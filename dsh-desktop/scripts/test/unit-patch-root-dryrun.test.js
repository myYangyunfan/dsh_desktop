'use strict';

// unit-patch-root-dryrun.test.js —— V14 审查 P1-1 / P1-2 回归：
//
//   四个 root 应用器此前签名只收 (nmRoot, log)，丢弃 options，内部
//   applyPatchToFiles 未收到 dryRun → CLI --dry-run 时真实落盘（P1-1）；
//   同时未回流 stats → anchorMissing/failed 恒 0（P1-2）。现统一签名
//   (nmRoot, log, stats, options) 并透传 stats / dryRun / donePrefix /
//   anchorLog，对齐 scripts/patch-session-persistence.js 的样板契约。
//
// 本测试对每个应用器：dry-run 零落盘、stats.anchorMissing 计数正确、
// 真实写入返回变更文件数且二次幂等。
//
// 运行：node --test scripts/test/unit-patch-root-dryrun.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  CLIENT_MODULES_CLIENT_REL,
  patchBundleArrivalRetry,
} = require('../lib/bundle-arrival-retry-patch');
const {
  AGENT_LOOP_REL,
  TOOLS_REL,
  patchSchedulerGuard,
} = require('../lib/scheduler-guard-patch');
const {
  SESSION_VALIDATION_REL,
  patchToolSourceCompat,
} = require('../lib/tool-source-patch');
const {
  ATOMIC_WRITE_REL,
  SETTINGS_MODELS_REL,
  patchAtomicWriteOrphanLock,
  patchSettingsModelsResilience,
  AW_CONSTANTS,
} = require('../lib/patch-settings-write-resilience');

// ---------------------------------------------------------------------------
// 夹具（最小 pristine 源，仅含 transform 判定的锚点原文；与实现同源）
// ---------------------------------------------------------------------------

const LOADER_PRISTINE = [
  '\t\t/** Default bundle-load hook: same-origin external classic script. */',
  '\t\tconst defaultLoadBundle = (url) => new Promise((resolve, reject) => {',
  '\t\t\tconst el = document.createElement("script");',
  '\t\t\tel.async = true;',
  '\t\t\tel.src = url;',
  '\t\t\tel.addEventListener("load", () => {',
  '\t\t\t\tel.remove();',
  '\t\t\t\tresolve();',
  '\t\t\t}, { once: true });',
  '\t\t\tel.addEventListener("error", () => {',
  '\t\t\t\tel.remove();',
  '\t\t\t\treject(/* @__PURE__ */ new Error(`client-modules: bundle script ${url} failed to load`));',
  '\t\t\t}, { once: true });',
  '\t\t\tdocument.head.append(el);',
  '\t\t});',
].join('\n');

const SCHED_LOOP_PRISTINE = [
  'import { TOOL_ABORTED_BEFORE_DISPATCH, TOOL_RUNTIME_SCHEDULER } from "@deepseek-ai/dsh-tools";',
  'const a = ctx.tools[TOOL_RUNTIME_SCHEDULER];',
  'const b = ctx.tools[TOOL_RUNTIME_SCHEDULER];',
  'const c = ctx.tools[TOOL_RUNTIME_SCHEDULER];',
  'const d = ctx.tools[TOOL_RUNTIME_SCHEDULER];',
].join('\n');

const SCHED_TOOLS_PRISTINE = [
  '\t[TOOL_RUNTIME_SCHEDULER] = {',
  '\t\tprepare: (exec) => this.prepareScheduledExecution(exec),',
  '\t\tdispatch: (exec) => this.dispatchScheduledExecution(exec),',
  '\t\tfinalize: (exec, result) => this.finalizeScheduledExecution(exec, result),',
  '\t\tfinish: (exec, result) => this.finishScheduledExecution(exec, result)',
  '\t};',
].join('\n');

const TOOL_SESSION_PRISTINE = [
  '\tif (sourceRecord["kind"] !== "tool" || typeof sourceRecord["callId"] !== "string" || sourceRecord["callId"] === "") throw new Error(`${subject} message must have tool source`);',
  '\tif (block["toolCallId"] !== sourceRecord["callId"]) throw new Error(`${subject} message has mismatched tool call ids`);',
].join('\n');

const TOOL_LOOP_PRISTINE = [
  'function appendToolCall(session, turn, step, block) {',
  '\treturn session.append("tool/call", {',
  '\t\tturn,',
  '\t\tstep,',
  '\t\tcallId: block.id,',
  '\t\tname: block.name,',
  '\t\targuments: block.arguments',
  '\t}).seq;',
  '}',
  'function appendToolResult(session, turn, step, block, result, callSeq) {',
  '\tconst message = createToolResultMessage({',
  '\t\tcallId: block.id,',
  '\t\tcontent: result.content,',
  '\t\tisError: result.isError',
  '\t});',
].join('\n');

const AW_PRISTINE = [
  AW_CONSTANTS.IMPORT_ANCHOR,
  '',
  AW_CONSTANTS.HELPER_ANCHOR,
  '\t// body placeholder',
  AW_CONSTANTS.CONTENTION_ANCHOR,
].join('\n');

const SM_PRISTINE = [
  'class ModelsSettingsStore {',
  '\tasync load() {',
  '\t\tconst views = [];',
  '\t\tconst providers = [];',
  AW_CONSTANTS.SM_NS_ANCHOR,
  '\t}',
  '}',
].join('\n');

// ---------------------------------------------------------------------------
// 临时 node_modules 根构造器
// ---------------------------------------------------------------------------

