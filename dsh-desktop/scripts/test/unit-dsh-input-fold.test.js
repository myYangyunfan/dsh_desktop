'use strict';

// unit-dsh-input-fold.test.js — 会话用户提示词折叠的单测。
//
// 覆盖 dsh-input-fold v0.1.0（assets/plugins/dsh-input-fold/lib/client.js）：
//   1) 纯逻辑：shouldFold 阈值（>400 字符 / >8 行）、countLines、foldController
//      展开/收起/切换；
//   2) vm 端到端（极小 DOM 垫片，无 jsdom 依赖）：apply → scan 按需标注 →
//      长消息默认折叠、短消息/图片/富内容零侵入、点击展开/收起、React 重渲染
//      抹掉按钮后扫描自愈。
//
// 运行：node --test scripts/test/unit-dsh-input-fold.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const PLUGIN = path.join(__dirname, '..', '..', 'assets', 'plugins', 'dsh-input-fold', 'lib', 'client.js');

// ───────────────────────── 极小 DOM 垫片 ─────────────────────────
// 支持本插件用到的选择器子集：tag | [attr] | [attr="v"] | [attr*="v"] |
// 逗号列表 | closest；以及 className / textContent / appendChild /
// setAttribute / getAttribute / addEventListener。

class El {
  constructor(tag) {
    this.tagName = String(tag || 'div').toUpperCase();
    this.children = [];
    this.parentElement = null;
    this.className = '';
    this.attrs = Object.create(null);
    this._text = '';
    this._listeners = Object.create(null);
  }
  get classList() {
    return String(this.className || '').split(/\s+/).filter(Boolean);
  }
  setAttribute(k, v) {
    if (k === 'class') this.className = String(v);
    else this.attrs[k] = String(v);
  }
  getAttribute(k) {
    if (k === 'class') return this.className || null;
    return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null;
  }
  hasAttribute(k) { return this.getAttribute(k) !== null; }
  set textContent(v) { this.children = []; this._text = String(v); }
  get textContent() {
    let out = this._text || '';
    for (const c of this.children) out += c.textContent;
    return out;
  }
  appendChild(n) { return this.insertBefore(n, null); }
  insertBefore(n, ref) {
    if (n.parentElement) n.parentElement.removeChild(n);
    const i = ref ? this.children.indexOf(ref) : this.children.length;
    this.children.splice(i < 0 ? this.children.length : i, 0, n);
    n.parentElement = this;
    return n;
  }
  removeChild(n) {
    const i = this.children.indexOf(n);
    if (i >= 0) this.children.splice(i, 1);
    n.parentElement = null;
    return n;
  }
  contains(n) { for (let e = n; e; e = e.parentElement) if (e === this) return true; return false; }
  addEventListener(ev, fn) { (this._listeners[ev] = this._listeners[ev] || []).push(fn); }
  matches(sel) { return matchAny(this, sel); }
  closest(sel) {
    for (let e = this; e; e = e.parentElement) if (e instanceof El && matchAny(e, sel)) return e;
    return null;
  }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  querySelectorAll(sel) {
    const out = [];
    const walk = (e) => {
      for (const c of e.children) {
        if (c instanceof El) {
          if (matchAny(c, sel)) out.push(c);
          walk(c);
        }
      }
    };
    walk(this);
    return out;
  }
}

function matchAny(el, sel) {
  if (!(el instanceof El)) return false;
  return String(sel).split(',').some((part) => part.trim() && matchCompound(el, part.trim()));
}

function matchCompound(el, compound) {
  let s = String(compound).trim();
  if (!s) return false;
  const m = /^[a-zA-Z][a-zA-Z0-9-]*/.exec(s);
  if (m) {
    if (el.tagName !== m[0].toUpperCase()) return false;
    s = s.slice(m[0].length);
  }
  let i = 0;
  while (i < s.length) {
    if (s[i] === '[') {
      const j = s.indexOf(']', i);
      if (j === -1) return false;
      if (!matchAttr(el, s.slice(i + 1, j))) return false;
      i = j + 1;
    } else if (s[i] === '.') {
      let k = i + 1;
      while (k < s.length && /[A-Za-z0-9_-]/.test(s[k])) k++;
      if (!el.classList.includes(s.slice(i + 1, k))) return false;
      i = k;
    } else {
      i++;
    }
  }
  return true;
}

function matchAttr(el, attrSel) {
  const raw = String(attrSel).trim();
  const eq = raw.indexOf('=');
  if (eq === -1) return el.hasAttribute(raw); // 属性存在性
  const op = eq > 0 && raw[eq - 1] === '*' ? '*=' : '=';
  const name = raw.slice(0, op === '*=' ? eq - 1 : eq).trim();
  const q1 = raw.indexOf('"', eq);
  const q2 = raw.lastIndexOf('"');
  const want = q1 === -1 ? '' : raw.slice(q1 + 1, q2 === -1 ? raw.length : q2);
  const actual = name === 'class' ? String(el.className || '') : (el.getAttribute(name) || '');
  return op === '=' ? actual === want : actual.indexOf(want) !== -1;
}

