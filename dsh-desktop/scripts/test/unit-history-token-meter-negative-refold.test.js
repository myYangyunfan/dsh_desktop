'use strict';

// ---------------------------------------------------------------------------
// unit-history-token-meter-negative-refold.test.js
//
// Issue #172「0.5.6 历史会话记录加载失败」回归。
//
// 根因（内核 alpha.5 现状，见证据链）：
//   .tmp-kernel/.../dsh-token-meter breakdown-projection.ts 的
//   contextBreakdownProjectionDefinition.apply 用
//     messageTokens: state.messageTokens + fold.deltaTokens,
//   而 foldSurfaceProjection 在 surfaceOp === "replace"（自动压缩）时返回
//   deltaTokens = tokens - claim.tokens（可为负）→ messageTokens 溢出为负。
//   stateSchema/viewSchema 的 tokenCount = z.number().int().nonnegative()
//   （报 "Too small: expected number to be >=0"，path ["messageTokens"]）。
//
//   投影 checkpoint 是落盘的（session_projcache/sessions/<id>.json，行 val 只过
//   z.json() —— 负值可入；checkpoint() 用 structuredClone(state) 不做 stateSchema
//   校验）。冷加载 restore() 在 session-projection/src/index.ts:510-521 见
//   row.ver === def.stateVersion 就 stateSchema.parse(row.val) → 对 0.5.6 遗留的
//   ver=2 负值行直接抛错 → 历史加载失败。
//
// 兼容层修复（scripts/patch-token-meter-clamp.js，两层）：
//   [写端] messageTokens 夹到 Math.max(0, …) —— 杜绝新负值产生/落盘；
//   [读端] contextBreakdown stateVersion 2→3 —— 令 restore 走 ver 失配：
//          restoreFloor 把该 key 的 floor 拉到 0（index.ts:429）→ 从 seq 0 用已
//          夹取的 apply 重折出合法非负态并回写 ver=3，脏行一次性自愈。
//
// 本测试锁两件事：
//   1) transform 三态契约 + 只 bump contextBreakdown（不误伤同值 2 的 tokenUsage）；
//   2) 用还原框架 restore/restoreFloor 数学的模型证明：live stateVersion 仍为 2 时
//      对已落盘负值行 restore 抛错（复现 #172），而 bump 到 3 后走丢弃重折、不抛且
//      非负（修复生效）。live 版本从真实已补丁 bundle 字节里正则提取 —— 一旦补丁不
//      再 bump，测试即红（回归位）。
//
// 运行：node --test scripts/test/unit-history-token-meter-negative-refold.test.js
// （不依赖内核运行期 / 网络：restore/restoreFloor 数学按 alpha.5 源码逐行还原。）
// ---------------------------------------------------------------------------

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  transformTokenMeterClamp,
  PATCH_MARKER,
  PATCH_MARKER_VERSION,
} = require('../patch-token-meter-clamp');

const BUNDLE = path.join(
  __dirname, '..', '..', 'node_modules', '@deepseek-ai', 'dsh-token-meter', 'lib', 'index.js',
);

// ---------------------------------------------------------------------------
// 从 bundle 源码文本提取某个投影定义的 stateVersion（key 行后第一个 stateVersion: N）。
// ---------------------------------------------------------------------------
function extractStateVersion(src, key) {
  const ki = src.indexOf(`key: "${key}",`);
  if (ki === -1) return null;
  const m = src.slice(ki).match(/stateVersion:\s*(\d+)/);
  return m ? Number(m[1]) : null;
}

// 还原后的 bundle 里 messageTokens 是否为夹取体。
function isClamped(src) {
  return src.includes('Math.max(0, state.messageTokens + fold.deltaTokens)');
}

