'use strict';

// issue #36 补丁脚本单元测试（node --test）。
// 覆盖：一次应用、二次幂等、anchor 缺失跳过且字节级不损坏、非目标包跳过、
//       注入保留 rc.2 的 overlayTopMargin 顶缘避让、#182 退役后零残留、
//       vendored 真实内核字节的锚点新鲜度。
// 夹具口径：menuShape() 按 compat-pin 版本（当前 0.2.0-rc.2）
//   dsh-client-ui-primitives/lib/index.js 里 Menu 的 useLayoutEffect 真实字节
//   逐行抄录（place() 体 3 tab、effect 体 2 tab、逐帧 rAF track + cleanup）。
//   缩进就是锚的一部分，夹具与内核字节脱钩会让「锚已漂移」在单测里静默隐身
//   （本文件曾中招）。
// 用法：node --test scripts/test/unit-menu-viewport.test.js

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync, execFileSync } = require('node:child_process');
const { patchMenuViewport, MARKER } = require('../patch-menu-viewport');
const { kernel } = require('../compat/kernel-pin.json');

/**
 * rc.2 Menu 的 useLayoutEffect 现场。
 * shape='rc2'    —— 现行锚点（y 下界走 overlayTopMargin(MARGIN)）。
 * shape='legacy' —— 0.1.6 及更早的形态（y 下界是字面量 MARGIN），
 *                   用来反证「锚点确实咬住了 rc.2 的改动」：补丁脚本打在
 *                   legacy 字节上必须整段跳过、零写入。
 */
function menuShape(shape = 'rc2') {
  const yClamp = shape === 'legacy'
    ? '\t\t\tif (lh > 0) y = Math.min(Math.max(y, MARGIN), vh - lh - MARGIN);'
    : '\t\t\tif (lh > 0) y = Math.min(Math.max(y, overlayTopMargin(MARGIN)), vh - lh - MARGIN);';
  const lines = [
    'function Menu({ open, anchor, items, onClose, align = "start", side = "bottom", portal = false, getAnchorRect }) {',
    '\tconst rootRef = useRef(null);',
    '\tconst listRef = useRef(null);',
    '\tconst [fixedPos, setFixedPos] = useState(null);',
    '\tuseLayoutEffect(() => {',
    '\t\tif (!open || !portal) {',
    '\t\t\tsetFixedPos(null);',
    '\t\t\treturn;',
    '\t\t}',
    '\t\tconst place = () => {',
    '\t\t\tconst MARGIN = 12;',
    '\t\t\tconst vw = window.innerWidth;',
    '\t\t\tconst vh = window.innerHeight;',
    '\t\t\tconst listEl = listRef.current;',
    '\t\t\tconst lw = listEl?.offsetWidth ?? 0;',
    '\t\t\tconst lh = listEl?.offsetHeight ?? 0;',
    '\t\t\tlet x;',
    '\t\t\tlet y;',
    '\t\t\tif (lw > 0) x = Math.min(Math.max(x, MARGIN), vw - lw - MARGIN);',
    yClamp,
    '\t\t\tsetFixedPos((current) => current?.left === x && current.top === y ? current : {',
    '\t\t\t\tleft: x,',
    '\t\t\t\ttop: y',
    '\t\t\t});',
    '\t\t};',
    '\t\tplace();',
    '\t\tconst track = () => {',
    '\t\t\tplace();',
    '\t\t\tframe = requestAnimationFrame(track);',
    '\t\t};',
    '\t\tlet frame = requestAnimationFrame(track);',
    '\t\twindow.addEventListener("scroll", place, true);',
    '\t\twindow.addEventListener("resize", place);',
    '\t\treturn () => {',
    '\t\t\tcancelAnimationFrame(frame);',
    '\t\t\twindow.removeEventListener("scroll", place, true);',
    '\t\t\twindow.removeEventListener("resize", place);',
    '\t\t};',
    '\t}, [',
    '\t\topen,',
    '\t\tportal,',
    '\t\talign,',
    '\t\tside,',
    '\t\tgetAnchorRect',
    '\t]);',
    '\treturn jsx("div", {',
    '\t\tref: listRef,',
    '\t\tstyle: portal ? fixedPos ?? MEASURE_STYLE : void 0,',
    '\t});',
    '}',
    'export { Menu };',
  ];
  return lines.join('\n');
}