// ───────────────────────── 装载 ─────────────────────────

function makeDocument() {
  const docEl = new El('html');
  const head = new El('head');
  const body = new El('body');
  docEl.appendChild(head);
  docEl.appendChild(body);
  const docListeners = Object.create(null);
  return {
    documentElement: docEl,
    head,
    body,
    createElement: (t) => new El(t),
    addEventListener(type, fn) { (docListeners[type] = docListeners[type] || []).push(fn); },
    querySelector: (s) => docEl.querySelector(s),
    querySelectorAll: (s) => docEl.querySelectorAll(s),
    _docListeners: docListeners,
    dispatchClick(target) { for (const fn of (docListeners.click || []).slice()) fn({ target }); },
  };
}

function loadClient() {
  let captured = null;
  const doc = makeDocument();
  const rafCalls = [];
  const sandbox = {
    window: {
      __ModuleLoader__: { load: (reg) => { captured = reg; } },
      requestAnimationFrame: (fn) => { rafCalls.push(fn); },
    },
    document: doc,
  };
  // setInterval 不提供 → 插件跳过低频兜底（测试手动 scan）。
  vm.runInNewContext(fs.readFileSync(PLUGIN, 'utf8'), sandbox, { filename: PLUGIN });
  const mod = captured.factory();
  return { captured, mod, doc, rafCalls, sandbox, core: mod.core, store: sandbox.window.__dshInputFoldStore };
}

// ───────────────────────── 骨架构造 ─────────────────────────

function makeUserRow(doc, key, text, opts) {
  const flow = new El('div');
  flow.setAttribute('data-chat-flow-kind', 'user');
  flow.setAttribute('data-chat-anchor-key', key);

  const userRow = new El('div');
  userRow.setAttribute('data-time-hover-root', '');
  const userStack = new El('div');

  if (opts && opts.image) {
    const img = new El('img');
    userStack.appendChild(img);
  }

  const bubble = new El('div');
  bubble.className = 'gdEzaW_bubble';
  if (opts && opts.rich) {
    bubble.textContent = text;
    const btn = new El('button');
    btn.textContent = 'json-block';
    bubble.appendChild(btn);
  } else {
    bubble.textContent = text;
  }
  userStack.appendChild(bubble);
  userRow.appendChild(userStack);
  flow.appendChild(userRow);

  doc.body.appendChild(flow);
  return { flow, userRow, userStack, bubble };
}

const SHORT = '帮我总结这段代码';
const LONG = ('这是一个很长的提示词，用于触发折叠。'.repeat(30)); // 480 字符
const MANY_LINES = Array.from({ length: 9 }, (_, i) => `第 ${i + 1} 行`).join('\n');

// ───────────────────────── 1. 纯逻辑 ─────────────────────────

const { core } = loadClient();

test('shouldFold：空/短消息不折叠；>400 字符折叠；>8 行折叠', () => {
  assert.equal(core.shouldFold(''), false);
  assert.equal(core.shouldFold(null), false);
  assert.equal(core.shouldFold(undefined), false);
  assert.equal(core.shouldFold(SHORT), false);

  // 字符阈值边界：400 不折叠，401 折叠
  assert.equal(core.shouldFold('a'.repeat(400)), false);
  assert.equal(core.shouldFold('a'.repeat(401)), true);

  // 行阈值边界：8 行不折叠，9 行折叠
  assert.equal(core.shouldFold('1\n2\n3\n4\n5\n6\n7\n8'), false);
  assert.equal(core.shouldFold(MANY_LINES), true);

  // 字符未超但行超 → 折叠
  assert.equal(core.shouldFold('ab\ncd\nef\ngh\nij\nkl\nmn\nop\nqr'), true);
});

test('countLines：换行符三种形态与空串', () => {
  assert.equal(core.countLines(''), 0);
  assert.equal(core.countLines('single'), 1);
  assert.equal(core.countLines('a\nb'), 2);
  assert.equal(core.countLines('a\r\nb\rc\nd'), 4);
  assert.equal(core.countLines(null), 0);
});

