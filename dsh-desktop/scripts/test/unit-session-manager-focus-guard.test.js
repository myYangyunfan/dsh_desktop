'use strict';

// dsh-session-manager 焦点兜底单测（node --test）。
//
// 回归背景（用户实测 bug）：删除「非当前」会话后，当前输入框光标消失但仍可
// 输入。根因是官方 composer 的 focus effect 只依赖 [locked, sessionId]，而
// 点行菜单删除按钮造成的「同会话内失焦」不在覆盖范围。兜底订阅 sessions.list：
// 检测到有会话被删且当前会话未变 → 双 rAF 后把焦点与光标补回 composer 输入框。
// 这里只测纯函数（无 DOM / 不跑 rAF 时序），DOM 侧注入 fake document。
//
// 注意：插件是 "type": "module" 包，node 直接 require 其 .js 会
// ERR_REQUIRE_ESM，故用 VM 沙箱 + window.__ModuleLoader__ stub 加载。
// 用法：node --test scripts/test/unit-session-manager-focus-guard.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const CLIENT_SRC = path.join(__dirname, '..', '..', 'assets', 'plugins', 'dsh-session-manager', 'lib', 'client.js');

// ---------------------------------------------------------------------------
// 加载插件 client 模块（stub 掉 react / __ModuleLoader__，只取纯函数导出）
// ---------------------------------------------------------------------------
function loadClientModule() {
  const code = fs.readFileSync(CLIENT_SRC, 'utf8');
  let loaded = null;
  const sandbox = {
    console,
    window: {
      __ModuleLoader__: {
        load(entry) {
          const fakeRequire = (id) => {
            if (id === 'react') return { useState: () => [], useEffect: () => {} };
            if (id === 'react/jsx-runtime') return { jsx: () => {}, jsxs: () => {} };
            if (id === '@deepseek-ai/dsh-client-web-react') return { bindSnapshotSelector: () => () => {} };
            if (id === '@deepseek-ai/dsh-client-ui-primitives') return { Button: () => {} };
            throw new Error('unexpected require: ' + id);
          };
          loaded = entry.factory(fakeRequire);
        }
      }
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: 'dsh-session-manager/client.js' });
  return loaded;
}

const CLIENT = loadClientModule();
const { shouldRestoreFocusAfterRemoval, restoreComposerFocus } = CLIENT.focusGuard;

// ---------------------------------------------------------------------------
// fake DOM 帮手
// ---------------------------------------------------------------------------
function makeTextarea(overrides) {
  const ta = {
    disabled: false,
    readOnly: false,
    value: 'hello',
    selectionStart: 0,
    selectionEnd: 0,
    focusCalls: 0,
    focus(opts) { this.focusCalls += 1; this.focusOpts = opts; },
    setSelectionRange(a, b) { this.selectionStart = a; this.selectionEnd = b; }
  };
  return Object.assign(ta, overrides);
}

function makeDoc(opts = {}) {
  const textarea = opts.textarea === undefined ? makeTextarea() : opts.textarea;
  const wrap = { querySelector: (sel) => (sel === 'textarea' ? textarea : null) };
  return {
    body: {},
    documentElement: {},
    activeElement: opts.activeElement === undefined ? null : opts.activeElement,
    querySelector: (sel) => (sel === '[data-input-scroll]' ? wrap : null)
  };
}

function snap(overrides) {
  return Object.assign({ ids: [], byId: {}, current: void 0, phase: 'ready' }, overrides);
}

// ---------------------------------------------------------------------------
// shouldRestoreFocusAfterRemoval：决策纯函数
// ---------------------------------------------------------------------------
test('决策：删除非当前会话（current 不变）应补焦', () => {
  const prev = snap({ ids: ['a', 'b', 'c'], current: 'a' });
  const next = snap({ ids: ['a', 'c'], current: 'a' });
  assert.equal(shouldRestoreFocusAfterRemoval(prev, next), true);
});

test('决策：删除当前会话（current 跟随变化）不应补焦', () => {
  const prev = snap({ ids: ['a', 'b', 'c'], current: 'b' });
  const next = snap({ ids: ['a', 'c'], current: 'a' });
  assert.equal(shouldRestoreFocusAfterRemoval(prev, next), false);
});

test('决策：删除当前会话（current 变 void 0，hero 化）不应补焦', () => {
  const prev = snap({ ids: ['a', 'b'], current: 'b' });
  const next = snap({ ids: ['a'], current: void 0 });
  assert.equal(shouldRestoreFocusAfterRemoval(prev, next), false);
});

