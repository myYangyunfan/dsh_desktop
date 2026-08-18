'use strict';

// balance.js 纯函数单测：峰谷定价切换、模型档位读取锚定、凭据读取顶层锚定、
// 金额解析、用量窗口规整、端点覆盖、no-key 返回形态。
// 不发起任何网络请求（网络路径在 integration-balance.test.js 用 mock server 覆盖）；
// 不触碰真实 ~/.dsh（全部使用 os.tmpdir() 临时目录）。

const test = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

const balance = require('../../balance');

// ---------------------------------------------------------------------------
// 辅助
// ---------------------------------------------------------------------------

function tmpHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-balance-unit-'));
}

function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}

// 环境变量快照（测试结束时恢复，避免污染其它测试）
const ENV_KEYS = [
  'DEEPSEEK_API_KEY', 'DEEPSEEK_BALANCE_URL', 'DEEPSEEK_API_BASE',
  'OPENCODE_GO_API_KEY', 'OPENCODE_API_KEY', 'OPENCODE_USAGE_URL',
];
const envSnapshot = {};
for (const k of ENV_KEYS) envSnapshot[k] = process.env[k];

test.after(() => {
  for (const k of ENV_KEYS) {
    if (envSnapshot[k] === undefined) delete process.env[k];
    else process.env[k] = envSnapshot[k];
  }
});

// ---------------------------------------------------------------------------
// effectivePrice：峰谷切换 / 回退档 / 临界点
// ---------------------------------------------------------------------------

test('effectivePrice: 峰谷切换与旧版固定价（按 UTC 时刻精确断言）', () => {
  // 峰谷生效节点：2026-08-16 16:00 UTC。之前 = 旧版固定价。
  const legacyDate = new Date('2026-08-16T15:59:59Z');
  assert.deepStrictEqual(balance.effectivePrice('deepseek-v4-flash', legacyDate), { cacheMiss: 1, cacheHit: 0.02, output: 2 });
  // 之后：北京时间高峰（9:00-12:00、14:00-18:00）全价。
  const peakDate = new Date('2026-08-17T02:30:00Z'); // 北京 10:30
  assert.deepStrictEqual(balance.effectivePrice('deepseek-v4-flash', peakDate), { cacheMiss: 3, cacheHit: 0.1, output: 9 });
  // 空闲时段半价。
  const offDate = new Date('2026-08-17T05:00:00Z'); // 北京 13:00
  assert.deepStrictEqual(balance.effectivePrice('deepseek-v4-flash', offDate), { cacheMiss: 1.5, cacheHit: 0.05, output: 4.5 });
  // 未知模型（峰谷期）：统一按 v4-pro 高估档回退，避免少报费用，且与旧版期回退档位一致。
  assert.deepStrictEqual(balance.effectivePrice('unknown-model', peakDate), { cacheMiss: 9, cacheHit: 0.3, output: 27 });
  // 未知模型（旧版固定价期）：同样按 v4-pro 旧版价回退，杜绝两时期回退档位跳变。
  assert.deepStrictEqual(balance.effectivePrice('unknown-model', legacyDate), { cacheMiss: 3, cacheHit: 0.025, output: 6 });
  // 空模型：按 pro 兜底（与 main.js 调用方回退一致）。
  assert.deepStrictEqual(balance.effectivePrice('', peakDate), { cacheMiss: 9, cacheHit: 0.3, output: 27 });
});