function buildFakeTree(t, shape = 'rc2') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-menu-vp-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const file = path.join(root, '@deepseek-ai', 'dsh-client-ui-primitives', 'lib', 'index.js');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, menuShape(shape));
  return { root, file };
}

test('补丁脚本：一次应用、二次幂等、anchor 缺失跳过且不损坏', (t) => {
  const tree = buildFakeTree(t);
  // 第一次：应修改
  let n = patchMenuViewport(tree.root);
  assert.strictEqual(n, 1, '应补丁 1 个文件');
  const patched = fs.readFileSync(tree.file, 'utf8');
  assert.ok(patched.includes(MARKER), '应写入幂等标记');
  assert.ok(patched.includes('maxHeight: "min(calc(100vh - 24px), 560px)"'), '应写入视口封顶 maxHeight');
  assert.ok(patched.includes('overflowY: "auto"'), '应写入纵向滚动');
  assert.ok(
    patched.includes('Math.max(MARGIN, vh - Math.min(lh, vh - 2 * MARGIN) - MARGIN)'),
    'y 夹紧应按封顶高度计算',
  );
  // 反证 ①：注入必须原样保留 rc.2 的顶缘避让，别退回旧的字面量下界。
  assert.ok(
    patched.includes('if (lh > 0) y = Math.min(Math.max(y, overlayTopMargin(MARGIN)),'),
    '注入体必须保住 overlayTopMargin(MARGIN) 下界（否则全屏/自定义标题栏下弹层顶缘被裁）',
  );
  // 反证 ②：#182 已退役（rc.2 的逐帧 rAF track 自带重定位），不得留任何残留。
  assert.ok(!patched.includes('#182'), '#182 退役后不得写入任何 #182 标记/注释');
  assert.ok(!patched.includes('ResizeObserver'), '#182 退役后不得注入 ResizeObserver');
  assert.ok(patched.includes('requestAnimationFrame(track)'), '#182 退役前提：上游逐帧重定位在场');
  // 第二次：零写入且内容不变
  n = patchMenuViewport(tree.root);
  assert.strictEqual(n, 0, '第二次应零写入');
  assert.strictEqual(fs.readFileSync(tree.file, 'utf8'), patched, '内容不应变化');
  // anchor 缺失：跳过且字节级不损坏
  fs.writeFileSync(tree.file, 'export const changed = true;\n完全不同的内容\n');
  const before = fs.readFileSync(tree.file);
  n = patchMenuViewport(tree.root);
  assert.strictEqual(n, 0, 'anchor 不匹配应跳过');
  assert.deepStrictEqual(fs.readFileSync(tree.file), before, '文件字节级不变');
});

test('锚点新鲜度反证：打在 0.1.6 旧形态字节上必须整段跳过并计 anchorMissing', (t) => {
  // 这条判据的作用：证明 OLD_Y_CLAMP 咬的是 rc.2 的 overlayTopMargin 改动，
  // 而不是「任何一版都能命中」的宽松匹配。旧形态漏匹配 = 换代后静默失配，
  // 正是本判据要报红的对象（红在这里是正确行为，vendor 里不该再有旧字节）。
  const tree = buildFakeTree(t, 'legacy');
  const before = fs.readFileSync(tree.file, 'utf8');
  // stats 形状按 patch-runner 的契约来（它总带 anchorMissing/failed 两个零值字段）。
  const stats = { anchorMissing: 0, failed: 0 };
  const n = patchMenuViewport(tree.root, () => {}, stats);
  assert.strictEqual(n, 0, '旧形态锚应失配 → 零写入');
  assert.strictEqual(stats.anchorMissing, 1, '失配应计入 stats.anchorMissing');
  assert.strictEqual(fs.readFileSync(tree.file, 'utf8'), before, '失配时文件字节级不变');
});

