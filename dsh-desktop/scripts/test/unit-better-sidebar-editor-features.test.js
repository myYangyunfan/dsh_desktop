/**
 * unit-better-sidebar-editor-features.test.js — side-ed 侧边栏编辑器增强
 * （括号配对 + 缩进折叠 + 查找替换）单测。
 *
 * 架构背景（房子规矩）：本插件已能本地重建（package.json 的
 * `build: rm -rf lib && tsc && tsdown`），“src 权威源 + lib 手工内联”双轨已终结
 * —— lib/client-editor.js 就是 src/client/editor-features.ts 的构建产物，不再
 * 需要 `dsh-editor-features:begin/end` 两个 marker 夹住的手工内联段（真实现已
 * 经 src 编译在位，手工段反而会变成重复声明）。
 *
 * 两条取字节的路子（都是发行字节，不测手写副本）：
 *  1) loadChunk()：实例化整个 chunk 工厂，取它原生导出的 __internals。
 *     既能直测四个纯函数，又反向证明了「测试面确实挂在 chunk 导出上」。
 *  2) loadFeaturesRegion()：tsdown 会保留 `//#region <源路径>` 定界，抠出
 *     editor-features 区段单独求值 —— chunk 只导出 TextEditor/__internals，
 *     而 editorFeatures() 组合与 ensureEditorFeaturesCss() 幂等需要直接调用它们。
 *
 * 覆盖四块：
 *  1) 纯函数实测：matchingBracketIndex / foldableBlocks / findMatchOffsets /
 *     computeReplacedText（经路子 1）。
 *  2) 组合形状：editorFeatures() = [括号, 折叠(3 项), 查找(2 项)]（路子 2）。
 *  3) CSS 注入幂等：带 document stub 跑 ensureEditorFeaturesCss（K28
 *     data-plugin-css 模式），两次调用只插一个 <style>。
 *  4) 产物/src 契约：chunk 导出面、挂载点邻接与优先级、三特性关键标识、
 *     src 导出面与 canonical 键位。
 *
 * 运行：node --test scripts/test/unit-better-sidebar-editor-features.test.js
 *（不依赖内核 / 真实 DOM / 网络；CodeMirror 绑定以 Proxy stub 顶替。）
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// vm 物化出的对象跨 realm，统一经 JSON 往返归一为本地 realm。
const plain = (x) => JSON.parse(JSON.stringify(x));

const PLUGIN_DIR = path.join(__dirname, '..', '..', 'assets', 'plugins', 'dsh-better-sidebar');
const EDITOR_CHUNK = path.join(PLUGIN_DIR, 'lib', 'client-editor.js');
const FEATURES_SRC = path.join(PLUGIN_DIR, 'src', 'client', 'editor-features.ts');
const TEXT_EDITOR_SRC = path.join(PLUGIN_DIR, 'src', 'client', 'TextEditor.tsx');
const CHUNK_ENTRY_SRC = path.join(PLUGIN_DIR, 'src', 'client', 'chunks', 'editor.tsx');

/** tsdown 产物里保留的源区段定界（构建期写入，用于把单个源的代码抓出来）。 */
const REGION_HEAD = '//#region src/client/editor-features.ts';

/** 区段可能引用的外部绑定（构建后由工厂顶部的 require 提供）。
 *  多注入无害（区段内同名声明会遮蔽沙箱全局），少一个就 ReferenceError；
 *  靠穷举源码引用集不靠谱（`extends WidgetType` 这种既非调用也非属性访问），
 *  所以按 @codemirror/state + @codemirror/view 常见导出给完整一份。 */
const CM_STUB_NAMES = [
  'Decoration', 'EditorState', 'EditorSelection', 'EditorView', 'Range', 'RangeSet', 'StateEffect',
  'StateField', 'Transaction', 'ViewPlugin', 'WidgetType', 'GutterMarker', 'keymap', 'gutter', 'Prec', 'theme',
];

/** 依赖替身：任意取属性 / 调用 / 构造都返回可链式透传的自身（`extends` 也吃得下）。 */
function stubAny() {
  const fn = function () { return fn; };
  return new Proxy(fn, {
    get: (t, k) => (k === Symbol.toPrimitive ? () => '' : fn),
    apply: () => fn,
    construct: () => fn,
  });
}

