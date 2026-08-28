'use strict';

// patch-runner 单元测试（node --test）。
// 覆盖：applyFile 对 slot-compat 布局不再双重处理；applyAll 的 failPolicy
// 三档分级落地（warn / degrade / fatal）与汇总日志。补丁目标目录经 mkdtemp
// 隔离，绝不触碰真实 ~/.dsh。

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { applyFile, applyAll, applyRoot, resolveFiles } = require('../integration/patch-runner');
const { PATCH_SPECS } = require('../lib/patch-registry');
const { resolveNmRoots } = require('../lib/patch-target-resolver');
const { patchSessionPersistence } = require('../patch-session-persistence');

function makeCtx(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-runner-home-'));
  const appDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-runner-app-'));
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-runner-ud-'));
  t.after(() => {
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(appDir, { recursive: true, force: true });
    fs.rmSync(userDataDir, { recursive: true, force: true });
  });
  const logs = [];
  return { home, appDir, userDataDir, logs, log: (m) => logs.push(m), wslMode: false };
}

test('applyFile：slot-compat 布局每个目标文件只被处理一次（不双重处理）', (t) => {
  const ctx = makeCtx(t);
  const spec = PATCH_SPECS.find((s) => s.id === 'slot-legacy-key');

  // 在 profile fallback 根创建该 spec 自身 pkgRels 的目标文件，
  // 用计数 transform 统计每个文件被调用的次数。
  // 0.1.2-alpha.1：slot 三层各自收窄 pkgRels 到其锚点所在文件（slot-legacy-key
  // 只指向 ui-slots，不再覆盖 cordis-client-runner）。
  const created = [];
  for (const rel of spec.pkgRels) {
    const f = path.join(ctx.home, 'profiles', 'node_modules', '@deepseek-ai', rel);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, 'const x = 1;\n');
    created.push(f);
  }
  const calls = new Map();
  const counting = (src, file) => {
    calls.set(file, (calls.get(file) || 0) + 1);
    return { status: 'anchor-missing', detail: 'x' };
  };
  applyFile(ctx, { ...spec, transform: counting });

  // 每个被创建的目标文件恰好被处理一次。
  for (const f of created) {
    assert.equal(calls.get(f) || 0, 1, `${f} 应恰好处理一次，实际 ${calls.get(f)}`);
  }
  // 不应存在任何文件被处理超过一次。
  for (const [f, n] of calls) assert.ok(n <= 1, `${f} 被重复处理 ${n} 次`);
});

// 构造一个会让 resolveFiles 抛出「规格级异常」的 file 规格（缺 pkgRel/pkgRels
// 且布局依赖 pkgRel），以触发 applyAll 的 catch 分支（逐文件异常由
// applyPatchToFiles 内部吸收，不会传到 applyAll）。
function throwingFileSpec(id, order, failPolicy) {
  return {
    id, group: 'runtime', order, kind: 'file', layout: 'runtime-local', wslLayout: 'wsl',
    requires: [], failPolicy,
    transform: () => ({ status: 'already' }),
    logs: {},
  };
}

// 构造一个会命中单个真实落盘文件的 file spec（transform 可注入），供
// stats（anchorMissing / failed）回流断言使用。
function fileSpec(id, transform, { pkgRel = path.join('dsh-client-runtime', 'lib', 'client.js'), failPolicy = 'warn', order = 1 } = {}) {
  return {
    id, group: 'runtime', order, kind: 'file', layout: 'runtime-local', wslLayout: 'wsl',
    pkgRel, requires: [], failPolicy, transform, logs: { prefix: id },
  };
}

// 在 ctx.home 的 runtime-local 第一落点写入一个真实文件，返回绝对路径。
// 仅创建一个副本，其余两个落点不存在会被 applyPatchToFiles 静默跳过，
// 从而让 transform 恰好执行一次，便于断言 stats 计数精确回流。
function writeRuntimeFile(ctx, pkgRel = path.join('dsh-client-runtime', 'lib', 'client.js')) {
  const f = path.join(ctx.home, 'profiles', 'node_modules', '@deepseek-ai', pkgRel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, 'const x = 1;\n');
  return f;
}

