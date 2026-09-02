/**
 * unit-better-sidebar-editor-features.test.js — side-ed 侧边栏编辑器增强
 * （括号配对 + 缩进折叠 + 查找替换）单测。
 *
 * 架构背景（房子规矩）：dsh-better-sidebar 是 vendored 社区插件，编辑器
 * chunk（lib/client-editor.js）无法离线重建 —— 走「src 权威源 + lib 等价
 * 内联」双轨。lib 中的内联实现位于 `dsh-editor-features` 两个 marker 之间，
 * 以 `dshEditorFeatures` IIFE 形态存在；src 侧对应
 * src/client/editor-features.ts。
 *
 * 覆盖四块：
 *  1) 纯函数实测：vm 提取 lib 内联 section（CodeMirror 绑定用 stub），
 *     直测 matchingBracketIndex / foldableBlocks / findMatchOffsets /
 *     computeReplacedText —— 测的就是发行字节。
 *  2) 组合形状：editorFeatures()（= 括号配对 + 折叠 + 查找）返回结构与
 *     src 的 [bracket, fold(3 项), find(2 项)] 对齐。
 *  3) CSS 注入幂等：带 document stub 跑 ensureEditorFeaturesCss（K28
 *     data-plugin-css 模式），两次调用只插一个 <style>。
 *  4) 产物/src 契约：锚点邻接、marker 唯一、导出面、接线点、canonical 键位。
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

const BEGIN = '/* dsh-editor-features:begin */';
const END = '/* dsh-editor-features:end */';

/** CodeMirror 绑定替身：任意取属性/调用/构造都返回可链式透传的函数。 */
function cmStub() {
  const fn = function () { return fn; };
  return new Proxy(fn, {
    get: (t, k) => {
      if (k === Symbol.toPrimitive) return () => '';
      return fn;
    },
    apply: () => fn,
    construct: () => ({}),
  });
}

/** 从 lib 产物中提取 marker 之间的内联 section 并在沙箱中求值。 */
function loadSection(sandboxExtra = {}) {
  const lib = fs.readFileSync(EDITOR_CHUNK, 'utf8');
  const begin = lib.indexOf(BEGIN);
  const end = lib.indexOf(END);
  assert.ok(begin !== -1, 'lib 应含 begin marker');
  assert.ok(end !== -1 && end > begin, 'lib 应含 end marker 且在 begin 之后');
  const section = lib.slice(begin, end + END.length);
  const sandbox = {
    Decoration: cmStub(),
    EditorView: cmStub(),
    GutterMarker: cmStub(),
    ViewPlugin: cmStub(),
    WidgetType: cmStub(),
    StateEffect: cmStub(),
    StateField: cmStub(),
    keymap: cmStub(),
    EditorSelection: cmStub(),
    activeGutters: cmStub(),
    gutters: cmStub(),
    module: { exports: {} },
    ...sandboxExtra,
  };
  vm.runInNewContext(section, sandbox, { filename: 'client-editor.js#dsh-editor-features' });
  const internals = sandbox.module.exports.__internals;
  assert.ok(internals && typeof internals.matchingBracketIndex === 'function', 'section 应导出 __internals');
  assert.equal(typeof sandbox.module.exports.editorFeaturesDsh, 'function', 'section 应导出 editorFeaturesDsh');
  return { internals, mod: sandbox.module.exports, sandbox };
}

// ---------------------------------------------------------------------------
// 1) matchingBracketIndex：光标邻接括号对
// ---------------------------------------------------------------------------
test('bracket: 光标在 ( 之后 → 前括号向后配对', () => {
  const { matchingBracketIndex } = loadSection().internals;
  assert.deepEqual(plain(matchingBracketIndex('()', 1)), { bracket: 0, match: 1 });
});

test('bracket: 光标在 ) 之前（head 处即括号）→ 后括号向前配对', () => {
  const { matchingBracketIndex } = loadSection().internals;
  // head=1 处是 ')'，head-1 处是 '('：光标后括号优先级更高，两解等价一致。
  assert.deepEqual(plain(matchingBracketIndex('()', 1)), { bracket: 0, match: 1 });
  // 纯 forward 案例：head 处是 '('。
  assert.deepEqual(plain(matchingBracketIndex('()x', 0)), { bracket: 0, match: 1 });
});

