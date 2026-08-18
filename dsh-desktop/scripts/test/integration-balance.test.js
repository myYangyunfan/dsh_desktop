'use strict';

// balance.js 集成测试：真实回环 HTTP/HTTPS mock server，覆盖 fetchJson /
// queryBalance / queryOpencodeUsage 的完整网络路径。
// 重点：
// 重定向 Authorization 剥离（跨主机 / https→http 降级 / 同主机 https 保留）
// OpenCode 用量 percent=null 保持 null
// 总超时（slow-drip）+ 按字节计的体积上限
// http 端点警告
// 余额金额解析（千分位/货币符号/负数钳制/脏数据告警）
// OPENCODE_USAGE_URL 环境变量覆盖
// 隔离承诺：全部请求闭环在 127.0.0.1 回环地址；不触碰真实 ~/.dsh、不发真实
// 网络请求；环境变量测试前快照、测试后恢复。

const test = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

const { createMockServer } = require('./mock-server.cjs');
const { createTlsServer } = require('./mock-tls-server.cjs');
const balance = require('../../balance');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function tmpHome() { return fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-balance-int-')); }
function cleanup(dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} }

const ENV_KEYS = [
  'DEEPSEEK_API_KEY', 'DEEPSEEK_BALANCE_URL', 'DEEPSEEK_API_BASE',
  'OPENCODE_GO_API_KEY', 'OPENCODE_API_KEY', 'OPENCODE_USAGE_URL',
];
const envSnapshot = {};
for (const k of ENV_KEYS) envSnapshot[k] = process.env[k];
const restoreEnv = () => {
  for (const k of ENV_KEYS) {
    if (envSnapshot[k] === undefined) delete process.env[k];
    else process.env[k] = envSnapshot[k];
  }
};
test.after(restoreEnv);

let srv;      // HTTP mock
let tlsSrv;   // HTTPS mock（自签名证书，仅测试用）
let tlsRejectSaved; // NODE_TLS_REJECT_UNAUTHORIZED 单独管理：整套件内保持关闭
test.before(async () => {
  srv = createMockServer();
  await srv.start();
  tlsSrv = createTlsServer();
  await tlsSrv.start();
  tlsRejectSaved = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'; // 仅允许测试进程信任自签名证书
});
test.after(async () => {
  if (srv) await srv.stop();
  if (tlsSrv) await tlsSrv.stop();
  if (tlsRejectSaved === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  else process.env.NODE_TLS_REJECT_UNAUTHORIZED = tlsRejectSaved;
});

// ---------------------------------------------------------------------------
// queryBalance：字段映射与金额解析
// ---------------------------------------------------------------------------

test('queryBalance: 200 响应字段映射（含千分位/货币符号/负数钳制）', async () => {
  const dir = tmpHome();
  try {
    srv.clear();
    srv.setRoute('/user/balance', {
      status: 200,
      json: {
        is_available: true,
        balance_infos: [{
          currency: 'CNY',
          total_balance: '1,234.56',
          granted_balance: '¥10',
          topped_up_balance: '-5',
        }],
      },
    });
    process.env.DEEPSEEK_API_KEY = 'sk-int-1';
    process.env.DEEPSEEK_BALANCE_URL = srv.url('/user/balance');
    const r = await balance.queryBalance(dir);
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.isAvailable, true);
    assert.deepStrictEqual(r.balances, [{ currency: 'CNY', total: 1234.56, granted: 10, toppedUp: 0 }]);
    // 全部金额可解析 → 无「无法解析」告警（http 明文传输告警与解析无关，允许存在）
    assert.ok(!String(r.warning || '').includes('无法解析'), '全部可解析时无解析告警');
  } finally {
    cleanup(dir);
    restoreEnv();
  }
});

test('queryBalance: 脏数据显式告警（不静默清零，warnings 并入 result）', async () => {
  const dir = tmpHome();
  try {
    srv.clear();
    srv.setRoute('/user/balance', {
      status: 200,
      json: { is_available: true, balance_infos: [{ currency: 'CNY', total_balance: 'not-a-number', granted_balance: '0', topped_up_balance: '0' }] },
    });
    process.env.DEEPSEEK_API_KEY = 'sk-int-2';
    process.env.DEEPSEEK_BALANCE_URL = srv.url('/user/balance');
    const r = await balance.queryBalance(dir);
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.balances[0].total, 0);
    assert.ok(String(r.warning).includes('无法解析'), '脏数据必须有显式告警');
  } finally {
    cleanup(dir);
    restoreEnv();
  }
});