test('applyAll：failPolicy=warn 异常进 errors，不中断后续补丁', () => {
  const logs = [];
  const ctx = { home: 'x', appDir: 'y', userDataDir: 'z', wslMode: false, log: (m) => logs.push(m) };
  const report = applyAll(ctx, [
    throwingFileSpec('boom', 1, 'warn'),
    throwingFileSpec('ok', 2, 'warn'),
  ]);
  assert.deepEqual(report.errors, ['boom', 'ok'], 'warn 异常应记入 errors');
});

test('applyAll：failPolicy=degrade / fatal 异常进 degraded，不 throw', () => {
  const logs = [];
  const ctx = { home: 'x', appDir: 'y', userDataDir: 'z', wslMode: false, log: (m) => logs.push(m) };
  const report = applyAll(ctx, [
    throwingFileSpec('deg', 1, 'degrade'),
    throwingFileSpec('fat', 2, 'fatal'),
  ]);
  assert.deepEqual(report.degraded, ['deg', 'fat'], 'degrade/fatal 异常应记入 degraded');
  assert.equal(report.errors.length, 0, 'degrade/fatal 不得记入 errors');
});

test('applyAll：输出汇总日志（避免部分失败静默）', () => {
  const logs = [];
  const ctx = { home: 'x', appDir: 'y', userDataDir: 'z', wslMode: false, log: (m) => logs.push(m) };
  applyAll(ctx, [throwingFileSpec('boom', 1, 'warn')]);
  assert.ok(logs.some((m) => m.includes('补丁应用汇总')), '应输出汇总日志');
});

test('applyAll：transform 返回 anchor-missing → report.anchorMissing 回流', (t) => {
  const ctx = makeCtx(t);
  writeRuntimeFile(ctx);
  const report = applyAll(ctx, [
    fileSpec('am', () => ({ status: 'anchor-missing', detail: '锚点失配' })),
  ]);
  assert.equal(report.anchorMissing, 1, 'anchor-missing 应回流到 report.anchorMissing');
});

test('applyAll：transform 抛异常 → report.failed 回流（不记入规格级 errors）', (t) => {
  const ctx = makeCtx(t);
  writeRuntimeFile(ctx);
  const report = applyAll(ctx, [
    fileSpec('tf', () => { throw new Error('boom'); }),
  ]);
  assert.equal(report.failed, 1, '逐文件异常应回流到 report.failed');
  assert.equal(report.errors.length, 0, '逐文件异常不记入规格级 errors');
});

test('applyAll：failPolicy=degrade 且 anchorMissing>0 → 记入 degraded（互斥，不重复计入 anchorMissing）', (t) => {
  const ctx = makeCtx(t);
  writeRuntimeFile(ctx);
  const report = applyAll(ctx, [
    fileSpec('deg-am', () => ({ status: 'anchor-missing', detail: '失配' }), { failPolicy: 'degrade' }),
  ]);
  assert.ok(report.degraded.includes('deg-am'), 'degrade + anchorMissing 应记入 degraded');
  assert.equal(report.anchorMissing, 0, 'degrade 档失配只进 degraded，不得重复计入 anchorMissing（互斥）');
});

test('applyAll：failPolicy=warn 且 anchorMissing>0 → 只进 anchorMissing，不进 degraded（互斥）', (t) => {
  const ctx = makeCtx(t);
  writeRuntimeFile(ctx);
  const report = applyAll(ctx, [
    fileSpec('warn-am', () => ({ status: 'anchor-missing', detail: '失配' }), { failPolicy: 'warn' }),
  ]);
  assert.equal(report.anchorMissing, 1, 'warn 档失配只进 anchorMissing');
  assert.ok(!report.degraded.includes('warn-am'), 'warn 档失配不得进 degraded');
});