// ---------------------------------------------------------------------------
// 合成 pristine 片段：镜像真实 bundle 结构（tab 缩进）+ 三个 key/stateVersion 对，
// 覆盖 transformTokenMeterClamp 的三态契约，且能验证锚点唯一性（tokenUsage 同值 2）。
// ---------------------------------------------------------------------------
const PRISTINE = [
  'const contextBreakdownProjectionDefinition = {',
  '\tkey: "contextBreakdown",',
  '\tstateVersion: 2,',
  '\tstateSchema: z$1.object({',
  '\t\tsystemTokens: tokenCount,',
  '\t\tmessageTokens: tokenCount,',
  '\t}).strict(),',
  '\tapply: (state, event) => {',
  '\t\tconst fold = foldSurfaceProjection(state.claim, event);',
  '\t\treturn {',
  '\t\t\tsystemTokens: state.systemTokens,',
  '\t\t\tmessageTokens: state.messageTokens + fold.deltaTokens,',
  '\t\t};',
  '\t},',
  '};',
  'const tokenUsageProjectionDefinition = {',
  '\tkey: "tokenUsage",',
  '\tstateVersion: 2,',
  '};',
  'const contextPressureProjectionDefinition = {',
  '\tkey: "contextPressure",',
  '\tstateVersion: 4,',
  '};',
].join('\n');

// ===========================================================================
// 1. transform 三态契约
// ===========================================================================

test('pristine → changed：夹取 messageTokens 且仅 bump contextBreakdown stateVersion 2→3', () => {
  const r = transformTokenMeterClamp(PRISTINE, 'index.js');
  assert.equal(r.status, 'changed');
  assert.equal(typeof r.src, 'string');
  assert.notEqual(r.src, PRISTINE);
  // 写端：夹取生效
  assert.ok(isClamped(r.src), '产物应把 messageTokens 夹到 Math.max(0, …)');
  assert.ok(r.src.includes(PATCH_MARKER));
  assert.ok(r.src.includes(PATCH_MARKER_VERSION));
  // 读端：只有 contextBreakdown bump 到 3
  assert.equal(extractStateVersion(r.src, 'contextBreakdown'), 3, 'contextBreakdown 应 bump 到 3');
  // 不误伤：同值 2 的 tokenUsage、以及 4 的 contextPressure 保持原样
  assert.equal(extractStateVersion(r.src, 'tokenUsage'), 2, 'tokenUsage stateVersion 不得被改动');
  assert.equal(extractStateVersion(r.src, 'contextPressure'), 4, 'contextPressure stateVersion 不得被改动');
});

test('幂等：对产物再跑一遍 → already（零写入）', () => {
  const once = transformTokenMeterClamp(PRISTINE, 'index.js');
  assert.equal(once.status, 'changed');
  const twice = transformTokenMeterClamp(once.src, 'index.js');
  assert.equal(twice.status, 'already');
  assert.equal(twice.src, undefined, 'already 态不得携带 src');
});

test('marker-only（两 marker 齐、无锚点）→ already（marker 短路）', () => {
  const src = `// ${PATCH_MARKER}\n// ${PATCH_MARKER_VERSION}\nconst x = 1;\n`;
  const r = transformTokenMeterClamp(src, 'index.js');
  assert.equal(r.status, 'already');
});

test('双锚点皆失 → anchor-missing（整补丁退役），detail 含文件名、无 src', () => {
  const r = transformTokenMeterClamp('const nothingRelevant = true;\n', 'some-pkg-index.js');
  assert.equal(r.status, 'anchor-missing');
  assert.ok(r.detail && r.detail.includes('some-pkg-index.js'), '退役态 detail 应含文件名');
  assert.equal(r.src, undefined);
});