test('queryBalance: 401 / 500 / 非 JSON 的失败形态（error 含状态码）', async () => {
  const dir = tmpHome();
  try {
    process.env.DEEPSEEK_API_KEY = 'sk-int-3';
    srv.clear();
    srv.setRaw('/auth', { status: 401, body: JSON.stringify({ error: { message: 'Invalid API key' } }) });
    process.env.DEEPSEEK_BALANCE_URL = srv.url('/auth');
    let r = await balance.queryBalance(dir);
    assert.strictEqual(r.ok, false);
    assert.ok(r.error.includes('401'));
    assert.deepStrictEqual(r.balances, []);

    srv.setRaw('/srvfail', { status: 500, body: 'oops' });
    process.env.DEEPSEEK_BALANCE_URL = srv.url('/srvfail');
    r = await balance.queryBalance(dir);
    assert.strictEqual(r.ok, false);
    assert.ok(r.error.includes('500'));

    srv.setRaw('/badjson', { status: 200, body: 'not json{' });
    process.env.DEEPSEEK_BALANCE_URL = srv.url('/badjson');
    r = await balance.queryBalance(dir);
    assert.strictEqual(r.ok, false);
    assert.ok(r.error.includes('JSON 解析失败'));
  } finally {
    cleanup(dir);
    restoreEnv();
  }
});

test('queryBalance: http 端点给出明文传输警告', async () => {
  const dir = tmpHome();
  try {
    srv.clear();
    srv.setRoute('/user/balance', { status: 200, json: { is_available: true, balance_infos: [] } });
    process.env.DEEPSEEK_API_KEY = 'sk-int-4';
    process.env.DEEPSEEK_BALANCE_URL = srv.url('/user/balance'); // http://
    const r = await balance.queryBalance(dir);
    assert.strictEqual(r.ok, true);
    assert.ok(String(r.warning).includes('http://'), 'http 端点必须警告明文传输');
  } finally {
    cleanup(dir);
    restoreEnv();
  }
});

// ---------------------------------------------------------------------------
// 重定向：跟随、上限与 Authorization 安全边界
// ---------------------------------------------------------------------------

test('fetchJson: 相对重定向解析 + ≤5 跳跟随成功', async () => {
  srv.clear();
  // /a → /b → /c → /d → /e → /final（5 跳）
  srv.setRedirect('/a', '/b');
  srv.setRedirect('/b', '/c');
  srv.setRedirect('/c', '/d');
  srv.setRedirect('/d', '/e');
  srv.setRedirect('/e', '/final');
  srv.setRoute('/final', { status: 200, json: { arrived: true } });
  const data = await balance.fetchJson(srv.url('/a'), 'sk-key');
  assert.deepStrictEqual(data, { arrived: true });
});

test('fetchJson: 超过 5 跳重定向拒绝（重定向次数过多）', async () => {
  srv.clear();
  const chain = ['/r0', '/r1', '/r2', '/r3', '/r4', '/r5', '/r6', '/r7'];
  for (let i = 0; i < chain.length - 1; i++) srv.setRedirect(chain[i], chain[i + 1]);
  srv.setRoute('/r7', { status: 200, json: {} });
  await assert.rejects(() => balance.fetchJson(srv.url('/r0'), 'sk-key'), /重定向次数过多/);
});

test('fetchJson: 重定向地址无效 → 明确拒绝', async () => {
  srv.clear();
  srv.setRedirect('/bad', 'http://[::1'); // 畸形 Location：new URL 无法解析
  await assert.rejects(() => balance.fetchJson(srv.url('/bad'), 'sk-key'), /重定向地址无效/);
});

test('安全: 跨主机重定向（不同端口=不同 host）剥离 Authorization，且结果附警告', async () => {
  srv.clear();
  const target = createMockServer();
  await target.start();
  try {
    // 源服务器 302 → 目标服务器（另一个端口 = 另一个 host）
    srv.setRedirect('/balance', target.url('/landing'));
    target.setRoute('/landing', { status: 200, json: { is_available: true, balance_infos: [] } });
    process.env.DEEPSEEK_API_KEY = 'SECRET-KEY-XYZ';
    process.env.DEEPSEEK_BALANCE_URL = srv.url('/balance');
    const dir = tmpHome();
    try {
      const r = await balance.queryBalance(dir);
      assert.strictEqual(r.ok, true, '请求本身应成功（不带 Authorization 目标也接受）');
      const hit = target.requestLog.find((x) => x.url.startsWith('/landing'));
      assert.ok(hit, '重定向目标应收到请求');
      assert.strictEqual(hit.headers.authorization, undefined, '🔴 密钥绝不允许出现在跨主机重定向目标上');
      assert.ok(String(r.warning).includes('剥离'), '剥离动作必须显式告警');
    } finally {
      cleanup(dir);
    }
  } finally {
    await target.stop();
    restoreEnv();
  }
});

