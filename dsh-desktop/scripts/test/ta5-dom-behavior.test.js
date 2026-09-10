'use strict';
// ---------------------------------------------------------------------------
// TA5 DOM 行为级测试：bridge-shim.js（真实 dist 源码）与 pages.rs 内嵌页
// （LOADING_HTML / RECOVERY_HTML 的 <script>）在最小 DOM stub + mock
// __TAURI_INTERNALS__ + 假定时器下的行为验证。
//
// 零第三方依赖：自建最小 DOM（createElement/textContent/innerHTML setter/
// appendChild/removeChild/classList/getElementById/querySelector(All)/事件/
// CustomEvent/localStorage），vm 装载真实源码。
//
// 运行：node scripts/test/ta5-dom-behavior.test.js
// ---------------------------------------------------------------------------

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');
const SHIM_SRC = fs.readFileSync(
  path.join(ROOT, '..', 'dsh-tauri', 'src-tauri', 'crates', 'bridge', 'dist', 'bridge-shim.js'), 'utf8');
const PAGES_RS = fs.readFileSync(
  path.join(ROOT, '..', 'dsh-tauri', 'src-tauri', 'src', 'app', 'src', 'pages.rs'), 'utf8').replace(/\r\n/g, '\n');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' :: ' + detail : ''}`); }
}
const flush = async (n = 25) => { for (let i = 0; i < n; i++) await Promise.resolve(); };

// ===========================================================================
// 1. 最小 DOM stub（零依赖）
// ===========================================================================

function decodeEntities(s) {
  return String(s).replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_, e) =>
    ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", nbsp: ' ' })[e]);
}

class TextNode {
  constructor(data) { this.nodeType = 3; this.data = String(data); this.parentNode = null; }
  get textContent() { return this.data; }
  set textContent(v) { this.data = String(v); }
}

class Element {
  constructor(tag) {
    this.nodeType = 1;
    this.tagName = String(tag).toUpperCase();
    this.childNodes = [];
    this.parentNode = null;
    this.attributes = {};
    this.id = '';
    this._className = '';
    this.style = {};
    this.hidden = false;
    this.onclick = null;
    this.title = '';
  }
  get className() { return this._className; }
  set className(v) { this._className = String(v); }
  get classList() {
    const self = this;
    return {
      add(...cs) {
        const set = new Set(self._className.split(/\s+/).filter(Boolean));
        cs.forEach(c => set.add(c));
        self._className = [...set].join(' ');
      },
      remove(...cs) {
        const set = new Set(self._className.split(/\s+/).filter(Boolean));
        cs.forEach(c => set.delete(c));
        self._className = [...set].join(' ');
      },
      contains(c) { return self._className.split(/\s+/).filter(Boolean).includes(c); }
    };
  }
  setAttribute(k, v) {
    const s = String(v);
    this.attributes[k] = s;
    if (k === 'id') this.id = s;
    if (k === 'class') this._className = s;
  }
  getAttribute(k) { return k in this.attributes ? this.attributes[k] : null; }
  hasAttribute(k) { return k in this.attributes; }
  removeAttribute(k) { delete this.attributes[k]; }
  appendChild(c) {
    if (c.parentNode) c.parentNode.removeChild(c);
    c.parentNode = this;
    this.childNodes.push(c);
    return c;
  }
  removeChild(c) {
    const i = this.childNodes.indexOf(c);
    if (i >= 0) { this.childNodes.splice(i, 1); c.parentNode = null; }
    return c;
  }
  get children() { return this.childNodes.filter(n => n.nodeType === 1); }
  get firstChild() { return this.childNodes[0] || null; }
  get parentNode() { return this._parentNode || null; }
  set parentNode(p) { this._parentNode = p; }
  get textContent() {
    return this.childNodes.map(n => n.textContent).join('');
  }
  set textContent(v) {
    this.childNodes = [];
    if (v !== '' && v != null) this.childNodes.push(new TextNode(v));
  }
  set innerHTML(html) { this.childNodes = parseHTML(String(html)); }
  get innerHTML() { return this.childNodes.map(serNode).join(''); }
  contains(n) { while (n) { if (n === this) return true; n = n.parentNode; } return false; }
  querySelector(sel) { return queryAll(this, sel)[0] || null; }
  querySelectorAll(sel) { return queryAll(this, sel); }
}
function serNode(n) {
  if (n.nodeType === 3) return n.data;
  const attrs = Object.entries(n.attributes).map(([k, v]) => ` ${k}="${v}"`).join('');
  const cls = n._className && !('class' in n.attributes) ? ` class="${n._className}"` : '';
  return `<${n.tagName.toLowerCase()}${attrs}${cls}>${n.childNodes.map(serNode).join('')}</${n.tagName.toLowerCase()}>`;
}

function parseHTML(html) {
  const frag = new Element('#frag');
  const stack = [frag];
  const re = /<(\/?)([a-zA-Z][\w-]*)([^>]*)>/g;
  let last = 0, m;
  const pushText = (parent, txt) => {
    if (txt && !/^\s*$/.test(txt)) parent.appendChild(new TextNode(decodeEntities(txt)));
  };
  while ((m = re.exec(html))) {
    pushText(stack[stack.length - 1], html.slice(last, m.index));
    const [, close, tag, attrStrRaw] = m;
    const selfClose = /\/\s*$/.test(attrStrRaw);
    const attrStr = attrStrRaw.replace(/\/\s*$/, '');
    if (close) {
      if (stack.length > 1) stack.pop();
    } else {
      const el = new Element(tag);
      const are = /([\w-]+)(?:\s*=\s*("([^"]*)"|'([^']*)'|[^\s]+))?/g;
      let a;
      while ((a = are.exec(attrStr))) {
        el.setAttribute(a[1], decodeEntities(a[3] !== undefined ? a[3] : a[4] !== undefined ? a[4] : (a[2] || '')));
      }
      stack[stack.length - 1].appendChild(el);
      if (!selfClose) stack.push(el);
    }
    last = re.lastIndex;
  }
  pushText(stack[stack.length - 1], html.slice(last));
  return frag.childNodes;
}

// 选择器：支持 #id / .class / tag / 组合 / [attr] / [attr="v"]，逗号多选
function selMatches(el, sel) {
  const bracket = sel.indexOf('[');
  let main = sel, attrPart = '';
  if (bracket >= 0) { main = sel.slice(0, bracket); attrPart = sel.slice(bracket); }
  const m = main.match(/^([a-zA-Z][\w-]*|\*)?((?:[.#][\w-]+)*)$/);
  if (!m) return false;
  if (m[1] && m[1] !== '*' && el.tagName !== m[1].toUpperCase()) return false;
  const classes = [], ids = [];
  const cr = /([.#])([\w-]+)/g; let c;
  while ((c = cr.exec(m[2] || ''))) (c[1] === '.' ? classes : ids).push(c[2]);
  if (ids.length && !ids.every(i => el.id === i)) return false;
  if (classes.length) {
    const have = el._className.split(/\s+/).filter(Boolean);
    if (!classes.every(c2 => have.includes(c2))) return false;
  }
  if (attrPart) {
    const ar = /\[\s*([\w-]+)\s*(?:=\s*("([^"]*)"|'([^']*)'|([^\]]*)))?\s*\]/g; let x;
    while ((x = ar.exec(attrPart))) {
      const val = el.getAttribute(x[1]);
      if (val === null) return false;
      if (x[2] !== undefined) {
        const want = x[3] !== undefined ? x[3] : x[4] !== undefined ? x[4] : x[5];
        if (val !== want) return false;
      }
    }
  }
  return true;
}
function descendants(root, out) {
  for (const c of root.childNodes) {
    if (c.nodeType === 1) { out.push(c); descendants(c, out); }
  }
  return out;
}
function queryAll(root, sel) {
  const sels = String(sel).split(',').map(s => s.trim()).filter(Boolean);
  const pool = root.nodeType === 1 ? descendants(root, []) : descendants(root, []);
  return pool.filter(el => sels.some(s => selMatches(el, s)));
}

class Document extends Element {
  constructor() {
    super('#document');
    this.readyState = 'complete';
    this.hidden = false;
    this._listeners = {};
    this.documentElement = new Element('html');
    this.appendChild(this.documentElement);
    this.head = new Element('head');
    this.body = new Element('body');
    this.documentElement.appendChild(this.head);
    this.documentElement.appendChild(this.body);
  }
  createElement(t) { return new Element(t); }
  createElementNS(_ns, t) { return new Element(t); }
  getElementById(id) {
    return descendants(this, []).find(el => el.id === id || el.getAttribute('id') === id) || null;
  }
  addEventListener(t, fn) { (this._listeners[t] = this._listeners[t] || []).push(fn); }
  removeEventListener(t, fn) {
    const a = this._listeners[t] || []; const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1);
  }
  dispatchEvent(ev) {
    (this._listeners[ev.type] || []).slice().forEach(fn => { try { fn(ev); } catch (e) { /* 隔离 */ } });
    return true;
  }
}

class CustomEvent {
  constructor(type, opts) { this.type = type; this.detail = opts && opts.detail !== undefined ? opts.detail : null; }
}

class MutationObserver {
  constructor(cb) { this.cb = cb; }
  observe() {}
  disconnect() {}
}

// 假定时器：手动推进
function makeTimers() {
  let now = 0, seq = 0;
  const timeouts = new Map(), intervals = new Map();
  return {
    setTimeout(fn, delay) { const id = ++seq; timeouts.set(id, { fn, at: now + (delay || 0) }); return id; },
    clearTimeout(id) { timeouts.delete(id); },
    setInterval(fn, every) { const id = ++seq; intervals.set(id, { fn, every: every || 0, next: now + (every || 0) }); return id; },
    clearInterval(id) { intervals.delete(id); },
    advance(ms) {
      const target = now + ms;
      for (;;) {
        let best = null, bestAt = Infinity, kind = null;
        for (const [id, t] of timeouts) if (t.at <= target && t.at < bestAt) { bestAt = t.at; best = id; kind = 't'; }
        for (const [id, it] of intervals) if (it.next <= target && it.next < bestAt) { bestAt = it.next; best = id; kind = 'i'; }
        if (best === null) break;
        now = bestAt;
        if (kind === 't') { const { fn } = timeouts.get(best); timeouts.delete(best); fn(); }
        else { const it = intervals.get(best); it.next += it.every; it.fn(); }
      }
      now = target;
    },
    now: () => now
  };
}

function makeStorage() {
  const m = new Map();
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: k => m.delete(k),
    clear: () => m.clear(),
    get length() { return m.size; }
  };
}

// ===========================================================================
// 2. mock __TAURI_INTERNALS__ + sandbox 工厂
// ===========================================================================

function makeInternals(label) {
  const handlers = {};   // event -> [fn(envelope)]
  const calls = [];      // {cmd, args}
  const routes = {};     // cmd -> (args) => result
  const internals = {
    metadata: { currentWindow: { label } },
    transformCallback(fn) { return fn; },
    invoke(cmd, args) {
      calls.push({ cmd, args });
      if (cmd === 'plugin:event|listen') {
        (handlers[args.event] = handlers[args.event] || []).push(args.handler);
        return Promise.resolve();
      }
      const h = routes[cmd];
      if (h) return Promise.resolve().then(() => h(args || {}));
      return Promise.resolve(undefined);
    }
  };
  return { internals, handlers, calls, routes };
}

function bootShim(opts = {}) {
  const timers = makeTimers();
  const doc = new Document();
  const storage = opts.storage || makeStorage();
  const itn = makeInternals(opts.label || 'main');
  const winListeners = {};
  const win = {
    __TAURI_INTERNALS__: itn.internals,
    document: doc,
    location: { pathname: opts.pathname || '/app/index.html' },
    setInterval: timers.setInterval.bind(timers),
    clearInterval: timers.clearInterval.bind(timers),
    setTimeout: timers.setTimeout.bind(timers),
    clearTimeout: timers.clearTimeout.bind(timers),
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    addEventListener(t, fn) { (winListeners[t] = winListeners[t] || []).push(fn); },
    removeEventListener(t, fn) { const a = winListeners[t] || []; const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); },
    dispatchEvent(ev) {
      (winListeners[ev.type] || []).slice().forEach(fn => { try { fn(ev); } catch (e) {} });
      return true;
    },
    console, MutationObserver, CustomEvent, Promise, Error, JSON, String, Number, Object, Boolean, Array,
    localStorage: storage,
    navigator: opts.navigator || {}
  };
  win.top = win.self = win.window = win;
  Object.assign(itn.routes, opts.routes || {});
  if (opts.appInfo) itn.routes['app_init'] = () => opts.appInfo;
  const ctx = vm.createContext(Object.assign(Object.create(null), {
    window: win, document: doc, location: win.location, localStorage: storage,
    setInterval: win.setInterval, clearInterval: win.clearInterval,
    setTimeout: win.setTimeout, clearTimeout: win.clearTimeout,
    CustomEvent, MutationObserver, console, navigator: win.navigator,
    Promise, Error, JSON
  }));
  vm.runInContext(SHIM_SRC, ctx, { filename: 'bridge-shim.js' });
  const emit = (event, payload) => (itn.handlers[event] || []).slice().forEach(fn => fn({ event, payload }));
  return { win, doc, timers, storage, itn, emit, ctx,
    calls: itn.calls, count: cmd => itn.calls.filter(c => c.cmd === cmd).length,
    last: cmd => [...itn.calls].reverse().find(c => c.cmd === cmd) };
}

// 无宿主（浏览器模式）沙箱
function bootShimNoHost() {
  const timers = makeTimers();
  const doc = new Document();
  const win = {
    document: doc, location: { pathname: '/x.html' },
    setInterval: timers.setInterval.bind(timers), clearInterval: timers.clearInterval.bind(timers),
    setTimeout: timers.setTimeout.bind(timers), clearTimeout: timers.clearTimeout.bind(timers),
    matchMedia: () => ({ matches: false }), addEventListener() {}, dispatchEvent() { return true; },
    console, MutationObserver, CustomEvent, Promise, Error, JSON, localStorage: makeStorage(), navigator: {}
  };
  win.top = win.self = win.window = win;
  const ctx = vm.createContext(Object.assign(Object.create(null), {
    window: win, document: doc, location: win.location, localStorage: win.localStorage,
    setInterval: win.setInterval, clearInterval: win.clearInterval,
    setTimeout: win.setTimeout, clearTimeout: win.clearTimeout,
    CustomEvent, MutationObserver, console, navigator: {}, Promise, Error, JSON
  }));
  vm.runInContext(SHIM_SRC, ctx, { filename: 'bridge-shim.js' });
  return { win, doc, timers };
}

// pages.rs 内嵌页提取
function extractConst(name) {
  const m = PAGES_RS.match(new RegExp(`pub const ${name}: &str = r#"([\\s\\S]*?)"#;`));
  if (!m) throw new Error(`pages.rs 缺 ${name}`);
  return m[1];
}
function extractScript(html) {
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  if (!scripts.length) throw new Error('无 <script>');
  return scripts[scripts.length - 1][1];
}
const LOADING_SCRIPT = extractScript(extractConst('LOADING_HTML'));
const RECOVERY_SCRIPT = extractScript(extractConst('RECOVERY_HTML'));

