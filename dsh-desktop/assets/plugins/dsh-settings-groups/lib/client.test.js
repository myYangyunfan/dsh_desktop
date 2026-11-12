'use strict';

/**
 * dsh-settings-groups — 浏览器半边 rc.8 DOM 契约 + 折叠行为测试
 * =====================================================================
 * 运行：`node --test lib/client.test.js`（本插件目录下）。
 *
 * 三层覆盖：
 *   1. 纯逻辑（partitionItems / isAdvancedTitle / parse·serialize）；
 *   2. 静态锚点契约——本插件用到的锚点（navList 类名子串、「通用设置」
 *      行文案、data-slot="settings.section"/"settings.general.item"）必须
 *      仍然出现在内核 rc.8 的 dsh-client-ui-settings-general 渲染源里
 *      （锚点漂移 tripwire：内核升级改结构时这里先红）；
 *   3. DOM 模拟——按 rc.8 真实结构（VOzbGW_* hashed 类、display:contents
 *      的 data-slot 锚点、._xxx_section flex 行宿主）搭骨架，跑完整
 *      DOM 粘合：侧边栏分组折叠/展开、常规页高级折叠（组头必须落进
 *      flex 行宿主、order 生效）、组头被 React 抹掉后的指纹自愈、
 *      绝不删改 React 行节点。
 *
 * 自带极小 DOM 垫片（无 jsdom 依赖）：支持插件用到的选择器子集
 * （tag / .class / [attr="v"] / [attr*="v"] / 逗号列表）、cssText、
 * childList MutationObserver（变更即回调，去抖由插件自己负责）、
 * 可手动冲刷的定时器队列。
 */

import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT = path.join(__dirname, 'client.js');
const SRC = fs.readFileSync(CLIENT, 'utf8');

// ───────────────────────── 极小 DOM 垫片 ─────────────────────────
class Style {
  constructor() { this._m = {}; }
  set cssText(s) {
    this._m = {};
    String(s || '').split(';').forEach((decl) => {
      const i = decl.indexOf(':');
      if (i <= 0) return;
      const k = decl.slice(0, i).trim();
      if (k) this._m[k.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = decl.slice(i + 1).trim();
    });
  }
  get cssText() { return Object.entries(this._m).map(([k, v]) => `${k}:${v}`).join(';'); }
}

const Dom = { observers: [] };

class El {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase();
    this.children = [];
    this.parentElement = null;
    this.className = '';
    this.attrs = {};
    this.style = new Style();
    this._text = '';
    this._listeners = {};
    this._computedDisplay = 'block';
  }
  get classList() { return String(this.className || '').split(/\s+/).filter(Boolean); }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; }
  set textContent(v) { this.children = []; this._text = String(v); }
  get textContent() {
    let out = this._text || '';
    for (const c of this.children) out += c.textContent;
    return out;
  }
  get firstElementChild() { return this.children.find((c) => c instanceof El) || null; }
  appendChild(n) { return this.insertBefore(n, null); }
  insertBefore(n, ref) {
    if (n.parentElement) n.parentElement.removeChild(n);
    const i = ref ? this.children.indexOf(ref) : this.children.length;
    this.children.splice(i < 0 ? this.children.length : i, 0, n);
    n.parentElement = this;
    Dom.mutated(this);
    return n;
  }
  removeChild(n) {
    const i = this.children.indexOf(n);
    if (i >= 0) this.children.splice(i, 1);
    n.parentElement = null;
    Dom.mutated(this);
    return n;
  }
  contains(n) {
    for (let e = n; e; e = e.parentElement) if (e === this) return true;
    return false;
  }
  addEventListener(ev, fn) { (this._listeners[ev] = this._listeners[ev] || []).push(fn); }
  dispatch(ev) { for (const fn of (this._listeners[ev] || []).slice()) fn({ target: this }); }
  matches(sel) { return Dom.matchAny(this, sel); }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  querySelectorAll(sel) {
    const out = [];
    const walk = (e) => {
      for (const c of e.children) {
        if (c instanceof El && Dom.matchAny(c, sel)) out.push(c);
        walk(c);
      }
    };
    walk(this);
    return out;
  }
}

