'use strict';

/**
 * DSH Desktop（Tauri 版）sidecar CLI 功能测试
 * ============================================
 * 运行：`node --test sidecar/cli.test.js`（仓库 dsh-tauri/ 目录下）。
 *
 * 覆盖：boot 链（沙箱 home 全新建档）/ plugin-list / set-enabled 可逆往返 /
 * diag-run / backup 导出→预览→恢复 roundtrip / 用法错误路径。
 *
 * 依赖：仓库检出内 dsh-desktop 已 npm install（vendor node + node_modules）。
 * 隔离：DSH_HOME 与 DSH_TAURI_USERDATA 全部指向临时目录，绝不触碰真实 ~/.dsh。
 */

const test = require('node:test');
const assert = require('node:assert');
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const SIDEAR = path.join(__dirname, 'cli.js');
const APP_DIR = path.resolve(__dirname, '..', '..', 'dsh-desktop');
// vendor node 双平台二进制：按平台选名（win32 node.exe / 其余 node），
// 缺失时互为兜底——测试在非 Windows 检出上也能驱动同一链路。
const NODE = (() => {
  const dir = path.join(APP_DIR, 'vendor', 'node');
  const primary = path.join(dir, process.platform === 'win32' ? 'node.exe' : 'node');
  if (fs.existsSync(primary)) return primary;
  const alt = path.join(dir, process.platform === 'win32' ? 'node' : 'node.exe');
  return fs.existsSync(alt) ? alt : primary;
})();
const HAVE_DEPS = fs.existsSync(NODE) && fs.existsSync(path.join(APP_DIR, 'node_modules', '@deepseek-ai', 'dsh'));

/** 沙箱环境（每个测试独立 home/userData）。 */
function sandbox(tag) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-sidecar-test-'));
  return { dir, env: { ...process.env, DSH_HOME: dir, DSH_TAURI_USERDATA: path.join(dir, 'ud') } };
}

/** 跑 CLI 子命令，返回 { code, json, stderr }（json = stdout 末行解析）。 */
function cli(args, opts = {}) {
  const r = spawnSync(NODE, [SIDEAR, ...args, '--app-dir', APP_DIR], {
    encoding: 'utf8',
    env: opts.env || process.env,
    timeout: opts.timeout || 120_000,
  });
  const lastLine = (r.stdout || '').trimEnd().split('\n').pop() || '';
  let json = null;
  try { json = JSON.parse(lastLine); } catch { /* 保持 null */ }
  return { code: r.status, json, stderr: r.stderr || '', stdout: r.stdout || '' };
}

test('环境自检：依赖齐备（否则全组跳过）', () => {
  if (!HAVE_DEPS) {
    console.warn('[skip] dsh-desktop 依赖不齐（先 npm install）');
  }
  assert.ok(true);
});

test('boot：沙箱 home 六步全过并建档', { skip: !HAVE_DEPS }, (t) => {
  const sb = sandbox(t.name);
  t.after(() => fs.rmSync(sb.dir, { recursive: true, force: true }));
  const r = cli(['boot'], { env: sb.env, timeout: 180_000 });
  assert.strictEqual(r.code, 0, `stderr: ${r.stderr.slice(-500)}`);
  assert.strictEqual(r.json.ok, true, JSON.stringify(r.json));
  // 固定顺序契约（data-flow.md §3；0.5.7 起加入 compat-pin 内核一致性校验步）。
  assert.deepStrictEqual(r.json.steps.map((s) => s.name), ['repair', 'sync', 'presets', 'patches', 'compat-pin', 'preflight']);
  // 沙箱建档：web profile + patch 清单落盘。
  assert.ok(fs.existsSync(path.join(sb.dir, 'profiles', 'web', 'cordis.patch.yml')), 'profile patch 应建档');
  assert.ok(fs.existsSync(path.join(sb.dir, 'profiles', 'web', 'package.json')), 'profile package 应建档');
  // #174 红线：内置预设必须落在**内核可发现的用户预设根** <DSH_HOME>/.agent-presets，
  // 而不是 payload 包目录（旧 bug 写进 node_modules/@deepseek-ai/dsh/.agent-presets，
  // 没有任何 roots 扫那里 → 客户端模式列表只剩出厂四件套）。
  assert.ok(fs.existsSync(path.join(sb.dir, '.agent-presets', 'minimal-win', 'agent.cordis.yml')), '内置预设应落 <DSH_HOME>/.agent-presets');
  assert.ok(fs.existsSync(path.join(sb.dir, '.agent-presets', 'router-standard', 'agent.cordis.yml')), 'v0.5.7 社区预设应在位');
  assert.ok(fs.existsSync(path.join(sb.dir, '.agent-presets', '_preset', 'skill-search.mjs')), '_preset 共享模块应在位（zero/whoami 系依赖）');
  assert.equal(
    fs.existsSync(path.join(APP_DIR, 'node_modules', '@deepseek-ai', 'dsh', '.agent-presets', 'minimal-win', 'agent.cordis.yml')),
    false,
    '不得再往 payload 包目录写预设（旧落点死角）',
  );
});

