'use strict';
// 内核槽位锚点新鲜度回归锁（node --test）。
//
// 背景（0.6.5 实爆，形态随 0.24.1 重皮迁移）：本插件要用内核 AppFrame 的「会话列」
// 作为让位对象——底部工作台占位而非浮盖，量不到会话列时 Sidebar.tsx 直接把面板
// `visibility:hidden`（见本文件用例「可见性闸门仍在」）。于是锚点 0 命中 →
// centerMeasured 恒 false → 面板停在 0 宽 + hidden → 用户侧表现为
// **「点文件后不出预览」**（标签其实开了，只是开在看不见的面板里）。
// 内核 0.1.6-alpha.1 把槽位 `conversation` 改名 `main.conversation` 时就是这条链炸的。
//
// 0.24.1 把这一面重做了，**故障面没变，实现与文件都变了**，判据跟着迁移：
//   · 槽位名解析从 Sidebar.tsx 搬进 `src/client/center-column.ts`
//     （CENTER_COLUMN_SELECTOR 同时认两代名字，newest first）；
//   · 让位从「CSS 结构性 `:has(> …[data-slot=…])` 选择器」改成「locator 给量到的列节点
//     写 `[data-dsh-center-col]` tag，CSS 只打 tag」。上游注释记录了换掉 has() 的理由：
//     结构性 :has 的匹配缓存会在 #root 每次流式变更时失效并对全文档重算 —— 这正是原症状
//     的性能半边，所以「浅层/深层 :has([data-slot]) 绝迹」现在是反向锁（用例 4）。
//   · 槽位宿主在 alpha.2 是 `display: contents` 的透明包装层，直接拿它当列会让位落在
//     0 尺寸元素上，locator 必须向上穿到第一个非 contents 的祖先（用例 2）。
//
// 判据来源：行为实跑随包交付的那份字节 —— `lib/client.js` 的
// `//#region src/client/center-column.ts` 区段自包含（零 import，DOM 全部可注入），
// 用夹具切出来在 vm 里跑。CSS/闸门侧是文本对等锁（src 与两个频道产物三向校验）。
//
// 用法：node --test scripts/test/unit-plugin-kernel-anchor.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { PLUGIN_DIR, loadRegionSymbols, regionTopLevelNames, srcTopLevelNames } = require('./fixtures/better-sidebar-region.js');

const CC_SRC = 'src/client/center-column.ts';
const CSS_SRC = 'src/client/layout.css';
const UCC_SRC = 'src/client/sidebar/use-center-column.ts';
const BUNDLES = ['client.js', 'client-registry.js'];

function read(rel) {
  return fs.readFileSync(path.join(PLUGIN_DIR, rel), 'utf8');
}

/** 产物区段里没有的 src 顶层名：type-only 与纯常量内联（值被折进调用点）。 */
const CC_FOLDED_OUT = ['CENTER_COLUMN_REVALIDATE_MS'];

/** 从 bundle 区段实跑取回 locator 的符号。 */
function locator(bundleRel) {
  return loadRegionSymbols(bundleRel, CC_SRC, ['CENTER_COLUMN_SELECTOR', 'resolveCenterColumn']);
}

/**
 * 最小假 DOM：只覆盖 resolveCenterColumn / columnOfSlotHost 实际触碰的接口
 * （query / isConnected / parentElement / ownerDocument.defaultView.getComputedStyle
 *  / documentElement.getAttribute），不依赖 jsdom。
 */
function fakeDom({ hosts = 1, contentsWrappers = 0, style = 'flex: 1 1 0%' } = {}) {
  const doc = {};
  const view = {
    getComputedStyle(node) { return { display: node.display === undefined ? 'grid' : node.display }; },
  };
  doc.documentElement = { getAttribute: (name) => (name === 'style' ? style : null) };
  doc.defaultView = view;
  doc.querySelector = () => null;
  const column = { isConnected: true, display: 'grid', ownerDocument: doc, parentElement: null };
  let host = null;
  let above = column;
  for (let i = 0; i < contentsWrappers; i += 1) {
    above = { isConnected: true, display: 'contents', ownerDocument: doc, parentElement: above };
  }
  host = { isConnected: true, display: 'contents', ownerDocument: doc, parentElement: above };
  const state = { queries: 0 };
  const query = () => {
    state.queries += 1;
    return hosts > 0 ? host : null;
  };
  return { doc, host, column, query, state };
}

// --- 判据本体（供反证复用）---------------------------------------------------

/** 两代槽位名必须都在，且 newest first、#root 作用域；返回违规说明（空数组=通过）。 */
function selectorOffenses(selector) {
  const offenses = [];
  if (typeof selector !== 'string') return ['锚点常量缺失'];
  if (!selector.startsWith('#root ')) offenses.push('锚点未限定在 #root 作用域');
  const newer = selector.indexOf('[data-slot="main.conversation"]');
  const older = selector.indexOf('[data-slot="conversation"]');
  if (newer === -1) offenses.push('缺当前内核槽位名 main.conversation');
  if (older === -1) offenses.push('缺上一代裸槽位名 conversation');
  if (newer !== -1 && older !== -1 && newer > older) offenses.push('两代名字顺序非 newest first');
  return offenses;
}