test('安全: https→http 降级重定向剥离 Authorization（仍跟随请求）', async () => {
  srv.clear();
  tlsSrv.requestLog.length = 0;
  // HTTPS 源 → HTTP 目标（协议降级）：跟随但剥离密钥
  tlsSrv.setRedirect('/secure', srv.url('/landing'));
  srv.setRoute('/landing', { status: 200, json: { ok: true } });
  const data = await balance.fetchJson(tlsSrv.url('/secure'), 'SECRET-KEY-DOWNGRADE');
  assert.deepStrictEqual(data, { ok: true });
  const hit = srv.requestLog.find((x) => x.url.startsWith('/landing'));
  assert.ok(hit, '降级重定向应到达 http 目标');
  assert.strictEqual(hit.headers.authorization, undefined, '🔴 https→http 降级绝不允许携带密钥');
  // 首跳（https 源）应带密钥
  assert.strictEqual(tlsSrv.requestLog[0].headers.authorization, 'Bearer SECRET-KEY-DOWNGRADE');
});

test('安全: 同主机 https 相对重定向保留 Authorization', async () => {
  tlsSrv.requestLog.length = 0;
  tlsSrv.setRedirect('/a', '/b');
  tlsSrv.setRoute('/b', { status: 200, json: { ok: true } });
  await balance.fetchJson(tlsSrv.url('/a'), 'KEEP-ME-SAME-HOST');
  const hits = tlsSrv.requestLog;
  assert.strictEqual(hits.length, 2);
  assert.strictEqual(hits[0].headers.authorization, 'Bearer KEEP-ME-SAME-HOST', '首跳应带密钥');
  assert.strictEqual(hits[1].headers.authorization, 'Bearer KEEP-ME-SAME-HOST', '同主机 https 重定向应保留密钥');
});

test('安全: 同主机 http 重定向同样剥离（规则：仅同主机 https 保留）', async () => {
  srv.clear();
  srv.setRedirect('/a', '/b');
  srv.setRoute('/b', { status: 200, json: { ok: true } });
  await balance.fetchJson(srv.url('/a'), 'KEY-HTTP-SAME-HOST');
  const hits = srv.requestLog;
  assert.strictEqual(hits.length, 2);
  assert.strictEqual(hits[0].headers.authorization, 'Bearer KEY-HTTP-SAME-HOST', '首跳（用户显式指定的 http 端点）带密钥');
  assert.strictEqual(hits[1].headers.authorization, undefined, 'http 重定向（即使同主机）不保留密钥');
});

// ---------------------------------------------------------------------------
// 总超时：slow-drip 服务器无法靠空闲超时保活绕过总时限
// ---------------------------------------------------------------------------

test('超时: slow-drip（每 20ms 一块，共 10s）在总时限 300ms 处拒绝', async () => {
  srv.clear();
  srv.setChunked('/drip', { chunkMs: 20, totalMs: 10_000, body: 'A'.repeat(1000) });
  const startAt = Date.now();
  await assert.rejects(() => balance.fetchJson(srv.url('/drip'), 'sk', { timeoutMs: 300 }), /请求超时/);
  const elapsed = Date.now() - startAt;
  assert.ok(elapsed < 3000, '总超时应在 deadline 附近拒绝（实际 ' + elapsed + 'ms）');
  assert.ok(elapsed >= 250, '不应早于 deadline 触发（实际 ' + elapsed + 'ms）');
});

test('超时: 无数据静默连接（socket 空闲）同样在总时限内拒绝', async () => {
  // 用 setChunked 但首块延迟极长（> 时限）模拟「连接建立后无任何数据」
  srv.clear();
  srv.setChunked('/silent', { chunkMs: 5000, totalMs: 5000, body: 'x' });
  const startAt = Date.now();
  await assert.rejects(() => balance.fetchJson(srv.url('/silent'), 'sk', { timeoutMs: 300 }), /请求超时/);
  assert.ok(Date.now() - startAt < 3000);
});