test('boot 容忍分级：自愈类子失败不阻断（坏 patch → 自愈 → ok:true）', { skip: !HAVE_DEPS }, (t) => {
  const sb = sandbox(t.name);
  t.after(() => fs.rmSync(sb.dir, { recursive: true, force: true }));
  // 预置「内容无法解析」的 profile patch（heal 的子失败场景）：repair 步应
  // 备份+重置自愈，boot 整体 ok:true——被容忍/自愈的子失败不得标步骤失败
  // （曾致 loading 页误报「启动受阻」类横幅的语义边界）。
  const patchFile = path.join(sb.dir, 'profiles', 'web', 'cordis.patch.yml');
  fs.mkdirSync(path.dirname(patchFile), { recursive: true });
  fs.writeFileSync(patchFile, 'this: is: [not: a: valid: patch: list\n');
  const r = cli(['boot'], { env: sb.env, timeout: 180_000 });
  assert.strictEqual(r.code, 0, `stderr: ${r.stderr.slice(-500)}`);
  assert.strictEqual(r.json.ok, true, JSON.stringify(r.json));
  for (const s of r.json.steps) {
    assert.strictEqual(s.ok, true, `步骤 ${s.name} 不应被自愈类子失败标失败: ${JSON.stringify(s)}`);
  }
  // 自愈证据：原文件被备份（.broken-*），现场重置为带标记的最小文件。
  const dir = path.dirname(patchFile);
  const backups = fs.readdirSync(dir).filter((f) => f.startsWith('cordis.patch.yml.broken-'));
  assert.ok(backups.length >= 1, '坏 patch 应有 .broken-* 备份');
  assert.ok(fs.readFileSync(patchFile, 'utf8').includes('recovered by DSH Desktop'), '自愈后应含重置标记');
});

test('plugin-list：boot 后可列出 companion 插件', { skip: !HAVE_DEPS }, (t) => {
  const sb = sandbox(t.name);
  t.after(() => fs.rmSync(sb.dir, { recursive: true, force: true }));
  assert.strictEqual(cli(['boot'], { env: sb.env, timeout: 180_000 }).code, 0);
  const r = cli(['plugin-list'], { env: sb.env });
  assert.strictEqual(r.code, 0);
  assert.ok(Array.isArray(r.json), '应输出插件数组');
  assert.ok(r.json.length >= 20, `沙箱应装配 20+ 伴随插件，得到 ${r.json.length}`);
  const groups = new Set(r.json.map((x) => x.group));
  assert.ok(groups.has('companion'), '应含 companion 组');
  for (const row of r.json) {
    // 行形态契约（contracts/plugin-contract.md C 层）。
    for (const key of ['id', 'name', 'enabled', 'toggleable', 'group', 'removed']) {
      assert.ok(key in row, `插件行缺字段 ${key}: ${JSON.stringify(row)}`);
    }
  }
});

test('plugin-set-enabled：可逆往返（关闭→列表确认→启用→还原）', { skip: !HAVE_DEPS }, (t) => {
  const sb = sandbox(t.name);
  t.after(() => fs.rmSync(sb.dir, { recursive: true, force: true }));
  assert.strictEqual(cli(['boot'], { env: sb.env, timeout: 180_000 }).code, 0);
  const list = () => cli(['plugin-list'], { env: sb.env }).json;
  const before = list().find((x) => x.id === 'balance');
  assert.ok(before, '应存在 balance 插件');
  assert.strictEqual(before.enabled, true, '初始应为启用');

  const off = cli(['plugin-set-enabled', 'balance', '0'], { env: sb.env });
  assert.strictEqual(off.json.ok, true, JSON.stringify(off.json));
  assert.strictEqual(list().find((x) => x.id === 'balance').enabled, false, '应已禁用');

  const on = cli(['plugin-set-enabled', 'balance', '1'], { env: sb.env });
  assert.strictEqual(on.json.ok, true);
  assert.strictEqual(list().find((x) => x.id === 'balance').enabled, true, '应还原启用');

  // 未知插件 → ok:false + 中文错误。
  const bad = cli(['plugin-set-enabled', 'no-such-plugin', '0'], { env: sb.env });
  assert.strictEqual(bad.json.ok, false);
  assert.ok(String(bad.json.error).length > 0);
});

