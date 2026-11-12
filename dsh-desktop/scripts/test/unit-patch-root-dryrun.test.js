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
  SESSION_VALIDATION_REL,
  TOOLS_LIB_DIR_REL,
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

// 0.2.2-rc.2 的 dsh-client-modules/lib/client.js 是压缩产物：defaultLoadBundle 压成单行、
// 不再有空格式与 `/* @__PURE__ */`，字符串改模板字面量。夹具逐字节照真字节录（下面这行就是
// pristine 里那一整条语句）。
const LOADER_PRISTINE = "const defaultLoadBundle=url=>new Promise((resolve,reject)=>{const el=document.createElement(`script`);el.async=true;el.src=url;el.addEventListener(`load`,()=>{el.remove();resolve()},{once:true});el.addEventListener(`error`,()=>{el.remove();reject(new Error(`client-modules: bundle script ${url} failed to load`))},{once:true});document.head.append(el)});";

// ⚠ 夹具逐字节即生产锚点：0.2.0-rc.2 把 callId 的镜像位从 content[0] 块
// （block["toolCallId"]）上移到消息记录自身（messageRecord["toolCallId"]），此前这里没随迁，
// transformToolSourceTolerance 因 OLD_2 失配整份 anchor-missing（真实 pristine 是 changed）。
// 下方第 5 节的 driftedFixtureLines 是把这类漂移变成响亮失败的守卫。
const TOOL_SESSION_PRISTINE = [
  '\tif (sourceRecord["kind"] !== "tool" || typeof sourceRecord["callId"] !== "string" || sourceRecord["callId"] === "") throw new Error(`${subject} message must have tool source`);',
  '\tif (messageRecord["toolCallId"] !== sourceRecord["callId"]) throw new Error(`${subject} message has mismatched tool call ids`);',
].join('\n');

// tool-source 写端（空 tool-call 补 ids）：0.2.2-rc.1 起写端从 dsh-agent-loop/lib/index.js
// 迁到 dsh-tools 的批入口 lib/pipeline.js（单文件 bundle 已拆成
// index.js + pipeline.js + shared-<hash>.js，哈希名逐版变，故按目录 + 文件名定位，
// 绝不在用例里写死哈希）。锚点 = executeToolBatch 的 calls 拆包行。
const TOOL_PIPELINE_REL = path.join(TOOLS_LIB_DIR_REL, 'pipeline.js');
const TOOL_WRITE_PRISTINE = [
  '\tconst { calls: toolCalls, signal, agent, toolSet, maxParallelToolCalls } = input;',
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
// 2) scheduler-guard —— 已退役
//
// 0.2.2-rc.1 把 TOOL_RUNTIME_SCHEDULER 符号面整体删除（364 个包 0 命中），
// agent-loop 的旧 import 改成 ToolActivationError / ToolBatchExecutionError，工具批改走
// this.loopCtx.tools.execute({...})：scheduler-guard 的两条 root 应用器（agent-loop 半边 +
// tools 半边）连同 registry 规格一并退役。判据没有落脚点可留（锚点在 pin 闭包里 0 命中），
// 故整组退役，不保留空转的 dry-run 用例。
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 3) tool-source-compat
// ---------------------------------------------------------------------------

test('tool-source-compat: dry-run 零落盘 + 真实写 2 文件 + 幂等', () => {
  assertDryRunAndWrite(
    patchToolSourceCompat,
    {
      [SESSION_VALIDATION_REL]: TOOL_SESSION_PRISTINE,
      [TOOL_PIPELINE_REL]: TOOL_WRITE_PRISTINE,
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

// ---------------------------------------------------------------------------
// 5) 夹具字节漂移守卫
//
// 为什么要这一节（实测事故）：上面各组夹具是手抄的最小 pristine 字节。0.2.0-rc.2 把
// tool source 的 callId 镜像位从 content[0] 块（block["toolCallId"]）上移到消息记录
// 自身（messageRecord["toolCallId"]），生产锚点随迁了、夹具没随迁 →
// transformToolSourceTolerance 整份 anchor-missing，而 dry-run 用例只报
// 「anchorMissing 计数不对」，根因得手动 probe 才看得出来。
// 这里直接核对「夹具每一行逐字节出现在真实 pristine 内核文件里」，把漂移变成响亮失败。
// ---------------------------------------------------------------------------

const { findPristineFile, describePristineRoots } = require('../lib/pristine-kernel-roots');

/** 返回夹具里在真实 pristine 中找不到的行（空数组 = 夹具仍与生产同源）。 */
function driftedFixtureLines(fixture, pkgRel) {
  const file = findPristineFile(pkgRel);
  if (!file) throw new Error('pristine 缺失: ' + pkgRel + '（查过 ' + describePristineRoots() + '）');
  const src = fs.readFileSync(file, 'utf8');
  return String(fixture).split('\n').filter((line) => line !== '' && !src.includes(line));
}

// 逐字节手抄、必须与生产同源的夹具。
// 0.2.2-rc.1：scheduler-guard(tools) 已退役（TOOL_RUNTIME_SCHEDULER 符号面删除），
// 其夹具无法在 pin 闭包里找到载体，故从本表移除（不是放宽判据，是判据失去对象）。
const VERBATIM_FIXTURES = [
  ['tool-source 读端', TOOL_SESSION_PRISTINE, SESSION_VALIDATION_REL],
  ['tool-source 写端', TOOL_WRITE_PRISTINE, TOOL_PIPELINE_REL],
  ['bundle-arrival-retry', LOADER_PRISTINE, CLIENT_MODULES_CLIENT_REL],
];

for (const [label, fixture, rel] of VERBATIM_FIXTURES) {
  const pristineFile = findPristineFile(rel);
  test(`夹具漂移守卫：${label} 的每一行都在真实 pristine 里`, { skip: pristineFile ? false : '无 pristine ' + rel + '（先跑 node scripts/install-pristine-kernel.mjs）' }, () => {
    assert.deepEqual(
      driftedFixtureLines(fixture, rel),
      [],
      `夹具 ${label} 相对 pristine ${rel} 已漂移——内核换代后生产锚点重靶了，夹具没随迁`,
    );
  });
}

// 反证：判据必须真的起作用——把读端夹具退回 rc.2 之前的旧字节，守卫要报出那一行。
test('反证：rc.2 之前的旧字节（block["toolCallId"]）会被漂移守卫判为失配', { skip: findPristineFile(SESSION_VALIDATION_REL) ? false : '无 pristine ' + SESSION_VALIDATION_REL }, () => {
  const stale = TOOL_SESSION_PRISTINE.replace('messageRecord["toolCallId"]', 'block["toolCallId"]');
  const drifted = driftedFixtureLines(stale, SESSION_VALIDATION_REL);
  assert.equal(drifted.length, 1, '旧字节那一行必须被判漂移');
  assert.match(drifted[0], /block\["toolCallId"\]/);
});
