'use strict';

// loader 自动隔离补丁「深水区」单测（unit-loader-isolation-deep）。
// 与 unit-loader-isolation.test.js 互补：那一个做锚点命中/幂等/注入契约的
// 冒烟断言；本文件做穷举级断言——
//   · 语法变体矩阵（LF / CRLF / 混排缩进 / 额外 if 深度 / 单行压缩）；
//   · 真实语义行为执行（子进程跑变换后的迷你 loader，验证「非受保护失败不
//     拖垮进程、受保护核心仍 fatal、成功零输出」）；
//   · 锚点 vs 真实 vendored 产物（已变换 → 断言 marker + 注入体）；
//   · marker 单一数据源与 stderr 标记格式（经 plugin-core markers.js 解析）；
//   · 锚点缺失/部分锚点路径。
// 只读断言：绝不写真实 node_modules；临时文件一律落 os.tmpdir()。

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const {
  LOADER_TREE_ISOLATION_MARKER,
  LOADER_ACTIVATION_ISOLATION_MARKER,
  FAIL_LOUD_ISOLATION_MARKER,
  markers: loaderMarkers,
  transformLoaderTreeIsolation,
  transformLoaderActivationIsolation,
  transformFailLoudIsolation,
} = require('../lib/loader-isolation');

// ── 锚点常量（与 scripts/lib/loader-isolation.js 逐字节一致；该模块不导出锚点） ──
const LOADER_UPDATE_OUTCOMES_OLD = [
  '\t\t\tconst outcomes = await Promise.allSettled(config.map((options) => this.create(options)));',
  '\t\t\tif (this.ctx.fiber.uid === null) return;',
  '\t\t\tconst failures = outcomes.filter((outcome) => outcome.status === "rejected").map((outcome) => outcome.reason);',
  '\t\t\tif (failures.length === 1) throw failures[0];',
  '\t\t\tif (failures.length > 1) throw new AggregateError(failures, "loader entries failed to apply");',
].join('\n');

const LOADER_AWAIT_FAILURES_OLD = [
  '\t\t\tconst failures = (await Promise.allSettled([...this.entries()].map((entry) => entry._await()))).filter((outcome) => outcome.status === "rejected").map((outcome) => outcome.reason);',
  '\t\t\tif (failures.length === 1) throw failures[0];',
  '\t\t\tif (failures.length > 1) throw new AggregateError(failures, "loader fibers failed");',
].join('\n');

const LOADER_HELPERS_ANCHOR = 'function updateError(stage, options, cause) {';

const APP_BOOT_BOOT_CALL_OLD = [
  '\t\tawait ctx.get("loader")?.await();',
  '\t\tif (ctx.get("loader") === void 0) return ctx;',
  '\t\tawait auditStartupEntries(ctx, binName);',
].join('\n');

const APP_BOOT_INSERT_ANCHOR = 'function composeEntries(layers, warn = () => {}) {';

const FAIL_LOUD_NO_RELEASE_OLD = [
  '\t\tif (release === void 0) {',
  '\t\t\tproc.exit(1);',
  '\t\t\treturn;',
  '\t\t}',
].join('\n');

const FAIL_LOUD_RELEASE_BLOCK_OLD = [
  '\t\t(async () => {',
  '\t\t\tlet timer;',
  '\t\t\ttry {',
  '\t\t\t\tawait Promise.race([(async () => release())(), new Promise((resolve) => {',
  '\t\t\t\t\ttimer = setTimeout(resolve, FAIL_LOUD_RELEASE_TIMEOUT_MS);',
  '\t\t\t\t})]);',
  '\t\t\t} catch {}',
  '\t\t\tclearTimeout(timer);',
  '\t\t\tproc.exit(1);',
  '\t\t})();',
].join('\n');

// ── 工具 ────────────────────────────────────────────────────────────────────
function countOccurrences(haystack, needle) {
  let n = 0;
  let idx = 0;
  while ((idx = haystack.indexOf(needle, idx)) !== -1) {
    n += 1;
    idx += needle.length;
  }
  return n;
}

function runNodeCheck(src) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-li-check-'));
  const file = path.join(dir, 'fixture.js');
  fs.writeFileSync(file, src, 'utf8');
  const r = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  fs.rmSync(dir, { recursive: true, force: true });
  return { ok: r.status === 0, stdout: r.stdout, stderr: r.stderr };
}