test('effectivePrice: 峰谷生效临界点 ±1ms 与别名档', () => {
  const before = new Date(2026, 7, 16, 16, 0, 0, -1); // 生效前 1ms → 旧版价
  assert.deepStrictEqual(balance.effectivePrice('deepseek-v4-pro', before), { cacheMiss: 3, cacheHit: 0.025, output: 6 });
  const after = new Date('2026-08-16T16:00:00Z'); // 生效瞬间（北京 8/17 00:00，空闲）
  assert.deepStrictEqual(balance.effectivePrice('deepseek-v4-pro', after), { cacheMiss: 4.5, cacheHit: 0.15, output: 13.5 });
  // 别名 deepseek-chat 与 v4-flash 同档
  const peakDate = new Date('2026-08-17T02:30:00Z');
  assert.deepStrictEqual(balance.effectivePrice('deepseek-chat', peakDate), balance.effectivePrice('deepseek-v4-flash', peakDate));
  assert.deepStrictEqual(balance.effectivePrice('deepseek-reasoner', peakDate), balance.effectivePrice('deepseek-v4-pro', peakDate));
  // 空白模型名（'  '）同样兜底 pro
  assert.deepStrictEqual(balance.effectivePrice('   ', peakDate), balance.effectivePrice('deepseek-v4-pro', peakDate));
  // 无效日期：Date 无效 → isPeakHour false → 空闲半价（峰谷期）
  const bad = balance.effectivePrice('deepseek-v4-flash', new Date('not-a-date'));
  assert.deepStrictEqual(bad, { cacheMiss: 1.5, cacheHit: 0.05, output: 4.5 });
  // 返回全新对象：修改返回值不影响后续调用
  const a = balance.effectivePrice('deepseek-v4-flash', peakDate);
  a.cacheMiss = 999;
  assert.strictEqual(balance.effectivePrice('deepseek-v4-flash', peakDate).cacheMiss, 3);
});

test('effectivePrice: 北京时间 9/12/14/18 四个切换边界', () => {
  // 北京 08:59:59.999（00:59:59.999Z）空闲；09:00:00（01:00:00Z）高峰
  assert.strictEqual(balance.effectivePrice('deepseek-v4-flash', new Date('2026-08-17T00:59:59.999Z')).cacheMiss, 1.5);
  assert.strictEqual(balance.effectivePrice('deepseek-v4-flash', new Date('2026-08-17T01:00:00Z')).cacheMiss, 3);
  // 北京 11:59:59.999 高峰；12:00:00 午间空闲
  assert.strictEqual(balance.effectivePrice('deepseek-v4-flash', new Date('2026-08-17T03:59:59.999Z')).cacheMiss, 3);
  assert.strictEqual(balance.effectivePrice('deepseek-v4-flash', new Date('2026-08-17T04:00:00Z')).cacheMiss, 1.5);
  // 北京 13:59:59.999 空闲；14:00:00 高峰
  assert.strictEqual(balance.effectivePrice('deepseek-v4-flash', new Date('2026-08-17T05:59:59.999Z')).cacheMiss, 1.5);
  assert.strictEqual(balance.effectivePrice('deepseek-v4-flash', new Date('2026-08-17T06:00:00Z')).cacheMiss, 3);
  // 北京 17:59:59.999 高峰；18:00:00 空闲
  assert.strictEqual(balance.effectivePrice('deepseek-v4-flash', new Date('2026-08-17T09:59:59.999Z')).cacheMiss, 3);
  assert.strictEqual(balance.effectivePrice('deepseek-v4-flash', new Date('2026-08-17T10:00:00Z')).cacheMiss, 1.5);
});

// ---------------------------------------------------------------------------
// isPeakHour
// ---------------------------------------------------------------------------

test('isPeakHour: 北京时间高峰边界', () => {
  // 北京 08:59（00:59Z）非高峰；09:00（01:00Z）起高峰。
  assert.equal(balance.isPeakHour(new Date('2026-08-17T00:59:00Z')), false);
  assert.equal(balance.isPeakHour(new Date('2026-08-17T01:00:00Z')), true);
  // 北京 11:59 高峰；12:00 午间低谷。
  assert.equal(balance.isPeakHour(new Date('2026-08-17T03:59:00Z')), true);
  assert.equal(balance.isPeakHour(new Date('2026-08-17T04:00:00Z')), false);
  // 北京 13:59 低谷；14:00 起高峰。
  assert.equal(balance.isPeakHour(new Date('2026-08-17T05:59:00Z')), false);
  assert.equal(balance.isPeakHour(new Date('2026-08-17T06:00:00Z')), true);
  // 北京 17:59 高峰；18:00 起空闲。
  assert.equal(balance.isPeakHour(new Date('2026-08-17T09:59:00Z')), true);
  assert.equal(balance.isPeakHour(new Date('2026-08-17T10:00:00Z')), false);
});