/** 让位 CSS 判据：tag 规则在位（含变量），且结构性 :has([data-slot]) 绝迹。 */
function cssOffenses(text) {
  const offenses = [];
  const rule = /#root \[data-dsh-center-col\]\s*\{[^}]*margin-bottom:\s*var\(--dsh-sidebar-height/g;
  if (!rule.test(text)) offenses.push('缺少打在 [data-dsh-center-col] 上的让位规则（margin-bottom: var(--dsh-sidebar-height…)）');
  if (text.includes(':has(> [data-slot=') || text.includes(':has(> * > [data-slot=')) {
    offenses.push('仍存在按 data-slot 匹配的结构性 :has 选择器（流式变更下会对全文档重算）');
  }
  return offenses;
}

// --- 用例 -------------------------------------------------------------------

test('会话列锚点必须同时认两代槽位名，且 src 与两个频道产物逐字一致', () => {
  const srcSelector = /const CENTER_COLUMN_SELECTOR = '([^']+)'/.exec(read(CC_SRC));
  assert.ok(srcSelector !== null, `${CC_SRC}：找不到 CENTER_COLUMN_SELECTOR 字面量`);
  assert.deepEqual(selectorOffenses(srcSelector[1]), [], '源侧锚点常量不合规');

  for (const rel of BUNDLES) {
    const { CENTER_COLUMN_SELECTOR } = locator(rel);
    assert.deepEqual(selectorOffenses(CENTER_COLUMN_SELECTOR), [], `${rel}：锚点常量不合规`);
    assert.equal(CENTER_COLUMN_SELECTOR, srcSelector[1], `${rel}：产物锚点常量与 src 不同字（漏改一侧即红）`);
  }
});

test('锚点必须向上穿过 display:contents 的透明槽位宿主，落到真有盒子的列', () => {
  const { resolveCenterColumn } = locator('client.js');
  const plain = (v) => JSON.parse(JSON.stringify(v === undefined ? null : { ok: true }));
  // alpha.2 形态：main.conversation 宿主 + 一层 keyed 包装都是 contents，真列在再上面。
  const dom = fakeDom({ contentsWrappers: 1 });
  let clock = 1000;
  const got = resolveCenterColumn(null, {
    document: dom.doc, query: dom.query, now: () => clock, htmlStyle: () => 's',
  });
  assert.equal(got === undefined ? 'undefined' : plain(got).ok, true, '量不到列时返回 undefined 是可接受回落，但本例必须命中');
  assert.equal(got.isConnected, true);
  assert.equal(dom.column.parentElement, null, '夹具自身：column 必须是链顶');
  // 返回的必须是非 contents 的那一层，而不是 host 或 contents 包装层。
  assert.notEqual(got, dom.host, '不得把透明槽位宿主当列（会让位落在 0 尺寸元素上）');
  assert.equal(got.display, 'grid', '实跑得回的列节点 display 不能是 contents');
});

test('流式变更不得反复全文档扫描：缓存列在安全网周期内零重查，三种失效信号各触发一次重查', () => {
  const { resolveCenterColumn } = locator('client.js');
  const dom = fakeDom({ contentsWrappers: 1 });
  let clock = 0;
  let style = 's';
  const opts = {
    document: dom.doc, query: dom.query, now: () => clock, htmlStyle: () => style,
  };
  const first = resolveCenterColumn(null, opts);
  assert.equal(dom.state.queries, 1, '首调必须查一次文档');
  // 模拟流式 token 期间的 50 次 locate：一律走缓存，不再扫 #root。
  for (let i = 0; i < 50; i += 1) {
    clock += 10;
    assert.equal(resolveCenterColumn(first, opts), first);
  }
  assert.equal(dom.state.queries, 1, '安全网周期内重复调用不得再扫文档（上游换掉 :has() 的同一动机）');
  // ① 超过 1500ms 安全网 → 重查。
  clock += 2000;
  resolveCenterColumn(first, opts);
  assert.equal(dom.state.queries, 2, '1.5s 安全网到点必须重验一次');
  // ② <html style> 变化（HMR/布局重同步信号）→ 立刻重查，不等安全网。
  clock += 10;
  style = 's2';
  resolveCenterColumn(first, opts);
  assert.equal(dom.state.queries, 3, 'html style 变化必须绕过缓存立刻重查');
  // ③ 缓存节点断开（DOM 被换掉）→ 立刻重查。
  clock += 10;
  const stale = { isConnected: false, display: 'grid', ownerDocument: dom.doc, parentElement: null };
  resolveCenterColumn(stale, opts);
  assert.equal(dom.state.queries, 4, '断开的缓存节点必须触发重查');
  // ④ 文档里没有锚点 → 回落 undefined，绝不抛（面板保持 hidden 是可诊断状态，不是崩溃）。
  const none = fakeDom({ hosts: 0 });
  const miss = resolveCenterColumn(null, {
    document: none.doc, query: none.query, now: () => 1, htmlStyle: () => 's',
  });
  assert.equal(miss, undefined, '锚点 0 命中必须安静回落');
});

