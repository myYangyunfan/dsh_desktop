'use strict';
// 文件打开落点回归锁（node --test）。
//
// 背景（0.6.5 实爆）：dsh-better-sidebar 的 openTab 默认落在「全局 activePane」，
// 而底部面板的 pane 只要存在（它的自动终端 tab 会把它激活）就长期是 activePane
// → 资源管理器里点文件后，编辑器 tab 全部落进**底部面板**，右侧 workbench 永远是
// 空的。用户实报：「点击侧边栏文件后不会在右边预览」「我希望的是在右边侧边栏能够
// 预览」——预览其实开了，只是开在了会话列下方那条底部面板里。
//
// 0.24.1 重皮后这一面的模型换了，**故障面不变（落点必须可见、同文件不重复开）**，
// 判据随迁：
//   · 插件不再自绘右列 —— 右列归内核（`sidebarRightTabs` 注册 + native surface），
//     内部树只剩 `bottomSplits` 一棵。所以 0.15.3 时代我们手改进产物的
//     「三棵树 + seed.host 点名落点」整套形态（`SidebarTreeKey` / `rehostTab` /
//     `host: 'splits'` / `src/client/intercept.tsx`）在 src 与产物里**整体绝迹**，
//     本文件末尾把它做成反向锁（复活即红），而不是留着空转。
//   · 落点可见性改由两处保证：service 的 land 走 `openTabInBottomPane`（它自己置
//     `bottomOpen: true`），且 reducer 收尾再兜一次 `landed.bottomOpen ? landed : {..., bottomOpen: true}`；
//     有 native surface 时改走 `surface.openTab({ revealIfOpened, preferNewPane })`。
//   · 同文件不重复开由 editor 描述符的 `dedupeKey: (tab) => tab.path` + 路径派生 id
//     （`editor:<absolute>`）双保证。
//
// 判据来源：落点 reducer 是**纯函数**，但 0.24.1 起 `state.ts` 被折进产物 factory 的
// 无标记前奏（既没有逐文件镜像，也没有自己的 `//#region`），所以本文件自带一个
// 按缩进配对花括号切函数的取数器（并当场断言定义唯一），切出的字节在 vm 里实跑 ——
// 测的就是随包交付的那份实现。源侧与两个频道产物三向校验（漏一侧即红）。
//
// 用法：node --test scripts/test/unit-plugin-tab-host.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { PLUGIN_DIR } = require('./fixtures/better-sidebar-region.js');

const FILE_SRC = 'src/client/sidebar-file.ts';
const SVC_SRC = 'src/client/service.ts';
const TABS_SRC = 'src/client/builtins/tabs.tsx';
const BUNDLES = ['client.js', 'client-registry.js'];

function read(rel) {
  return fs.readFileSync(path.join(PLUGIN_DIR, rel), 'utf8');
}

/**
 * 从产物原文里按名字切出一个顶层函数：起点是 `function NAME(` 所在行的行首缩进，
 * 终点是同缩进、只有 `}` 的那一行（函数体内层的收尾都更深）。
 * 定义唯一性当场断言 —— 0.24.1 把 `state.ts` 整块折进了产物的无标记前奏
 * （只有 `prefs.ts`/`service.ts` 这类有自己的 `//#region`），所以只能全文件扫 + 数定义。
 */
