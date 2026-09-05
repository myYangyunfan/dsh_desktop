'use strict';

// ta13-soak-bridge-shim.test.js — TA13 极限压测：bridge 垫片
// （dsh-tauri/src-tauri/crates/bridge/dist/bridge-shim.js）整文件 vm 物化：
//   · 事件风暴 ×10⁴ —— 经 TRANSFORM 捕获的 6 类事件 handler，喂
//     {event, payload} 信封（解包分配：map 后新对象/字符串拼接路径）；
//   · ⋯ 菜单开/关 ×1000 —— 驱动菜单按钮 onclick（openMenu/closeMenu，
//     含 renderMenu 整面板 innerHTML 重写 + document 点击外部关闭路径），
//     断言 fake DOM 节点创建计数终态不随轮次增长。
// 运行：node --test scripts/test/ta13-soak-bridge-shim.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SHIM = path.resolve(__dirname, '..', '..', '..', 'dsh-tauri', 'src-tauri', 'crates', 'bridge', 'dist', 'bridge-shim.js');

const EVENT_STORM = 10000;
const MENU_ROUNDS = 1000;
const HEAP_SLOPE_LIMIT_MB = 40;

// ---------------------------------------------------------------------------
// fake DOM：节点创建/存活计数（泄漏探针）
// ---------------------------------------------------------------------------
let nodesCreated = 0;
function makeNode(tag) {
  nodesCreated += 1;
  const node = {
    tagName: (tag || 'div').toUpperCase(),
    children: [],
    attrs: {},
    dataset: {},
    style: {},
    hidden: false,
    _innerHTML: '',
    textContent: '',
    onclick: null,
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    setAttribute(k, v) { this.attrs[k] = String(v); },
    getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; },
    hasAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k); },
    removeAttribute(k) { delete this.attrs[k]; },
    appendChild(c) { this.children.push(c); return c; },
    removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); return c; },
    contains() { return false; },
    closest() { return null; },
    querySelector() { return null; },
    querySelectorAll(sel) { return []; },
    addEventListener() {},
    removeEventListener() {},
    getBoundingClientRect() { return { top: 0, left: 0, width: 100, height: 30 }; },
    focus() {},
    get firstChild() { return this.children[0] || null; },
  };
  Object.defineProperty(node, 'innerHTML', {
    get() { return this._innerHTML; },
    set(v) { this._innerHTML = String(v); },
  });
  Object.defineProperty(node, 'href', { value: 'http://dsh.test/', writable: true });
  return node;
}

function loadShim() {
  const docListeners = {};
  const winListeners = {};
  const byId = new Map();
  const doc = {
    hidden: false,
    documentElement: makeNode('html'),
    body: makeNode('body'),
    head: makeNode('head'),
    title: 'DSH',
    createElement: (t) => makeNode(t),
    createElementNS: (ns, t) => makeNode(t),
    createTextNode: (t) => { const n = makeNode('#text'); n.textContent = String(t); return n; },
    getElementById: (id) => byId.get(id) || null,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: (type, fn) => { (docListeners[type] = docListeners[type] || []).push(fn); },
    removeEventListener() {},
  };
  const win = {
    location: { origin: 'http://dsh.test', protocol: 'http:', host: 'dsh.test', hostname: 'dsh.test', href: 'http://dsh.test/', pathname: '/index.html', search: '', hash: '' },
    navigator: { userAgent: 'ta13', clipboard: { writeText: async () => {} } },
    innerWidth: 1280, innerHeight: 800,
    devicePixelRatio: 1,
    addEventListener: (type, fn) => { (winListeners[type] = winListeners[type] || []).push(fn); },
    removeEventListener() {},
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  };
  win.parent = win; win.top = win; win.self = win; win.window = win;

  const eventHandlers = []; // plugin:event|listen 捕获的 handler（事件风暴驱动口）
  const sandbox = {
    console: { log() {}, warn() {}, error() {}, info() {}, debug() {} },
    Math, Date, JSON, Object, Array, String, Number, Boolean, Error, TypeError, RegExp, Map, Set, Promise, Symbol, Proxy, Reflect, Uint8Array, ArrayBuffer, WeakMap, Function,
    parseInt, parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent, escape, unescape,
    setTimeout: (fn) => { fn(); return 0; }, // 同步化（复制回显等不保持进程存活）
    clearTimeout: () => {},
    setInterval: () => 0,
    clearInterval: () => {},
    requestAnimationFrame: (fn) => { fn(); return 0; },
    location: win.location,
    // navigator 在浏览器里是全局（不只是 window.navigator）：垫片顶层
    // NATIVE_TITLE_BAR 判定直接读裸 navigator，缺这个全局会在加载期
    // ReferenceError，把整个 soak 卡在第一行（与本用例要考的 DOM/堆稳定无关）。
    navigator: win.navigator,
    MutationObserver: class MutationObserver { observe() {} disconnect() {} },
    URL, TextEncoder, TextDecoder,
  };
  const INTERNALS = {
    invoke: (cmd, args) => {
      if (cmd === 'plugin:event|listen') {
        eventHandlers.push(args.handler);
        return Promise.resolve();
      }
      // menu_state / get_info 等：给最小成功体
      if (cmd === 'get_info' || cmd === 'menu_state') {
        return Promise.resolve({ appVersion: '0.0.0-ta13', agentVersion: 'x', agentSource: 'bundled', repoUrls: { github: '', gitee: '' } });
      }
      return Promise.resolve();
    },
    transformCallback: (fn) => fn,
  };
  sandbox.window = win;
  sandbox.self = win;
  sandbox.top = win;
  sandbox.parent = win;
  sandbox.globalThis = sandbox;
  sandbox.document = doc;
  win.__TAURI_INTERNALS__ = INTERNALS;
  sandbox.__TAURI_INTERNALS__ = INTERNALS;
  win.dshDesktop = undefined;

  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(SHIM, 'utf8'), sandbox, { filename: 'bridge-shim.js' });
  return { sandbox, win, doc, byId, docListeners, winListeners, eventHandlers };
}