test('diag-run：沙箱只读诊断返回结构化报告', { skip: !HAVE_DEPS }, (t) => {
  const sb = sandbox(t.name);
  t.after(() => fs.rmSync(sb.dir, { recursive: true, force: true }));
  assert.strictEqual(cli(['boot'], { env: sb.env, timeout: 180_000 }).code, 0);
  const r = cli(['diag-run'], { env: sb.env, timeout: 120_000 });
  assert.strictEqual(r.code, 0);
  assert.strictEqual(r.json.ok, true, JSON.stringify(r.json).slice(0, 200));
  for (const key of ['errors', 'warnings', 'infos', 'generatedAt', 'sections']) {
    assert.ok(key in r.json.report, `诊断报告缺 ${key}`);
  }
});

test('backup 全链：导出→预览（token）→恢复（roundtrip）', { skip: !HAVE_DEPS }, (t) => {
  const sb = sandbox(t.name);
  t.after(() => fs.rmSync(sb.dir, { recursive: true, force: true }));
  assert.strictEqual(cli(['boot'], { env: sb.env, timeout: 180_000 }).code, 0);

  const outFile = path.join(sb.dir, 'backup.json');
  const ex = cli(['backup-export', 'test-label', outFile], { env: sb.env });
  assert.strictEqual(ex.json.ok, true, JSON.stringify(ex.json));
  assert.ok(fs.existsSync(outFile), '备份文件应写出');
  assert.ok(ex.json.files >= 1, '至少备份一个文件');

  const prev = cli(['backup-restore-preview', outFile], { env: sb.env });
  assert.strictEqual(prev.json.ok, true, JSON.stringify(prev.json));
  assert.match(prev.json.token, /^[0-9a-f]{64}$/, 'token = sha256');

  // 篡改文件后 token 失配 → 拒绝（TOCTOU 防御）。
  const tampered = path.join(sb.dir, 'tampered.json');
  fs.copyFileSync(outFile, tampered);
  const prev2 = cli(['backup-restore-preview', tampered], { env: sb.env });
  fs.appendFileSync(tampered, ' ');
  const bad = cli(['backup-restore-apply', tampered, prev2.json.token], { env: sb.env });
  assert.strictEqual(bad.json.ok, false, '篡改后必须拒绝恢复');

  // 正件恢复成功。
  const ap = cli(['backup-restore-apply', outFile, prev.json.token], { env: sb.env });
  assert.strictEqual(ap.json.ok ?? true, true, JSON.stringify(ap.json).slice(0, 300));
});

test('用法错误：未知子命令退出码 2、空参数退出码 2', { skip: !HAVE_DEPS }, () => {
  const r1 = cli(['definitely-not-a-command']);
  assert.strictEqual(r1.code, 2, `未知子命令应 exit 2，得到 ${r1.code}`);
  const r2 = spawnSync(NODE, [SIDEAR], { encoding: 'utf8', timeout: 15_000 });
  assert.strictEqual(r2.status, 2, `空参数应 exit 2，得到 ${r2.status}`);
});

test('未知插件卸载：ok:false 而非崩溃', { skip: !HAVE_DEPS }, (t) => {
  const sb = sandbox(t.name);
  t.after(() => fs.rmSync(sb.dir, { recursive: true, force: true }));
  assert.strictEqual(cli(['boot'], { env: sb.env, timeout: 180_000 }).code, 0);
  const r = cli(['plugin-uninstall', 'no-such-id'], { env: sb.env });
  assert.strictEqual(r.json.ok, false);
  assert.match(String(r.json.error), /未知插件/);
});

// ===========================================================================
// 余额单轮取数（balance-fetch：Electron ensureBalanceScheduler 取数半边的
// sidecar 化——Rust 编排层 commands/balance.rs 每轮调用本子命令）
// ===========================================================================