Dom.mutated = function mutated(node) {
  // childList 语义：观察了包含该节点的子树 → 直接触发回调
  // （回调里插件只做去抖 schedule，不会递归写 DOM）。
  for (const o of Dom.observers.slice()) {
    if (o.target === node || o.target.contains(node)) {
      try { o.cb([]); } catch (e) { /* 插件侧已整体 try/catch，双保险 */ }
    }
  }
};
Dom.matchOne = function matchOne(el, raw) {
  // 简单选择器：tag | .class | [attr="v"] | [attr*="v"]（可连写 tag.class）。
  // 注意先把 [..] 段摘出来再匹配 .class——属性值里的点（如
  // "settings.general.item"）不是 class 语法。
  let s = String(raw).trim();
  let tag = null;
  const m = /^[a-zA-Z][a-zA-Z0-9-]*/.exec(s);
  if (m) { tag = m[0].toUpperCase(); s = s.slice(m[0].length); }
  if (tag && el.tagName !== tag) return false;
  const attrMatches = [...s.matchAll(/\[([a-zA-Z-]+)(\*?=)"((?:[^"\\]|\\.)*)"\]/g)];
  s = s.replace(/\[[^[]*\]/g, '');
  const cls = [...s.matchAll(/\.([A-Za-z0-9_-]+)/g)].map((x) => x[1]);
  if (cls.some((c) => !el.classList.includes(c))) return false;
  for (const a of attrMatches) {
    const v = a[1] === 'class' ? String(el.className || '') : (el.getAttribute(a[1]) || '');
    const want = a[3].replace(/\\"/g, '"');
    if (a[2] === '=' ? v !== want : v.indexOf(want) === -1) return false;
  }
  return true;
};
Dom.matchAny = function matchAny(el, sel) {
  return String(sel).split(',').some((part) => part.trim() && Dom.matchOne(el, part));
};

class ShimMutationObserver {
  constructor(cb) { this.cb = cb; this.target = null; }
  observe(target) { this.target = target; Dom.observers.push(this); }
  disconnect() { Dom.observers = Dom.observers.filter((o) => o !== this); }
}

/** 定时器队列：schedule(80/200) 去抖可手动冲刷。 */
function makeTimers() {
  const q = [];
  return {
    setTimeout(fn, ms) { q.push({ fn, ms: ms || 0 }); return q.length; },
    flush() { while (q.length) q.shift().fn(); },
  };
}

const PREV_GLOBALS = ['document', 'window', 'MutationObserver', 'setTimeout', 'localStorage', 'getComputedStyle']
  .reduce((acc, k) => ({ ...acc, [k]: global[k] }), {});

/** 安装全局垫片并 eval client.js。测试结束后调 restore() 复原全局。 */
function boot() {
  const documentEl = new El('html');
  const body = new El('body');
  documentEl.appendChild(body);
  const timers = makeTimers();
  const storage = new Map();
  const loaderEntries = [];
  const sandboxWindow = { __ModuleLoader__: { load: (e) => loaderEntries.push(e) } };
  Dom.observers = [];

  global.document = {
    documentElement: documentEl,
    body,
    createElement: (t) => new El(t),
    querySelector: (s) => documentEl.querySelector(s),
    querySelectorAll: (s) => documentEl.querySelectorAll(s),
  };
  global.window = sandboxWindow;
  global.MutationObserver = ShimMutationObserver;
  global.setTimeout = timers.setTimeout;
  global.localStorage = {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k),
  };
  global.getComputedStyle = (el) => ({ display: el._computedDisplay || 'block' });

  vm.runInThisContext(SRC, { filename: CLIENT });
  const modules = loaderEntries.map((e) => e.factory());
  return {
    core: sandboxWindow.__dshSettingsGroupsCore,
    modules,
    timers,
    documentEl,
    body,
    storage,
    restore() { Object.assign(global, PREV_GLOBALS); },
  };
}

// ───────────────────────── rc.8 骨架构造 ─────────────────────────
// 结构对齐 dsh-client-ui-settings-general rc.8（与 rc.7 同构，实测 diff 证实）：
//   overlay > mask + panel[role=dialog]
//     > nav > (navTitle div, navList div > button.navCell × N)
//     > content > (header > (actions div, close button),
//                  options > div[data-slot=settings.section](display:contents)
//                     > div.section(flex column)
//                         > div[data-slot=settings.general.item](display:contents) × N)
function el(tag, className, parent) {
  const e = new El(tag);
  if (className) e.className = className;
  if (parent) parent.appendChild(e);
  return e;
}
function navRow(list, label) {
  const b = el('button', 'VOzbGW_navCell', list);
  b.setAttribute('type', 'button');
  const icon = el('svg', 'VOzbGW_navIcon', b); // 无文本，模拟 navIcon()
  icon.setAttribute('aria-hidden', 'true');
  const span = el('span', 'VOzbGW_navLabel', b);
  span.textContent = label;
  return b;
}
function buildPanel(host, itemTitles) {
  const overlay = el('div', 'VOzbGW_overlay', host);
  const mask = el('div', 'VOzbGW_mask', overlay);
  mask.setAttribute('aria-hidden', 'true');
  const panel = el('div', 'VOzbGW_panel', overlay);
  const nav = el('nav', 'VOzbGW_nav', panel);
  const navTitle = el('div', 'VOzbGW_navTitle', nav);
  navTitle.textContent = '设置';
  const navList = el('div', 'VOzbGW_navList', nav);
  navList._computedDisplay = 'flex';
  const content = el('div', 'VOzbGW_content', panel);
  const header = el('div', 'VOzbGW_header', content);
  el('div', 'VOzbGW_actions', header);
  const close = el('button', 'VOzbGW_close', header);
  close.textContent = '关闭';
  const options = el('div', 'VOzbGW_options', content);
  const sectionAnchor = el('div', '', options);
  sectionAnchor.setAttribute('data-slot', 'settings.section');
  sectionAnchor.style.cssText = 'display:contents';
  const sectionFlex = el('div', 'WvWnq_section', sectionAnchor);
  sectionFlex._computedDisplay = 'flex';
  for (const t of itemTitles) {
    const item = el('div', '', sectionFlex);
    item.setAttribute('data-slot', 'settings.general.item');
    item.style.cssText = 'display:contents';
    const card = el('div', 'itemCard', item);
    const title = el('div', 'itemTitle', card);
    title.textContent = t;
    el('div', 'itemControl', card);
  }
  return { overlay, panel, nav, navList, sectionAnchor, sectionFlex };
}

const NAV_LABELS = ['通用设置', '价格', '人设卡', '模型设置', '插件', '识图插件（view_image）'];
const ITEM_TITLES = ['通用', '价格设置', '外观', '语言', '开发者选项'];
const SIDEBAR_ADVANCED = ['模型设置', '插件', '识图插件（view_image）'];

/** 跑一遍完整生命周期（apply → 初始 scan）。 */
function start(b, itemTitles, navLabels) {
  const panel = buildPanel(b.body, itemTitles);
  for (const l of navLabels) navRow(panel.navList, l);
  b.modules[0].apply({ get: () => undefined });
  b.timers.flush();
  return panel;
}

// ───────────────────────── 1. 纯逻辑 ─────────────────────────
test('纯逻辑：partitionItems 按关键词双语分组，空标题归基础', () => {
  const b = boot();
  try {
    const parts = b.core.partitionItems(['通用', '外观', '', 'Language', '模型'], b.core.DEFAULT_ADVANCED_KEYWORDS);
    assert.deepEqual(parts.basic, [0, 2, 4]); // 模型是侧边栏高级词，不是常规页高级词
    assert.deepEqual(parts.advanced, [1, 3]);
    assert.equal(b.core.isAdvancedTitle('Experimental Features', b.core.DEFAULT_ADVANCED_KEYWORDS), true);
    assert.equal(b.core.isAdvancedTitle('', b.core.DEFAULT_ADVANCED_KEYWORDS), false);
  } finally { b.restore(); }
});

test('纯逻辑：parseConfig 容忍脏数据，serialize 往返', () => {
  const b = boot();
  try {
    assert.deepEqual(b.core.parseConfig('not json'), { expanded: false });
    assert.deepEqual(b.core.parseConfig('{"expanded":true}'), { expanded: true });
    assert.deepEqual(b.core.parseConfig(null), { expanded: false });
    assert.equal(b.core.parseConfig(b.core.serialize({ expanded: true })).expanded, true);
    assert.equal(b.core.parseConfig(b.core.serialize({ expanded: false })).expanded, false);
  } finally { b.restore(); }
});

// ───────────────────────── 2. 静态锚点契约 ─────────────────────────
// 内核 rc.8 渲染源位置（存在的都断言；都不存在则跳过——比如纯源码检出）。
const KERNEL_CANDIDATES = [
  path.join(__dirname, '..', '..', '..', '..', 'node_modules', '@deepseek-ai', 'dsh-client-ui-settings-general', 'lib', 'client.js'),
  path.join(__dirname, '..', '..', '..', '..', '..', 'dsh-tauri', 'pp', 'node_modules', '@deepseek-ai', 'dsh-client-ui-settings-general', 'lib', 'client.js'),
].filter((p) => fs.existsSync(p));

test('插件侧：锚点选择器形态在源内（防重构漂移）', () => {
  for (const frag of ['[class*="navList"]', '通用设置', '"settings.section"', '"settings.general.item"', 'parentElement && sectionEl.contains']) {
    assert.ok(SRC.indexOf(frag) !== -1, `client.js 应包含锚点/形态片段: ${frag}`);
  }
});

test('内核侧：rc.8 渲染源仍产出全部锚点（漂移 tripwire）', { skip: KERNEL_CANDIDATES.length === 0 }, (t) => {
  for (const file of KERNEL_CANDIDATES) {
    const k = fs.readFileSync(file, 'utf8');
    const anchors = {
      'navList 类（hash 前缀无关，子串匹配目标）': 'navList',
      'navCell 行（button）': 'navCell',
      '「通用设置」行文案': '通用设置',
      'settings.section 锚点': '"settings.section"',
      'settings.general.item 锚点': '"settings.general.item"',
    };
    for (const [name, frag] of Object.entries(anchors)) {
      t.assert.ok(k.indexOf(frag) !== -1, `${file} 应包含 ${name}（${frag}）`);
    }
  }
});

// ───────────────────────── 3. DOM 模拟 ─────────────────────────
test('侧边栏：高级行默认折叠、组头可展开、绝不删行', () => {
  const b = boot();
  try {
    const panel = start(b, ITEM_TITLES, NAV_LABELS);
    const cells = panel.navList.querySelectorAll('button');
    assert.equal(cells.length, NAV_LABELS.length, 'React 行一个都不能少');
    const heads = panel.navList.querySelectorAll('.eac-settings-groups-navhead');
    assert.equal(heads.length, 2, '普通/高级两个组头');
    const advHead = heads.filter((h) => h.getAttribute('aria-expanded') !== null)[0];
    assert.ok(advHead, '「高级」折叠组头存在（带 aria-expanded）');
    assert.equal(advHead.getAttribute('aria-expanded'), 'false');
    const hidden = cells.filter((c) => c.style.display === 'none').map((c) => c.textContent.trim());
    assert.deepEqual([...hidden].sort(), [...SIDEBAR_ADVANCED].sort(), '关键词命中的高级行默认隐藏');
    // 展开：点击组头 → 高级行全部恢复可见，行数不变（无删改）。
    // applyNav 重放会换新组头节点，断言一律按当前 DOM 重查。
    advHead.dispatch('click');
    const headAfter = panel.navList.querySelectorAll('.eac-settings-groups-navhead').filter((h) => h.getAttribute('aria-expanded') !== null)[0];
    assert.ok(headAfter, '展开后「高级」组头仍在');
    assert.equal(headAfter.getAttribute('aria-expanded'), 'true');
    const visible = panel.navList.querySelectorAll('button').filter((c) => c.style.display !== 'none');
    assert.equal(visible.length, NAV_LABELS.length, '展开后全部行可见');
    assert.equal(panel.navList.querySelectorAll('button').length, NAV_LABELS.length, '展开后行数不变');
    // 展开态持久化写入
    assert.equal(JSON.parse(b.storage.get(b.core.NAV_STORAGE_KEY)).expanded, true);
  } finally { b.restore(); }
});

test('常规页：组头落进 flex 行宿主、order 生效、展开可见（rc.8 结构）', () => {
  const b = boot();
  try {
    const panel = start(b, ITEM_TITLES, ['通用设置']);
    const head = panel.sectionAnchor.querySelector('.eac-settings-groups-head');
    assert.ok(head, '「高级选项」组头存在');
    assert.equal(head.parentElement, panel.sectionFlex, '组头在官方 flex 行宿主内（锚点 > section 根 > 行）');
    assert.equal(head.style.order, '1');
    const items = panel.sectionFlex.querySelectorAll('[data-slot="settings.general.item"]');
    const advIdx = [2, 3, 4]; // 外观/语言/开发者选项
    for (const i of advIdx) {
      assert.equal(items[i].style.order, '2', `${ITEM_TITLES[i]} 应排高级序`);
      assert.equal(items[i].style.display, 'none', `${ITEM_TITLES[i]} 默认折叠`);
    }
    assert.equal(items[0].style.order, '0', '基础行排普通序');
    assert.equal(items[1].style.order, '0', '基础行排普通序');
    // 展开：display 复位、order 保留（flex 分组仍在）
    head.dispatch('click');
    assert.equal(head.getAttribute('aria-expanded'), 'true');
    for (const i of advIdx) {
      assert.notEqual(items[i].style.display, 'none', '展开后高级行可见');
      assert.equal(items[i].style.order, '2');
    }
    assert.equal(panel.sectionFlex.querySelectorAll('[data-slot="settings.general.item"]').length, ITEM_TITLES.length, '行数不变');
    assert.equal(JSON.parse(b.storage.get(b.core.STORAGE_KEY)).expanded, true);
  } finally { b.restore(); }
});

test('自愈：React 重渲染抹掉组头后指纹存在位触发重放', () => {
  const b = boot();
  try {
    const panel = start(b, ITEM_TITLES, ['通用设置']);
    assert.ok(panel.sectionAnchor.querySelector('.eac-settings-groups-head'));
    // 模拟 React 整棵重建 section 子树抹掉组头（行标题不变）
    panel.sectionFlex.removeChild(panel.sectionFlex.querySelector('.eac-settings-groups-head'));
    b.timers.flush(); // 变更 → 观察器回调 → schedule(80) → scan 重放
    const head2 = panel.sectionAnchor.querySelector('.eac-settings-groups-head');
    assert.ok(head2, '组头被抹掉后由指纹存在位自愈重建');
    assert.equal(head2.parentElement, panel.sectionFlex, '重建后仍在 flex 行宿主内');
  } finally { b.restore(); }
});

test('零误伤：无高级关键词时不出组头、不动行', () => {
  const b = boot();
  try {
    const panel = start(b, ['通用', '价格设置'], ['通用设置']);
    assert.equal(panel.sectionAnchor.querySelector('.eac-settings-groups-head'), null, '无高级行不建组头');
    assert.equal(panel.navList.querySelector('.eac-settings-groups-navhead'), null, '侧边栏无高级行不出组头');
    for (const it of panel.sectionFlex.querySelectorAll('[data-slot="settings.general.item"]')) {
      assert.notEqual(it.style.display, 'none');
      assert.notEqual(it.style.order, '2');
    }
  } finally { b.restore(); }
});
