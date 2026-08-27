'use strict';

// pi-ai 手声明路由思考档位默认补丁单元测试（node --test）。
// 覆盖：transform 一次应用（marker + 默认字典 + base 存在分支保留）、二次
// 幂等、锚点缺失跳过且字节不损坏、目录缺失静默、dry-run 不落盘、stats 计数，
// 以及**行为语义**：eval 提取补丁后的 resolveModelReasoning，断言
//   a) 手声明条目（base undefined）未声明字典 → reasoning:true + 标准档位
//      thinkingLevelMap（off 缺席 = 不发字段）；
//   b) catalog 条目（base 存在）未声明字典 → 维持上游继承（reasoning: base.reasoning）；
//   c) 显式声明字典 → 维持上游声明路径（未声明档位钉 null）。
// 用法：node --test scripts/test/unit-patch-pi-ai-reasoning-defaults.test.js

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  patchPiAiReasoningDefaults,
  transformReasoningDefaults,
  MARKER,
  TARGET_REL,
  ANCHOR,
  OLD_MAP,
  NEW_MAP,
} = require('../patch-pi-ai-reasoning-defaults');

/** 与 dsh-llm-pi-ai lib/index.js 同构的最小片段（tab 缩进、含锚点行）。 */
function fixtureSource() {
  return [
    'function invalid(provider, message) {',
    '\tthrow new Error(message);',
    '}',
    'const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];',
    'function resolveModelReasoning(provider, entry, base) {',
    '\tconst efforts = entry.reasoningEfforts;',
    '\tif (efforts === void 0) return { reasoning: base?.reasoning ?? false };',
    '\tif (efforts === false) return { reasoning: false };',
    '\tif (efforts === null || Object.keys(efforts).length === 0) invalid(provider, "empty");',
    '\tconst declared = THINKING_LEVELS.flatMap((level) => {',
    '\t\tconst wire = efforts[level];',
    '\t\treturn wire === void 0 ? [] : [[level, wire]];',
    '\t});',
    '\tconst map = {};',
    '\tfor (const level of THINKING_LEVELS) {',
    '\t\tconst wire = efforts[level];',
    '\t\tif (wire === void 0) map[level] = null;',
    '\t\telse if (wire !== null) map[level] = wire;',
    '\t}',
    '\treturn {',
    '\t\treasoning: true,',
    '\t\tthinkingLevelMap: map',
    '\t};',
    '}',
  ].join('\n');
}

function buildFakeTree(t, initial) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-piai-reasoning-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const file = path.join(root, TARGET_REL);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, initial);
  return { root, file };
}

/** 从补丁产物中提取 resolveModelReasoning 并在桩环境里 eval 出可调用函数。 */
function extractPatchedFunction(src) {
  const start = src.indexOf('function resolveModelReasoning');
  assert.ok(start >= 0, '补丁产物应仍含 resolveModelReasoning');
  const end = src.indexOf('\n}', src.indexOf('return {', src.indexOf('thinkingLevelMap', start))) + 2;
  const body = src.slice(start, end);
  const THINKING_LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];
  const invalid = () => {
    throw new Error('invalid() called');
  };
  // eslint-disable-next-line no-new-func
  const factory = new Function('THINKING_LEVELS', 'invalid', body + '\nreturn resolveModelReasoning;');
  return factory(THINKING_LEVELS, invalid);
}

test('补丁脚本：一次应用注入 marker + 默认字典，base 分支保留', () => {
  const result = transformReasoningDefaults(fixtureSource());
  assert.equal(result.status, 'changed');
  assert.ok(result.src.includes(MARKER), '应注入幂等 marker');
  assert.ok(result.src.includes(NEW_MAP), '应注入完整 7 档字典（含 xhigh/max）');
  assert.ok(result.src.includes('if (base === void 0) return {'), '手声明判定分支应在');
  // base 存在时的上游继承语义保留。
  assert.ok(result.src.includes('return { reasoning: base?.reasoning ?? false };'), '继承分支应保留');
  // 锚点原行被替换（不再是单行形态）。
  assert.ok(!result.src.includes(ANCHOR), '原锚点单行应被替换');
});