test('balance-fetch：本地 mock 端点 → 与 Electron 同构的事件载荷', { skip: !HAVE_DEPS }, async (t) => {
  const sb = sandbox(t.name);
  t.after(() => fs.rmSync(sb.dir, { recursive: true, force: true }));
  // 本地回环 mock（integration-balance.test.js 同款隔离承诺：不出 127.0.0.1）。
  // NO_PROXY 显式放行回环——防开发机全局 HTTP_PROXY 劫持测试端点。
  const http = require('node:http');
  const { spawn } = require('node:child_process');
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      is_available: true,
      balance_infos: [{ currency: 'CNY', total_balance: '12.34', granted_balance: '1', topped_up_balance: '11.34' }],
    }));
  });
  await new Promise((res) => server.listen(0, '127.0.0.1', res));
  try {
    const env = {
      ...sb.env,
      DEEPSEEK_API_KEY: 'k-test',
      DEEPSEEK_BALANCE_URL: 'http://127.0.0.1:' + server.address().port + '/user/balance',
      NO_PROXY: '127.0.0.1,localhost',
    };
    // 异步 spawn（spawnSync 会冻结本进程事件循环——mock server 无法应答，
    // 子进程只能等满 15s 超时；余额链路测试必须让事件循环活着）。
    const r = await new Promise((resolve, reject) => {
      const p = spawn(NODE, [SIDEAR, 'balance-fetch', '--app-dir', APP_DIR], { env, stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '', stderr = '';
      p.stdout.on('data', (c) => { stdout += c; });
      p.stderr.on('data', (c) => { stderr += c; });
      const timer = setTimeout(() => p.kill(), 120_000);
      p.on('error', reject);
      p.on('close', (code) => {
        clearTimeout(timer);
        const lastLine = stdout.trimEnd().split('\n').pop() || '';
        let json = null;
        try { json = JSON.parse(lastLine); } catch { /* 保持 null */ }
        resolve({ code, json, stderr, stdout });
      });
    });
    assert.strictEqual(r.code, 0, `stderr: ${r.stderr.slice(-500)}`);
    // 载荷契约（docs/balance-architecture.md §2，Electron dsh:balance 同构）。
    assert.strictEqual(r.json.ok, true, JSON.stringify(r.json));
    assert.strictEqual(r.json.balances[0].total, 12.34);
    assert.ok(r.json.prices && Number(r.json.prices.cacheMiss) > 0, 'prices 应附加');
    assert.ok(r.json.priceTable && r.json.priceTable['deepseek-v4-pro'], 'priceTable 应含全模型');
    assert.strictEqual(typeof r.json.peak, 'boolean', 'peak 应为布尔');
    assert.strictEqual(typeof r.json.at, 'string', 'at 应为 ISO 串');
    assert.ok(r.json.model, '默认模型应解析（缺省 v4-pro 兜底）');
    assert.ok(r.json.opencodeGo && typeof r.json.opencodeGo === 'object', 'opencodeGo 字段应存在（无键=ok:false）');
    // 密钥不出进程：载荷中不得出现 API Key。
    assert.ok(!JSON.stringify(r.json).includes('k-test'), '载荷不得携带密钥');
  } finally {
    server.close();
  }
});

test('balance-fetch：showBalanceDock=false → disabled 载荷（短路，零网络）', { skip: !HAVE_DEPS }, (t) => {
  const sb = sandbox(t.name);
  t.after(() => fs.rmSync(sb.dir, { recursive: true, force: true }));
  // 预置桌面壳 settings（sandbox 的 DSH_TAURI_USERDATA = sb.dir/ud）。
  fs.mkdirSync(path.join(sb.dir, 'ud'), { recursive: true });
  fs.writeFileSync(path.join(sb.dir, 'ud', 'settings.json'), JSON.stringify({ showBalanceDock: false }));
  // 端点指向必失败地址——若未短路会 ok:false/error 且耗 15s 超时。
  const env = {
    ...sb.env,
    DEEPSEEK_API_KEY: 'k-test',
    DEEPSEEK_BALANCE_URL: 'http://127.0.0.1:1/user/balance',
    NO_PROXY: '127.0.0.1,localhost',
  };
  const r = cli(['balance-fetch'], { env });
  assert.strictEqual(r.code, 0);
  assert.strictEqual(r.json.ok, false, JSON.stringify(r.json));
  assert.strictEqual(r.json.disabled, true, '关闭态须最先判 disabled');
  assert.deepStrictEqual(r.json.balances, [], '禁用载荷 balances 空');
  assert.strictEqual(r.json.opencodeGo && r.json.opencodeGo.disabled, true, 'opencodeGo 同步禁用');
});