// 壳页（loading/recovery）沙箱：不装 shim，页面脚本独立运行
function bootPage(script, { dshDesktop, prebuild = [] } = {}) {
  const timers = makeTimers();
  const doc = new Document();
  prebuild.forEach(id => { const e = doc.createElement('div'); e.id = id; doc.body.appendChild(e); });
  const itn = makeInternals('main');
  const winListeners = {};
  const win = {
    __TAURI_INTERNALS__: itn.internals,
    document: doc,
    setInterval: timers.setInterval.bind(timers), clearInterval: timers.clearInterval.bind(timers),
    setTimeout: timers.setTimeout.bind(timers), clearTimeout: timers.clearTimeout.bind(timers),
    addEventListener(t, fn) { (winListeners[t] = winListeners[t] || []).push(fn); },
    dispatchEvent() { return true; },
    console, MutationObserver, CustomEvent, Promise, Error, JSON, localStorage: makeStorage(),
    dshDesktop
  };
  win.top = win.self = win.window = win;
  const ctx = vm.createContext(Object.assign(Object.create(null), {
    window: win, document: doc, setInterval: win.setInterval, clearInterval: win.clearInterval,
    setTimeout: win.setTimeout, clearTimeout: win.clearTimeout, console, Promise, Error, JSON
  }));
  vm.runInContext(script, ctx, { filename: 'page-script.js' });
  const emit = (event, payload) => (itn.handlers[event] || []).slice().forEach(fn => fn({ event, payload }));
  return { win, doc, timers, emit, ctx };
}