test('补丁脚本：二次应用幂等（already）', () => {
  const once = transformReasoningDefaults(fixtureSource());
  assert.equal(once.status, 'changed');
  assert.equal(transformReasoningDefaults(once.src).status, 'already');
});

test('补丁脚本：旧版字典（low/medium/high）就地升级为完整 7 档并幂等', () => {
  // 模拟已打「旧版补丁」的部署文件：marker + 旧字典，原锚点单行已被替换掉。
  const oldSource = [
    'const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];',
    'function resolveModelReasoning(provider, entry, base) {',
    '\tconst efforts = entry.reasoningEfforts;',
    '\tif (efforts === void 0) {',
    '\t\t// ' + MARKER + ': legacy three-level defaults',
    '\t\tif (base === void 0) return {',
    '\t\t\treasoning: true,',
    '\t\t\t' + OLD_MAP,
    '\t\t};',
    '\t\treturn { reasoning: base?.reasoning ?? false };',
    '\t}',
    '\treturn { reasoning: true, thinkingLevelMap: {} };',
    '}',
  ].join('\n');
  assert.ok(oldSource.includes(MARKER), '模拟旧补丁文件应含 marker');
  assert.ok(oldSource.includes(OLD_MAP), '模拟旧补丁文件应含旧字典');
  assert.ok(!oldSource.includes(ANCHOR), '旧补丁文件不应再含原锚点单行');

  const upgraded = transformReasoningDefaults(oldSource);
  assert.equal(upgraded.status, 'changed', '旧字典应被升级而非 anchor-missing');
  assert.ok(upgraded.src.includes(NEW_MAP), '应升级为完整 7 档字典');
  assert.ok(!upgraded.src.includes(OLD_MAP), '旧字典应被完全替换');
  assert.ok(upgraded.src.includes(MARKER), '升级不应破坏 marker');
  // 升级后二次幂等：已是新字典 → already，不再重复改写。
  assert.equal(transformReasoningDefaults(upgraded.src).status, 'already');
});

test('补丁脚本：锚点缺失跳过且字节不损坏', () => {
  const src = 'function resolveModelReasoning(provider, entry, base) {\n\treturn {};\n}';
  const result = transformReasoningDefaults(src);
  assert.equal(result.status, 'anchor-missing');
  assert.ok(!('src' in result), '锚点缺失不得产出改写文本');
});

test('补丁脚本：锚点缺失返回 detail（含文件名与原因，V14 P2-2）', () => {
  const src = 'function resolveModelReasoning(provider, entry, base) {\n\treturn {};\n}';
  const file = 'C:\\nm\\@deepseek-ai\\dsh-llm-pi-ai\\lib\\index.js';
  const result = transformReasoningDefaults(src, file);
  assert.equal(result.status, 'anchor-missing');
  assert.ok(typeof result.detail === 'string' && result.detail.length > 0, 'anchor-missing 应带 detail');
  assert.ok(result.detail.includes(file), 'detail 应含文件名: ' + result.detail);
  assert.ok(result.detail.includes('resolveModelReasoning') || result.detail.includes('未声明分支锚点'), 'detail 应含原因');
});

test('补丁脚本：root 应用器一次写入 / 二次幂等 / stats 计数 / dry-run / 目录缺失', (t) => {
  const tree = buildFakeTree(t, fixtureSource());
  const stats = { anchorMissing: 0, failed: 0 };
  assert.equal(patchPiAiReasoningDefaults(tree.root, () => {}, stats), 1, '首遍应写入 1 文件');
  const patched = fs.readFileSync(tree.file, 'utf8');
  assert.ok(patched.includes(MARKER));
  assert.equal(patchPiAiReasoningDefaults(tree.root, () => {}, stats), 0, '二遍应幂等 0');
  assert.equal(stats.anchorMissing, 0);
  assert.equal(stats.failed, 0);

  // dry-run：新树首遍 dry-run 不落盘。
  const tree2 = buildFakeTree(t, fixtureSource());
  assert.equal(patchPiAiReasoningDefaults(tree2.root, () => {}, undefined, { dryRun: true }), 0);
  assert.strictEqual(fs.readFileSync(tree2.file, 'utf8'), fixtureSource(), 'dry-run 不得改写文件');

  // 锚点失配计入 stats.anchorMissing。
  const tree3 = buildFakeTree(t, 'const x = 1;\n');
  patchPiAiReasoningDefaults(tree3.root, () => {}, stats);
  assert.equal(stats.anchorMissing, 1, '锚点失配应计数');

  // 目标文件不存在（未装包的根）静默 0。
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-piai-empty-'));
  t.after(() => fs.rmSync(empty, { recursive: true, force: true }));
  assert.equal(patchPiAiReasoningDefaults(empty, () => {}, stats), 0);
});