test('isPeakHour: 峰谷生效前的旧版期一律 false（与 effectivePrice 的旧版固定价一致）', () => {
  // 旧版期即使落在北京高峰时段也应返回 false——否则 chip 与计价档自相矛盾。
  assert.equal(balance.isPeakHour(new Date('2026-08-16T02:30:00Z')), false); // 北京 8/16 10:30
  assert.equal(balance.isPeakHour(new Date('2026-08-16T15:59:59Z')), false);
  // 生效瞬间（北京 8/17 00:00）是空闲
  assert.equal(balance.isPeakHour(new Date('2026-08-16T16:00:00Z')), false);
});

test('isPeakHour: 无效日期 / 非 Date 输入不抛异常且语义明确', () => {
  assert.equal(balance.isPeakHour(new Date('invalid')), false); // 无效日期 → false
  assert.equal(balance.isPeakHour('2026-08-17T02:30:00Z'), true); // 字符串可被 new Date 解析 → 北京 10:30 高峰
  assert.equal(typeof balance.isPeakHour(undefined), 'boolean'); // undefined → 当前时刻：不抛异常即可
  assert.equal(typeof balance.isPeakHour(12345), 'boolean'); // 数字按时间戳解析：不抛异常即可
});

// ---------------------------------------------------------------------------
// priceTable
// ---------------------------------------------------------------------------

test('priceTable: 全部模型同刻求值，别名与主名同档', () => {
  const peakDate = new Date('2026-08-17T02:30:00Z');
  const table = balance.priceTable(peakDate);
  assert.deepStrictEqual(Object.keys(table).sort(), ['deepseek-chat', 'deepseek-reasoner', 'deepseek-v4-flash', 'deepseek-v4-pro']);
  assert.deepStrictEqual(table['deepseek-v4-flash'], { cacheMiss: 3, cacheHit: 0.1, output: 9 });
  assert.deepStrictEqual(table['deepseek-chat'], table['deepseek-v4-flash']);
  assert.deepStrictEqual(table['deepseek-reasoner'], table['deepseek-v4-pro']);
});

// ---------------------------------------------------------------------------
// parseAmount
// ---------------------------------------------------------------------------

test('parseAmount: 千分位/货币符号/空白剥离与钳制', () => {
  assert.strictEqual(balance.parseAmount('1,234.56'), 1234.56);
  assert.strictEqual(balance.parseAmount('¥88'), 88);
  assert.strictEqual(balance.parseAmount('￥ 88 '), 88);
  assert.strictEqual(balance.parseAmount('$1,000.5'), 1000.5);
  assert.strictEqual(balance.parseAmount(' 12.5 '), 12.5);
  assert.strictEqual(balance.parseAmount(123.45), 123.45);
  assert.strictEqual(balance.parseAmount(0), 0);
  assert.strictEqual(balance.parseAmount('0'), 0);
  // 负数钳为 0（业务规则：余额不为负）
  assert.strictEqual(balance.parseAmount('-5'), 0);
  assert.strictEqual(balance.parseAmount(-12), 0);
  // 不可解析 → null（调用方决定降级策略，绝不静默 0 掩盖脏数据）
  assert.strictEqual(balance.parseAmount('abc'), null);
  assert.strictEqual(balance.parseAmount(''), null);
  assert.strictEqual(balance.parseAmount(null), null);
  assert.strictEqual(balance.parseAmount(undefined), null);
  assert.strictEqual(balance.parseAmount('Infinity'), null);
  assert.strictEqual(balance.parseAmount(Infinity), null);
  assert.strictEqual(balance.parseAmount(NaN), null);
  // 数字串尾部带注释形态文本 → 整体不可解析（接口契约：纯数值）
  assert.strictEqual(balance.parseAmount('88.5 CNY'), null);
});