test('balance-fetch：无密钥 → ok:false/no-key（不 panic、结构化降级）', { skip: !HAVE_DEPS }, (t) => {
  const sb = sandbox(t.name);
  t.after(() => fs.rmSync(sb.dir, { recursive: true, force: true }));
  const env = {
    ...sb.env,
    DEEPSEEK_API_KEY: '',
    DEEPSEEK_BALANCE_URL: 'http://127.0.0.1:1/user/balance',
    NO_PROXY: '127.0.0.1,localhost',
  };
  delete env.DEEPSEEK_API_KEY;
  const r = cli(['balance-fetch'], { env });
  assert.strictEqual(r.code, 0);
  assert.strictEqual(r.json.ok, false, JSON.stringify(r.json));
  assert.strictEqual(r.json.error, 'no-key', '无密钥应结构化报 no-key');
  assert.deepStrictEqual(r.json.balances, []);
});

// ===========================================================================
// 升级适配子命令（koffi 预检 / picker 降级 overlay / safe-boot overlay）
// ===========================================================================

test('koffi-preflight：返回布尔探测结果（本机应通过）', { skip: !HAVE_DEPS }, () => {
  const r = cli(['koffi-preflight']);
  assert.strictEqual(r.code, 0);
  assert.strictEqual(typeof r.json.ok, 'boolean', JSON.stringify(r.json));
});

test('picker-overlay：内容与 Electron 版逐行一致', { skip: !HAVE_DEPS }, (t) => {
  const sb = sandbox(t.name);
  t.after(() => fs.rmSync(sb.dir, { recursive: true, force: true }));
  const r = cli(['picker-overlay'], { env: sb.env });
  assert.strictEqual(r.json.ok, true, JSON.stringify(r.json));
  const text = fs.readFileSync(r.json.path, 'utf8');
  // Electron main.js enablePickerBrowseOverlay 的关键行逐条断言。
  assert.ok(text.includes('# DSH-DESKTOP-AUTO: picker browse fallback'), '标记行');
  assert.ok(text.includes('- id: directory-picker\n  disabled: true'), '禁用 native 选择器');
  assert.ok(text.includes("@deepseek-ai/dsh-host-directory-picker-browse"), 'browse 后端包名');
  assert.ok(text.includes('@deepseek-ai/dsh-client-ui-directory-picker-browse'), 'browse client 包名');
});

test('safe-overlay：解析失败日志 → 禁用 overlay（幂等合并）', { skip: !HAVE_DEPS }, (t) => {
  const sb = sandbox(t.name);
  t.after(() => fs.rmSync(sb.dir, { recursive: true, force: true }));
  // 模拟 dsh-web.log 尾部（Electron parseFailedLoaderIds 的多形态样本，
  // 含 import 期失败：safe-boot 此前只认 apply，同坏插件反复弹）。
  const logs = path.join(sb.dir, 'ud', 'logs'); // sandbox 的 DSH_TAURI_USERDATA = sb.dir/ud
  fs.mkdirSync(logs, { recursive: true });
  fs.writeFileSync(path.join(logs, 'dsh-web.log'), [
    'boot: ok',
    'duplicate loader entry id: bad-plugin-x',
    'failed to apply loader entry broken_y (some stack)',
    'failed to import loader entry 9c5ab60c (@linxin666/dsh-desktop-launcher): client-modules: require("@deepseek-ai/dsh-client-runtime/client") missed the module table',
    'profile bundle "ghost-bundle" declares no dsh.bundle',
    'dsh web: http://127.0.0.1:1',
  ].join('\n'));
  const r = cli(['safe-overlay'], { env: sb.env });
  assert.strictEqual(r.json.ok, true, JSON.stringify(r.json));
  assert.ok(r.json.ids.includes('bad-plugin-x'), `ids: ${JSON.stringify(r.json.ids)}`);
  assert.ok(r.json.ids.includes('ghost-bundle'), 'bundle 形态也应命中');
  assert.ok(r.json.ids.includes('9c5ab60c'), 'import hash 形态也应命中');
  assert.ok(r.json.ids.includes('@linxin666/dsh-desktop-launcher'), 'import 包名形态也应命中');
  const text = fs.readFileSync(r.json.path, 'utf8');
  assert.ok(text.includes('- id: bad-plugin-x\n  disabled: true'), 'overlay 禁用条目');
  // 幂等：再跑一次不重复。
  const r2 = cli(['safe-overlay'], { env: sb.env });
  const dup = (fs.readFileSync(r2.json.path, 'utf8').match(/bad-plugin-x/g) || []).length;
  assert.strictEqual(dup, 1, '重复执行不得重复登记');
});