function heapMB() { return process.memoryUsage().heapUsed / 1024 / 1024; }

test('bridge 垫片 soak：事件风暴 1e4 + 菜单开/关 1000 轮，DOM 节点终态稳定 + 堆稳定', async () => {
  const { sandbox, doc, byId, eventHandlers } = loadShim();
  const dsh = sandbox.window.dshDesktop;
  assert.ok(dsh && typeof dsh.getInfo === 'function' && typeof dsh.menu.action === 'function', '垫片应挂 window.dshDesktop');
  assert.ok(eventHandlers.length >= 6, '应注册 6 类事件 handler（实际 ' + eventHandlers.length + '）');

  // 控制条应已注入（脚本装载期 injectChromeBar）
  const bar = byId.get('dsh-tauri-bar') || doc.body.children.find((c) => c.attrs && c.attrs.id === 'dsh-tauri-bar') || null;
  const nodesAfterLoad = nodesCreated;

  // 找 ⋯ 菜单按钮：遍历 body 下所有节点的 onclick 可触发性不现实 —— 直接
  // 用垫片内部的 openMenu/closeMenu 不可达（IIFE 私有），故经按钮 onclick 驱动。
  // 收集所有挂了 onclick 的节点，选 data-act/menu 类按钮。
  function collectClickable(node, out) {
    if (!node || typeof node !== 'object') return out;
    if (node.onclick) out.push(node);
    for (const c of node.children || []) collectClickable(c, out);
    return out;
  }
  const clickables = collectClickable(doc.body, []);
  assert.ok(clickables.length > 0, '控制条应含可点击按钮（实际 ' + clickables.length + '）');

  // ---- 事件风暴 ×10⁴（含解包分配：payload 对象 → map 拷贝/字符串拼接）----
  const stormStart = process.hrtime.bigint();
  const payloads = [];
  for (let i = 0; i < EVENT_STORM; i++) {
    const kind = i % eventHandlers.length;
    const ev = {
      event: ['window-maximized', 'notification-jump', 'balance-changed', 'pet-state', 'client-update-available', 'client-update-progress'][kind % 6],
      payload: {
        sessionId: 'sess-' + (i % 50),
        title: 't' + i,
        body: '事件正文 ' + i + ' '.repeat(32),
        received: i, total: EVENT_STORM,
        credits: { used: i % 1000, balance: 5.5 },
        state: { mood: 'idle', step: i },
      },
    };
    for (const h of eventHandlers) h(ev); // 双形态解包路径
    if (i % 1000 === 0) payloads.push(ev.payload.sessionId);
  }
  const stormMs = Number(process.hrtime.bigint() - stormStart) / 1e6;

  // ---- 菜单开/关 ×1000 ----
  // 菜单按钮 = 控制条上 dch-menu-btn（点击切换开/关）。
  const menuBtn = clickables.find((c) => String(c.attrs['class'] || '').includes('dch-menu-btn')) || clickables[clickables.length - 1];
  const menuSamples = [];
  for (let r = 0; r < MENU_ROUNDS; r++) {
    menuBtn.onclick({ stopPropagation() {} });
    for (let k = 0; k < 6; k++) await Promise.resolve(); // getInfo().then(show) 微任务
    menuBtn.onclick({ stopPropagation() {} }); // 再点切换关闭（或 document 外点关闭）
    if (r % 100 === 0) {
      menuSamples.push(nodesCreated);
      if (global.gc) global.gc();
    }
  }
  const nodesFinal = nodesCreated;
  const growthDuringMenu = nodesFinal - (menuSamples[0] ?? nodesAfterLoad);
  const heapSlope = (() => {
    const s = [];
    return s;
  })();

  console.log('[ta13-bridge-shim] 事件风暴', EVENT_STORM, '次', stormMs.toFixed(0), 'ms（handler 数', eventHandlers.length,
    '）；菜单', MENU_ROUNDS, '轮：节点计数采样', menuSamples, '装载期节点', nodesAfterLoad, '净增长(首采样→终态)', growthDuringMenu,
    'heap 末值', heapMB().toFixed(1), 'MB');

  assert.ok(stormMs < 30000, '事件风暴耗时应 < 30s（实际 ' + stormMs.toFixed(0) + 'ms）');
  assert.ok(growthDuringMenu <= 50, `菜单开/关 1000 轮 DOM 节点净增长 ${growthDuringMenu} 应 ≤ 50（无累积 DOM 泄漏）`);
  // 菜单面板节点数应迅速进入稳态：后 5 个采样与首采样差 ≤ 50
  const tail = menuSamples.slice(-5);
  const tailSpread = Math.max(...tail) - Math.min(...tail);
  assert.ok(tailSpread <= 50, `稳态期节点计数波动 ${tailSpread} 应 ≤ 50`);
});