test('行为语义：手声明条目（无 base）未声明字典 → reasoning:true + 完整档位 map', () => {
  const once = transformReasoningDefaults(fixtureSource());
  const resolveModelReasoning = extractPatchedFunction(once.src);
  const out = resolveModelReasoning('my-gateway', { id: 'gpt-5-mini' }, undefined);
  assert.deepEqual(out, {
    reasoning: true,
    // off 缺席 = 「不发字段」的规范 map 形态（与上游声明路径对 off:null 的
    // 物化一致：声明 off:null 落 map 时省略键）。
    thinkingLevelMap: {
      minimal: 'minimal',
      low: 'low',
      medium: 'medium',
      high: 'high',
      xhigh: 'xhigh',
      max: 'max',
    },
  });
});

test('行为语义：catalog 条目（base 存在）未声明字典 → 维持上游继承', () => {
  const once = transformReasoningDefaults(fixtureSource());
  const resolveModelReasoning = extractPatchedFunction(once.src);
  // base.reasoning:false（catalog 非推理条目）→ 继承 false（上游语义不变）。
  assert.deepEqual(
    resolveModelReasoning('openai', { id: 'gpt-4.1' }, { reasoning: false }),
    { reasoning: false },
  );
  // base.reasoning:true（catalog 推理条目，无字典覆盖）→ 继承 true。
  assert.deepEqual(
    resolveModelReasoning('openai', { id: 'o9' }, { reasoning: true }),
    { reasoning: true },
  );
});

test('行为语义：显式声明字典 → 维持上游声明路径（未声明档位钉 null）', () => {
  const once = transformReasoningDefaults(fixtureSource());
  const resolveModelReasoning = extractPatchedFunction(once.src);
  const out = resolveModelReasoning('my-gateway', { id: 'm1', reasoningEfforts: { off: null, high: 'high' } }, undefined);
  // 上游物化语义：声明 off:null → map 键缺席（「不发字段」）；未声明档位 → 钉 null。
  assert.deepEqual(out, {
    reasoning: true,
    thinkingLevelMap: { minimal: null, low: null, medium: null, high: 'high', xhigh: null, max: null },
  });
});

test('实装文件锚定：dev node_modules 的 dsh-llm-pi-ai 已打补丁且行为正确（缺包则跳过）', () => {
  const real = path.resolve(__dirname, '..', '..', 'node_modules', TARGET_REL);
  if (!fs.existsSync(real)) return; // 剖离检出（无 dev node_modules）时跳过
  const src = fs.readFileSync(real, 'utf8');
  if (!src.includes(MARKER)) return; // patch-deps 尚未跑过（CI 顺序），不算失败
  const resolveModelReasoning = extractPatchedFunction(src);
  // 手声明条目：控件开箱即用（完整 7 档含 xhigh/max）。
  assert.deepEqual(
    resolveModelReasoning('my-gateway', { id: 'gpt-5' }, undefined),
    { reasoning: true, thinkingLevelMap: { minimal: 'minimal', low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh', max: 'max' } },
  );
  // catalog 条目：上游继承语义不变。
  assert.deepEqual(
    resolveModelReasoning('openai', { id: 'gpt-4.1' }, { reasoning: false }),
    { reasoning: false },
  );
  // 语法完整（补丁未破坏上游文件）。
  // node --check 由 CI / patch-deps 兜底，这里以 eval 成功为准（上方已隐式验证）。
});