// ---------------------------------------------------------------------------
// pickUsageWindow
// ---------------------------------------------------------------------------

test('pickUsageWindow: percent=null 保持 null（绝不折算成 0），0 保持 0', () => {
  assert.deepStrictEqual(balance.pickUsageWindow({ status: 'ok', percent: null, resetsAt: 'x' }), { status: 'ok', percent: null, resetsAt: 'x' });
  assert.deepStrictEqual(balance.pickUsageWindow({ percent: undefined }), { status: null, percent: null, resetsAt: null });
  assert.deepStrictEqual(balance.pickUsageWindow({ percent: 0 }), { status: null, percent: 0, resetsAt: null });
  assert.deepStrictEqual(balance.pickUsageWindow({ percent: '42' }), { status: null, percent: 42, resetsAt: null });
  assert.deepStrictEqual(balance.pickUsageWindow({ percent: 'abc' }), { status: null, percent: null, resetsAt: null });
  assert.deepStrictEqual(balance.pickUsageWindow({ percent: NaN }), { status: null, percent: null, resetsAt: null });
  // 非对象输入
  assert.strictEqual(balance.pickUsageWindow(null), null);
  assert.strictEqual(balance.pickUsageWindow(undefined), null);
  assert.strictEqual(balance.pickUsageWindow('str'), null);
  // status/resetsAt 只接受字符串
  assert.deepStrictEqual(balance.pickUsageWindow({ status: 200, resetsAt: 42, percent: 10 }), { status: null, percent: 10, resetsAt: null });
});

// ---------------------------------------------------------------------------
// readCredentialLine：顶层键锚定
// ---------------------------------------------------------------------------

test('readCredentialLine: 只读顶层键，嵌套段同名键不匹配', () => {
  const dir = tmpHome();
  try {
    const creds = [
      'DEEPSEEK_API_KEY: sk-top-level',
      'some-plugin:',
      '  DEEPSEEK_API_KEY: sk-nested-should-not-win',
      '  sub:',
      '    DEEPSEEK_API_KEY: sk-deep-nested',
      'OPENCODE_GO_API_KEY: go-top',
    ].join('\n');
    fs.writeFileSync(path.join(dir, '.credentials.yaml'), creds, 'utf8');
    assert.strictEqual(balance.readCredentialLine(dir, 'DEEPSEEK_API_KEY'), 'sk-top-level');
    assert.strictEqual(balance.readCredentialLine(dir, 'OPENCODE_GO_API_KEY'), 'go-top');
  } finally {
    cleanup(dir);
  }
});

test('readCredentialLine: 带引号的值 / 行尾注释 / 缺失文件 / 键名正则元字符', () => {
  const dir = tmpHome();
  try {
    const creds = [
      'QUOTED: "sk-with-quotes"',
      "SINGLE: 'sk-single'",
      'HASH_IN_VALUE: sk-abc123',
      'COMMENTED: sk-value  # 行尾注释',
      'KEY.WITH[SPECIAL]: sk-regex-safe',
    ].join('\n');
    fs.writeFileSync(path.join(dir, '.credentials.yaml'), creds, 'utf8');
    assert.strictEqual(balance.readCredentialLine(dir, 'QUOTED'), 'sk-with-quotes');
    assert.strictEqual(balance.readCredentialLine(dir, 'SINGLE'), 'sk-single');
    assert.strictEqual(balance.readCredentialLine(dir, 'HASH_IN_VALUE'), 'sk-abc123');
    assert.strictEqual(balance.readCredentialLine(dir, 'COMMENTED'), 'sk-value');
    // 键名含正则元字符（. [ ]）必须字面匹配
    assert.strictEqual(balance.readCredentialLine(dir, 'KEY.WITH[SPECIAL]'), 'sk-regex-safe');
    // 缺失文件 → 空串
    assert.strictEqual(balance.readCredentialLine(path.join(dir, 'missing'), 'DEEPSEEK_API_KEY'), '');
    // 不存在的键 → 空串
    assert.strictEqual(balance.readCredentialLine(dir, 'NOT_THERE'), '');
  } finally {
    cleanup(dir);
  }
});