test('safe-overlay：无失败日志 → 不生成禁用条目', { skip: !HAVE_DEPS }, (t) => {
  const sb = sandbox(t.name);
  t.after(() => fs.rmSync(sb.dir, { recursive: true, force: true }));
  const r = cli(['safe-overlay'], { env: sb.env });
  assert.strictEqual(r.json.ok, true);
  assert.deepStrictEqual(r.json.ids, [], '干净日志应返回空名单');
  assert.strictEqual(fs.existsSync(path.join(sb.dir, 'safe-boot.overlay.yml')), false, '不应生成文件');
});

test('safe-overlay：@deepseek-ai 包名必须 YAML 引号化（#155 根因二）', { skip: !HAVE_DEPS }, (t) => {
  const sb = sandbox(t.name);
  t.after(() => fs.rmSync(sb.dir, { recursive: true, force: true }));
  const logs = path.join(sb.dir, 'ud', 'logs');
  fs.mkdirSync(logs, { recursive: true });
  // 失败日志带 scoped 包名（parseFailedLoaderIds 的 pkgRe 形态）。
  fs.writeFileSync(path.join(logs, 'dsh-web.log'), [
    'failed to apply loader entry abc123 (@deepseek-ai/dsh-host-directory-picker): boom',
    'dsh web: http://127.0.0.1:1',
  ].join('\n'));
  const r = cli(['safe-overlay'], { env: sb.env });
  assert.strictEqual(r.json.ok, true, JSON.stringify(r.json));
  assert.ok(r.json.ids.includes('@deepseek-ai/dsh-host-directory-picker'), `ids: ${JSON.stringify(r.json.ids)}`);
  const text = fs.readFileSync(r.json.path, 'utf8');
  // #155 根因二：裸 `@` 标量是 YAML indicator 起始（js-yaml bad indentation），
  // 必须带单引号；同时内容必须能被 js-yaml 解析（内核装配不再崩）。
  assert.ok(text.includes("- id: '@deepseek-ai/dsh-host-directory-picker'"), 'scoped 包名必须带引号: ' + text);
  assert.ok(!/- id: @deepseek-ai\//.test(text), '不得出现裸 @ 包名');
  const yaml = require(path.join(APP_DIR, 'node_modules', 'js-yaml'));
  const parsed = yaml.load(text);
  assert.ok(parsed.some((e) => e && e.id === '@deepseek-ai/dsh-host-directory-picker'), 'overlay 必须可解析且含 scoped 条目');
  const scoped = parsed.find((e) => e && e.id === '@deepseek-ai/dsh-host-directory-picker');
  assert.strictEqual(scoped.disabled, true);
});

test('safe-overlay：既有脏文件（裸 @ 包名）幂等修复（#155 根因二）', { skip: !HAVE_DEPS }, (t) => {
  const sb = sandbox(t.name);
  t.after(() => fs.rmSync(sb.dir, { recursive: true, force: true }));
  // 旧版写入的脏 overlay：裸 @deepseek-ai 包名（内核装配即崩的形态），
  // 落点 = DSH_TAURI_USERDATA（sandbox 的 ud/）。
  const dirty = [
    '# DSH Desktop 安全启动 overlay（自动生成）',
    '- id: @deepseek-ai/dsh-host-directory-picker',
    '  disabled: true',
    '',
  ].join('\n');
  const overlayFile = path.join(sb.dir, 'ud', 'safe-boot.overlay.yml');
  fs.mkdirSync(path.dirname(overlayFile), { recursive: true });
  fs.writeFileSync(overlayFile, dirty);
  // 无新失败日志：文件仍必须被修复（不能「no-failures 早退」留下脏文件）。
  const r = cli(['safe-overlay'], { env: sb.env });
  assert.strictEqual(r.json.ok, true, JSON.stringify(r.json));
  assert.ok(r.json.ids.includes('@deepseek-ai/dsh-host-directory-picker'), '既有脏条目应被识别: ' + JSON.stringify(r.json.ids));
  const text = fs.readFileSync(r.json.path, 'utf8');
  assert.ok(text.includes("- id: '@deepseek-ai/dsh-host-directory-picker'"), '脏条目必须被补引号: ' + text);
  const yaml = require(path.join(APP_DIR, 'node_modules', 'js-yaml'));
  const parsed = yaml.load(text);
  assert.ok(parsed.some((e) => e && e.id === '@deepseek-ai/dsh-host-directory-picker'));
  // 幂等：修复后再跑不变更。
  const r2 = cli(['safe-overlay'], { env: sb.env });
  assert.strictEqual(fs.readFileSync(r2.json.path, 'utf8'), text, '修复后重复执行零改写');
});

// ===========================================================================
// WSL 托管模式（boot 链 WSL 半边）
// ---------------------------------------------------------------------------
// 本机 WSL VM 损坏（wsl --status 退出 0 但 wsl -e 失败），全部用模拟：
//   · DSH_WSL_MODE=1 触发模式（Rust 设置页解锁前的临时缝）；
//   · DSH_TAURI_WSL_DISTRO 免清单探测、DSH_TAURI_WSL_UNC_HOME 把「UNC 安装
//     目录」指到临时目录（\\wsl$ 结构本机造不出——用普通目录模拟路径形态，
//     boot 半边的全部 fs 语义与真 UNC 等价：路径拼接 / 写穿 / 布局）；
//   · wsl.exe 真实交互（spawn 原语）在 wsl-mode.test.js 用桩替身覆盖。
// ===========================================================================

/** WSL 测试环境：模拟模式 + 显式 distro + UNC home 指向给定目录。 */
function wslEnv(uncHome, extra = {}) {
  return {
    ...extra,
    DSH_WSL_MODE: '1',
    DSH_TAURI_WSL_DISTRO: 'Ubuntu',
    DSH_TAURI_WSL_UNC_HOME: uncHome,
  };
}

/** 造最小 WSL agent 布局（<uncHome>/agent/node_modules/@deepseek-ai/dsh）。 */
function makeWslAgentLayout(uncHome) {
  const dshDir = path.join(uncHome, 'agent', 'node_modules', '@deepseek-ai', 'dsh');
  fs.mkdirSync(dshDir, { recursive: true });
  fs.writeFileSync(path.join(dshDir, 'package.json'), JSON.stringify({
    name: '@deepseek-ai/dsh',
    version: '0.1.0-rc.8',
    main: 'lib/bin.js',
  }));
  return dshDir;
}

test('boot（WSL 半边）：六步全过，sync/presets 落 UNC home，本地 DSH_HOME 零写入', { skip: !HAVE_DEPS }, (t) => {
  const sb = sandbox(t.name);
  t.after(() => fs.rmSync(sb.dir, { recursive: true, force: true }));
  const uncHome = path.join(sb.dir, 'wsl-home'); // 普通目录模拟 \\wsl$ 布局形态
  const dshDir = makeWslAgentLayout(uncHome);
  const env = { ...sb.env, ...wslEnv(uncHome) };

  const r = cli(['boot'], { env, timeout: 180_000 });
  assert.strictEqual(r.code, 0, `stderr: ${r.stderr.slice(-800)}`);
  assert.strictEqual(r.json.ok, true, JSON.stringify(r.json).slice(0, 400));
  // 步骤契约不变（supervisor 消费 ok/steps；WSL 是同一六步链，0.5.7 起
  // 含 compat-pin）。
  assert.deepStrictEqual(r.json.steps.map((s) => s.name), ['repair', 'sync', 'presets', 'patches', 'compat-pin', 'preflight']);
  for (const s of r.json.steps) assert.strictEqual(s.ok, true, JSON.stringify(s));
  // 后端观测字段。
  assert.strictEqual(r.json.backend, 'wsl');
  assert.strictEqual(r.json.wsl.distro, 'Ubuntu');
  assert.strictEqual(r.json.wsl.uncHome, uncHome);
  assert.strictEqual(r.json.wsl.simulated, true);
  assert.strictEqual(r.json.wsl.agentReady, true);
  // sync 半边：companion 落 UNC profile（伴生插件实体目录是设计——farm/junction
  // 语义不适用于该层）。
  assert.ok(fs.existsSync(path.join(uncHome, 'profiles', 'web', 'cordis.patch.yml')), 'UNC profile patch 应建档');
  assert.ok(fs.existsSync(path.join(uncHome, 'profiles', 'web', 'node_modules')), 'UNC profile node_modules 应建档');
  // presets 半边：内置 Agent 预设落 UNC home 的用户预设根（WSL 内 agent 以
  // DSH_HOME=<安装目录> 运行，见 dsh-desktop/wsl-backend.js:455）。
  // #174：旧实现传 dshDir（agent 包目录），写进无人读取的死角——现在必须落 home。
  assert.ok(fs.existsSync(path.join(uncHome, '.agent-presets', 'minimal-win', 'agent.cordis.yml')), '内置预设应落 UNC home/.agent-presets');
  assert.ok(fs.existsSync(path.join(uncHome, '.agent-presets', 'router-standard', 'agent.cordis.yml')), 'v0.5.7 社区预设应落 UNC home');
  assert.equal(fs.existsSync(path.join(dshDir, '.agent-presets')), false, '不得再往 WSL agent 包目录写预设');
  // 本地 DSH_HOME（沙箱）零写入——WSL 模式一切落点换到 UNC home。
  assert.strictEqual(fs.existsSync(path.join(sb.dir, 'profiles')), false, '本地 home 不应被写入');
});

test('boot（WSL 半边）：agent 未就绪 → presets 跳过不阻断（下次 boot 补齐）', { skip: !HAVE_DEPS }, (t) => {
  const sb = sandbox(t.name);
  t.after(() => fs.rmSync(sb.dir, { recursive: true, force: true }));
  const uncHome = path.join(sb.dir, 'wsl-home'); // 空目录：Rust 侧 ensureInstalled 未跑完的形态
  const env = { ...sb.env, ...wslEnv(uncHome) };
  const r = cli(['boot'], { env, timeout: 180_000 });
  assert.strictEqual(r.code, 0, `stderr: ${r.stderr.slice(-800)}`);
  assert.strictEqual(r.json.ok, true, JSON.stringify(r.json).slice(0, 400));
  const presets = r.json.steps.find((s) => s.name === 'presets');
  assert.strictEqual(presets.ok, true, 'agent 未就绪不得阻断 boot');
  assert.match(r.stderr, /WSL 内 dsh 包未就绪/);
  assert.strictEqual(r.json.wsl.agentReady, false);
  // agent 未就绪时 presets 步跳过，但 repair 步的只补不动兵（preset-heal）仍应
  // 把缺失预设补到 UNC home——客户端能否看到预设与 agent 包安装进度无关。
  assert.ok(fs.existsSync(path.join(uncHome, '.agent-presets', 'minimal-win', 'agent.cordis.yml')), 'repair 步兵底应补写预设');
});

test('boot（WSL 解析失败）：回落 local 继续启动（Electron issue #54 语义）', { skip: !HAVE_DEPS }, (t) => {
  const sb = sandbox(t.name);
  t.after(() => fs.rmSync(sb.dir, { recursive: true, force: true }));
  // distro 缺省 → 探测 wsl.exe；DSH_TAURI_WSL_EXE 指向不存在的可执行文件 →
  // ENOENT → 空清单 → 可读错误 → 回落 local（确定性、不碰真机 wsl.exe）。
  const env = { ...sb.env, DSH_WSL_MODE: '1', DSH_TAURI_WSL_EXE: 'definitely-not-wsl.exe' };
  const r = cli(['boot'], { env, timeout: 180_000 });
  assert.strictEqual(r.code, 0, `stderr: ${r.stderr.slice(-800)}`);
  assert.strictEqual(r.json.ok, true);
  assert.strictEqual(r.json.backend, 'local');
  assert.match(r.json.wslFallbackReason, /未检测到 WSL 发行版/);
  // 回落 = 完整 local boot：本地沙箱 home 正常建档。
  assert.ok(fs.existsSync(path.join(sb.dir, 'profiles', 'web', 'cordis.patch.yml')), '回落后本地链应正常建档');
});

test('koffi-preflight（WSL 模式）：跳过且 stdout 末行逐字为 {"ok":true}（Rust 字符串契约）', { skip: !HAVE_DEPS }, (t) => {
  const sb = sandbox(t.name);
  t.after(() => fs.rmSync(sb.dir, { recursive: true, force: true }));
  const uncHome = path.join(sb.dir, 'wsl-home');
  const env = { ...sb.env, ...wslEnv(uncHome) };
  const r = cli(['koffi-preflight'], { env });
  assert.strictEqual(r.code, 0);
  // supervisor.run_koffi_preflight 按 ends_with("{\"ok\":true}") 判过——
  // WSL 跳过分支绝不能附加字段（skipped 之类会破坏该匹配）。
  assert.strictEqual(r.stdout.trimEnd().split('\n').pop(), '{"ok":true}');
  assert.match(r.stderr, /WSL 托管模式跳过/);
});
