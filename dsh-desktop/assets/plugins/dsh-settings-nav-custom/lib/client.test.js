'use strict';

/**
 * dsh-settings-nav-custom — 浏览器半边 rc.8 DOM 契约 + 边栏定制行为测试
 * =====================================================================
 * 运行：`node --test lib/client.test.js`（本插件目录下）。
 *
 * 覆盖：
 *   1. 纯逻辑（parseConfig / serialize / applyConfig / move / toggle）；
 *   2. 静态锚点契约——本插件从 [data-slot="settings.section"] 锚点结构
 *      上攀（options → content → panel）取面板，该锚点与「通用设置」
 *      navList 行必须仍出现在内核 rc.8 的
 *      dsh-client-ui-settings-general 渲染源里（漂移 tripwire）；
 *   3. DOM 模拟——按 rc.8 真实结构搭骨架，跑完整 DOM 粘合：
 *      面板定位（结构上攀）、「自定义边栏」按钮入 nav、隐藏行
 *      display:none、排序行写 flex order、绝不移动/删除 React 行。
 *
 * DOM 垫片与 dsh-settings-groups/lib/client.test.js 同一套极小实现
 * （两包各自独立，避免跨包 require）。
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

// ───────────────────────── 极小 DOM 垫片（同 settings-groups 测试） ─────────────────────────
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
  querySelector(s) { return this.querySelectorAll(s)[0] || null; }
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
  for (const o of Dom.observers.slice()) {
    if (o.target === node || o.target.contains(node)) {
      try { o.cb([]); } catch (e) { /* 插件侧已整体 try/catch，双保险 */ }
    }
  }
};
Dom.matchOne = function matchOne(el, raw) {
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

function makeTimers() {
  const q = [];
  return {
    setTimeout(fn) { q.push({ fn }); return q.length; },
    flush() { let guard = 0; while (q.length && guard++ < 50) q.shift().fn(); },
  };
}

const PREV_GLOBALS = ['document', 'window', 'MutationObserver', 'setTimeout', 'localStorage', 'getComputedStyle']
  .reduce((acc, k) => ({ ...acc, [k]: global[k] }), {});

/** 安装全局垫片并 eval client.js；slotsStub 喂给 apply 的 slots 服务。 */
function boot(slotsStub) {
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
  const modules = loaderEntries.map((e) => e.factory(() => slotsStub));
  return {
    core: sandboxWindow.__dshSettingsNavCore,
    modules,
    timers,
    body,
    storage,
    restore() { Object.assign(global, PREV_GLOBALS); },
  };
}

// ───────────────────────── rc.8 骨架构造（同官方 SettingsPanel） ─────────────────────────
function el(tag, className, parent) {
  const e = new El(tag);
  if (className) e.className = className;
  if (parent) parent.appendChild(e);
  return e;
}

/**
 * 官方结构（dsh-client-ui-settings-general rc.7/rc.8 同构）：
 *   overlay > panel > nav > (navTitle, navList > button.navCell × N)
 *                        content > (header > (actions, close), options >
 *                          div[data-slot=settings.section](display:contents) > …)
 */
function buildPanel(host, labels) {
  const overlay = el('div', 'VOzbGW_overlay', host);
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
  const cells = labels.map((l) => {
    const b = el('button', 'VOzbGW_navCell', navList);
    const s = el('span', 'VOzbGW_navLabel', b);
    s.textContent = l;
    return b;
  });
  return { overlay, panel, nav, navList, sectionAnchor, cells };
}

const SECTIONS = [
  { id: 'general', label: '通用设置' },
  { id: 'models', label: '模型设置' },
  { id: 'plugins', label: '插件' },
  { id: 'dsh-vision', label: '识图插件（view_image）' },
];
const slotsStub = {
  entries: (name) => (name === 'settings.section'
    ? SECTIONS.map((s) => ({ options: { id: s.id, label: s.label } }))
    : []),
};

// ───────────────────────── 1. 纯逻辑 ─────────────────────────
test('纯逻辑：parseConfig 脏数据容忍 + serialize 往返', () => {
  const b = boot(slotsStub);
  try {
    assert.deepEqual(b.core.parseConfig(null), { hidden: new Set(), order: [] });
    assert.deepEqual(b.core.parseConfig('bad'), { hidden: new Set(), order: [] });
    const cfg = b.core.parseConfig('{"hidden":["plugins"],"order":["models","general"]}');
    assert.equal(cfg.hidden.has('plugins'), true);
    assert.deepEqual(cfg.order, ['models', 'general']);
    const back = b.core.parseConfig(b.core.serialize(cfg));
    assert.deepEqual([...back.hidden], ['plugins']);
    assert.deepEqual(back.order, ['models', 'general']);
  } finally { b.restore(); }
});

test('纯逻辑：applyConfig 过滤隐藏 + 自定义排序，未知项保持原序跟尾', () => {
  const b = boot(slotsStub);
  try {
    const cfg = b.core.parseConfig('{"hidden":["plugins"],"order":["dsh-vision","models"]}');
    const out = b.core.applyConfig(SECTIONS, cfg);
    assert.deepEqual(out.map((s) => s.id), ['dsh-vision', 'models', 'general']); // plugins 隐藏，其余按 order + 原序
    const all = b.core.applyConfig(SECTIONS, b.core.parseConfig(null));
    assert.deepEqual(all.map((s) => s.id), ['general', 'models', 'plugins', 'dsh-vision']);
  } finally { b.restore(); }
});

test('纯逻辑：move 上下移与边界，未知 id 不动', () => {
  const b = boot(slotsStub);
  try {
    const known = SECTIONS.map((s) => s.id);
    const cfg = { hidden: new Set(), order: ['general', 'models', 'plugins'] };
    assert.deepEqual(b.core.move('models', -1, cfg, known).order, ['models', 'general', 'plugins']);
    assert.deepEqual(b.core.move('general', -1, cfg, known).order, ['models', 'plugins']); // 顶行再上移 = 移出显式序（回落默认原序）
    assert.deepEqual(b.core.move('unknown', 1, cfg, known).order, ['general', 'models', 'plugins']); // 未知 id 不动
    assert.deepEqual(b.core.move('plugins', 1, cfg, known).order, ['general', 'models']); // 移出末尾即除名
    assert.deepEqual([...b.core.toggle('models', cfg).hidden], ['models']);
  } finally { b.restore(); }
});

// ───────────────────────── 2. 静态锚点契约 ─────────────────────────
const KERNEL_CANDIDATES = [
  path.join(__dirname, '..', '..', '..', '..', 'node_modules', '@deepseek-ai', 'dsh-client-ui-settings-general', 'lib', 'client.js'),
  path.join(__dirname, '..', '..', '..', '..', '..', 'dsh-tauri', 'pp', 'node_modules', '@deepseek-ai', 'dsh-client-ui-settings-general', 'lib', 'client.js'),
].filter((p) => fs.existsSync(p));

test('插件侧：结构上攀与按钮定位形态在源内', () => {
  for (const frag of ['[data-slot="settings.section"]', 'parentElement', 'settings.section', '自定义边栏']) {
    assert.ok(SRC.indexOf(frag) !== -1, `client.js 应包含形态片段: ${frag}`);
  }
});

test('内核侧：rc.8 渲染源仍产出锚点（漂移 tripwire）', { skip: KERNEL_CANDIDATES.length === 0 }, (t) => {
  for (const file of KERNEL_CANDIDATES) {
    const k = fs.readFileSync(file, 'utf8');
    for (const [name, frag] of Object.entries({
      'settings.section 锚点': '"settings.section"',
      'navList 类': 'navList',
      'navCell 行（button）': 'navCell',
    })) {
      t.assert.ok(k.indexOf(frag) !== -1, `${file} 应包含 ${name}`);
    }
  }
});

// ───────────────────────── 3. DOM 模拟 ─────────────────────────
test('DOM：面板结构上攀定位、footer 入 nav、默认零改动', () => {
  const b = boot(slotsStub);
  try {
    const p = buildPanel(b.body, SECTIONS.map((s) => s.label));
    b.modules[0].apply({ get: (name) => (name === 'slots' ? slotsStub : undefined) });
    b.timers.flush();
    // 面板从 data-slot 锚点三层上攀找到（options → content → panel）
    const footer = p.nav.querySelector('.eac-nav-footer');
    assert.ok(footer, '「自定义边栏」按钮已加入 nav');
    assert.equal(footer.parentElement, p.nav, 'footer 挂 nav（React 管理区末尾追加，不动既有子）');
    // 默认配置：全部显示、行原样（display 复位 + order 赋序号）
    assert.equal(p.navList.querySelectorAll('button').length, SECTIONS.length, 'React 行一个都不少');
    for (const c of p.cells) assert.notEqual(c.style.display, 'none');
  } finally { b.restore(); }
});

test('DOM：隐藏项 display:none、排序写 flex order、不删行', () => {
  const b = boot(slotsStub);
  try {
    b.storage.set('eac:settings-nav:v1', JSON.stringify({ hidden: ['plugins'], order: ['dsh-vision', 'models'] }));
    const p = buildPanel(b.body, SECTIONS.map((s) => s.label));
    b.modules[0].apply({ get: (name) => (name === 'slots' ? slotsStub : undefined) });
    b.timers.flush();
    assert.equal(p.navList.querySelectorAll('button').length, SECTIONS.length, '隐藏 = display:none，绝不 removeChild');
    const byLabel = {};
    p.cells.forEach((c, i) => { byLabel[SECTIONS[i].label] = c; });
    assert.equal(byLabel['插件'].style.display, 'none', 'plugins 隐藏');
    assert.notEqual(byLabel['通用设置'].style.display, 'none', 'general 可见');
    // dsh-vision(0) → models(1) → general 跟尾，plugins 隐藏不影响 order 写入
    assert.equal(byLabel['识图插件（view_image）'].style.order, '0');
    assert.equal(byLabel['模型设置'].style.order, '1');
    assert.equal(byLabel['通用设置'].style.order, '2');
  } finally { b.restore(); }
});

test('DOM：设置面板关闭后重开自动重放（指纹随 cell 集合变化）', () => {
  const b = boot(slotsStub);
  try {
    b.storage.set('eac:settings-nav:v1', JSON.stringify({ hidden: ['models'], order: [] }));
    let p = buildPanel(b.body, SECTIONS.map((s) => s.label));
    b.modules[0].apply({ get: (name) => (name === 'slots' ? slotsStub : undefined) });
    b.timers.flush();
    assert.equal(p.cells[1].style.display, 'none', 'models 首次应用即隐藏');
    // 关面板 = overlay 整体卸下；重开 = 全新节点（React 卸载/重挂）
    b.body.removeChild(p.overlay);
    b.timers.flush();
    p = buildPanel(b.body, SECTIONS.map((s) => s.label));
    b.timers.flush(); // 观察器捕获新面板 → scan → 指纹不同 → 重放
    assert.equal(p.cells[1].style.display, 'none', '重开后配置自动重放');
    assert.equal(p.cells[0].style.display !== 'none', true);
  } finally { b.restore(); }
});