test('applyAll：互斥分流汇总日志——失配 N 只反映 warn 档，降级 J 含 degrade 档', (t) => {
  const ctx = makeCtx(t);
  writeRuntimeFile(ctx);
  const report = applyAll(ctx, [
    fileSpec('warn-am', () => ({ status: 'anchor-missing', detail: '失配' }), { failPolicy: 'warn', order: 1 }),
    fileSpec('deg-am', () => ({ status: 'anchor-missing', detail: '失配' }), { failPolicy: 'degrade', order: 2 }),
  ]);
  assert.equal(report.anchorMissing, 1, '互斥分流：anchorMissing 只计 warn 档（1 项）');
  assert.deepEqual(report.degraded, ['deg-am'], 'degraded 只含 degrade 档 spec.id');
  const summary = ctx.logs.find((m) => m.includes('补丁应用汇总'));
  assert.ok(summary, '应输出汇总日志');
  assert.ok(summary.includes('失配 1 项'), `汇总「失配」应只反映 warn 档：${summary}`);
  assert.ok(summary.includes('降级 1 项'), `汇总「降级」应含 degrade 档：${summary}`);
});

test('applyAll：规格级异常也计入 report.total（不再低报）', () => {
  const logs = [];
  const ctx = { home: 'x', appDir: 'y', userDataDir: 'z', wslMode: false, log: (m) => logs.push(m) };
  const report = applyAll(ctx, [throwingFileSpec('boom', 1, 'warn')]);
  assert.equal(report.total, 1, '规格级异常也应计入 total');
  assert.ok(report.errors.includes('boom'), '异常仍记入 errors');
});

// ---------------------------------------------------------------------------
// 上一轮重构补漏（P0）：applyRoot 逐根容错 / root anchor-missing 回流 /
// requires 降级链 / dryRun·donePrefix 场景参数 / fatal→degrade 语义。
// ---------------------------------------------------------------------------

/** 构造一个 kind='root' 规格（apply / successLog / failLog 可注入）。 */
function rootSpec(id, applyFn, { failPolicy = 'warn' } = {}) {
  return {
    id, group: 'package', order: 1, kind: 'root', layout: 'nm-roots', wslLayout: 'nm-roots',
    apply: applyFn, requires: [], failPolicy,
    successLog: (root) => 'ok ' + root,
    failLog: (root, err) => 'fail ' + root + ': ' + err.message,
  };
}

test('applyRoot：逐根容错——单根异常计入 stats.failed，其余根仍被处理，不 throw', (t) => {
  const ctx = makeCtx(t);
  const roots = resolveNmRoots(ctx, { layout: 'nm-roots' });
  // 只创建前两根（home/appDir），第三根（userDataDir/agent/node_modules）不存在 → 跳过。
  fs.mkdirSync(roots[0], { recursive: true });
  fs.mkdirSync(roots[1], { recursive: true });

  let secondProcessed = false;
  const stats = { anchorMissing: 0, failed: 0 };
  const spec = rootSpec('rt', (root) => {
    if (root === roots[0]) throw new Error('boom');
    secondProcessed = true;
    return 1;
  });

  const written = applyRoot(ctx, spec, stats);
  assert.equal(stats.failed, 1, '抛异常的根应计入 stats.failed');
  assert.equal(written, 1, '另一个根仍应写入并计数');
  assert.ok(secondProcessed, '第二个根应被继续处理（不被第一个根异常拖垮）');
});

test('applyAll：root 补丁 anchor-missing 经真实 patchSessionPersistence 回流', (t) => {
  const ctx = makeCtx(t);
  // 在 home 的 nm-root 落点创建不含任何锚点的 dsh-session-persistence-jsonl 文件。
  const spec = PATCH_SPECS.find((s) => s.id === 'session-persistence');
  const root = path.join(ctx.home, 'profiles', 'node_modules');
  const file = path.join(root, '@deepseek-ai', 'dsh-session-persistence-jsonl', 'lib', 'index.js');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, 'export const x = 1;\n');

  const report = applyAll(ctx, [spec]);
  assert.equal(report.anchorMissing, 1, 'root 应用器 anchor-missing 应回流到 report.anchorMissing');
  assert.equal(report.failed, 0, '失配不应计为 failed');
});