// ===========================================================================
// 3. 测试
// ===========================================================================

const APP_INFO = {
  appVersion: '1.2.3', agentVersion: '0.9.7', agentSource: 'bundled',
  notifyOnTurnEnd: true, closeToTray: true, showBalanceDock: true, autoInstallUpdates: false,
  repoUrls: { github: 'https://github.com/a/b', gitee: 'https://gitee.com/a/b' }
};

async function main() {
  // ---- 3.1 基础：装载 / 幂等 / 浏览器降级 ----
  console.log('\n[1] shim 装载与浏览器降级');
  {
    const s = bootShim({ appInfo: APP_INFO });
    await flush();
    check('window.dshDesktop 定义（48 方法桥）', !!s.win.dshDesktop && typeof s.win.dshDesktop.menu.action === 'function');
    const before = s.win.dshDesktop;
    vm.runInContext(SHIM_SRC, s.ctx, { filename: 'bridge-shim-again.js' });
    check('重复注入幂等（对象不变）', s.win.dshDesktop === before);
    check('初始心跳已发送', s.count('renderer_heartbeat') >= 1);
    check('dialog polyfill：confirm 恒 true', s.win.confirm() === true);
    check('dialog polyfill：prompt 恒 null', s.win.prompt() === null);
    check('app_init 后 appVersion 回填', s.win.dshDesktop.appVersion === '1.2.3');
  }
  {
    const s = bootShimNoHost();
    await flush();
    let msg = '';
    try { await s.win.dshDesktop.windowControls.minimize(); } catch (e) { msg = e.message; }
    check('浏览器模式：reject 且 [E_NO_HOST] 前缀', /^\[E_NO_HOST\]/.test(msg), msg);
    check('浏览器模式：getPathForFile 返回空串', s.win.dshDesktop.getPathForFile({}) === '');
  }

  // ---- 3.2 事件链：notification-jump ----
  console.log('\n[2] 事件链：notification-jump 信封解包 + 定向守卫');
  {
    const s = bootShim({ appInfo: APP_INFO });
    await flush();
    const got = [];
    s.win.dshDesktop.onNotificationJump(j => got.push(j));
    s.emit('notification-jump', { sessionId: '  s1  ' });
    check('信封解包 + trim：消费者收到 {sessionId:"s1"}',
      got.length === 1 && got[0].sessionId === 's1', JSON.stringify(got));
    check('payload 冻结（Object.freeze）', Object.isFrozen(got[0]));
    s.emit('notification-jump', { sessionId: 'x'.repeat(300) });
    s.emit('notification-jump', { sessionId: '   ' });
    check('非法 sessionId（超长/空白）拒收', got.length === 1);
  }
  {
    const s = bootShim({ appInfo: APP_INFO, label: 'float' });
    await flush();
    const got = [];
    s.win.dshDesktop.onNotificationJump(j => got.push(j));
    s.emit('notification-jump', { sessionId: 's2' });
    check('浮窗 label 拒收（非主窗）', got.length === 0);
  }
  {
    const s = bootShim({ appInfo: APP_INFO });
    s.win.__DSH_FLOAT__ = true;
    await flush();
    const got = [];
    s.win.dshDesktop.onNotificationJump(j => got.push(j));
    s.emit('notification-jump', { sessionId: 's3' });
    s.win.__DSH_FLOAT__ = false; s.win.__DSH_PET__ = true;
    s.emit('notification-jump', { sessionId: 's3' });
    check('__DSH_FLOAT__ / __DSH_PET__ 标记拒收', got.length === 0);
  }
  {
    const s = bootShim({ appInfo: APP_INFO });
    await flush();
    s.itn.internals.metadata = undefined; // 旧壳 metadata 缺席兜底放行
    const got = [];
    s.win.dshDesktop.onNotificationJump(j => got.push(j));
    s.emit('notification-jump', { sessionId: 's4' });
    check('metadata 缺席兜底放行（主窗判定）', got.length === 1 && got[0].sessionId === 's4');
  }
  {
    const s = bootShim({ appInfo: APP_INFO });
    await flush();
    // 订阅前 emit：pendingJump 保留，订阅即补发
    s.emit('notification-jump', { sessionId: 'early' });
    const got = [];
    s.win.dshDesktop.onNotificationJump(j => got.push(j));
    check('pendingJump 补发（订阅前事件不丢）', got.length === 1 && got[0].sessionId === 'early');
    const got2 = [];
    s.win.dshDesktop.onNotificationJump(j => got2.push(j));
    check('pendingJump 取出即清（第二订阅者不收）', got2.length === 0);
  }

  // ---- 3.3 事件链：balance / pet / file-drop 转发 window CustomEvent ----
  console.log('\n[3] 事件链：balance / pet / file-drop → window CustomEvent');
  {
    const s = bootShim({ appInfo: APP_INFO });
    await flush();
    const evts = [];
    ['dsh-balance-changed', 'dsh-pet-state', 'client-file-drop'].forEach(t =>
      s.win.addEventListener(t, e => evts.push(e)));
    s.emit('balance-changed', { balance: '1.23', turnCost: '0.4' });
    check('balance-changed → dsh-balance-changed CustomEvent detail 原样',
      evts[0] && evts[0].type === 'dsh-balance-changed' && evts[0].detail.balance === '1.23');
    s.emit('pet-state', { open: true });
    check('pet-state → dsh-pet-state CustomEvent', evts[1] && evts[1].type === 'dsh-pet-state' && evts[1].detail.open === true);
    const dropPayload = { type: 'drop', files: [{ path: 'C:/a.png', name: 'a.png', kind: 'image' }], skipped: [] };
    s.emit('client-file-drop', dropPayload);
    check('file-drop 转发 window CustomEvent client-file-drop（detail 契约）',
      evts[2] && evts[2].type === 'client-file-drop' && evts[2].detail.type === 'drop'
      && evts[2].detail.files[0].path === 'C:/a.png');
  }

  // ---- 3.4 控制条注入 ----
  console.log('\n[4] 控制条（chrome bar）注入');
  {
    const s = bootShim({ appInfo: APP_INFO });
    await flush();
    const bar = s.doc.getElementById('dsh-tauri-chrome');
    check('控制条注入 body', !!bar && s.doc.body.contains(bar));
    check('data-dsh-title-bar-height=36 声明', s.doc.documentElement.getAttribute('data-dsh-title-bar-height') === '36');
    check('样式 <style data-for> 注入 head（幂等单份）',
      s.doc.head.querySelectorAll(`style[data-for="dsh-tauri-chrome"]`).length === 1
      && s.doc.head.querySelectorAll(`style[data-for="dsh-tauri-chrome-layout"]`).length === 1);
    const badge = bar.querySelector('.dch-badge');
    await flush();
    check('版本徽章回填 v1.2.3（getInfo）', badge && badge.textContent === 'v1.2.3' && badge.style.display === '');
    // 自愈重注：摘条 → body childList 观察（MutationObserver 为 stub 不触发）→ 手动再注入路径
    // MutationObserver 无操作化，此处直接验证幂等入口：手动移除条后 getElementById 为 null
    s.doc.body.removeChild(bar);
    check('条移除后可检测（自愈重注前提）', s.doc.getElementById('dsh-tauri-chrome') === null);
  }
  {
    // 壳页路径跳过注入
    const s = bootShim({ appInfo: APP_INFO, pathname: '/loading.html' });
    await flush();
    check('loading.html 壳页跳过控制条注入', s.doc.getElementById('dsh-tauri-chrome') === null);
  }

  // ---- 3.5 ⋯ 菜单流 ----
  console.log('\n[5] ⋯ 菜单：openMenu → getInfo → menuState merge → 渲染');
  {
    const s = bootShim({ appInfo: APP_INFO });
    await flush();
    const bar = s.doc.getElementById('dsh-tauri-chrome');
    const menuBtn = bar.querySelector('button.dch-menu-btn');
    check('⋯ 菜单按钮存在', !!menuBtn);
    const menuPanel = s.doc.getElementById('dsh-tauri-menu');
    check('菜单面板初始隐藏', menuPanel && menuPanel.hidden === true);
    menuBtn.onclick();
    await flush();
    check('openMenu 后面板可见', menuPanel.hidden === false);
    const html = menuPanel.innerHTML;
    check('标题版本行 v1.2.3', menuPanel.querySelector('.dch-mh-ver').textContent === 'v1.2.3');
    check('agent 版本/来源行', menuPanel.querySelector('.dch-mh-sub').textContent.includes('0.9.7')
      && menuPanel.querySelector('.dch-mh-sub').textContent.includes('bundled'));
    const rows = menuPanel.querySelectorAll('.dch-repo-row');
    check('更新源两行（github + gitee）', rows.length === 2
      && menuPanel.textContent.includes('https://github.com/a/b')
      && menuPanel.textContent.includes('https://gitee.com/a/b'));
    const copies = menuPanel.querySelectorAll('.dch-copy');
    check('两个复制按钮', copies.length === 2);
    check('自动安装更新开关行（缺省未开）',
      menuPanel.querySelector('[data-act="toggle-auto-update"]').textContent.includes('自动安装客户端更新')
      && !menuPanel.querySelector('[data-act="toggle-auto-update"]').textContent.includes('✓'));
    check('会话完成通知开关 ✓（menuState merge 生效）',
      menuPanel.querySelector('[data-act="toggle-notify"]').textContent.includes('✓'));

    // 复制按钮：copy_text invoke + 「已复制 ✓」+ 1.2s 还原
    copies[0].onclick();
    await flush();
    const copyCall = s.last('copy_text');
    check('复制点击 → copy_text invoke（github 地址）', copyCall && copyCall.args.text === 'https://github.com/a/b');
    check('按钮反馈「已复制 ✓」', copies[0].textContent === '已复制 ✓');
    s.timers.advance(1200);
    check('1.2s 后按钮文案还原', copies[0].textContent === '复制');

    // 开关类：menu_action 改写 settings → merge → 重渲染
    const toggle = menuPanel.querySelector('[data-act="toggle-notify"]');
    let toggleResolve;
    s.itn.routes['menu_action'] = (args) => args.action === 'toggle-notify'
      ? new Promise(res => { toggleResolve = res; }) : Promise.resolve({});
    toggle.onclick();
    await flush();
    check('开关点击 → menu_action toggle-notify', s.last('menu_action').args.action === 'toggle-notify');
    toggleResolve({ notifyOnTurnEnd: false });
    await flush();
    const after = menuPanel.querySelector('[data-act="toggle-notify"]');
    check('merge 后重渲染：✓ 消失', after && !after.textContent.includes('✓'));

    // 点击面板外关闭（菜单当前处于打开态：先关再开验证 toggle）
    menuBtn.onclick(); await flush();
    check('⋯ 再点切换：关闭', menuPanel.hidden === true);
    menuBtn.onclick(); await flush();
    check('⋯ 再点切换：重开（getInfo → 渲染 → 可见）', menuPanel.hidden === false);
    s.doc.dispatchEvent({ type: 'click', target: s.doc.body });
    check('点击面板外 → 关闭', menuPanel.hidden === true);

    // Escape 关闭
    menuBtn.onclick(); await flush();
    s.doc.dispatchEvent({ type: 'keydown', key: 'Escape' });
    check('Escape → 关闭', menuPanel.hidden === true);
  }

  // ---- 3.6 更新行状态机 ----
  console.log('\n[6] 更新行状态机：检查中 → 可更新 → 下载% → 完成/安装');
  {
    const s = bootShim({ appInfo: APP_INFO });
    await flush();
    const bar = s.doc.getElementById('dsh-tauri-chrome');
    const menuBtn = bar.querySelector('button.dch-menu-btn');
    menuBtn.onclick(); await flush();
    const menuPanel = s.doc.getElementById('dsh-tauri-menu');

    let checkDefer = null, installDefer = null;
    s.itn.routes['menu_action'] = (args) => {
      if (args.action === 'check-client-update') return new Promise((res, rej) => { checkDefer = { res, rej }; });
      if (args.action === 'install-client-update') return new Promise(res => { installDefer = { res }; });
      return Promise.resolve({});
    };
    s.itn.routes['copy_text'] = () => Promise.resolve();

    // 初始：无状态 → 纯「检查客户端更新…」
    check('初始无 install 按钮', menuPanel.querySelector('[data-act="install-client-update"]') === null);

    // 检查中…
    menuPanel.querySelector('[data-act="check-client-update"]').onclick();
    const stSpan = menuPanel.querySelector('.dch-upd');
    check('点击后即时「检查中…」（就地回显不关菜单）', stSpan && stSpan.textContent === '检查中…' && menuPanel.hidden === false);
    await flush(); // deferred 路由在微任务里创建

    // 可更新 v9.9.9（源：Gitee）
    checkDefer.res({ ok: true, upToDate: false, next: '9.9.9', source: 'gitee' });
    await flush();
    check('可更新 v9.9.9（源：Gitee）', menuPanel.textContent.includes('可更新 v9.9.9（源：Gitee）'));
    check('源归一 gitee→Gitee', menuPanel.textContent.includes('Gitee'));
    check('install 按钮出现', !!menuPanel.querySelector('[data-act="install-client-update"]'));
    check('红点打上（dch-dot）', menuBtn.classList.contains('dch-dot'));

    // 点击安装 → downloading 0%
    menuPanel.querySelector('[data-act="install-client-update"]').onclick();
    await flush();
    check('install → menu_action install-client-update', s.last('menu_action').args.action === 'install-client-update');
    check('下载中 0%', menuPanel.querySelector('.dch-upd-info').textContent === '下载中 0%');

    // 下载进度 25%（received/total 折算，就地改文本）
    s.emit('client-update-progress', { received: 50, total: 200 });
    check('下载中 25%（信封解包 + 折算）', menuPanel.querySelector('.dch-upd-info').textContent === '下载中 25%');

    // 100% → 安装中
    s.emit('client-update-progress', { received: 200, total: 200 });
    check('100% → 「下载完成，正在安装…」', menuPanel.querySelector('.dch-upd-info').textContent === '下载完成，正在安装…');

    // install resolve {installing:true}
    installDefer.res({ installing: true, version: '9.9.9' });
    await flush();
    check('install installing 态：无 install 按钮', menuPanel.querySelector('[data-act="install-client-update"]') === null);

    // 已是最新 → 红点摘除
    menuPanel.querySelector('[data-act="check-client-update"]').onclick();
    await flush();
    checkDefer.res({ ok: true, upToDate: true });
    await flush();
    check('已是最新', menuPanel.textContent.includes('已是最新'));
    check('红点摘除', !menuBtn.classList.contains('dch-dot'));

    // 检查失败路径
    menuPanel.querySelector('[data-act="check-client-update"]').onclick();
    await flush();
    checkDefer.rej(new Error('[E_UPD] boom'));
    await flush();
    check('检查失败：<原因>（去 [CODE] 前缀）', menuPanel.textContent.includes('检查失败：boom'));

    // armed：有会话运行时首点弹显式确认（不再隐晦「再点一次」二次文案）
    s.storage.setItem('dsh.sessions.current', JSON.stringify({ sessionId: 'live-session' }));
    s.timers.advance(3000); // currentSession 轮询 3s
    menuPanel.querySelector('[data-act="check-client-update"]').onclick();
    await flush();
    checkDefer.res({ ok: true, upToDate: false, next: '8.8.8', source: 'github' });
    await flush();
    const inst = menuPanel.querySelector('[data-act="install-client-update"]');
    check('可更新态 install 按钮文案「下载并安装」', inst && inst.textContent === '下载并安装');
    inst.onclick(); await flush();
    const confirm = menuPanel.querySelector('.dch-upd-confirm');
    check('会话运行中首点 → 弹显式确认提示', !!confirm && confirm.textContent.includes('确认继续'));
    const go = menuPanel.querySelector('[data-act="install-client-update"]');
    const cancel = menuPanel.querySelector('[data-act="cancel-install-confirm"]');
    check('确认面板含「继续安装」/「取消」按钮',
      go && go.textContent === '继续安装' && cancel && cancel.textContent === '取消');
    const installs = s.calls.filter(c => c.cmd === 'menu_action' && c.args.action === 'install-client-update');
    check('确认弹窗前不发 install-client-update', installs.length === 1, String(installs.length));
    cancel.onclick(); await flush();
    check('取消 → 回到「下载并安装」且不发 install',
      menuPanel.querySelector('[data-act="install-client-update"]').textContent === '下载并安装'
      && s.calls.filter(c => c.cmd === 'menu_action' && c.args.action === 'install-client-update').length === 1);
    menuPanel.querySelector('[data-act="install-client-update"]').onclick(); await flush();
    check('再点 → 再次弹确认', menuPanel.querySelector('[data-act="install-client-update"]').textContent === '继续安装');
    menuPanel.querySelector('[data-act="install-client-update"]').onclick(); await flush();
    const installs2 = s.calls.filter(c => c.cmd === 'menu_action' && c.args.action === 'install-client-update');
    check('「继续安装」真正触发 install', installs2.length === 2);
  }

  // ---- 3.7 client-update-available：红点 / 通知 / 自动安装 ----
  console.log('\n[7] client-update-available：menuState 回填 / 红点 / 自动安装');
  {
    const s = bootShim({ appInfo: Object.assign({}, APP_INFO, { autoInstallUpdates: true }) });
    await flush();
    const bar = s.doc.getElementById('dsh-tauri-chrome');
    const menuBtn = bar.querySelector('button.dch-menu-btn');
    s.emit('client-update-available', { next: '2.0.0', source: 'gitee' });
    await flush();
    check('红点打上', menuBtn.classList.contains('dch-dot'));
    check('系统通知（plugin:notification|notify）', s.count('plugin:notification|notify') === 1);
    check('autoInstallUpdates+无会话 → 自动安装', s.last('menu_action') && s.last('menu_action').args.action === 'install-client-update');
    menuBtn.onclick();
    await flush();
    const menuPanel = s.doc.getElementById('dsh-tauri-menu');
    check('打开菜单渲染「可更新 v2.0.0（源：Gitee）」', menuPanel.textContent.includes('可更新 v2.0.0（源：Gitee）'));
    check('同版本通知去重', (s.emit('client-update-available', { next: '2.0.0' }), s.count('plugin:notification|notify') === 1));
  }
  {
    const s = bootShim({ appInfo: Object.assign({}, APP_INFO, { autoInstallUpdates: true }) });
    await flush();
    s.storage.setItem('dsh.sessions.current', JSON.stringify({ sessionId: 'busy' }));
    s.timers.advance(3000);
    s.emit('client-update-available', { next: '2.0.0' });
    await flush();
    const installs = s.calls.filter(c => c.cmd === 'menu_action' && c.args.action === 'install-client-update');
    check('有会话运行 → 只提醒不自动装', installs.length === 0);
  }
  {
    const s = bootShim({ appInfo: APP_INFO, label: 'float' });
    await flush();
    s.emit('client-update-available', { next: '2.0.0' });
    await flush();
    check('非主窗：无通知/无红点/不自动装',
      s.count('plugin:notification|notify') === 0
      && !s.doc.getElementById('dsh-tauri-chrome').querySelector('button.dch-menu-btn').classList.contains('dch-dot'));
  }

  // ---- 3.7b 页面引导期主动补查（#189 回归）----
  // 壳的启动检查在 webview 挂上监听之前就广播完了 client-update-available
  // （updater_client.rs 模块文档已写明该风险），事件不重放 ⇒ 垫片必须在页面
  // 就绪后主动补查一次，否则红点/通知/自动安装每次启动都落空。
  console.log('\n[7b] 页面引导期主动补查 check-client-update（#189 回归）');
  {
    const acts = [];
    const s = bootShim({
      appInfo: Object.assign({}, APP_INFO, { autoInstallUpdates: true }),
      routes: {
        menu_action: (args) => {
          acts.push(args.action);
          if (args.action === 'check-client-update') return { ok: true, upToDate: true };
          return undefined;
        },
      },
    });
    await flush();
    check('引导后主动补查一次 check-client-update', acts.length === 1 && acts[0] === 'check-client-update', JSON.stringify(acts));
    const btn = s.doc.getElementById('dsh-tauri-chrome').querySelector('button.dch-menu-btn');
    check('补查 upToDate → 无红点 / 无通知 / 不安装',
      !btn.classList.contains('dch-dot') && s.count('plugin:notification|notify') === 0
      && !acts.includes('install-client-update'));
    s.timers.advance(60000);
    await flush();
    check('补查每页一次（不随定时器重复）', acts.length === 1, JSON.stringify(acts));
  }
  {
    const acts = [];
    const s = bootShim({
      appInfo: Object.assign({}, APP_INFO, { autoInstallUpdates: true }),
      routes: {
        menu_action: (args) => {
          acts.push(args.action);
          if (args.action === 'check-client-update') return { ok: true, next: '9.9.9', source: 'github' };
          if (args.action === 'install-client-update') return { installing: true };
          return undefined;
        },
      },
    });
    await flush();
    const btn = s.doc.getElementById('dsh-tauri-chrome').querySelector('button.dch-menu-btn');
    check('补查命中 → 红点', btn.classList.contains('dch-dot'));
    check('补查命中 → 系统通知一次', s.count('plugin:notification|notify') === 1);
    check('补查命中 + 无会话 → 自动安装（与事件链同闸门）', acts.includes('install-client-update'), JSON.stringify(acts));
  }
  {
    const acts = [];
    const s = bootShim({
      appInfo: Object.assign({}, APP_INFO, { autoInstallUpdates: true }),
      routes: {
        menu_action: (args) => {
          acts.push(args.action);
          if (args.action === 'check-client-update') return { ok: true, next: '9.9.9' };
          return undefined;
        },
      },
    });
    s.storage.setItem('dsh.sessions.current', JSON.stringify({ sessionId: 'busy' }));
    s.timers.advance(3000); // 3s 轮询读到会话之后再补查
    await flush();
    check('有会话 → 补查只提醒不自动装', !acts.includes('install-client-update'), JSON.stringify(acts));
    check('有会话 → 红点仍打上',
      s.doc.getElementById('dsh-tauri-chrome').querySelector('button.dch-menu-btn').classList.contains('dch-dot'));
  }
  {
    const acts = [];
    const s = bootShim({
      appInfo: APP_INFO,
      pathname: '/loading.html',
      routes: { menu_action: (args) => { acts.push(args.action); return { ok: true, next: '9.9.9' }; } },
    });
    await flush();
    check('壳页（loading.html）不补查（跨 origin 会话态不可信）', acts.length === 0, JSON.stringify(acts));
  }
  {
    const acts = [];
    const s = bootShim({
      appInfo: APP_INFO,
      label: 'float',
      routes: { menu_action: (args) => { acts.push(args.action); return { ok: true, next: '9.9.9' }; } },
    });
    await flush();
    check('非主窗不补查（防浮窗/宠物窗并发安装）', acts.length === 0, JSON.stringify(acts));
  }
  {
    const acts = [];
    const s = bootShim({
      appInfo: APP_INFO,
      routes: { menu_action: (args) => { acts.push(args.action); throw new Error('[UPDATE_CHECK_FAILED] offline'); } },
    });
    await flush();
    check('补查失败静默（不抛异常）', acts.length === 1 && acts[0] === 'check-client-update', JSON.stringify(acts));
    check('补查失败 → 无红点 / 无通知',
      !s.doc.getElementById('dsh-tauri-chrome').querySelector('button.dch-menu-btn').classList.contains('dch-dot')
      && s.count('plugin:notification|notify') === 0);
  }

  // ---- 3.8 拖放悬停层 ----
  console.log('\n[8] 拖放悬停层：enter 创建 / leave+drop 移除 / ESC 残留（现状）');
  {
    const s = bootShim({ appInfo: APP_INFO });
    await flush();
    const HINT = '__dsh_drop_hint__';
    s.emit('client-file-drop', { type: 'enter', count: 3 });
    const d = s.doc.getElementById(HINT);
    check('enter 创建悬停层', !!d && s.doc.body.contains(d));
    check('文案「松开投喂 3 个文件」', d.textContent === '松开投喂 3 个文件');
    s.emit('client-file-drop', { type: 'leave' });
    check('leave 移除悬停层', s.doc.getElementById(HINT) === null);
    s.emit('client-file-drop', { type: 'enter', count: 0 });
    check('enter count=0 文案「松开投喂 文件」', s.doc.getElementById(HINT).textContent === '松开投喂 文件');
    s.emit('client-file-drop', { type: 'drop', files: [] });
    check('drop 移除悬停层', s.doc.getElementById(HINT) === null);
    // ESC：菜单关但悬停层不关 —— 断言现状（bug 记录，不修）
    s.emit('client-file-drop', { type: 'enter', count: 1 });
    s.doc.dispatchEvent({ type: 'keydown', key: 'Escape' });
    check('现状断言：ESC 不移除悬停层（bug：无 Escape 处理）', s.doc.getElementById(HINT) !== null);
    s.emit('client-file-drop', { type: 'leave' });
  }

  // ---- 3.9 心跳 / currentSession 轮询 ----
  console.log('\n[9] 心跳 5s + visibilitychange / currentSession 3s 轮询');
  {
    const s = bootShim({ appInfo: APP_INFO });
    await flush();
    const hb = () => s.count('renderer_heartbeat');
    const base = hb();
    check('装载即发一次心跳', base >= 1);
    s.timers.advance(5000);
    check('5s interval 推进一发', hb() === base + 1);
    s.timers.advance(10000);
    check('10s 推进两发', hb() === base + 3);
    s.doc.dispatchEvent({ type: 'visibilitychange' });
    check('visibilitychange（非 hidden）补报', hb() === base + 4);
    s.doc.hidden = true;
    s.doc.dispatchEvent({ type: 'visibilitychange' });
    check('hidden 时不补报', hb() === base + 4);

    const cs = () => s.calls.filter(c => c.cmd === 'current_session');
    s.storage.setItem('dsh.sessions.current', JSON.stringify({ sessionId: 'sess-1' }));
    s.timers.advance(3000);
    check('会话变化上报 current_session', cs().length === 1 && cs()[0].args.sessionId === 'sess-1');
    s.timers.advance(3000); s.timers.advance(3000);
    check('无变化不重复上报', cs().length === 1);
    s.storage.setItem('dsh.sessions.current', JSON.stringify({ sessionId: 'sess-2' }));
    s.timers.advance(3000);
    check('切换会话再上报新值', cs().length === 2 && cs()[1].args.sessionId === 'sess-2');
    s.storage.setItem('dsh.sessions.current', 'not-json{{{');
    s.timers.advance(3000);
    check('脏数据静默（不炸不报）', cs().length === 2);
  }

  // ---- 3.10 LOADING_HTML 行为 ----
  console.log('\n[10] LOADING_HTML：boot-step 序列 / 字段渲染 / 标题状态机');
  {
    const s = bootPage(LOADING_SCRIPT, { prebuild: ['steps', 'title', 'err'] });
    const stepEl = () => s.doc.getElementById('steps');
    const title = () => s.doc.getElementById('title');
    const err = () => s.doc.getElementById('err');
    title().textContent = '正在启动 DSH 内核…';

    s.emit('boot-step', { name: 'repair', ok: true, ms: 12 });
    let line = stepEl().children[0];
    check('boot-step ok 行（class/text）', line.className === 'ok' && line.textContent === '自愈检查 12ms');
    s.emit('boot-step', { name: 'sync', ok: false, ms: 5, error: 'timeout' });
    line = stepEl().children[1];
    check('boot-step !ok 行（fail + error）', line.className === 'fail' && line.textContent === '伴随插件同步 5ms：timeout');
    s.emit('boot-step', { name: 'spawn', ok: true, ms: 340 });
    check('未知外的步骤名映射（spawn=内核拉起）', stepEl().children[2].textContent === '内核拉起 340ms');
    s.emit('boot-step', { name: 'weird-step', ok: true, ms: 1 });
    check('未映射步骤名原样透传（不 undefined）', stepEl().children[3].textContent === 'weird-step 1ms');
    check('所有行无 "undefined"', !stepEl().textContent.includes('undefined'));
    check('单步 !ok 不翻全局标题', title().textContent === '正在启动 DSH 内核…');
    check('err 区为空', err().textContent === '');

    // 步骤行上限 10
    for (let i = 0; i < 12; i++) s.emit('boot-step', { name: 'preflight', ok: true, ms: i });
    check('步骤区滚动上限 10 行', stepEl().children.length === 10);

    // kernel-fail 防抖：窗口内不翻失败
    s.emit('kernel-fail', { reason: 'crash-loop' });
    check('kernel-fail 即时：标题不翻（防抖内）', title().textContent === '正在启动 DSH 内核…');
    s.timers.advance(1799);
    check('防抖窗口 1799ms 仍未翻', title().textContent === '正在启动 DSH 内核…');
    s.emit('boot-step', { name: 'repair', ok: true, ms: 3 }); // 新尝试取消定时器
    s.timers.advance(5000);
    check('窗口内 boot-step 取消防抖（永不翻失败）',
      title().textContent !== '启动失败（正在转入恢复…）' && err().textContent === '');
    check('新轮 repair 重现 → 第 2 次尝试', title().textContent.includes('第 2 次尝试'));

    // 真终态：到点翻失败
    s.emit('kernel-fail', { reason: 'dead' });
    s.timers.advance(1800);
    check('防抖到点翻终态标题', title().textContent === '启动失败（正在转入恢复…）');
    check('data-fail 标记 + err 文案', title().getAttribute('data-fail') === '1' && err().textContent === 'dead');
    // kernel-fail 后新轮复位
    s.emit('boot-step', { name: 'repair', ok: true, ms: 2 });
    check('kernel-fail 后新轮复位标题（第 3 次尝试）',
      title().textContent.includes('第 3 次尝试') && !title().textContent.includes('失败'));
    check('复位清 data-fail / err', title().getAttribute('data-fail') === null && err().textContent === '');
  }
  {
    // 首轮 repair（roundOpen=false）不算新轮
    const s = bootPage(LOADING_SCRIPT, { prebuild: ['steps', 'title', 'err'] });
    const t = s.doc.getElementById('title');
    t.textContent = '正在启动 DSH 内核…';
    s.emit('boot-step', { name: 'repair', ok: true, ms: 1 });
    check('首轮 repair 不加「第 N 次尝试」', t.textContent === '正在启动 DSH 内核…');
  }

  // ---- 3.11 RECOVERY_HTML 行为 ----
  console.log('\n[11] RECOVERY_HTML：状态读取 / 按钮回调');
  {
    const calls = [];
    let stateResult = Promise.resolve({ reason: '内核崩溃环', crashes: 3 });
    const bridge = {
      recovery: {
        getState: () => { calls.push('getState'); return stateResult; },
        restart: () => { calls.push('restart'); return Promise.resolve({}); },
        reload: () => { calls.push('reload'); return Promise.resolve({}); },
        openLogs: () => { calls.push('openLogs'); return Promise.resolve({}); }
      }
    };
    const s = bootPage(RECOVERY_SCRIPT, { dshDesktop: bridge, prebuild: ['why'] });
    const why = s.doc.getElementById('why');
    await flush();
    check('初始状态读取', calls[0] === 'getState');
    check('why 渲染：原因 + 崩溃次数 + 指引', why.textContent.includes('原因：内核崩溃环')
      && why.textContent.includes('本次累计异常退出：3 次') && why.textContent.includes('导出日志'));
    check('无 undefined', !why.textContent.includes('undefined'));

    // 按钮回调（onclick="doRestart()" 等内联 → 直接调全局）
    s.win.doRestart();
    await flush();
    check('doRestart → recovery.restart + 再刷新', calls.includes('restart') && calls.filter(c => c === 'getState').length >= 2);
    s.win.doReload();
    s.win.doLogs();
    check('doReload/doLogs → 契约调用', calls.includes('reload') && calls.includes('openLogs'));

    // 读取失败路径
    const s2why = why;
    stateResult = Promise.reject(new Error('bridge-down'));
    const s2 = s;
    s2.win.doRestart(); // restart resolve → refresh → getState reject
    await flush();
    check('状态读取失败 → 「状态读取失败：」', s2why.textContent.includes('状态读取失败：'));
  }

  // ---- 3.12 外链点击委托：<a target="_blank"> http(s) → open_external ----
  console.log('\n[12] 外链点击委托：<a target="_blank"> http(s) → open_external');
  {
    const s = bootShim({ appInfo: APP_INFO });
    await flush();
    const mkAnchor = (attrs) => {
      const a = s.doc.createElement('a');
      for (const [k, v] of Object.entries(attrs)) a.setAttribute(k, v);
      s.doc.body.appendChild(a);
      return a;
    };
    // 正向：余额充值外链（target=_blank + https）→ open_external + preventDefault
    const topup = mkAnchor({ href: 'https://platform.deepseek.com/top_up', target: '_blank', rel: 'noopener noreferrer' });
    let prevented = 0;
    s.doc.dispatchEvent({ type: 'click', target: topup, preventDefault() { prevented++; } });
    await flush();
    const call = s.last('open_external');
    check('https 外链 → open_external(top_up)', !!call && call.args.url === 'https://platform.deepseek.com/top_up', call && JSON.stringify(call.args));
    check('外链点击已 preventDefault（阻止原生导航）', prevented === 1);

    // 正向：命中 <span> 子元素也经祖先 <a> 拦截（closest-a 向上遍历）
    const child = s.doc.createElement('span');
    topup.appendChild(child);
    let prevented2 = 0;
    s.doc.dispatchEvent({ type: 'click', target: child, preventDefault() { prevented2++; } });
    await flush();
    check('点击 <span> 子元素 → 仍拦截到祖先 <a>', s.count('open_external') === 2 && prevented2 === 1);

    // 负向：无 target 的 <a>（同站导航）→ 不拦
    const noTarget = mkAnchor({ href: 'https://example.com/x' });
    s.doc.dispatchEvent({ type: 'click', target: noTarget, preventDefault() {} });
    await flush();
    check('无 target 的 <a> 不拦截', s.count('open_external') === 2);

    // 负向：内核同源 127.0.0.1（target=_blank）→ 不拦（内部导航放行）
    const internal = mkAnchor({ href: 'http://127.0.0.1:4000/chat', target: '_blank' });
    s.doc.dispatchEvent({ type: 'click', target: internal, preventDefault() {} });
    await flush();
    check('127.0.0.1 内核内链不拦截', s.count('open_external') === 2);

    // 负向：非 http(s) 协议（mailto:）target=_blank → 不拦
    const mailto = mkAnchor({ href: 'mailto:a@b.c', target: '_blank' });
    s.doc.dispatchEvent({ type: 'click', target: mailto, preventDefault() {} });
    await flush();
    check('mailto: 外链不拦截', s.count('open_external') === 2);
  }

  // ---- 汇总 ----
  console.log(`\n===== TA5 DOM 行为测试：${pass} ok, ${fail} FAIL =====`);
  if (fail > 0) process.exitCode = 1;
}

main().catch(e => { console.error('测试框架异常：', e); process.exitCode = 1; });