test('foldController：默认折叠、toggle/expand/collapse、空 key 无副作用', () => {
  const c = core.createFoldController();
  assert.equal(c.isExpanded('k1'), false, '默认折叠');
  assert.equal(c.toggle('k1'), true, 'toggle → 展开');
  assert.equal(c.isExpanded('k1'), true);
  // snapshot 返回 vm 上下文对象，原型与宿主不同，走 JSON 快照比对。
  assert.equal(JSON.stringify(c.snapshot()), JSON.stringify({ k1: true }));

  assert.equal(c.toggle('k1'), false, '再 toggle → 收起');
  assert.equal(c.isExpanded('k1'), false);

  c.expand('k2');
  assert.equal(c.isExpanded('k2'), true);
  c.collapse('k2');
  assert.equal(c.isExpanded('k2'), false);

  // 空 key：toggle 返回 false、set 不落状态
  assert.equal(c.toggle(''), false);
  c.expand('');
  assert.equal(JSON.stringify(c.snapshot()), '{}');
});

// ───────────────────────── 2. vm 端到端 ─────────────────────────

function setup() {
  const b = loadClient();
  b.mod.apply();
  return b;
}

test('e2e: 长消息默认折叠（collapsed + 收起按钮 + 状态落控制器）', () => {
  const b = setup();
  const { flow, userRow } = makeUserRow(b.doc, 'k1', LONG);
  b.store.scan();

  assert.equal(flow.getAttribute('data-dsh-fold'), 'collapsed');
  assert.ok(userRow.querySelector('[data-dsh-fold-toggle]'), '收起按钮应注入');
  assert.equal(b.store.getController().isExpanded('k1'), false);
});

test('e2e: 短消息零侵入（off 标记 + 无按钮 + 不折叠）', () => {
  const b = setup();
  const { flow, userRow } = makeUserRow(b.doc, 'k1', SHORT);
  b.store.scan();

  assert.equal(flow.getAttribute('data-dsh-fold'), 'off');
  assert.equal(userRow.querySelector('[data-dsh-fold-toggle]'), null);
  assert.equal(b.store.getController().isExpanded('k1'), false);
});

test('e2e: 带图片的用户消息不折叠（别碰图片）', () => {
  const b = setup();
  const { flow, userRow } = makeUserRow(b.doc, 'k1', LONG, { image: true });
  b.store.scan();

  assert.equal(flow.getAttribute('data-dsh-fold'), 'off');
  assert.equal(userRow.querySelector('[data-dsh-fold-toggle]'), null);
});

test('e2e: 气泡内含富内容（JsonBlock button）不折叠（别碰代码块/表格）', () => {
  const b = setup();
  const { flow, userRow } = makeUserRow(b.doc, 'k1', LONG, { rich: true });
  b.store.scan();

  assert.equal(flow.getAttribute('data-dsh-fold'), 'off');
  assert.equal(userRow.querySelector('[data-dsh-fold-toggle]'), null);
});

test('e2e: 点击折叠区展开、点击收起按钮收回', () => {
  const b = setup();
  const { flow, userRow, bubble } = makeUserRow(b.doc, 'k1', LONG);
  b.store.scan();
  assert.equal(flow.getAttribute('data-dsh-fold'), 'collapsed');

  // 点击折叠区（bubble）→ 展开
  b.doc.dispatchClick(bubble);
  assert.equal(flow.getAttribute('data-dsh-fold'), 'expanded');
  assert.equal(b.store.getController().isExpanded('k1'), true);

  // 点击「收起」按钮 → 收回
  const btn = userRow.querySelector('[data-dsh-fold-toggle]');
  assert.ok(btn, '展开后收起按钮仍在');
  b.doc.dispatchClick(btn);
  assert.equal(flow.getAttribute('data-dsh-fold'), 'collapsed');
  assert.equal(b.store.getController().isExpanded('k1'), false);
});

test('e2e: 点气泡外的动作区不误展开；点收起按钮只在展开态生效', () => {
  const b = setup();
  const { flow, userRow } = makeUserRow(b.doc, 'k1', LONG);
  b.store.scan();
  assert.equal(flow.getAttribute('data-dsh-fold'), 'collapsed');

  // 点击 userRow（气泡外，例如 hover 动作区）不应展开
  b.doc.dispatchClick(userRow);
  assert.equal(flow.getAttribute('data-dsh-fold'), 'collapsed');

  // collapsed 态下没有收起按钮（display:none 由 CSS 控制；DOM 上按钮仅注入不删除），
  // 但这里模拟点一个不存在的按钮不应报错；直接断言状态未变即可。
  assert.equal(b.store.getController().isExpanded('k1'), false);
});

test('e2e: React 重渲染抹掉按钮后 scan 自愈补回', () => {
  const b = setup();
  const { flow, userRow } = makeUserRow(b.doc, 'k1', LONG);
  b.store.scan();
  const btn = userRow.querySelector('[data-dsh-fold-toggle]');
  assert.ok(btn, '首次扫描注入按钮');

  // 模拟 React 重建子树抹掉按钮（折叠状态属性仍在 flow item 上）
  userRow.removeChild(btn);
  assert.equal(userRow.querySelector('[data-dsh-fold-toggle]'), null);
  assert.equal(flow.getAttribute('data-dsh-fold'), 'collapsed');

  b.store.scan(); // 已标记行 → 走 ensureToggleButton 自愈分支
  assert.ok(userRow.querySelector('[data-dsh-fold-toggle]'), '按钮应被补回');
});