function makeRoot(filesSpec) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-root-dryrun-'));
  const files = {};
  for (const [rel, content] of Object.entries(filesSpec)) {
    const file = path.join(dir, '@deepseek-ai', rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
    files[rel] = file;
  }
  return { dir, files };
}

/** 通用断言：dry-run 零落盘 + stats 不变，随后真实写入 + 二次幂等。 */
function assertDryRunAndWrite(applier, filesSpec, expectedWrites) {
  const { dir, files } = makeRoot(filesSpec);
  try {
    const stats = { anchorMissing: 0, failed: 0 };
    // dry-run：不落盘、返回 0（引擎在 dryRun 分支不计数 written）。
    assert.equal(applier(dir, () => {}, stats, { dryRun: true }), 0, 'dry-run 应零写入');
    for (const [rel, file] of Object.entries(files)) {
      assert.equal(fs.readFileSync(file, 'utf8'), filesSpec[rel], `dry-run 不得改写 ${rel}`);
    }
    assert.deepEqual(stats, { anchorMissing: 0, failed: 0 }, 'dry-run 命中不应误计 anchorMissing/failed');

    // 真实写入：返回变更文件数。
    assert.equal(applier(dir, () => {}, stats), expectedWrites, `应写入 ${expectedWrites} 份文件`);
    assert.deepEqual(stats, { anchorMissing: 0, failed: 0 }, '正常写入不应产生失配/失败计数');

    // 二次幂等：0 写入。
    assert.equal(applier(dir, () => {}, stats), 0, '二次应用应幂等 0 写入');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** 通用断言：锚点缺失时 stats.anchorMissing 正确回流。 */
function assertAnchorMissingCount(applier, filesSpec, expectedMissing) {
  const { dir } = makeRoot(filesSpec);
  try {
    const stats = { anchorMissing: 0, failed: 0 };
    assert.equal(applier(dir, () => {}, stats), 0, '锚点缺失应 0 写入');
    assert.equal(stats.anchorMissing, expectedMissing, `应回流 ${expectedMissing} 个 anchorMissing`);
    assert.equal(stats.failed, 0, '锚点缺失不得计 failed');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// 1) bundle-arrival-retry
// ---------------------------------------------------------------------------

test('bundle-arrival-retry: dry-run 零落盘 + 真实写 1 文件 + 幂等', () => {
  // 0.1.2-alpha.1 退役内核半边（serveBundle transient-read retry）：新 serveBundle
  // 从预烘焙 in-memory responses 表直接回包，serveBundle 半边锚点自然退役，
  // 仅浏览器半边（defaultLoadBundle）保留。
  assertDryRunAndWrite(
    patchBundleArrivalRetry,
    {
      [CLIENT_MODULES_CLIENT_REL]: LOADER_PRISTINE,
    },
    1,
  );
});

test('bundle-arrival-retry: anchor-missing 计入 stats.anchorMissing', () => {
  assertAnchorMissingCount(
    patchBundleArrivalRetry,
    { [CLIENT_MODULES_CLIENT_REL]: 'export {};\n' },
    1,
  );
});

// ---------------------------------------------------------------------------
// 2) scheduler-guard
// ---------------------------------------------------------------------------

test('scheduler-guard: dry-run 零落盘 + 真实写 2 文件 + 幂等', () => {
  assertDryRunAndWrite(
    patchSchedulerGuard,
    {
      [AGENT_LOOP_REL]: SCHED_LOOP_PRISTINE,
      [TOOLS_REL]: SCHED_TOOLS_PRISTINE,
    },
    2,
  );
});

test('scheduler-guard: anchor-missing 计入 stats.anchorMissing', () => {
  assertAnchorMissingCount(
    patchSchedulerGuard,
    { [AGENT_LOOP_REL]: 'export {};\n' },
    1,
  );
});

// ---------------------------------------------------------------------------
// 3) tool-source-compat
// ---------------------------------------------------------------------------

test('tool-source-compat: dry-run 零落盘 + 真实写 2 文件 + 幂等', () => {
  assertDryRunAndWrite(
    patchToolSourceCompat,
    {
      [SESSION_VALIDATION_REL]: TOOL_SESSION_PRISTINE,
      [AGENT_LOOP_REL]: TOOL_LOOP_PRISTINE,
    },
    2,
  );
});

test('tool-source-compat: anchor-missing 计入 stats.anchorMissing', () => {
  assertAnchorMissingCount(
    patchToolSourceCompat,
    { [SESSION_VALIDATION_REL]: 'export {};\n' },
    1,
  );
});

// ---------------------------------------------------------------------------
// 4) patch-settings-write-resilience
// ---------------------------------------------------------------------------

test('atomic-write-orphan-lock: dry-run 零落盘 + 真实写 1 文件 + 幂等', () => {
  assertDryRunAndWrite(
    patchAtomicWriteOrphanLock,
    { [ATOMIC_WRITE_REL]: AW_PRISTINE },
    1,
  );
});

test('atomic-write-orphan-lock: anchor-missing 计入 stats.anchorMissing', () => {
  assertAnchorMissingCount(
    patchAtomicWriteOrphanLock,
    { [ATOMIC_WRITE_REL]: 'export {};\n' },
    1,
  );
});

test('settings-models-resilience: dry-run 零落盘 + 真实写 1 文件 + 幂等', () => {
  assertDryRunAndWrite(
    patchSettingsModelsResilience,
    { [SETTINGS_MODELS_REL]: SM_PRISTINE },
    1,
  );
});

test('settings-models-resilience: anchor-missing 计入 stats.anchorMissing', () => {
  assertAnchorMissingCount(
    patchSettingsModelsResilience,
    { [SETTINGS_MODELS_REL]: 'class X {}\n' },
    1,
  );
});
