'use strict';
// unit-patch-pi-ai-credits.test.js —— F2（第三方模型接入反馈）补丁单测。
//
// 覆盖：
//   1. transform 三态：pristine 命中（余额判定前置到 401-AUTH 之前）/ already
//      幂等 / anchor-missing 容忍（版本漂移不改写）。
//   2. 补丁语义：patched 源码中 isQuotaExceededError 判定行必须出现在 401/403
//      判定行之前（欠费 401 + CreditsError → QUOTA 而非 AUTH）。
//   3. 根应用器：临时目录真实读写（应用 → already → 计数与日志）。
//   4. 注册表登记：pi-ai-credits 条目存在、root 应用器可解析、cli:true
//      （CLI 同步期也应用）、failPolicy warn。
//   5. patch-deps 集成：dev node_modules 目标文件在补丁后含 marker。

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  patchPiAiCredits,
  transformPiAiCredits,
  PATCH_MARKER,
  PKG_REL,
} = require('../patch-pi-ai-credits');

/** classifyPiAiError 上游 pristine 形态（tab 缩进、401 在前、余额在后）。 */
const PRISTINE = [
  'function classifyPiAiError(message) {',
  '\tif (/\\b(?:401|403)\\b/.test(message)) return "AUTH";',
  '\tif (isQuotaExceededError(message)) return QUOTA_EXCEEDED_CODE;',
  '\tif (/\\b429\\b|rate.?limit/i.test(message)) return "RATE_LIMIT";',
  '\treturn "PI_AI_ERROR";',
  '}',
].join('\n');

// dsh-desktop 包根（本文件在 scripts/test/ 下，上一级是 scripts/，再上一级才是包根）。
// 2026-11-12 修正：原先只上溯一级指到 scripts/，拼出的 scripts/node_modules/... 恒不存在，
// 下面「dev node_modules」那条断言长期空转（静默 return），换代后才发现。
const PKG_DIR = path.resolve(__dirname, '..', '..');
const REPO_ROOT = path.resolve(PKG_DIR, '..');

test('transform: pristine 命中 → 余额判定前置', () => {
  const r = transformPiAiCredits(PRISTINE, 'x.js');
  assert.equal(r.status, 'changed');
  assert.ok(r.src.includes(PATCH_MARKER));
  // 语义核心：余额判定行在 401/403 判定行之前。
  const quotaAt = r.src.indexOf('if (isQuotaExceededError(message))');
  const authAt = r.src.indexOf('if (/\\b(?:401|403)\\b/.test(message))');
  assert.ok(quotaAt >= 0 && authAt > quotaAt, 'isQuotaExceededError 必须先于 401/403 判定');
});

test('transform: 已应用 → already 幂等', () => {
  const once = transformPiAiCredits(PRISTINE, 'x.js');
  const twice = transformPiAiCredits(once.src, 'x.js');
  assert.equal(twice.status, 'already');
});

test('transform: 锚点失配 → anchor-missing 不改写', () => {
  const drifted = PRISTINE.replace('return "AUTH";', 'return "AUTH_CODE";');
  const r = transformPiAiCredits(drifted, 'x.js');
  assert.equal(r.status, 'anchor-missing');
});

test('transform: CRLF 历史发布形态也命中', () => {
  const crlf = PRISTINE.replace(/\n/g, '\r\n');
  const r = transformPiAiCredits(crlf, 'x.js');
  assert.equal(r.status, 'changed');
});

test('根应用器: 临时目录 应用→幂等→计数', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-ai-credits-'));
  try {
    const target = path.join(tmp, PKG_REL);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, PRISTINE, 'utf8');
    const logs = [];
    const stats = { anchorMissing: 0, failed: 0 };
    assert.equal(patchPiAiCredits(tmp, (m) => logs.push(m), stats), 1, '首次应用应计 1');
    assert.equal(fs.readFileSync(target, 'utf8').includes(PATCH_MARKER), true);
    assert.equal(patchPiAiCredits(tmp, () => {}, stats), 0, '再次应用幂等计 0');
    assert.equal(stats.anchorMissing, 0);
    assert.equal(stats.failed, 0);
    // 目录缺包 → 静默 0。
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-ai-credits-empty-'));
    try {
      assert.equal(patchPiAiCredits(empty, () => {}), 0);
    } finally {
      fs.rmSync(empty, { recursive: true, force: true });
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('注册表: pi-ai-credits 条目登记齐全', () => {
  const { getSpecsByGroup } = require('../lib/patch-registry');
  const spec = getSpecsByGroup().find((s) => s.id === 'pi-ai-credits');
  assert.ok(spec, 'patch-registry 必须登记 pi-ai-credits');
  assert.equal(spec.kind, 'root');
  assert.equal(spec.group, 'package');
  assert.equal(spec.failPolicy, 'warn');
  assert.equal(spec.cli, true, 'CLI 同步期也应应用（内核包补丁）');
  assert.equal(typeof spec.apply, 'function');
  assert.ok(spec.successLog && spec.failLog);
});

test('dev node_modules: 补丁后目标文件含 marker 且判定序正确', () => {
  const file = path.join(PKG_DIR, 'node_modules', PKG_REL);
  if (!fs.existsSync(file)) {
    // CI 干净环境可能未 npm install；postinstall 会补，跳过即可。
    return;
  }
  const n = patchPiAiCredits(path.join(PKG_DIR, 'node_modules'), () => {});
  const src = fs.readFileSync(file, 'utf8');
  assert.ok(src.includes(PATCH_MARKER), 'dev node_modules 应含余额判定 marker（本断言前已幂等应用）');
  const quotaAt = src.indexOf('if (isQuotaExceededError(message))');
  // rc.2 起上游把「行首 HTTP 状态码」抽成 statusSource，AUTH 行判定读的是它（不再读 message）。
  const authAt = src.search(/if \(\/\\b\(\?:401\|403\)\\b\/\.test\((?:statusSource|message)\)\)/);
  assert.ok(quotaAt >= 0 && authAt > quotaAt, '余额判定必须先于 401/403（实际改动数 ' + n + '）');
});