test('升级实态：旧版仅夹取已应用、version 仍 2 → changed，只补 bump（两层独立幂等）', () => {
  // 模拟 0.5.6→main 之间某次只打了夹取、还没加 bump 的中间产物。
  const onlyClamp = transformTokenMeterClamp(PRISTINE, 'index.js');
  assert.equal(onlyClamp.status, 'changed');
  // 手动把 contextBreakdown stateVersion 回退到 2（保留夹取 marker），复现"夹取在、bump 缺"。
  const regressed = onlyClamp.src
    .replace('\tkey: "contextBreakdown",', '\tkey: "contextBreakdown",')
    .replace(/\t\/\* dsh-desktop fix: bump contextBreakdown stateVersion[\s\S]*?\*\/\n\tstateVersion: 3,/, '\tstateVersion: 2,');
  assert.equal(extractStateVersion(regressed, 'contextBreakdown'), 2, '前置：回退到 2');
  assert.ok(regressed.includes(PATCH_MARKER), '前置：夹取 marker 仍在');
  assert.ok(!regressed.includes(PATCH_MARKER_VERSION), '前置：bump marker 已被移除');

  const r = transformTokenMeterClamp(regressed, 'index.js');
  assert.equal(r.status, 'changed', '应只补上 version bump 这一层');
  assert.equal(extractStateVersion(r.src, 'contextBreakdown'), 3);
  assert.equal(extractStateVersion(r.src, 'tokenUsage'), 2, '仍不误伤 tokenUsage');
  assert.ok(isClamped(r.src), '夹取层保持不变（未被重复注入）');
  // 夹取 marker 只应出现一次（幂等，未二次注入）
  assert.equal(r.src.split(PATCH_MARKER + ' ——').length - 1, 1, '夹取 marker 不应重复注入');
});

// ===========================================================================
// 2. 真实已装 bundle 字节：fixed-point + 版本状态
// ===========================================================================

test('真实已装 bundle：transform → already（已全量补丁，锚点/marker 与真字节一致）', () => {
  assert.ok(fs.existsSync(BUNDLE), `缺已装 bundle：${BUNDLE}`);
  const installed = fs.readFileSync(BUNDLE, 'utf8');
  const r = transformTokenMeterClamp(installed, 'index.js');
  assert.equal(r.status, 'already', '对已补丁真字节应幂等 already');
  assert.ok(isClamped(installed), '真字节应已夹取 messageTokens');
  assert.equal(extractStateVersion(installed, 'contextBreakdown'), 3, '真字节 contextBreakdown 应为 ver3');
  assert.equal(extractStateVersion(installed, 'tokenUsage'), 2, '真字节 tokenUsage 应仍 ver2');
});

// ===========================================================================
// 3. restore/restoreFloor 机制模型：证明 bump 使脏行自愈
// ===========================================================================
// 逐行还原 session-projection/src/index.ts 的 usable/floor 数学（:429 / :510-534）。
// contextBreakdown 定义以补丁产物为准：stateVersion 从真实 bundle 正则提取，apply 为
// 夹取体；stateSchema 用等价的 tokenCount=Number.isInteger(x)&&x>=0 校验 messageTokens。

function makeContextBreakdownDef(stateVersion) {
  return {
    key: 'contextBreakdown',
    stateVersion,
    init: () => ({ systemTokens: 0, toolsTokens: 0, messageTokens: 0 }),
    parseState: (val) => {
      for (const k of ['systemTokens', 'toolsTokens', 'messageTokens']) {
        if (!Number.isInteger(val[k]) || val[k] < 0) {
          const err = new Error(`Too small: expected number to be >=0 [path: ["${k}"]]`);
          err.field = k;
          throw err;
        }
      }
      return { ...val };
    },
    apply: (state, event) => {
      // 夹取体（补丁产物）：Math.max(0, state.messageTokens + fold.deltaTokens)
      const delta = event.deltaTokens;
      return { ...state, messageTokens: Math.max(0, state.messageTokens + delta) };
    },
  };
}

// 未打 bump 的 apply（内核原始）：不夹取 → 可产生负值（仅作对照，不参与断言修复）
function makeContextBreakdownDefUnclamped(stateVersion) {
  const d = makeContextBreakdownDef(stateVersion);
  d.apply = (state, event) => ({ ...state, messageTokens: state.messageTokens + event.deltaTokens });
  return d;
}