// ---------------------------------------------------------------------------
// 体积上限：按字节计，多字节内容不绕过
// ---------------------------------------------------------------------------

test('体积: 字节上限（多字节中文内容按字节拒绝，同字节 ASCII 通过）', async () => {
  srv.clear();
  const chinese = '中'.repeat(4000); // 4000 字符 = 12000 字节
  srv.setRaw('/cn', { status: 200, body: chinese, headers: { 'Content-Type': 'application/json' } });
  await assert.rejects(() => balance.fetchJson(srv.url('/cn'), 'sk', { maxBodyBytes: 10_000 }), /响应过大/);

  // 恰好等于上限的字节数允许（> 才拒绝）；用合法 JSON 验证能正常解析
  const under = '{"x":"' + 'A'.repeat(9990) + '"}'; // 7 + 9990 = 9997 字节
  srv.setRaw('/under', { status: 200, body: under, headers: { 'Content-Type': 'application/json' } });
  const r = await balance.fetchJson(srv.url('/under'), 'sk', { maxBodyBytes: 10_000 });
  assert.strictEqual(typeof r.x, 'string');
  assert.strictEqual(r.x.length, 9990);
  // 超出 3 字节 → 拒绝
  const over = '{"x":"' + 'A'.repeat(9996) + '"}'; // 7 + 9996 = 10003 字节
  srv.setRaw('/over', { status: 200, body: over, headers: { 'Content-Type': 'application/json' } });
  await assert.rejects(() => balance.fetchJson(srv.url('/over'), 'sk', { maxBodyBytes: 10_000 }), /响应过大/);
});

// ---------------------------------------------------------------------------
// queryOpencodeUsage：端点覆盖、percent=null、响应形态
// ---------------------------------------------------------------------------

test('OpenCode: OPENCODE_USAGE_URL 环境变量覆盖端点；percent=null 保持 null', async () => {
  const dir = tmpHome();
  try {
    srv.clear();
    srv.setRoute('/go/usage', {
      status: 200,
      json: {
        usage: {
          rolling: { status: 'ok', percent: null, resetsAt: '2026-08-18T08:00:00Z' },
          weekly: { status: 'ok', percent: 0, resetsAt: '2026-08-20T00:00:00Z' },
          monthly: { status: 'warning', percent: '42', resetsAt: 123 },
        },
      },
    });
    process.env.OPENCODE_GO_API_KEY = 'go-key';
    process.env.OPENCODE_USAGE_URL = srv.url('/go/usage');
    const r = await balance.queryOpencodeUsage(dir);
    assert.strictEqual(r.ok, true);
    assert.deepStrictEqual(r.usage.rolling, { status: 'ok', percent: null, resetsAt: '2026-08-18T08:00:00Z' });
    assert.deepStrictEqual(r.usage.weekly, { status: 'ok', percent: 0, resetsAt: '2026-08-20T00:00:00Z' });
    assert.deepStrictEqual(r.usage.monthly, { status: 'warning', percent: 42, resetsAt: null });
    assert.strictEqual(srv.requestLog[0].url, '/go/usage', '请求应打到覆盖后的端点');
  } finally {
    cleanup(dir);
    restoreEnv();
  }
});

test('OpenCode: bad-response / 401 / 非 JSON 的失败形态', async () => {
  const dir = tmpHome();
  try {
    process.env.OPENCODE_GO_API_KEY = 'go-key-2';
    process.env.OPENCODE_USAGE_URL = srv.url('/go/usage2');
    srv.clear();
    srv.setRoute('/go/usage2', { status: 200, json: 'just-a-string' });
    let r = await balance.queryOpencodeUsage(dir);
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.reason, 'bad-response');

    srv.setRaw('/go/usage2', { status: 401, body: '{}' });
    r = await balance.queryOpencodeUsage(dir);
    assert.strictEqual(r.ok, false);
    assert.ok(r.error.includes('401'));

    srv.setRaw('/go/usage2', { status: 200, body: '{bad' });
    r = await balance.queryOpencodeUsage(dir);
    assert.strictEqual(r.ok, false);
    assert.ok(r.error.includes('JSON'));
  } finally {
    cleanup(dir);
    restoreEnv();
  }
});