// 变换 → 断言 changed → 落盘 → 子进程执行 → 返回 { status, stdout, stderr }。
function transformAndRun(transformFn, fixture, env) {
  const r = transformFn(fixture, 'fixture.js');
  assert.equal(r.status, 'changed', 'transform should change the synthetic fixture');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-li-run-'));
  const file = path.join(dir, 'fixture.js');
  fs.writeFileSync(file, r.src, 'utf8');
  const res = spawnSync(process.execPath, [file], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
  fs.rmSync(dir, { recursive: true, force: true });
  return { status: res.status, stdout: res.stdout, stderr: res.stderr };
}

function parseResult(stdout) {
  const idx = stdout.indexOf('RESULT:');
  assert.notEqual(idx, -1, 'child should emit a RESULT payload; got stdout: ' + JSON.stringify(stdout));
  return JSON.parse(stdout.slice(idx + 'RESULT:'.length));
}

// 合成一个语法上合法的 mini-loader：类方法内嵌真实锚点。
function buildTreeFixture(updateBody, awaitBody) {
  return [
    "'use strict';",
    'class Loader {',
    '  async update(config) {',
    updateBody,
    '  }',
    '  async settle() {',
    awaitBody,
    '  }',
    '}',
    'function updateError(stage, options, cause) { return 1; }',
  ].join('\n');
}

// 行为执行夹具：真实锚点 + 极简 FakeLoader/FakeEntry + stderr 捕获 + 驱动。
function buildTreeBehaviorFixture() {
  return [
    "'use strict';",
    'function updateError(stage, options, cause) { return new Error("unused " + stage); }',
    '',
    'const captured = [];',
    'process.stderr.write = function (chunk) { captured.push(String(chunk)); return true; };',
    '',
    'class FakeEntry {',
    '  constructor(options) { this.options = options; }',
    '  async _await() {',
    '    if (this.options.fiberFail) throw new Error("fiber boom: " + this.options.id);',
    '    return this.options.id;',
    '  }',
    '}',
    '',
    'class FakeLoader {',
    '  constructor() { this.ctx = { fiber: { uid: "root" } }; this._entries = []; }',
    '  entries() { return this._entries; }',
    '  async create(options) {',
    '    if (options.applyFail) throw new Error("apply boom: " + options.id);',
    '    return options.id;',
    '  }',
    '  async update(config) {',
    LOADER_UPDATE_OUTCOMES_OLD,
    '  }',
    '  async settle() {',
    LOADER_AWAIT_FAILURES_OLD,
    '  }',
    '}',
    '',
    'async function main() {',
    '  const out = {};',
    '  let loader, before, threw;',
    '  // phase 1: success entries → zero extra stderr',
    '  loader = new FakeLoader();',
    '  before = captured.length;',
    '  await loader.update([{ id: "ok.plugin", name: "ok-plugin" }]);',
    '  loader._entries = [new FakeEntry({ id: "ok.fiber", name: "ok-fiber" })];',
    '  await loader.settle();',
    '  out.successExtraStderr = captured.length - before;',
    '  // phase 2: failing NON-protected apply entry → no throw + marker',
    '  loader = new FakeLoader();',
    '  before = captured.length;',
    '  threw = false;',
    '  try { await loader.update([{ id: "bad.plugin", name: "bad-plugin", applyFail: true }, { id: "ok2.plugin", name: "ok2-plugin" }]); } catch (e) { threw = true; }',
    '  out.applyNonProtected = { threw: threw, stderr: captured.slice(before) };',
    '  // phase 3: failing PROTECTED apply entry → throw',
    '  loader = new FakeLoader();',
    '  threw = false;',
    '  try { await loader.update([{ id: "core.apply", name: "@deepseek-ai/dsh-base", applyFail: true }]); } catch (e) { threw = true; }',
    '  out.applyProtected = { threw: threw };',
    '  // phase 4: failing NON-protected fiber → no throw + marker',
    '  loader = new FakeLoader();',
    '  loader._entries = [new FakeEntry({ id: "bad.fiber", name: "bad-fiber", fiberFail: true })];',
    '  before = captured.length;',
    '  threw = false;',
    '  try { await loader.settle(); } catch (e) { threw = true; }',
    '  out.fiberNonProtected = { threw: threw, stderr: captured.slice(before) };',
    '  // phase 5: failing PROTECTED fiber → throw',
    '  loader = new FakeLoader();',
    '  loader._entries = [new FakeEntry({ id: "core.fiber", name: "@deepseek-ai/dsh-web-app", fiberFail: true })];',
    '  threw = false;',
    '  try { await loader.settle(); } catch (e) { threw = true; }',
    '  out.fiberProtected = { threw: threw };',
    '  return out;',
    '}',
    'main().then(function (r) { process.stdout.write("RESULT:" + JSON.stringify(r)); }).catch(function (e) { process.stdout.write("RESULT:{\\"uncaught\\":\\"" + String(e && e.message) + "\\"}"); process.exitCode = 2; });',
  ].join('\n');
}

// 激活审计行为夹具：isolateInactiveEntries 的 fiber 状态矩阵。
function buildActivationBehaviorFixture() {
  return [
    "'use strict';",
    'const captured = [];',
    'process.stderr.write = function (chunk) { captured.push(String(chunk)); return true; };',
    '',
    'const FIBER_PENDING = 0;',
    'const FIBER_ACTIVE = 2;',
    'const FIBER_FAILED = 3;',
    'function formatActivationError(error) { return error instanceof Error ? (error.stack ?? error.message) : String(error); }',
    'function assertEntriesActivated(ctx, binName) { throw new Error("replaced"); }',
    'function composeEntries(layers, warn = () => {}) { return layers; }',
    '',
    'async function boot(ctx, binName) {',
    APP_BOOT_BOOT_CALL_OLD,
    '}',
    '',
    'function makeCtx(entries) {',
    '  const loader = { entries: function () { return entries; } };',
    '  return { loader: loader, get: function (name) { return name === "loader" ? { await: async function () {} } : undefined; } };',
    '}',
    '',
    'async function main() {',
    '  const out = {};',
    '  let before, threw;',
    '  // case 1: non-protected no-fiber → marker, no throw',
    '  before = captured.length;',
    '  threw = false;',
    '  try { await boot(makeCtx([{ options: { id: "lazy.plugin", name: "lazy-plugin" }, fiber: undefined, disabled: false }]), "testbin"); } catch (e) { threw = true; }',
    '  out.noFiber = { threw: threw, stderr: captured.slice(before) };',
    '  // case 2: protected no-fiber → fatal throw',
    '  threw = false;',
    '  try { await boot(makeCtx([{ options: { id: "core", name: "@deepseek-ai/dsh-base" }, fiber: undefined, disabled: false }]), "testbin"); } catch (e) { threw = true; }',
    '  out.noFiberProtected = { threw: threw };',
    '  // case 3: non-protected FAILED fiber → marker, no throw',
    '  before = captured.length;',
    '  threw = false;',
    '  try { await boot(makeCtx([{ options: { id: "fail.plugin", name: "fail-plugin" }, fiber: { state: FIBER_FAILED, await: async function () { throw new Error("activate boom"); } } }]), "testbin"); } catch (e) { threw = true; }',
    '  out.failed = { threw: threw, stderr: captured.slice(before) };',
    '  // case 4: non-protected PENDING fiber → marker, no throw',
    '  before = captured.length;',
    '  threw = false;',
    '  try { await boot(makeCtx([{ options: { id: "pend.plugin", name: "pend-plugin" }, fiber: { state: FIBER_PENDING, inject: { db: true, cache: true }, ctx: { get: function (s) { return s === "db" ? {} : undefined; } } } }]), "testbin"); } catch (e) { threw = true; }',
    '  out.pending = { threw: threw, stderr: captured.slice(before) };',
    '  // case 5: mixed ACTIVE + no-fiber → only the no-fiber entry emits',
    '  before = captured.length;',
    '  threw = false;',
    '  try { await boot(makeCtx([',
    '    { options: { id: "active.plugin", name: "active-plugin" }, fiber: { state: FIBER_ACTIVE } },',
    '    { options: { id: "lazy2.plugin", name: "lazy2-plugin" }, fiber: undefined, disabled: false }',
    '  ]), "testbin"); } catch (e) { threw = true; }',
    '  out.mixed = { threw: threw, stderr: captured.slice(before) };',
    '  // case 6: protected FAILED fiber → fatal throw',
    '  threw = false;',
    '  try { await boot(makeCtx([{ options: { id: "core2", name: "@deepseek-ai/dsh-base" }, fiber: { state: FIBER_FAILED, await: async function () { throw new Error("core activate"); } } }]), "testbin"); } catch (e) { threw = true; }',
    '  out.failedProtected = { threw: threw };',
    '  return out;',
    '}',
    'main().then(function (r) { process.stdout.write("RESULT:" + JSON.stringify(r)); }).catch(function (e) { process.stdout.write("RESULT:{\\"uncaught\\":\\"" + String(e && e.message) + "\\"}"); process.exitCode = 2; });',
  ].join('\n');
}

// installFailLoud 行为夹具：armed 不 exit、未 armed exit(1)。
function buildFailLoudBehaviorFixture() {
  return [
    "'use strict';",
    'const FAIL_LOUD_RELEASE_TIMEOUT_MS = 2000;',
    '',
    'function installFailLoud(binName, proc, release) {',
    '  let exiting = false;',
    '  const handler = function (err) {',
    '    if (exiting) return;',
    '    exiting = true;',
    '    proc.stderr.write(binName + ": fatal load failure: " + (err instanceof Error ? err.message : String(err)));',
    FAIL_LOUD_NO_RELEASE_OLD,
    FAIL_LOUD_RELEASE_BLOCK_OLD,
    '  };',
    '  proc.on("unhandledRejection", handler);',
    '  return function () { proc.off("unhandledRejection", handler); };',
    '}',
    '',
    'function runCase(armed) {',
    '  const cap = [];',
    '  const p = {',
    '    stderr: { write: function (c) { cap.push(String(c)); return true; } },',
    '    exit: function (code) { cap.push("EXIT:" + code); },',
    '    on: function (ev, fn) { p._handler = fn; },',
    '    off: function () {},',
    '  };',
    '  if (armed) { process.env.DSH_CRASH_SHIELD_ARMED = "1"; } else { delete process.env.DSH_CRASH_SHIELD_ARMED; }',
    '  installFailLoud("testbin", p);',
    '  p._handler(new Error("late boom"));',
    '  return cap;',
    '}',
    '',
    'const unarmed = runCase(false);',
    'const armed = runCase(true);',
    'process.stdout.write("RESULT:" + JSON.stringify({ unarmed: unarmed, armed: armed }));',
  ].join('\n');
}

const repoRoot = path.resolve(__dirname, '..', '..');
const loaderFile = path.join(repoRoot, 'node_modules', '@deepseek-ai', 'cordis-plugin-loader', 'lib', 'index.js');
const appBootFile = path.join(repoRoot, 'node_modules', '@deepseek-ai', 'dsh-app-boot', 'lib', 'index.js');

// ── 1. 语法变体矩阵 ─────────────────────────────────────────────────────────
test('loader tree: LF 精确锚点 → changed + marker + node --check + 幂等', () => {
  const fixture = buildTreeFixture(LOADER_UPDATE_OUTCOMES_OLD, LOADER_AWAIT_FAILURES_OLD);
  const r = transformLoaderTreeIsolation(fixture, 'fixture.js');
  assert.equal(r.status, 'changed');
  assert.ok(r.src.includes(LOADER_TREE_ISOLATION_MARKER), 'marker comment present');
  const check = runNodeCheck(r.src);
  assert.equal(check.ok, true, 'transformed LF output must pass node --check: ' + check.stderr);
  const r2 = transformLoaderTreeIsolation(r.src, 'fixture.js');
  assert.equal(r2.status, 'already');
});

test('loader tree: CRLF 归一化后仍命中并保持 CRLF 写回', () => {
  const fixture = buildTreeFixture(LOADER_UPDATE_OUTCOMES_OLD, LOADER_AWAIT_FAILURES_OLD).replace(/\n/g, '\r\n');
  const r = transformLoaderTreeIsolation(fixture, 'fixture.js');
  assert.equal(r.status, 'changed');
  assert.ok(r.src.includes(LOADER_TREE_ISOLATION_MARKER), 'marker comment present');
  assert.ok(r.src.includes('\r\n'), 'output must preserve CRLF');
  assert.ok(!r.src.replace(/\r\n/g, '').includes('\n'), 'no lone LF in CRLF output');
  const check = runNodeCheck(r.src);
  assert.equal(check.ok, true, 'transformed CRLF output must pass node --check: ' + check.stderr);
  assert.equal(transformLoaderTreeIsolation(r.src, 'fixture.js').status, 'already');
});

test('loader tree: 混排缩进（空格代换 Tab）→ anchor-missing 且不改写', () => {
  const updateSpaces = LOADER_UPDATE_OUTCOMES_OLD.replace(/\t/g, '    ');
  const awaitSpaces = LOADER_AWAIT_FAILURES_OLD.replace(/\t/g, '    ');
  const fixture = buildTreeFixture(updateSpaces, awaitSpaces);
  const original = fixture;
  const r = transformLoaderTreeIsolation(fixture, 'fixture.js');
  assert.equal(r.status, 'anchor-missing');
  assert.equal(r.src, undefined);
  assert.equal(fixture, original);
});

test('loader tree: 失败分支额外 if 块（更深缩进）→ anchor-missing 且不改写', () => {
  const updateDeeper = 'if (true) {\n' + LOADER_UPDATE_OUTCOMES_OLD.split('\n').map((l) => '\t' + l).join('\n') + '\n}';
  const fixture = buildTreeFixture(updateDeeper, LOADER_AWAIT_FAILURES_OLD);
  const original = fixture;
  const r = transformLoaderTreeIsolation(fixture, 'fixture.js');
  assert.equal(r.status, 'anchor-missing');
  assert.equal(r.src, undefined);
  assert.equal(fixture, original);
});

test('loader tree: 单行压缩锚点 → anchor-missing 且不改写', () => {
  const updateMin = LOADER_UPDATE_OUTCOMES_OLD.replace(/\n/g, ' ');
  const awaitMin = LOADER_AWAIT_FAILURES_OLD.replace(/\n/g, ' ');
  const fixture = buildTreeFixture(updateMin, awaitMin);
  const original = fixture;
  const r = transformLoaderTreeIsolation(fixture, 'fixture.js');
  assert.equal(r.status, 'anchor-missing');
  assert.equal(r.src, undefined);
  assert.equal(fixture, original);
});

// ── 2. 行为执行（真实语义） ─────────────────────────────────────────────────
test('loader tree 行为: 非受保护 apply/fiber 失败被隔离、受保护核心 fatal、成功零输出', () => {
  const result = transformAndRun(transformLoaderTreeIsolation, buildTreeBehaviorFixture());
  assert.equal(result.status, 0, 'child process must not exit; stderr: ' + result.stderr);
  const out = parseResult(result.stdout);
  assert.equal(out.successExtraStderr, 0, 'success entries produce zero stderr');
  // (a) 非受保护 apply 失败：不抛、打标记
  assert.equal(out.applyNonProtected.threw, false);
  assert.ok(out.applyNonProtected.stderr.join('').includes('[loader-isolation] entry bad.plugin (bad-plugin) failed to apply:'));
  // (b) 受保护 apply 失败：抛出传播
  assert.equal(out.applyProtected.threw, true);
  // (c) 非受保护 fiber 失败：不抛、打标记
  assert.equal(out.fiberNonProtected.threw, false);
  assert.ok(out.fiberNonProtected.stderr.join('').includes('[loader-isolation] entry bad.fiber (bad-fiber) failed:'));
  // 受保护 fiber 失败：抛出传播
  assert.equal(out.fiberProtected.threw, true);
});

test('activation 行为: inactive/pending/failed 打标记、受保护核心 fatal', () => {
  const result = transformAndRun(transformLoaderActivationIsolation, buildActivationBehaviorFixture());
  assert.equal(result.status, 0, 'child process must not exit; stderr: ' + result.stderr);
  const out = parseResult(result.stdout);
  assert.equal(out.noFiber.threw, false);
  assert.ok(out.noFiber.stderr.join('').includes('[loader-isolation] entry lazy.plugin (lazy-plugin): failed to load'));
  assert.equal(out.noFiberProtected.threw, true);
  assert.equal(out.failed.threw, false);
  assert.ok(out.failed.stderr.join('').includes('[loader-isolation] entry fail.plugin (fail-plugin): failed to activate:'));
  assert.equal(out.pending.threw, false);
  assert.ok(out.pending.stderr.join('').includes('[loader-isolation] entry pend.plugin (pend-plugin): pending (waiting for cache)'));
  assert.equal(out.mixed.threw, false);
  assert.equal(out.mixed.stderr.length, 1, 'ACTIVE entry must be skipped; only the no-fiber entry emits');
  assert.ok(out.mixed.stderr[0].includes('lazy2.plugin'));
  assert.equal(out.failedProtected.threw, true);
});

test('fail-loud 行为: armed 不 exit + crash-shield 标记、未 armed exit(1)', () => {
  const result = transformAndRun(transformFailLoudIsolation, buildFailLoudBehaviorFixture());
  assert.equal(result.status, 0, 'child process must not exit; stderr: ' + result.stderr);
  const out = parseResult(result.stdout);
  // 未 armed：exit(1) 被调用，且无 crash-shield 隔离标记
  assert.ok(out.unarmed.includes('EXIT:1'), 'unarmed handler must call proc.exit(1)');
  assert.ok(!out.unarmed.some((l) => l.indexOf('[crash-shield] isolated fatal load failure') === 0));
  // armed：不 exit，写 crash-shield 隔离标记
  assert.ok(!out.armed.includes('EXIT:1'), 'armed handler must not call proc.exit');
  assert.ok(out.armed.some((l) => l.indexOf('[crash-shield] isolated fatal load failure') === 0));
  assert.ok(out.armed.some((l) => l.includes('late boom')));
});

// ── 3. 锚点 vs 真实 vendored 产物（0.2.0-rc.2：tree-isolation 一层已退役）─────
test('vendored cordis-plugin-loader: rc.2 锚点整份失配 = 退役，非静默漏投', () => {
  const src = fs.readFileSync(loaderFile, 'utf8');
  const transformed = src.includes(LOADER_TREE_ISOLATION_MARKER);
  assert.equal(transformed, false, '退役后 dev 树里不该有本补丁 marker');
  assert.equal(countOccurrences(src, LOADER_UPDATE_OUTCOMES_OLD), 0, 'update 聚合失败锚点应已消失');
  assert.equal(countOccurrences(src, LOADER_AWAIT_FAILURES_OLD), 0, 'await 聚合失败锚点应已消失');
  assert.equal(transformLoaderTreeIsolation(src, loaderFile).status, 'anchor-missing');
  // 上游原生隔离的正证（回归旧形态时这里翻红 → 重新上补丁）。
  assert.ok(src.includes('Promise.allSettled'), 'EntryTree.await 走 allSettled');
  assert.equal((src.match(/\bthrow\b/g) || []).length, 3, 'throw 只剩条目查找错误 3 处');
});

test('vendored dsh-app-boot: 激活审计与 installFailLoud 均已变换 → marker + 注入体', () => {
  const src = fs.readFileSync(appBootFile, 'utf8');
  const actTransformed = src.includes(LOADER_ACTIVATION_ISOLATION_MARKER) && src.includes('async function isolateInactiveEntries(');
  if (actTransformed) {
    assert.ok(src.includes(LOADER_ACTIVATION_ISOLATION_MARKER));
    assert.ok(src.includes('async function isolateInactiveEntries('));
    assert.equal(transformLoaderActivationIsolation(src, appBootFile).status, 'already');
  } else {
    assert.equal(countOccurrences(src, APP_BOOT_BOOT_CALL_OLD), 1);
    assert.equal(countOccurrences(src, APP_BOOT_INSERT_ANCHOR), 1);
  }
  const flTransformed = src.includes(FAIL_LOUD_ISOLATION_MARKER) && src.includes(FAIL_LOUD_RELEASE_BLOCK_NEW_TEXT());
  if (flTransformed) {
    assert.ok(src.includes(FAIL_LOUD_ISOLATION_MARKER));
    assert.ok(src.includes('DSH_CRASH_SHIELD_ARMED'));
    assert.equal(transformFailLoudIsolation(src, appBootFile).status, 'already');
  } else {
    assert.equal(countOccurrences(src, FAIL_LOUD_NO_RELEASE_OLD), 1);
    assert.equal(countOccurrences(src, FAIL_LOUD_RELEASE_BLOCK_OLD), 1);
  }
});

// 新形态注入体的特征行（installFailLoud release 块里武装判定先于 release）。
function FAIL_LOUD_RELEASE_BLOCK_NEW_TEXT() {
  return [
    '\t\t(async () => {',
    '\t\t\tif (process.env.DSH_CRASH_SHIELD_ARMED === "1") {',
    '\t\t\t\tproc.stderr.write(`[crash-shield] isolated fatal load failure: ${err instanceof Error ? err.message : String(err)}\\n`);',
    '\t\t\t\treturn;',
    '\t\t\t}',
  ].join('\n');
}

// ── 4. marker 单一数据源 + stderr 标记格式 ───────────────────────────────────
test('marker 单一数据源: patch-adapters.markers 与 loader-isolation.markers 五 marker 值一致', () => {
  const { markers: adapterMarkers } = require('../lib/patch-adapters');
  // 5 = 三条在役隔离 + 两条「原文上身」诊断（loader-import-failure-report /
  // prompt-admission-reason-report，2026-10-10；含已退役的 tree-isolation 常量）。
  assert.equal(Object.keys(loaderMarkers).length, 5);
  assert.equal(adapterMarkers.LOADER_TREE_ISOLATION_MARKER, loaderMarkers.LOADER_TREE_ISOLATION_MARKER);
  assert.equal(adapterMarkers.LOADER_ACTIVATION_ISOLATION_MARKER, loaderMarkers.LOADER_ACTIVATION_ISOLATION_MARKER);
  assert.equal(adapterMarkers.FAIL_LOUD_ISOLATION_MARKER, loaderMarkers.FAIL_LOUD_ISOLATION_MARKER);
  assert.equal(adapterMarkers.LOADER_IMPORT_REPORT_MARKER, loaderMarkers.LOADER_IMPORT_REPORT_MARKER);
  assert.equal(adapterMarkers.PROMPT_ADMISSION_REASON_MARKER, loaderMarkers.PROMPT_ADMISSION_REASON_MARKER);
});

test('stderr 标记格式: 发射行满足 plugin-core markers.js LOADER_ISOLATION_RE', () => {
  const { parseMarkers } = require('../plugin-core/lib/markers');
  const lines = [
    '[loader-isolation] entry my.id (my-name) failed: boom',
    '[loader-isolation] entry x (y) failed to apply: z',
  ];
  const parsed = parseMarkers(lines.join('\n'));
  assert.deepEqual(parsed.isolations, [
    { id: 'my.id', name: 'my-name' },
    { id: 'x', name: 'y' },
  ]);
});

// ── 5. 锚点缺失路径（每个 transform） ────────────────────────────────────────
test('锚点缺失: 三个 transform 对无关源码均 anchor-missing、不改写、detail 带文件名', () => {
  const cases = [
    { fn: transformLoaderTreeIsolation, name: 'transformLoaderTreeIsolation' },
    { fn: transformLoaderActivationIsolation, name: 'transformLoaderActivationIsolation' },
    { fn: transformFailLoudIsolation, name: 'transformFailLoudIsolation' },
  ];
  for (const c of cases) {
    const src = 'export const unrelated = 1;';
    const original = src;
    const r = c.fn(src, 'fake-unrelated.js');
    assert.equal(r.status, 'anchor-missing', c.name);
    assert.equal(r.src, undefined, c.name);
    assert.equal(src, original, c.name);
    assert.ok(r.detail.includes('fake-unrelated.js'), c.name + ' detail must name the file');
  }
});

// ── 6. 部分锚点路径 ─────────────────────────────────────────────────────────
test('loader tree 部分锚点: 有 UPDATE 无 AWAIT → anchor-missing 且不改写', () => {
  const fixture = LOADER_UPDATE_OUTCOMES_OLD + '\nfunction updateError(stage, options, cause) { return 1; }';
  const original = fixture;
  const r = transformLoaderTreeIsolation(fixture, 'partial.js');
  assert.equal(r.status, 'anchor-missing');
  assert.equal(r.src, undefined);
  assert.equal(fixture, original);
});

test('loader tree 部分锚点: 有失败分支无 helper 锚点 → anchor-missing 且不改写', () => {
  const fixture = LOADER_UPDATE_OUTCOMES_OLD + '\n' + LOADER_AWAIT_FAILURES_OLD;
  const original = fixture;
  const r = transformLoaderTreeIsolation(fixture, 'partial.js');
  assert.equal(r.status, 'anchor-missing');
  assert.equal(r.src, undefined);
  assert.equal(fixture, original);
});