function restoreFloor(defs, checkpoint) {
  let floor;
  for (const def of defs) {
    const row = checkpoint[def.key];
    const need = row !== undefined && row.ver === def.stateVersion ? Math.max(row.seq + 1, 0) : 0;
    floor = floor === undefined ? need : Math.min(floor, need);
  }
  return floor === undefined ? undefined : Math.max(floor - 1, 0);
}

function restore(defs, checkpoint, events, baseSeq) {
  const endSeq = events.length ? events[events.length - 1].seq : baseSeq - 1;
  const beforeBase = baseSeq - 1;
  const states = {};
  for (const def of defs) {
    const row = checkpoint[def.key];
    const usable = row !== undefined
      && row.ver === def.stateVersion
      && row.seq >= beforeBase
      && row.seq <= endSeq;
    if (!usable && baseSeq > 0) {
      throw new Error(`${def.key} cannot restore from seq ${baseSeq}: version-mismatched; re-read from seq 0`);
    }
    let state = usable ? def.parseState(row.val) : def.init();
    const from = usable ? row.seq : beforeBase;
    for (let i = from - baseSeq + 1; i < events.length; i++) state = def.apply(state, events[i]);
    states[def.key] = state;
  }
  return states;
}

// 已落盘的 0.5.6 脏 checkpoint：contextBreakdown ver=2、messageTokens=-5；
// tokenUsage ver=2、seq 与之对齐（使 floor 由"是否 ver 匹配"决定）。
const DIRTY_CHECKPOINT = {
  contextBreakdown: { ver: 2, seq: 100, val: { systemTokens: 0, toolsTokens: 0, messageTokens: -5 } },
  tokenUsage: { ver: 2, seq: 100, val: { totals: 0 } },
};
const TOKEN_USAGE_DEF = { key: 'tokenUsage', stateVersion: 2, init: () => ({ totals: 0 }), parseState: (v) => ({ ...v }), apply: (s) => s };
// seq>100 的尾部事件：把 surface 重新推正（真实重折会覆盖脏值；这里只需 apply 保持非负）
const TAIL_EVENTS = [{ seq: 101, deltaTokens: 3 }, { seq: 102, deltaTokens: 4 }];

test('对照·复现 #172：live stateVersion 仍为 2 时，restore 直接 parse 落盘负值行 → 抛错', () => {
  const defs = [makeContextBreakdownDefUnclamped(2), TOKEN_USAGE_DEF];
  const baseSeq = restoreFloor(defs, DIRTY_CHECKPOINT);
  assert.ok(baseSeq > 0, 'ver 全匹配 → floor 不落 0（走尾部读）');
  assert.throws(
    () => restore(defs, DIRTY_CHECKPOINT, TAIL_EVENTS.filter((e) => e.seq >= baseSeq), baseSeq),
    /messageTokens|Too small/,
    '对 ver=2 负值行 stateSchema.parse 应抛（正是 #172 历史加载失败）',
  );
});

test('修复生效：live contextBreakdown stateVersion=3（自真实 bundle 提取）→ ver 失配丢弃重折、非负、不抛', () => {
  const liveVersion = extractStateVersion(fs.readFileSync(BUNDLE, 'utf8'), 'contextBreakdown');
  assert.equal(liveVersion, 3, '回归位：补丁未 bump 时此断言即红');
  const defs = [makeContextBreakdownDef(liveVersion), TOKEN_USAGE_DEF];
  const baseSeq = restoreFloor(defs, DIRTY_CHECKPOINT);
  assert.equal(baseSeq, 0, 'contextBreakdown ver 失配 → restoreFloor 拉到 0（全量重折）');
  const states = restore(defs, DIRTY_CHECKPOINT, TAIL_EVENTS.filter((e) => e.seq >= baseSeq), baseSeq);
  const cb = states.contextBreakdown;
  assert.ok(Number.isInteger(cb.messageTokens) && cb.messageTokens >= 0, `重折后 messageTokens 应非负，得 ${cb.messageTokens}`);
});