/**
 * 路子 1：实例化发行 chunk。
 * 产物形态：`globalThis.__dshChunks__["editor"] = (require) => { ... return module.exports }`，
 * 所以给一个全 Proxy 的 require 就能拿到真实导出面。
 */
function loadChunk() {
  const src = fs.readFileSync(EDITOR_CHUNK, 'utf8');
  const sandbox = {
    console, setTimeout, clearTimeout, Promise, TextEncoder, TextDecoder, URL, Buffer, process,
  };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: 'client-editor.js' });
  const factory = sandbox.__dshChunks__ && sandbox.__dshChunks__.editor;
  assert.equal(typeof factory, 'function', 'chunk 应注册 __dshChunks__["editor"] 工厂');
  const mod = factory(() => stubAny());
  assert.ok(mod.__internals, '发行 chunk 应原生导出 __internals 测试面');
  assert.equal(typeof mod.TextEditor, 'function', '发行 chunk 应导出 TextEditor');
  return { mod, internals: mod.__internals };
}

/**
 * 路子 2：抠出 editor-features 区段单独求值（取 chunk 未导出的内部函数）。
 * 区段自包含设计：只依赖 @codemirror/state + @codemirror/view 核心机械件（已在
 * chunk 内），外部名字就 CM_STUB_NAMES 七个 + document。
 */
