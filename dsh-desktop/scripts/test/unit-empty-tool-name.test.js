'use strict';
// unit-empty-tool-name.test.js —— K11（unknown tool "" 死循环）空工具名指引补丁单测。
//
// 覆盖：
//   1. transform 三态：pristine 命中（空 name 特判 + 指引）/ already 幂等 /
//      anchor-missing 容忍（版本漂移不改写）。
//   2. 补丁语义（真实 eval）：空 name → 带「工具调用 name 为空」指引；非空
//      name → `unknown tool "${name}"` 与带 reachableFrom 分支逐字不变。
//   3. 根应用器：临时目录真实读写（应用 → already → 计数与日志）。
//   4. 注册表登记：empty-tool-name-guidance 条目存在、root 应用器可解析、
//      cli:true（CLI 同步期也应用）、failPolicy warn。
//   5. patch-deps 集成：dev node_modules 目标文件在补丁后含 marker。

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  patchEmptyToolName,
  transformEmptyToolName,
  EMPTY_TOOL_NAME_MARKER,
  TOOLS_REL,
  resolveTargetFiles,
} = require('../lib/empty-tool-name-patch');

/** ToolNotFoundError 上游 pristine 形态（2-tab 缩进，含最小 HarnessError 桩供 eval）。 */
const PRISTINE = [
  'class HarnessError extends Error {',
  '\tconstructor(message, code) { super(message); this.code = code; }',
  '}',
  'var ToolNotFoundError = class extends HarnessError {',
  '\tconstructor(toolName, reachableFrom) {',
  '\t\tsuper(reachableFrom === void 0 ? `unknown tool "${toolName}"` : `unknown tool "${toolName}": ${reachableFrom}`, "UNKNOWN_TOOL");',
  '\t\tthis.name = "ToolNotFoundError";',
  '\t}',
  '};',
].join('\n');

/** 把（补丁后）源码 eval 成 ToolNotFoundError 构造器，供语义断言用。 */
function instantiate(src) {
  return new Function(src + '\nreturn ToolNotFoundError;')();
}

// 仓库根（dsh-desktop/）：本文件在 scripts/test/ 下，故要上溯两级。
// 旧值 `path.resolve(__dirname, '..')` 落在 scripts/，于是 `PKG_DIR/node_modules/...`
// 恒不存在、下面第 5 条用例静默 early-return —— 看着绿，判据根本没跑（假绿）。
const PKG_DIR = path.resolve(__dirname, '..', '..');

test('transform: pristine 命中 → 空 name 特判 + 指引注入', () => {
  const r = transformEmptyToolName(PRISTINE, 'x.js');
  assert.equal(r.status, 'changed');
  assert.ok(r.src.includes(EMPTY_TOOL_NAME_MARKER));
  // 语义核心：空 name 报错携带可操作指引，非空 name 逐字不变。
  const E = instantiate(r.src);
  const emptyMsg = new E('').message;
  assert.ok(emptyMsg.includes('工具调用 name 为空'), '空 name 必须携带中文指引');
  assert.ok(!emptyMsg.includes('unknown tool ""'), '不再输出裸 `unknown tool ""`');
  assert.equal(new E('foo').message, 'unknown tool "foo"');
  assert.equal(new E('foo', 'bar').message, 'unknown tool "foo": bar');
});

test('transform: 已应用 → already 幂等', () => {
  const once = transformEmptyToolName(PRISTINE, 'x.js');
  const twice = transformEmptyToolName(once.src, 'x.js');
  assert.equal(twice.status, 'already');
});

test('transform: 锚点失配 → anchor-missing 不改写', () => {
  const drifted = PRISTINE.replace('"UNKNOWN_TOOL"', '"UNKNOWN_TOOL_CODE"');
  const r = transformEmptyToolName(drifted, 'x.js');
  assert.equal(r.status, 'anchor-missing');
});