test('readCredentialLine: 前缀相似键不误匹配（DEEPSEEK_API_KEY 不匹配 DEEPSEEK_API_KEY_X）', () => {
  const dir = tmpHome();
  try {
    fs.writeFileSync(path.join(dir, '.credentials.yaml'), 'DEEPSEEK_API_KEY_EXTRA: sk-other\nDEEPSEEK_API_KEY: sk-right\n', 'utf8');
    assert.strictEqual(balance.readCredentialLine(dir, 'DEEPSEEK_API_KEY'), 'sk-right');
  } finally {
    cleanup(dir);
  }
});

// ---------------------------------------------------------------------------
// readActiveModel：段锚定
// ---------------------------------------------------------------------------

test('readActiveModel: 锚定 agent-default-model 段并剥离引号', () => {
  const dir = tmpHome();
  try {
    const settings = [
      'agent-default-model:',
      '  model: deepseek-v4-pro',
      '',
      'some-plugin:',
      '  model: "should-not-be-read"',
      '',
    ].join('\n');
    fs.writeFileSync(path.join(dir, 'settings.yaml'), settings, 'utf8');
    assert.equal(balance.readActiveModel(dir), 'deepseek-v4-pro');
    // 带引号的值也要剥离引号
    fs.writeFileSync(path.join(dir, 'settings.yaml'), 'agent-default-model:\n  model: \'deepseek-v4-flash\'\n', 'utf8');
    assert.equal(balance.readActiveModel(dir), 'deepseek-v4-flash');
    // 文件缺失 → 空串
    assert.equal(balance.readActiveModel(path.join(dir, 'missing')), '');
  } finally {
    cleanup(dir);
  }
});

test('readActiveModel: 前缀相似段 / 段内更深嵌套同名键不误匹配', () => {
  const dir = tmpHome();
  try {
    // agent-default-model-extra 不算目标段
    const s1 = [
      'agent-default-model-extra:',
      '  model: wrong-extra',
      'agent-default-model:',
      '  model: right-model',
    ].join('\n');
    fs.writeFileSync(path.join(dir, 'settings.yaml'), s1, 'utf8');
    assert.equal(balance.readActiveModel(dir), 'right-model');
    // 段内更深嵌套的 model（缩进更深）不优先于浅层 model
    const s2 = [
      'agent-default-model:',
      '  nested:',
      '    model: wrong-deep',
      '  model: right-shallow',
    ].join('\n');
    fs.writeFileSync(path.join(dir, 'settings.yaml'), s2, 'utf8');
    assert.equal(balance.readActiveModel(dir), 'right-shallow');
    // 目标段不在文件首部
    const s3 = [
      'other:',
      '  model: wrong-other',
      'agent-default-model:',
      '  model: right-late',
    ].join('\n');
    fs.writeFileSync(path.join(dir, 'settings.yaml'), s3, 'utf8');
    assert.equal(balance.readActiveModel(dir), 'right-late');
    // 无目标段 → 空串
    fs.writeFileSync(path.join(dir, 'settings.yaml'), 'other:\n  model: x\n', 'utf8');
    assert.equal(balance.readActiveModel(dir), '');
  } finally {
    cleanup(dir);
  }
});

// ---------------------------------------------------------------------------
// 端点覆盖
// ---------------------------------------------------------------------------