test('bracket: 嵌套深度计数（多层同型括号）', () => {
  const { matchingBracketIndex } = loadSection().internals;
  const text = '{a{b}c}';
  // head=1 在第一个 '{' 之后 → 配对末尾的 '}'。
  assert.deepEqual(plain(matchingBracketIndex(text, 1)), { bracket: 0, match: 6 });
  // head=7 在末尾 '}'（offset 6）之后 → 向前配对最外层 '{'（offset 0；
  // 内层 '{' 已被 offset 4 的 '}' 消耗）。
  assert.deepEqual(plain(matchingBracketIndex(text, 7)), { bracket: 6, match: 0 });
});

test('bracket: 混合类型括号互不误配', () => {
  const { matchingBracketIndex } = loadSection().internals;
  const text = '{[()]}';
  // head=2：head-1 处 '['（offset 1）向后配 ']'（offset 4）。
  assert.deepEqual(plain(matchingBracketIndex(text, 2)), { bracket: 1, match: 4 });
  // head=3：head-1 处 '('（offset 2）向后配紧邻的 ')'（offset 3）。
  assert.deepEqual(plain(matchingBracketIndex(text, 3)), { bracket: 2, match: 3 });
});

test('bracket: 不配对 / 空文本 / 越界 → null', () => {
  const { matchingBracketIndex } = loadSection().internals;
  assert.equal(matchingBracketIndex('(]', 1), null);
  assert.equal(matchingBracketIndex('abc', 1), null);
  assert.equal(matchingBracketIndex('', 0), null);
  assert.equal(matchingBracketIndex('()', 99), null);
});

test('bracket: 光标后字符优先于光标处字符（编辑器惯例）', () => {
  const { matchingBracketIndex } = loadSection().internals;
  // "f(a)" head=4：head-1 处是 ')'（offset 3），向前配对 '('（offset 1）。
  assert.deepEqual(plain(matchingBracketIndex('f(a)', 4)), { bracket: 3, match: 1 });
});

// ---------------------------------------------------------------------------
// 2) foldableBlocks：缩进折叠块
// ---------------------------------------------------------------------------
test('fold: 两层缩进 → 每个 header 行各出一个块', () => {
  const { foldableBlocks } = loadSection().internals;
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
  const { foldableBlocks } = loadSection().internals;
  const text = ['a:', '  x = 1', '', '  y = 2', 'b:'].join('\n');
  assert.deepEqual(plain(foldableBlocks(text)), [{ fromLine: 1, toLine: 4 }]);
});

test('fold: 无子行 / 纯空文档 → 无块', () => {
  const { foldableBlocks } = loadSection().internals;
  assert.deepEqual(plain(foldableBlocks('single line')), []);
  assert.deepEqual(plain(foldableBlocks('')), []);
  assert.deepEqual(plain(foldableBlocks('\n\n\n')), []);
});

test('fold: 同级连续行归入同一块', () => {
  const { foldableBlocks } = loadSection().internals;
  const text = ['root:', '  a', '  b', '  c'].join('\n');
  assert.deepEqual(plain(foldableBlocks(text)), [{ fromLine: 1, toLine: 4 }]);
});

// ---------------------------------------------------------------------------
// 3) findMatchOffsets / computeReplacedText：查找与替换
// ---------------------------------------------------------------------------
test('find: 基本匹配 + 大小写不敏感', () => {
  const { findMatchOffsets } = loadSection().internals;
  assert.deepEqual(plain(findMatchOffsets('abXab', 'ab', true)), [0, 3]);
  assert.deepEqual(plain(findMatchOffsets('abXab', 'AB', false)), [0, 3]);
  assert.deepEqual(plain(findMatchOffsets('abXab', 'AB', true)), []);
});

test('find: 空 query → []，重叠不重复计', () => {
  const { findMatchOffsets } = loadSection().internals;
  assert.deepEqual(plain(findMatchOffsets('aaa', '', true)), []);
  // "aa" in "aaa"：offset 0 命中后从 2 继续扫描 → 非 0/1 重叠。
  assert.deepEqual(plain(findMatchOffsets('aaa', 'aa', true)), [0]);
  assert.deepEqual(plain(findMatchOffsets('aaaa', 'aa', true)), [0, 2]);
});

test('replace: 全替换 + 计数；无匹配返回原文', () => {
  const { computeReplacedText } = loadSection().internals;
  assert.deepEqual(plain(computeReplacedText('aBcAbC', 'ab', 'X', false)), { text: 'XcXC', count: 2 });
  assert.deepEqual(plain(computeReplacedText('abc', 'zz', 'X', true)), { text: 'abc', count: 0 });
  assert.deepEqual(plain(computeReplacedText('aa', 'a', 'bb', true)), { text: 'bbbb', count: 2 });
});