test('补丁脚本：目标包缺失时返回 0 且不抛异常', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-menu-vp-empty-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  assert.strictEqual(patchMenuViewport(root), 0);
});

// ---------------------------------------------------------------------------
// 真实字节新鲜度 + 退役哨兵：夹具抄得再像也是二手货。这一条直接打 vendored tarball 里
// compat-pin 版本的 dsh-client-ui-primitives/lib/index.js。
//
// 0.2.2-rc.1 判定：menu-viewport 补丁**已退役**（registry 里摘除，见
// ta6-registry-invariants 的 E）——上游用 `useAnchoredPosition` +
// `--dsh-anchored-max-height` + `.Menu.module.css .scrollable` 自己实现了菜单视口约束，
// 我们原来那条 `maxHeight: "min(calc(100vh - 24px), 560px)"` 注入点不复存在。
// 于是这条用例的判据从「#36 命中并改写」改成「退役哨兵」：上游若把旧实现改回来
// （或又冒出裸 `#182`、或丢掉 useAnchoredPosition），这里当场红，提示把补丁重新靶回去，
// 而不是让它在「注册表里已经没有这条补丁」的状态下静默失能。
// ---------------------------------------------------------------------------
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const PRIMITIVES_TARBALL = path.join(
  REPO_ROOT, 'dsh-desktop', 'vendor', 'dsh-kernel',
  `deepseek-ai-dsh-client-ui-primitives-${kernel.packageVersion}.tgz`,
);

test(`退役哨兵：vendored ${kernel.packageVersion} 的菜单由上游 useAnchoredPosition 实现（#36 锚应整段失配）`, (t) => {
  assert.ok(fs.existsSync(PRIMITIVES_TARBALL), '缺 vendored primitives tarball: ' + PRIMITIVES_TARBALL);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-menu-real-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  // win32 显式用系统自带 bsdtar（Git Bash 的 GNU tar 会把 "C:\" 当远程主机）。
  const tarBin = process.platform === 'win32'
    ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe')
    : 'tar';
  const res = spawnSync(tarBin, ['-xzf', PRIMITIVES_TARBALL, '-C', dir], { encoding: 'utf8' });
  assert.strictEqual(res.status, 0, 'tar 解包失败: ' + (res.stderr || ''));
  const pristineFile = path.join(dir, 'package', 'lib', 'index.js');
  const pristine = fs.readFileSync(pristineFile, 'utf8');

  // —— 退役正证：上游自己的实现必须在位，我们的注入体必须不在位 ——
  assert.equal(pristine.split(MARKER).length - 1, 0, 'pristine 不得带我们的 marker');
  assert.ok(!pristine.includes('#182'), '旧实现的 #182 残留不应再存在');
  assert.ok(pristine.includes('useAnchoredPosition'), '上游应以 useAnchoredPosition 定位菜单');
  assert.ok(pristine.includes('--dsh-anchored-max-height'), '上游应以 --dsh-anchored-max-height 封顶菜单高度');
  const menuCss = fs.readFileSync(path.join(dir, 'package', 'lib', 'Menu.module.css'), 'utf8');
  assert.ok(menuCss.includes('.scrollable'), 'Menu.module.css 应含 .scrollable 滚动容器');

  // —— 退役形态必须是「整段失配」而非「静默错配」：应用器零写入 + anchorMissing 计数 ——
  const nmRoot = path.join(dir, 'nm');
  const target = path.join(nmRoot, '@deepseek-ai', 'dsh-client-ui-primitives', 'lib', 'index.js');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, pristine);
  const stats = { anchorMissing: 0, failed: 0 };
  assert.strictEqual(patchMenuViewport(nmRoot, () => {}, stats), 0, '退役后不应再改写任何文件');
  assert.strictEqual(stats.anchorMissing, 1, '新旧锚点都不在时失配必须计入 stats.anchorMissing');
  assert.strictEqual(stats.failed, 0, '失配不得计 failed');
  assert.strictEqual(fs.readFileSync(target, 'utf8'), pristine, '失配时文件字节级不变');
});