test('applyAll：requires 降级链（openPath required→degraded；deleteSession 非 required→warnings）', () => {
  const logs = [];
  const ctx = {
    home: 'x', appDir: 'y', userDataDir: 'z', wslMode: false,
    log: (m) => logs.push(m),
    hostDetectors: { openPath: () => false, deleteSession: () => false },
  };
  const mk = (id, requires) => ({
    id, group: 'runtime', order: 1, kind: 'file', layout: 'runtime-local', wslLayout: 'wsl',
    pkgRel: path.join('dsh-client-runtime', 'lib', 'client.js'), requires, failPolicy: 'warn',
    transform: () => ({ status: 'already' }), logs: { prefix: id },
  });
  const report = applyAll(ctx, [
    mk('needs-open-path', ['openPath']),
    mk('needs-delete-session', ['deleteSession']),
  ]);
  assert.ok(report.degraded.includes('needs-open-path'), 'openPath required 缺失 → degraded');
  assert.ok(report.warnings.includes('needs-delete-session'), 'deleteSession 非 required 缺失 → warnings');
  assert.ok(!report.degraded.includes('needs-delete-session'), '非 required 缺失不得进 degraded');
});

test('applyAll：dryRun=true 时 transform 返回 changed 但不落盘（dryRunChangedLog 输出）', (t) => {
  const ctx = makeCtx(t);
  const f = writeRuntimeFile(ctx);
  const before = fs.readFileSync(f, 'utf8');
  const report = applyAll(ctx, [
    fileSpec('dry', (src) => ({ status: 'changed', src: src + '// patched\n' })),
  ], { dryRun: true });
  assert.equal(fs.readFileSync(f, 'utf8'), before, 'dryRun 不得改写文件内容');
  assert.ok(ctx.logs.some((m) => m.includes('dry-run: 将')), '应输出 dryRunChangedLog 计划文案');
  assert.equal(report.changed, 0, 'dryRun 不落盘，changed 应保持 0');
});

test('applyAll：donePrefix=false 时成功日志无「前缀: 」', (t) => {
  const ctx = makeCtx(t);
  const f = writeRuntimeFile(ctx);
  applyAll(ctx, [
    fileSpec('noprefix', (src) => ({ status: 'changed', src: src + '// x\n' })),
  ], { donePrefix: false });
  assert.ok(ctx.logs.some((m) => m.includes('已应用 ' + f)), '应输出裸 doneLog');
  assert.ok(!ctx.logs.some((m) => m.includes('noprefix: 已应用')), 'donePrefix=false 时成功日志不得带前缀');
});

test('applyAll：failPolicy=fatal 规格级异常 → degraded（fatal→degrade），不 throw', () => {
  const logs = [];
  const ctx = { home: 'x', appDir: 'y', userDataDir: 'z', wslMode: false, log: (m) => logs.push(m) };
  const report = applyAll(ctx, [throwingFileSpec('fat2', 1, 'fatal')]);
  assert.deepEqual(report.degraded, ['fat2'], 'fatal 异常应降级为 degraded');
  assert.equal(report.errors.length, 0, 'fatal 异常不得记入 errors');
  assert.ok(logs.some((m) => m.includes('fatal→degrade')), '应输出 fatal→degrade 日志');
});

// ---------------------------------------------------------------------------
// P1：resolveFiles 的 profile-boot-dirs 布局 glob 分支（只返回 profile-boot-*.js）。
// ---------------------------------------------------------------------------

test('resolveFiles：profile-boot-dirs 布局只 glob 出 profile-boot-*.js', (t) => {
  const ctx = makeCtx(t);
  const dir = path.join(ctx.home, 'profiles', 'node_modules', '@deepseek-ai', 'dsh', 'lib');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'profile-boot-a.js'), 'export const a = 1;\n');
  fs.writeFileSync(path.join(dir, 'profile-boot-b.js'), 'export const b = 2;\n');
  fs.writeFileSync(path.join(dir, 'other.js'), 'export const other = 3;\n');

  const files = resolveFiles(ctx, { layout: 'profile-boot-dirs', wslLayout: 'profile-boot-dirs' }).sort();
  assert.deepEqual(files, [
    path.join(dir, 'profile-boot-a.js'),
    path.join(dir, 'profile-boot-b.js'),
  ].sort(), '只应返回 profile-boot-*.js，忽略 other.js');
});