test('让位规则打在 locator 的 tag 上，结构性 :has([data-slot]) 选择器必须绝迹', () => {
  for (const rel of [CSS_SRC, ...BUNDLES.map((b) => `lib/${b}`)]) {
    assert.deepEqual(cssOffenses(read(rel)), [], rel);
  }
});

test('tag 读写两侧同源：写方 setAttribute 与读方 CSS 都必须进两个频道产物', () => {
  assert.match(read(UCC_SRC), /setAttribute\('data-dsh-center-col', ''\)/, '写方缺 tag 写入');
  const counts = [];
  for (const rel of BUNDLES) {
    const s = read(`lib/${rel}`);
    assert.match(s, /setAttribute\("data-dsh-center-col", ""\)/, `${rel}：产物里没有 tag 写入（locator 与 CSS 断链）`);
    assert.match(s, /#root \[data-dsh-center-col\]/, `${rel}：产物里没有 tag 让位规则`);
    counts.push((s.match(/data-dsh-center-col/g) || []).length);
  }
  assert.equal(counts[0], counts[1], '两个频道的 tag 出现次数不一致（产物不同源）');
});

test('可见性闸门仍在：量不到列就隐藏面板（所以锚点判据不是空转）', () => {
  const gate = /centerMeasured \? undefined : 'hidden'/;
  assert.match(read('src/client/Sidebar.tsx'), gate, '源侧闸门丢失');
  for (const rel of BUNDLES) {
    assert.match(read(`lib/${rel}`), /centerMeasured \? void 0 : "hidden"/, `${rel}：产物闸门丢失（TS 的 undefined 会编成 void 0）`);
  }
});

test('src ↔ 产物 顶层名对等：产物区段不得冒出 src 没有的声明，src 缺项须逐名解释', () => {
  const srcNames = srcTopLevelNames(CC_SRC);
  assert.ok(srcNames.length >= 3, `夹具自身：${CC_SRC} 应至少 3 个顶层名，实得 ${srcNames.length}`);
  for (const rel of BUNDLES) {
    const regionNames = regionTopLevelNames(rel, CC_SRC);
    const orphans = regionNames.filter((n) => !srcNames.includes(n));
    assert.deepEqual(orphans, [], `${rel}：区段里有 src 不存在的顶层声明（手改进物的孤儿段）`);
    const absent = srcNames.filter((n) => !regionNames.includes(n));
    assert.deepEqual(absent, CC_FOLDED_OUT, `${rel}：src 有而产物无的名字必须逐名解释为 tree-shake/常量内联`);
  }
  // 常量内联必须在位：1500 的兜底值折进了 revalidateMs 默认分支。
  for (const rel of BUNDLES) {
    assert.match(read(`lib/${rel}`), /revalidateMs \?\? 1500/, `${rel}：1.5s 安全网字面量不在位`);
  }
});

// --- 反证（防判据恒真）-------------------------------------------------------

test('反证：锚点只认单代名字、残留 :has 结构选择器，都必须被判据咬住', () => {
  assert.deepEqual(selectorOffenses('#root [data-slot="conversation"]'), ['缺当前内核槽位名 main.conversation']);
  assert.deepEqual(selectorOffenses('[data-slot="main.conversation"], [data-slot="conversation"]'),
    ['锚点未限定在 #root 作用域']);
  assert.deepEqual(selectorOffenses('#root [data-slot="conversation"], #root [data-slot="main.conversation"]'),
    ['两代名字顺序非 newest first']);
  assert.throws(() => loadRegionSymbols('client.js', CC_SRC, ['noSuchColumnSymbol']));

  const good = read(CSS_SRC);
  assert.equal(cssOffenses(good).length, 0, '夹具自身：现网 CSS 必须过判据');
  // 旧形态 bait：浅层与深层各一，两条都必须被咬。
  assert.equal(cssOffenses(`${good}\n#root :has(> [data-slot="conversation"]) { margin-bottom: 0 }\n`).length, 1);
  assert.equal(cssOffenses(`${good}\n#root :has(> * > [data-slot="x"]) { margin-bottom: 0 }\n`).length, 1);
  // 让位规则整条缺失也要被咬。
  assert.equal(cssOffenses(good.replace(/margin-bottom: var\(--dsh-sidebar-height, 0px\);/, '')).length, 1);
});