test('决策：无会话被删（归档/仅更新/新增）不应补焦', () => {
  const prev = snap({ ids: ['a', 'b'], current: 'a' });
  assert.equal(shouldRestoreFocusAfterRemoval(prev, snap({ ids: ['a', 'b'], current: 'a' })), false);
  assert.equal(shouldRestoreFocusAfterRemoval(prev, snap({ ids: ['a', 'b', 'c'], current: 'a' })), false);
});

test('决策：列表未就绪（phase=pending）不应补焦', () => {
  const prev = snap({ ids: ['a', 'b'], current: 'a' });
  const next = snap({ ids: ['a'], current: 'a', phase: 'pending' });
  assert.equal(shouldRestoreFocusAfterRemoval(prev, next), false);
});

test('决策：空/非法快照不应补焦且不抛异常', () => {
  assert.equal(shouldRestoreFocusAfterRemoval(null, snap({ ids: ['a'] })), false);
  assert.equal(shouldRestoreFocusAfterRemoval(snap({ ids: ['a'] }), null), false);
  assert.equal(shouldRestoreFocusAfterRemoval(undefined, undefined), false);
});

// ---------------------------------------------------------------------------
// restoreComposerFocus：补焦动作（注入 fake document）
// ---------------------------------------------------------------------------
test('恢复：输入框可编辑且焦点不在输入控件 → 补焦并置光标到末尾', () => {
  const textarea = makeTextarea({ value: 'user 消息内容' });
  const doc = makeDoc({ textarea, activeElement: { tagName: 'BUTTON' } });
  assert.equal(restoreComposerFocus(doc), true);
  assert.equal(textarea.focusCalls, 1);
  assert.equal(textarea.focusOpts.preventScroll, true, '应禁止滚动（防止视口跳动）');
  assert.equal(textarea.selectionStart, 'user 消息内容'.length);
  assert.equal(textarea.selectionEnd, 'user 消息内容'.length);
});

test('恢复：焦点在 body（完全无焦点目标）→ 补焦', () => {
  const textarea = makeTextarea();
  const doc = makeDoc({ textarea, activeElement: { tagName: 'BODY' } });
  assert.equal(restoreComposerFocus(doc), true);
  assert.equal(textarea.focusCalls, 1);
});

test('恢复：textarea disabled（removed/无会话禁用）→ 不补焦', () => {
  const textarea = makeTextarea({ disabled: true });
  const doc = makeDoc({ textarea });
  assert.equal(restoreComposerFocus(doc), false);
  assert.equal(textarea.focusCalls, 0);
});

test('恢复：textarea readOnly（hero / 机器忙）→ 不补焦', () => {
  const textarea = makeTextarea({ readOnly: true });
  const doc = makeDoc({ textarea });
  assert.equal(restoreComposerFocus(doc), false);
  assert.equal(textarea.focusCalls, 0);
});

test('恢复：焦点已在输入控件（用户正在输入）→ 不抢焦', () => {
  const textarea = makeTextarea();
  const active = { tagName: 'TEXTAREA' };
  const doc = makeDoc({ textarea, activeElement: active });
  assert.equal(restoreComposerFocus(doc), false);
  assert.equal(textarea.focusCalls, 0);
  const doc2 = makeDoc({ textarea, activeElement: { tagName: 'INPUT' } });
  assert.equal(restoreComposerFocus(doc2), false);
  const doc3 = makeDoc({ textarea, activeElement: { tagName: 'DIV', isContentEditable: true } });
  assert.equal(restoreComposerFocus(doc3), false);
});

test('恢复：无 composer（设置页/非对话视图）→ 不动作', () => {
  const doc = {
    body: {}, documentElement: {}, activeElement: null,
    querySelector: () => null
  };
  assert.equal(restoreComposerFocus(doc), false);
  assert.equal(restoreComposerFocus(null), false);
});

test('恢复：空值 textarea（selection 不支持）不抛异常', () => {
  const textarea = makeTextarea();
  textarea.setSelectionRange = () => { throw new Error('no selection'); };
  const doc = makeDoc({ textarea });
  assert.equal(restoreComposerFocus(doc), true, '焦点仍应恢复，selection 失败可忽略');
});