function loadFeaturesRegion(sandboxExtra = {}) {
  const src = fs.readFileSync(EDITOR_CHUNK, 'utf8');
  const head = src.indexOf(REGION_HEAD);
  assert.ok(head !== -1, `产物应含区段定界 ${REGION_HEAD}`);
  const rest = src.slice(head + REGION_HEAD.length);
  // 区段在工厂函数体内，定界行带缩进；取本区段自己的收尾 endregion。
  const tail = rest.search(/\n[ \t]*\/\/\#endregion/);
  assert.ok(tail !== -1, '区段应有 //#endregion 收尾');
  const region = rest.slice(0, tail);
  const sandbox = {
    console, setTimeout: () => 0, clearTimeout: () => {},
    requestAnimationFrame: () => 0, cancelAnimationFrame: () => {},
    ...Object.fromEntries(CM_STUB_NAMES.map((n) => [n, stubAny()])),
    ...sandboxExtra,
  };
  vm.runInNewContext(region, sandbox, { filename: 'client-editor.js#editor-features' });
  assert.equal(typeof sandbox.editorFeatures, 'function', '区段应含 editorFeatures');
  assert.equal(typeof sandbox.ensureEditorFeaturesCss, 'function', '区段应含 ensureEditorFeaturesCss');
  return { sandbox, editorFeatures: sandbox.editorFeatures, ensureCss: sandbox.ensureEditorFeaturesCss };
}

// ---------------------------------------------------------------------------
// 1) matchingBracketIndex：光标邻接括号对
// ---------------------------------------------------------------------------
test('bracket: 光标在 ( 之后 → 前括号向后配对', () => {
  const { matchingBracketIndex } = loadChunk().internals;
  assert.deepEqual(plain(matchingBracketIndex('()', 1)), { bracket: 0, match: 1 });
});

test('bracket: 光标在 ) 之前（head 处即括号）→ 后括号向前配对', () => {
  const { matchingBracketIndex } = loadChunk().internals;
  // head=1 处是 ')'，head-1 处是 '('：光标后括号优先级更高，两解等价一致。
  assert.deepEqual(plain(matchingBracketIndex('()', 1)), { bracket: 0, match: 1 });
  // 纯 forward 案例：head 处是 '('。
  assert.deepEqual(plain(matchingBracketIndex('()x', 0)), { bracket: 0, match: 1 });
});

test('bracket: 嵌套深度计数（多层同型括号）', () => {
  const { matchingBracketIndex } = loadChunk().internals;
  const text = '{a{b}c}';
  // head=1 在第一个 '{' 之后 → 配对末尾的 '}'。
  assert.deepEqual(plain(matchingBracketIndex(text, 1)), { bracket: 0, match: 6 });
  // head=7 在末尾 '}'（offset 6）之后 → 向前配对最外层 '{'（offset 0；
  // 内层 '{' 已被 offset 4 的 '}' 消耗）。
  assert.deepEqual(plain(matchingBracketIndex(text, 7)), { bracket: 6, match: 0 });
});

test('bracket: 混合类型括号互不误配', () => {
  const { matchingBracketIndex } = loadChunk().internals;
  const text = '{[()]}';
  // head=2：head-1 处 '['（offset 1）向后配 ']'（offset 4）。
  assert.deepEqual(plain(matchingBracketIndex(text, 2)), { bracket: 1, match: 4 });
  // head=3：head-1 处 '('（offset 2）向后配紧邻的 ')'（offset 3）。
  assert.deepEqual(plain(matchingBracketIndex(text, 3)), { bracket: 2, match: 3 });
});

test('bracket: 不配对 / 空文本 / 越界 → null', () => {
  const { matchingBracketIndex } = loadChunk().internals;
  assert.equal(matchingBracketIndex('(]', 1), null);
  assert.equal(matchingBracketIndex('abc', 1), null);
  assert.equal(matchingBracketIndex('', 0), null);
  assert.equal(matchingBracketIndex('()', 99), null);
});

test('bracket: 光标后字符优先于光标处字符（编辑器惯例）', () => {
  const { matchingBracketIndex } = loadChunk().internals;
  // "f(a)" head=4：head-1 处是 ')'（offset 3），向前配对 '('（offset 1）。
  assert.deepEqual(plain(matchingBracketIndex('f(a)', 4)), { bracket: 3, match: 1 });
});

// ---------------------------------------------------------------------------
// 2) foldableBlocks：缩进折叠块
// ---------------------------------------------------------------------------
test('fold: 两层缩进 → 每个 header 行各出一个块', () => {
  const { foldableBlocks } = loadChunk().internals;
  const text = [
    'function f() {',
    '  if (x) {',
    '    deep();',
    '  }',
    '}',
  ].join('\n');
  // L1 开块到 L4（'  }' 是最后一个更深缩进行；闭合的 '}' 同级不计入），
  // L2 开块到 L3（deep() 是唯一子行）。与 VSCode 缩进折叠同语义。
  assert.deepEqual(plain(foldableBlocks(text)), [
    { fromLine: 1, toLine: 4 },
    { fromLine: 2, toLine: 3 },
  ]);
});

test('fold: 空行不打断块，尾随空行不计入', () => {
  const { foldableBlocks } = loadChunk().internals;
  const text = ['a:', '  x = 1', '', '  y = 2', 'b:'].join('\n');
  assert.deepEqual(plain(foldableBlocks(text)), [{ fromLine: 1, toLine: 4 }]);
});

test('fold: 无子行 / 纯空文档 → 无块', () => {
  const { foldableBlocks } = loadChunk().internals;
  assert.deepEqual(plain(foldableBlocks('single line')), []);
  assert.deepEqual(plain(foldableBlocks('')), []);
  assert.deepEqual(plain(foldableBlocks('\n\n\n')), []);
});

test('fold: 同级连续行归入同一块', () => {
  const { foldableBlocks } = loadChunk().internals;
  const text = ['root:', '  a', '  b', '  c'].join('\n');
  assert.deepEqual(plain(foldableBlocks(text)), [{ fromLine: 1, toLine: 4 }]);
});

// ---------------------------------------------------------------------------
// 3) findMatchOffsets / computeReplacedText：查找与替换
// ---------------------------------------------------------------------------
test('find: 基本匹配 + 大小写不敏感', () => {
  const { findMatchOffsets } = loadChunk().internals;
  assert.deepEqual(plain(findMatchOffsets('abXab', 'ab', true)), [0, 3]);
  assert.deepEqual(plain(findMatchOffsets('abXab', 'AB', false)), [0, 3]);
  assert.deepEqual(plain(findMatchOffsets('abXab', 'AB', true)), []);
});

test('find: 空 query → []，重叠不重复计', () => {
  const { findMatchOffsets } = loadChunk().internals;
  assert.deepEqual(plain(findMatchOffsets('aaa', '', true)), []);
  // "aa" in "aaa"：offset 0 命中后从 2 继续扫描 → 非 0/1 重叠。
  assert.deepEqual(plain(findMatchOffsets('aaa', 'aa', true)), [0]);
  assert.deepEqual(plain(findMatchOffsets('aaaa', 'aa', true)), [0, 2]);
});

test('replace: 全替换 + 计数；无匹配返回原文', () => {
  const { computeReplacedText } = loadChunk().internals;
  assert.deepEqual(plain(computeReplacedText('aBcAbC', 'ab', 'X', false)), { text: 'XcXC', count: 2 });
  assert.deepEqual(plain(computeReplacedText('abc', 'zz', 'X', true)), { text: 'abc', count: 0 });
  assert.deepEqual(plain(computeReplacedText('aa', 'a', 'bb', true)), { text: 'bbbb', count: 2 });
});

// ---------------------------------------------------------------------------
// 4) editorFeatures() 组合形状 + CSS 注入幂等（document stub）
// ---------------------------------------------------------------------------
test('editorFeatures(): 组合形状对齐 src（括号 + 折叠 3 项 + 查找 2 项）', () => {
  const { editorFeatures } = loadFeaturesRegion();
  // 不过 plain()：stub 是函数 Proxy，带 toJSON 陷阱会让 JSON 往返递归；
  // Array.isArray 与 length 都是跨 realm 安全的判定。
  const feat = editorFeatures();
  assert.ok(Array.isArray(feat), '应返回扩展数组');
  assert.equal(feat.length, 3, '括号配对 + 折叠 + 查找替换');
  assert.ok(Array.isArray(feat[1]) && feat[1].length === 3, '折叠 = field + gutter + keymap');
  assert.ok(Array.isArray(feat[2]) && feat[2].length === 2, '查找 = plugin + keymap');
});

test('CSS 注入幂等：两次 editorFeatures() 只插一个 <style data-plugin-css>', () => {
  const appended = [];
  const el = () => ({ dataset: {}, textContent: '', className: '', style: {}, appendChild() {} });
  const documentStub = {
    querySelector: () => appended[0] ?? null,
    createElement: el,
    head: { appendChild: (n) => appended.push(n) },
  };
  const { editorFeatures } = loadFeaturesRegion({ document: documentStub });
  editorFeatures();
  editorFeatures();
  assert.equal(appended.length, 1, 'style 标签只注入一次');
  assert.equal(appended[0].dataset.plugin, 'dsh-better-sidebar');
  assert.equal(appended[0].dataset.pluginCss, 'dsh-better-sidebar/editor-features');
  assert.ok(appended[0].textContent.includes('dsh-editor-bracket-match'), 'CSS 含括号配对样式');
  assert.ok(appended[0].textContent.includes('dsh-editor-fold-gutter'), 'CSS 含折叠 gutter 样式');
  assert.ok(appended[0].textContent.includes('dsh-editor-find-panel'), 'CSS 含查找面板样式');
});

test('CSS 守卫：无 document 环境（vm）不抛错', () => {
  // loadFeaturesRegion 默认沙箱没有 document —— 区段求值 + 调用本身已验证不抛。
  const { editorFeatures, ensureCss } = loadFeaturesRegion();
  assert.ok(editorFeatures, 'editorFeatures 可用');
  assert.doesNotThrow(() => ensureCss(), '无 document 时 ensureEditorFeaturesCss 应静默返回');
});

// ---------------------------------------------------------------------------
// 5) 产物契约：chunk 导出面、挂载点优先级、三特性标识
// ---------------------------------------------------------------------------
test('产物契约: chunk 导出面与挂载点邻接/优先级', () => {
  const lib = fs.readFileSync(EDITOR_CHUNK, 'utf8');
  const count = (needle) => lib.split(needle).length - 1;
  assert.equal(count('exports.__internals = __internals;'), 1, '__internals 挂到 chunk exports');
  assert.equal(count('exports.TextEditor = TextEditor;'), 1, 'TextEditor 挂到 chunk exports');
  assert.equal(count('editorFeatures(),'), 1, '扩展挂载点唯一');
  assert.equal(count('//#region src/client/editor-features.ts'), 1, '区段定界唯一（构建保留）');
  // 旧双轨的手工内联段不得回来：真实现已由 src 编译在位，同时存在 = 重复声明。
  assert.equal(count('/* dsh-editor-features:begin */'), 0, '手工内联 marker 不得再现');
  assert.equal(count('/* dsh-editor-features:end */'), 0, '手工内联 marker 不得再现');
  // 折叠 gutter：旧手工内联走 activeGutters（当时构建无 gutter() 导出），真构建后
  // 回归上游正规形态 gutter()，本包内应只出现一次。
  assert.equal(count('gutter({'), 1, '折叠 gutter 走 gutter()');
  // 挂载位置：扩展数组内、history() 之后与 tabSize 之前，保证三特性先于
  // TextEditor 自己的 keymap 拿到按键（Mod-f / F3 / Escape 优先）。
  const lines = lib.split('\n');
  const mountIdx = lines.findIndex((l) => l.trim() === 'editorFeatures(),');
  assert.ok(mountIdx !== -1, '挂载行存在');
  assert.ok(lines[mountIdx - 1].includes('history(),'), '挂载行紧跟 history()');
  assert.ok(lines[mountIdx + 1].includes('EditorState.tabSize.of(2),'), '挂载行先于 tabSize');
  const mountPos = lib.indexOf('editorFeatures(),');
  const keymapPos = lib.indexOf('keymap.of([', mountPos);
  assert.ok(keymapPos > mountPos, '挂载点之后才有 keymap（TextEditor 自有 keymap 优先生效）');
});

test('产物契约: 发行字节含三特性的关键标识与样式 class', () => {
  const lib = fs.readFileSync(EDITOR_CHUNK, 'utf8');
  for (const needle of [
    'dsh-editor-bracket-match',
    'dsh-editor-fold-gutter',
    'dsh-editor-fold-marker',
    'dsh-editor-fold-placeholder',
    'dsh-editor-find-panel',
    'DshFoldPlaceholder',
    'DshFoldMarker',
    'dshFoldEffect',
    'foldState',
    'Ctrl-Shift-[',
  ]) {
    assert.ok(lib.includes(needle), `发行字节应含 ${needle}`);
  }
});

// ---------------------------------------------------------------------------
// 6) src 权威源契约：导出面、接线点、canonical 键位
// ---------------------------------------------------------------------------
test('src 契约: editor-features.ts 导出面与纯函数', () => {
  const src = fs.readFileSync(FEATURES_SRC, 'utf8');
  for (const needle of [
    'export function matchingBracketIndex',
    'export function foldableBlocks',
    'export function findMatchOffsets',
    'export function computeReplacedText',
    'export function ensureEditorFeaturesCss',
    'export function editorFeatures',
    'export interface BracketPair',
    'export function bracketMatchExtension',
    'export function foldExtension',
    'export function findPanelExtension',
    'BRACKET_SCAN_LIMIT',
    'FOLD_STEP_BUDGET',
  ]) {
    assert.ok(src.includes(needle), `src 应含 ${needle}`);
  }
});

test('src 契约: TextEditor 接线 + chunks __internals + canonical 键位', () => {
  const editor = fs.readFileSync(TEXT_EDITOR_SRC, 'utf8');
  assert.ok(editor.includes("import { editorFeatures } from './editor-features.ts'"), 'import 存在');
  assert.ok(editor.includes('editorFeatures(),'), '扩展数组挂载点存在');
  // 挂载点必须在 keymap.of 之前（Mod-f / F3 / Escape 优先）。
  const featPos = editor.indexOf('editorFeatures(),');
  const keymapPos = editor.indexOf('keymap.of([');
  assert.ok(featPos !== -1 && keymapPos !== -1 && featPos < keymapPos, '挂载点先于 keymap');

  const entry = fs.readFileSync(CHUNK_ENTRY_SRC, 'utf8');
  assert.ok(
    entry.includes('export const __internals = { matchingBracketIndex, foldableBlocks, findMatchOffsets, computeReplacedText }'),
    'chunk 入口导出 __internals 测试面',
  );

  const feat = fs.readFileSync(FEATURES_SRC, 'utf8');
  assert.ok(feat.includes("{ key: 'Ctrl-Shift-[', mac: 'Mod-Alt-['"), '折叠键位为上游 canonical 形态');
  assert.ok(feat.includes("{ key: 'Ctrl-Shift-]', mac: 'Mod-Alt-]'"), '展开键位为上游 canonical 形态');
  assert.ok(feat.includes("'Mod-f'"), '查找键位 Mod-f');
  assert.ok(feat.includes('scrollIntoView: true'), '导航用事务级 scrollIntoView');
});