test('balanceEndpoint: 完整 URL 优先于 API_BASE', () => {
  const savedUrl = process.env.DEEPSEEK_BALANCE_URL;
  const savedBase = process.env.DEEPSEEK_API_BASE;
  try {
    process.env.DEEPSEEK_BALANCE_URL = 'http://proxy.local:8000/user/balance';
    process.env.DEEPSEEK_API_BASE = 'http://ignored.local';
    assert.strictEqual(balance.balanceEndpoint(), 'http://proxy.local:8000/user/balance');
    delete process.env.DEEPSEEK_BALANCE_URL;
    process.env.DEEPSEEK_API_BASE = 'https://mirror.example.com/api/';
    assert.strictEqual(balance.balanceEndpoint(), 'https://mirror.example.com/api/user/balance');
    delete process.env.DEEPSEEK_API_BASE;
    assert.strictEqual(balance.balanceEndpoint(), 'https://api.deepseek.com/user/balance');
  } finally {
    if (savedUrl === undefined) delete process.env.DEEPSEEK_BALANCE_URL; else process.env.DEEPSEEK_BALANCE_URL = savedUrl;
    if (savedBase === undefined) delete process.env.DEEPSEEK_API_BASE; else process.env.DEEPSEEK_API_BASE = savedBase;
  }
});

test('opencodeUsageEndpoint: OPENCODE_USAGE_URL 环境变量覆盖', () => {
  const saved = process.env.OPENCODE_USAGE_URL;
  try {
    assert.strictEqual(balance.opencodeUsageEndpoint(), 'https://opencode.ai/zen/go/v1/usage');
    process.env.OPENCODE_USAGE_URL = 'http://mirror.local/go/usage';
    assert.strictEqual(balance.opencodeUsageEndpoint(), 'http://mirror.local/go/usage');
    delete process.env.OPENCODE_USAGE_URL;
    assert.strictEqual(balance.opencodeUsageEndpoint(), 'https://opencode.ai/zen/go/v1/usage');
  } finally {
    if (saved === undefined) delete process.env.OPENCODE_USAGE_URL; else process.env.OPENCODE_USAGE_URL = saved;
  }
});

// ---------------------------------------------------------------------------
// readApiKey / readOpencodeGoKey：优先级链
// ---------------------------------------------------------------------------

test('readApiKey: 环境变量优先于 credentials', () => {
  const dir = tmpHome();
  const saved = process.env.DEEPSEEK_API_KEY;
  try {
    fs.writeFileSync(path.join(dir, '.credentials.yaml'), 'DEEPSEEK_API_KEY: sk-from-file\n', 'utf8');
    assert.strictEqual(balance.readApiKey(dir), 'sk-from-file');
    process.env.DEEPSEEK_API_KEY = '  sk-from-env  ';
    assert.strictEqual(balance.readApiKey(dir), 'sk-from-env'); // trim 后
    delete process.env.DEEPSEEK_API_KEY;
    assert.strictEqual(balance.readApiKey(dir), 'sk-from-file');
    assert.strictEqual(balance.readApiKey(path.join(dir, 'missing')), '');
  } finally {
    cleanup(dir);
    if (saved === undefined) delete process.env.DEEPSEEK_API_KEY; else process.env.DEEPSEEK_API_KEY = saved;
  }
});