test('根应用器: 临时目录 应用→幂等→计数', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'empty-tool-name-'));
  try {
    const target = path.join(tmp, '@deepseek-ai', TOOLS_REL);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, PRISTINE, 'utf8');
    const logs = [];
    const stats = { anchorMissing: 0, failed: 0 };
    assert.equal(patchEmptyToolName(tmp, (m) => logs.push(m), stats), 1, '首次应用应计 1');
    assert.equal(fs.readFileSync(target, 'utf8').includes(EMPTY_TOOL_NAME_MARKER), true);
    assert.equal(patchEmptyToolName(tmp, () => {}, stats), 0, '再次应用幂等计 0');
    assert.equal(stats.anchorMissing, 0);
    assert.equal(stats.failed, 0);
    // 目录缺包 → 静默 0。
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'empty-tool-name-empty-'));
    try {
      assert.equal(patchEmptyToolName(empty, () => {}), 0);
    } finally {
      fs.rmSync(empty, { recursive: true, force: true });
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('注册表: empty-tool-name-guidance 条目登记齐全', () => {
  const { getSpecsByGroup } = require('../lib/patch-registry');
  const spec = getSpecsByGroup().find((s) => s.id === 'empty-tool-name-guidance');
  assert.ok(spec, 'patch-registry 必须登记 empty-tool-name-guidance');
  assert.equal(spec.kind, 'root');
  assert.equal(spec.group, 'package');
  assert.equal(spec.failPolicy, 'warn');
  assert.equal(spec.cli, true, 'CLI 同步期也应应用（内核包补丁）');
  assert.equal(typeof spec.apply, 'function');
  assert.ok(spec.successLog && spec.failLog);
});

test('dev node_modules: 补丁后承载 ToolNotFoundError 的文件含 marker 且裸报错已替换', () => {
  const nmRoot = path.join(PKG_DIR, 'node_modules');
  // 0.2.2-rc.1 起 dsh-tools 由单文件 bundle 拆成 lib/index.js + lib/shared-<内容哈希>.js，
  // ToolNotFoundError 搬进哈希 chunk（index.js 只 re-export）。故不写死 index.js，
  // 也不写死哈希名——按「实际承载锚点/marker 的文件」解析。文件不在场才允许跳过
  // （CI 干净环境未 npm install；postinstall 会补），且此刻应已是补丁后形态。
  const files = resolveTargetFiles(nmRoot);
  assert.ok(files.length > 0, 'dev node_modules 缺 dsh-tools/lib/index.js（跑 npm ci）');
  assert.equal(patchEmptyToolName(nmRoot, () => {}), 0, 'dev 树应已是补丁态（幂等 0 写入）');
  const carriers = files.filter((f) => fs.readFileSync(f, 'utf8').includes(EMPTY_TOOL_NAME_MARKER));
  assert.equal(carriers.length, 1,
    `应恰有一个文件承载空工具名指引（实得 ${carriers.length}）；候选=${files.join(', ')}`);
  // 承载文件必须是拆分后的 chunk（哈希名逐版变，只咬形状，绝不写死具体哈希）。
  assert.ok(/shared-[0-9A-Za-z_-]+\.js$/.test(carriers[0]),
    'carrier 应为 lib/shared-<hash>.js（单文件 bundle 已拆），实得 ' + path.basename(carriers[0]));
  const src = fs.readFileSync(carriers[0], 'utf8');
  assert.ok(src.includes(EMPTY_TOOL_NAME_MARKER), 'dev 树应含空工具名指引 marker');
  assert.ok(src.includes('工具调用 name 为空'), 'dev 树应含中文指引正文');
  // 裸 `unknown tool ""` 分支已被替换：原始 super 行不应再存在。
  assert.ok(!src.includes('super(reachableFrom === void 0 ? `unknown tool "${toolName}"` : `unknown tool "${toolName}": ${reachableFrom}`, "UNKNOWN_TOOL");'), '原始 super 行应已替换');
  // 非空 name 两分支逐字保留。
  assert.ok(src.includes('message = `unknown tool "${toolName}"`;'));
  assert.ok(src.includes('message = `unknown tool "${toolName}": ${reachableFrom}`;'));
});