// ---------------------------------------------------------------------------
// 当前内核：composer 是 Lexical contenteditable div（不再有 <textarea>）
// ---------------------------------------------------------------------------
function makeEditable(overrides) {
  const el = {
    tagName: 'DIV',
    isContentEditable: true,
    textContent: '回退实测',
    disabled: false,
    readOnly: false,
    focusCalls: 0,
    _attrs: { contenteditable: 'true' },
    getAttribute(name) { return name in this._attrs ? this._attrs[name] : null; },
    focus(opts) { this.focusCalls += 1; this.focusOpts = opts; }
  };
  return Object.assign(el, overrides);
}

/** 造一个「新内核」document：wrap 里只有 contenteditable，没有 textarea。 */
function makeDocV2(opts = {}) {
  const field = opts.field === undefined ? makeEditable() : opts.field;
  const ranges = [];
  const wrap = {
    querySelector: (sel) => {
      if (sel === 'textarea') return null;
      if (sel === '[data-composer-input]') return field.getAttribute('contenteditable') === 'false' ? null : field;
      if (sel === '[contenteditable]') return field;
      return null;
    }
  };
  return {
    body: {},
    documentElement: {},
    activeElement: opts.activeElement === undefined ? null : opts.activeElement,
    querySelector: (sel) => (sel === '[data-input-scroll]' ? wrap : null),
    createRange: () => ({
      _collapsed: null,
      selectNodeContents(el) { this.node = el; },
      collapse(toStart) { this._collapsed = !toStart; }
    }),
    defaultView: {
      getSelection: () => ({
        removeAllRanges() { ranges.push('remove'); },
        addRange(r) { ranges.push(r); }
      })
    },
    _ranges: ranges
  };
}

test('恢复（新内核）：只有 contenteditable 时仍应补焦 —— 修前此处恒返回 false', () => {
  const field = makeEditable();
  const doc = makeDocV2({ field, activeElement: { tagName: 'BUTTON' } });
  assert.equal(restoreComposerFocus(doc), true, 'composer 换成 contenteditable 后补焦不得静默失效');
  assert.equal(field.focusCalls, 1);
  assert.equal(field.focusOpts.preventScroll, true);
  const added = doc._ranges.filter((r) => r !== 'remove');
  assert.equal(added.length, 1, '应经 Range 把光标放到末尾');
  assert.equal(added[0]._collapsed, true, 'collapse(false) = 置末尾');
  assert.equal(added[0].node, field, 'Range 应落在 composer 自身');
});

test('恢复（新内核）：contenteditable="false"（禁用/机器忙）→ 不抢焦点', () => {
  const field = makeEditable({ getAttribute(name) { return name === 'contenteditable' ? 'false' : null; } });
  const doc = makeDocV2({ field });
  // wrap 按属性契约查不到可编辑元素 → 等价于「无输入框」
  assert.equal(restoreComposerFocus(doc), false);
  assert.equal(field.focusCalls, 0);
});

test('恢复（新内核）：焦点已在 contenteditable 上 → 不重复抢焦', () => {
  const field = makeEditable();
  const doc = makeDocV2({ field, activeElement: field });
  assert.equal(restoreComposerFocus(doc), false);
  assert.equal(field.focusCalls, 0);
});

test('恢复：wrap 里既无 textarea 也无可编辑区（非对话视图）→ 不动作', () => {
  const wrap = { querySelector: () => null };
  const doc = { body: {}, documentElement: {}, activeElement: null, querySelector: (sel) => (sel === '[data-input-scroll]' ? wrap : null) };
  assert.equal(restoreComposerFocus(doc), false);
});

test('恢复：桩 document 无 createRange（旧宿主/测试环境）→ 仍补焦，不抛异常', () => {
  const field = makeEditable();
  const wrap = { querySelector: (sel) => (sel === 'textarea' ? null : field) };
  const doc = { body: {}, documentElement: {}, activeElement: null, querySelector: () => wrap };
  assert.equal(restoreComposerFocus(doc), true);
  assert.equal(field.focusCalls, 1);
});

// ---------------------------------------------------------------------------
// 装配冒烟：导出形状防止重构漂移
// ---------------------------------------------------------------------------
test('装配：client 导出 apply/inject/sessions 注入与 focusGuard 纯函数', () => {
  assert.equal(typeof CLIENT.apply, 'function');
  assert.ok(CLIENT.inject.includes('sessions'), '兜底依赖 sessions 服务注入');
  assert.ok(CLIENT.inject.includes('slots'));
  assert.equal(typeof CLIENT.focusGuard.shouldRestoreFocusAfterRemoval, 'function');
  assert.equal(typeof CLIENT.focusGuard.restoreComposerFocus, 'function');
});