function sliceTopLevelFunction(text, name) {
  const re = new RegExp(`^([ \\t]*)function ${name}\\(`, 'gm');
  const starts = [...text.matchAll(re)];
  assert.equal(starts.length, 1, `${name} 的定义应唯一，实得 ${starts.length}（多实现漂移前兆）`);
  const match = starts[0];
  const esc = match[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const body = text.slice(match.index);
  const close = new RegExp(`^${esc}}$`, 'm').exec(body);
  assert.ok(close !== null, `${name} 的收尾花括号未与函数同缩进（取数器假设失效，需随迁）`);
  return body.slice(0, close.index + close[0].length);
}

/**
 * 切出 `openTabInBottomPane` 及其依赖闭包（mapLeaf / firstLeaf / allLeaves / activateTab），
 * 在 vm 里物化 —— 交回的就是交付字节里的那份实现。
 */
function loadLanding(bundleRel) {
  const text = read(`lib/${bundleRel}`);
  const names = ['openTabInBottomPane', 'mapLeaf', 'firstLeaf', 'allLeaves', 'activateTab'];
  const source = names.map((n) => sliceTopLevelFunction(text, n)).join('\n');
  const made = vm.runInNewContext(`${source}\n({ openTabInBottomPane })`, vm.createContext({ console }));
  return { openTabInBottomPane: made.openTabInBottomPane, source };
}

/** 一个收起的默认工作台（字段形态取自 state.ts makeDefaultState）。 */
function collapsedState(splits = { kind: 'leaf', id: 'p1', tabs: [], active: null }) {
  return {
    activePane: splits.id, nextBrowser: 1, expanded: [], revealed: [],
    bottomOpen: false, bottomHeight: 220, bottomSplits: splits,
  };
}

/** 编辑器 tab 种子（与 sidebar-file.ts 的漏斗同形）。 */
function editorTab(absolute) {
  return { id: `editor:${absolute}`, type: 'editor', title: absolute.slice(absolute.lastIndexOf('/') + 1), path: absolute };
}

// --- 落点语义：实跑交付字节 --------------------------------------------------

test('文件打开必须把收起的工作台翻开并点亮落点（同树不重复开）', () => {
  for (const rel of BUNDLES) {
    const { openTabInBottomPane } = loadLanding(rel);
    const next = openTabInBottomPane(collapsedState(), editorTab('/w/a.md'));
    assert.equal(next.bottomOpen, true, `${rel}：收起的面板打开文件后仍收起 → 就是 0.6.5 的「预览不出」原症状`);
    assert.equal(next.activePane, 'p1', `${rel}：activePane 必须指向落点 leaf`);
    assert.equal(next.bottomSplits.active, 'editor:/w/a.md', `${rel}：落点 leaf 未激活新 tab`);
    // 跨 realm：vm 里 map 出来的 Array 不是本 realm 的原型，deepEqual 会假红，逐字段比。
    const firstIds = next.bottomSplits.tabs.map((t) => t.id);
    assert.equal(firstIds.length, 1, `${rel}：首开应只有 1 个 tab`);
    assert.equal(firstIds[0], 'editor:/w/a.md', `${rel}：首开落点内容不对`);

    // 同一 id 再开：只聚焦，不新增、不改写既有 tab（标题是 descriptor 的权威值）。
    const refocused = openTabInBottomPane(next, { ...editorTab('/w/a.md'), title: '改名了' });
    assert.equal(refocused.bottomSplits.tabs.length, 1, `${rel}：同 id 重复打开必须去重为聚焦`);
    assert.equal(refocused.bottomSplits.tabs[0].title, 'a.md', `${rel}：聚焦不得覆盖既有 tab 的标题`);

    // 分栏树：落在 firstLeaf（不是当前 activePane，也不再是「谁最后被激活跟谁」）。
    const split = {
      kind: 'split', id: 's1', dir: 'row', sizes: [0.5, 0.5],
      children: [
        { kind: 'leaf', id: 'left', tabs: [], active: null },
        { kind: 'leaf', id: 'right', tabs: [{ ...editorTab('/w/old.ts'), id: 'x' }], active: 'x' },
      ],
    };
    const landed = openTabInBottomPane(collapsedState(split), editorTab('/w/new.ts'));
    assert.equal(landed.bottomSplits.children[0].tabs.length, 1, `${rel}：应落进 firstLeaf`);
    assert.equal(landed.bottomSplits.children[1].tabs.length, 1, `${rel}：不该动另一棵 leaf`);
    assert.equal(landed.activePane, 'left', `${rel}：activePane 必须跟随实际落点`);
  }
});

// --- 漏斗与两条分支：源与两个频道产物对等 -----------------------------------

test('文件打开只有一个漏斗，且 id 按绝对路径派生（src 与两产物同形）', () => {
  // 种子对象在产物里被拆行，用窗口式匹配而不是 [^}]*。
  const funnelSrc = (q) => 'ctx\\.get\\(' + q + 'betterSidebar' + q +
    '\\)\\?\\.openTab\\(\\{[\\s\\S]{0,240}?id: `editor:\\$\\{absolute\\}`';
  const funnel = (q) => new RegExp(funnelSrc(q));
  assert.ok(funnel("'").test(read(FILE_SRC)), `${FILE_SRC}：openSidebarFile 的 editor 种子缺路径派生 id`);
  for (const rel of BUNDLES) assert.ok(funnel('"').test(read(`lib/${rel}`)), `lib/${rel}：漏斗形态与 src 不同源`);
  // 去重的另一半：editor 描述符按 path 去重（id 只是同 path 的的稳定形）。
  assert.match(read(TABS_SRC), /dedupeKey: \(tab\) => tab\.path/, `${TABS_SRC}：editor 描述符未按 path 去重`);
  for (const rel of BUNDLES) {
    assert.match(read(`lib/${rel}`), /dedupeKey: \(tab\) => tab\.path/, `lib/${rel}：产物里 editor 去重键丢失`);
  }
});

test('落点两条分支都在场：无 native surface 走工作台并兜底翻开，有则交内核 surface', () => {
  const src = read(SVC_SRC);
  assert.match(src, /const land = openTabInBottomPane/, `${SVC_SRC}：内部落点不再是 openTabInBottomPane`);
  assert.match(src, /return landed\.bottomOpen \? landed : \{ \.\.\.landed, bottomOpen: true \}/,
    `${SVC_SRC}：reducer 收尾的翻开兜底丢失（可见性只靠 land 一处，回归面翻倍）`);
  assert.match(src, /surface\.openTab\(\{[\s\S]{0,200}revealIfOpened/, `${SVC_SRC}：native surface 分支缺 revealIfOpened`);
  for (const rel of BUNDLES) {
    const s = read(`lib/${rel}`);
    assert.match(s, /const land = openTabInBottomPane/, `lib/${rel}：内部落点分支丢失`);
    assert.match(s, /return landed\.bottomOpen \? landed : \{/, `lib/${rel}：翻开兜底分支丢失`);
    assert.ok((s.match(/surface\.openTab\(/g) || []).length >= 2, `lib/${rel}：native surface 分支调用数少于 2`);
  }
});

// --- 反向锁：0.15.3 的手改进物形态不得复活 ----------------------------------

test('反向锁：三棵树 + seed.host 点名的旧形态在 src 与产物里必须绝迹', () => {
  const RETIRED = ['SidebarTreeKey', 'rehostTab', "host: 'splits'", 'host: "splits"', 'treeOf('];
  const sources = [FILE_SRC, SVC_SRC, 'src/client/state.ts', TABS_SRC, ...BUNDLES.map((b) => `lib/${b}`)];
  const revived = [];
  for (const rel of sources) {
    const text = read(rel);
    for (const token of RETIRED) if (text.includes(token)) revived.push(`${rel} 复活了 ${token}`);
  }
  assert.deepEqual(revived, [], '旧落点形态复活：\n' + revived.join('\n'));
  // intercept.tsx 由上游自己删的（turnTail 从 chain 变 list 后重复），漏斗已搬进 sidebar-file.ts。
  assert.equal(fs.existsSync(path.join(PLUGIN_DIR, 'src', 'client', 'intercept.tsx')), false,
    'src/client/intercept.tsx 不应存在：0.24.1 已把文件打开半段搬进 sidebar-file.ts');
});

// --- 反证（防判据恒真）------------------------------------------------------

test('反证：抽掉交付字节里的 bottomOpen 置位，落点判据必须当场变红', () => {
  const { openTabInBottomPane, source } = loadLanding('client.js');
  assert.equal(openTabInBottomPane(collapsedState(), editorTab('/w/a.md')).bottomOpen, true,
    '夹具自身：现网字节必须翻开');
  const mutated = source.replace('bottomOpen: true,', '');
  assert.notEqual(mutated, source, '夹具自身：变异点必须命中');
  const broken = vm.runInNewContext(`${mutated}\n({ openTabInBottomPane })`, vm.createContext({ console }));
  assert.equal(broken.openTabInBottomPane(collapsedState(), editorTab('/w/a.md')).bottomOpen, false,
    '判据恒真：去掉置位后面板仍是开的');
  // 取数器自身的失效模式也要被咬：函数名不存在 → 直接抛，而不是静默少切一块。
  assert.throws(() => sliceTopLevelFunction(source, 'noSuchReducer'));
});