// ---------------------------------------------------------------------------
// 4) editorFeatures() 组合形状 + CSS 注入幂等（document stub）
// ---------------------------------------------------------------------------
test('editorFeatures(): 组合形状对齐 src（括号 + 折叠 3 项 + 查找 2 项）', () => {
  const { mod } = loadSection();
  const feat = mod.editorFeaturesDsh();
  assert.ok(Array.isArray(feat), '应返回扩展数组');
  assert.equal(feat.length, 3, '括号配对 + 折叠 + 查找替换');
  assert.ok(Array.isArray(feat[1]) && feat[1].length === 3, '折叠 = field + gutter + keymap');
  assert.ok(Array.isArray(feat[2]) && feat[2].length === 2, '查找 = plugin + keymap');
});

test('CSS 注入幂等：两次 editorFeaturesDsh() 只插一个 <style data-plugin-css>', () => {
  const appended = [];
  const el = () => ({ dataset: {}, textContent: '', className: '', style: {}, appendChild() {} });
  const documentStub = {
    querySelector: () => appended[0] ?? null,
    createElement: el,
    head: { appendChild: (n) => appended.push(n) },
  };
  const { mod } = loadSection({ document: documentStub });
  mod.editorFeaturesDsh();
  mod.editorFeaturesDsh();
  assert.equal(appended.length, 1, 'style 标签只注入一次');
  assert.equal(appended[0].dataset.plugin, 'dsh-better-sidebar');
  assert.equal(appended[0].dataset.pluginCss, 'dsh-better-sidebar/editor-features');
  assert.ok(appended[0].textContent.includes('dsh-editor-bracket-match'), 'CSS 含括号配对样式');
  assert.ok(appended[0].textContent.includes('dsh-editor-fold-gutter'), 'CSS 含折叠 gutter 样式');
  assert.ok(appended[0].textContent.includes('dsh-editor-find-panel'), 'CSS 含查找面板样式');
});

test('CSS 守卫：无 document 环境（vm）不抛错', () => {
  // loadSection 的沙箱没有 document —— mod 导入/求值本身已验证不抛。
  const { mod } = loadSection();
  assert.ok(mod.editorFeaturesDsh, '导出可用');
});

// ---------------------------------------------------------------------------
// 5) 产物契约：lib 内联接线与 marker 唯一性
// ---------------------------------------------------------------------------
test('产物契约: lib 锚点邻接 + marker 唯一 + 导出面', () => {
  const lib = fs.readFileSync(EDITOR_CHUNK, 'utf8');
  const count = (needle) => lib.split(needle).length - 1;
  assert.equal(count(BEGIN), 1, 'begin marker 唯一');
  assert.equal(count(END), 1, 'end marker 唯一');
  assert.equal(count('dshEditorFeatures.editorFeatures(),'), 1, '扩展挂载点唯一');
  assert.equal(count('module.exports.__internals'), 1, '__internals 挂到 chunk exports');
  assert.equal(count('module.exports.editorFeaturesDsh'), 1, 'editorFeaturesDsh 挂到 chunk exports');
  assert.equal(count('activeGutters.of('), 1, '折叠 gutter 走 activeGutters（本构建无 gutter() 导出）');
  // 锚点行（cmSurfaceTheme）的下一行即挂载点，且位于 keymap 之前保证按键优先级。
  const lines = lib.split('\n');
  const anchorIdx = lines.findIndex((l) => l.trimEnd().endsWith('cmSurfaceTheme,'));
  assert.ok(anchorIdx !== -1, '锚点行存在');
  assert.match(lines[anchorIdx + 1], /^\s*dshEditorFeatures\.editorFeatures\(\),$/, '挂载行紧跟锚点');
  const anchorPos = lib.indexOf('dshEditorFeatures.editorFeatures(),');
  const keymapPos = lib.indexOf("keymap.of([", anchorPos);
  assert.ok(keymapPos === -1 || keymapPos > anchorPos, '挂载点在 TextEditor keymap 之前');
});

test('产物契约: lib 内联含三特性的关键标识与样式 class', () => {
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
    assert.ok(lib.includes(needle), `内联应含 ${needle}`);
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