test('readOpencodeGoKey: env(GO>兼容名) > credentials > 空', () => {
  const dir = tmpHome();
  const savedGo = process.env.OPENCODE_GO_API_KEY;
  const savedCompat = process.env.OPENCODE_API_KEY;
  try {
    delete process.env.OPENCODE_GO_API_KEY;
    delete process.env.OPENCODE_API_KEY;
    fs.writeFileSync(path.join(dir, '.credentials.yaml'), 'OPENCODE_GO_API_KEY: go-from-file\n', 'utf8');
    assert.strictEqual(balance.readOpencodeGoKey(dir), 'go-from-file');
    process.env.OPENCODE_API_KEY = 'go-compat-env';
    assert.strictEqual(balance.readOpencodeGoKey(dir), 'go-compat-env');
    process.env.OPENCODE_GO_API_KEY = 'go-env';
    assert.strictEqual(balance.readOpencodeGoKey(dir), 'go-env'); // 专用名优先
  } finally {
    cleanup(dir);
    if (savedGo === undefined) delete process.env.OPENCODE_GO_API_KEY; else process.env.OPENCODE_GO_API_KEY = savedGo;
    if (savedCompat === undefined) delete process.env.OPENCODE_API_KEY; else process.env.OPENCODE_API_KEY = savedCompat;
  }
});

// ---------------------------------------------------------------------------
// redirectAuthorization：密钥重定向保留规则（仅「同主机 + 全程 https」保留）
// ---------------------------------------------------------------------------

test('redirectAuthorization: 同主机（默认端口归一化）保留，跨主机/降级/空密钥剥离', () => {
  // 显式默认端口 :443 与省略端口视为同主机 → 保留
  assert.strictEqual(balance.redirectAuthorization('https://api.deepseek.com/user/balance', 'https://api.deepseek.com:443/user/balance', 'sk'), 'Bearer sk');
  assert.strictEqual(balance.redirectAuthorization('https://api.deepseek.com:443/a', 'https://api.deepseek.com/b', 'sk'), 'Bearer sk');
  // 不同端口 = 跨主机 → 剥离
  assert.strictEqual(balance.redirectAuthorization('https://api.deepseek.com/a', 'https://api.deepseek.com:8443/b', 'sk'), null);
  // 不同主机名 → 剥离
  assert.strictEqual(balance.redirectAuthorization('https://api.deepseek.com/a', 'https://evil.example.com/b', 'sk'), null);
  // https → http 降级（即使同主机）→ 剥离
  assert.strictEqual(balance.redirectAuthorization('https://api.deepseek.com/a', 'http://api.deepseek.com/b', 'sk'), null);
  // 空密钥 → null（不带 Authorization）
  assert.strictEqual(balance.redirectAuthorization('https://a.com/a', 'https://a.com/b', ''), null);
  // 畸形 URL → null（宁可不携带）
  assert.strictEqual(balance.redirectAuthorization('not-a-url', 'https://a.com/b', 'sk'), null);
});

// ---------------------------------------------------------------------------
// queryBalance：无密钥返回形态
// ---------------------------------------------------------------------------

test('queryBalance: 无密钥时返回形态一致（ok:false + balances:[]，无 prices）', async () => {
  const saved = process.env.DEEPSEEK_API_KEY;
  delete process.env.DEEPSEEK_API_KEY;
  const dir = tmpHome();
  try {
    const r = await balance.queryBalance(dir);
    assert.deepStrictEqual(Object.keys(r).sort(), ['balances', 'error', 'ok']);
    assert.equal(r.ok, false);
    assert.equal(r.error, 'no-key');
    assert.deepStrictEqual(r.balances, []);
  } finally {
    cleanup(dir);
    if (saved !== undefined) process.env.DEEPSEEK_API_KEY = saved;
  }
});

test('queryOpencodeUsage: 无密钥时返回 no-key（不发请求）', async () => {
  const saved = process.env.OPENCODE_GO_API_KEY;
  const savedCompat = process.env.OPENCODE_API_KEY;
  delete process.env.OPENCODE_GO_API_KEY;
  delete process.env.OPENCODE_API_KEY;
  const dir = tmpHome();
  try {
    const r = await balance.queryOpencodeUsage(dir);
    assert.deepStrictEqual(r, { ok: false, reason: 'no-key' });
  } finally {
    cleanup(dir);
    if (saved !== undefined) process.env.OPENCODE_GO_API_KEY = saved;
    if (savedCompat !== undefined) process.env.OPENCODE_API_KEY = savedCompat;
  }
});