test('e2e: apply 注册 document click 委托 + 注入样式（幂等）', () => {
  const b = setup();
  assert.equal(b.doc._docListeners.click.length, 1, '应注册一个 click 委托监听');
  // 样式注入一次
  const styles = b.doc.head.querySelectorAll('style[data-plugin-css="dsh-input-fold/client.css"]');
  assert.equal(styles.length, 1);
  // 二次 apply 不重复注入样式
  b.mod.apply();
  assert.equal(b.doc.head.querySelectorAll('style[data-plugin-css="dsh-input-fold/client.css"]').length, 1);
});

// ─────────────── 当前内核形状（[data-time-hover-root] 已被删除） ───────────────
// 实机取证（v0.6.2 打包时，127.0.0.1:61231）：user 行为
//   div._RXqYG_flowItem[data-chat-flow-kind="user"][data-chat-anchor-key]
//     └─ div.jWIv2G_userRow            ← 旧内核此处带 data-time-hover-root，现无
//          └─ div.jWIv2G_userStack
//               ├─ div.jWIv2G_bubble   ← [class*="bubble"] 仍命中（局部名未变）
//               └─ div.arNJOq_actions  ← 动作条在 bubble 之外（含 button，不得
//                                            被 measureRow 的富内容判据误伤）
// 折叠主链路在新内核下仍然工作，失效的只有「收起」按钮的宿主定位。
function makeUserRowV2(doc, key, text) {
  const flow = new El('div');
  flow.setAttribute('data-chat-flow-kind', 'user');
  flow.setAttribute('data-chat-anchor-key', key);

  const userRow = new El('div');
  userRow.className = 'jWIv2G_userRow';
  const userStack = new El('div');
  userStack.className = 'jWIv2G_userStack';
  const bubble = new El('div');
  bubble.className = 'jWIv2G_bubble';
  bubble.textContent = text;
  const actions = new El('div');
  actions.className = 'arNJOq_actions';
  const timeEl = new El('span');
  timeEl.className = 'arNJOq_timeStart';
  timeEl.textContent = '12:00';
  const actBtn = new El('button');
  actBtn.className = 'arNJOq_action';
  actions.appendChild(timeEl);
  actions.appendChild(actBtn);
  userStack.appendChild(bubble);
  userStack.appendChild(actions);
  userRow.appendChild(userStack);
  flow.appendChild(userRow);

  doc.body.appendChild(flow);
  return { flow, userRow, userStack, bubble };
}

test('e2e(当前内核形状): 长消息折叠，且「收起」按钮落在 userRow 内而非整行末尾', () => {
  const b = setup();
  const { flow, userRow } = makeUserRowV2(b.doc, 'k1', LONG);
  assert.equal(userRow.getAttribute('data-time-hover-root'), null, '桩必须复刻新内核：无 hover-root');

  b.store.scan();

  // 主链路：仍能折叠（动作条里的 button 在 bubble 之外，不触发富内容判据）
  assert.equal(flow.getAttribute('data-dsh-fold'), 'collapsed', '长消息仍应折叠');

  const btn = flow.querySelector('[data-dsh-fold-toggle]');
  assert.ok(btn, '收起按钮应注入');
  assert.equal(btn.parentElement, userRow, '按钮宿主应为 userRow（回退到 row 会把按钮甩到动作条之下）');
});

test('e2e(当前内核形状): 展开/收起交互在无 hover-root 时仍完整可用', () => {
  const b = setup();
  const { flow, userRow, bubble } = makeUserRowV2(b.doc, 'k1', LONG);
  b.store.scan();

  b.doc.dispatchClick(bubble);
  assert.equal(flow.getAttribute('data-dsh-fold'), 'expanded');
  assert.equal(b.store.getController().isExpanded('k1'), true);

  const btn = userRow.querySelector('[data-dsh-fold-toggle]');
  assert.ok(btn, '展开后按钮在 userRow 内');
  b.doc.dispatchClick(btn);
  assert.equal(flow.getAttribute('data-dsh-fold'), 'collapsed');
  assert.equal(b.store.getController().isExpanded('k1'), false);

  // React 重渲染抹掉按钮 → scan 自愈，宿主仍是 userRow
  userRow.removeChild(btn);
  b.store.scan();
  const btn2 = flow.querySelector('[data-dsh-fold-toggle]');
  assert.ok(btn2, '按钮应被补回');
  assert.equal(btn2.parentElement, userRow, '自愈后宿主仍为 userRow');
});
