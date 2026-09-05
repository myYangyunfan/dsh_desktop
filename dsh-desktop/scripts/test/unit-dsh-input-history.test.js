'use strict';

// unit-dsh-input-history.test.js — 终端式上下键命令历史回溯的单测。
//
// 覆盖 dsh-input-history v0.1.0（assets/plugins/dsh-input-history/lib/client.js）：
//   1) 纯逻辑：历史导航状态机（↑ 推进 / ↓ 回退 / 越界回空 / 编辑复位 /
//      临时第 0 条 / setHistory 去重不打断导航）；
//   2) 真实消息提取（session.chat.nodes + order，跳过非 user / 纯图消息）；
//   3) vm 端到端：factory 物化 + apply 注册槽位与全局监听 →
//      空草稿才触发 ↑ / 回溯中 ↓ 翻回 / ↓ 越界回空 / 手动编辑复位 /
//      回车与 submit 两条发送路径都记录历史 / 按会话隔离。
//
// 运行：node --test scripts/test/unit-dsh-input-history.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const PLUGIN = path.join(__dirname, '..', '..', 'assets', 'plugins', 'dsh-input-history', 'lib', 'client.js');

/** 在 vm sandbox 里执行 client.js，捕获 __ModuleLoader__.load 注册。 */
function loadClient(file, extraSandbox) {
  let captured = null;
  const baseWindow = { __ModuleLoader__: { load: (reg) => { captured = reg; } } };
  const sandbox = Object.assign({}, extraSandbox || {});
  sandbox.window = Object.assign(baseWindow, sandbox.window || {});
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), sandbox, { filename: file });
  return { captured, sandbox };
}

// rc8 式 require（种子表），返回可控 stub。
function makeRequire(stubs) {
  return (spec) => {
    if (stubs && Object.prototype.hasOwnProperty.call(stubs, spec)) return stubs[spec];
    throw new Error(`missed module: ${spec}`);
  };
}

// 最小 React stub（本插件只消费 useRef/useEffect）。
function makeReactStub() {
  return {
    Fragment: Symbol('fragment'),
    createElement: (tag, props, ...children) => ({ tag, props: props || {}, children }),
    useRef: (v) => ({ current: v }),
    useState: (v) => [v, () => {}],
    useEffect: (fn) => { fn(); return () => {}; },
  };
}

// ---------------------------------------------------------------------------
// 0) 加载 + 纯逻辑面暴露
// ---------------------------------------------------------------------------

const { captured } = loadClient(PLUGIN);
assert.ok(captured && typeof captured.factory === 'function', '应经 __ModuleLoader__.load 注册 factory');

const core = captured.factory(makeRequire({ react: makeReactStub() })).core;

// ---------------------------------------------------------------------------
// 1) 纯逻辑：历史导航状态机
// ---------------------------------------------------------------------------

test('history 控制器：↑ 从最新逐条往旧翻，最旧处不再前进', () => {
  const c = core.createHistoryController();
  c.setHistory(['m1', 'm2', 'm3']); // 最旧 → 最新
  assert.equal(c.up(''), 'm3');     // 空草稿：首次 ↑ 拿最新
  assert.equal(c.up(), 'm2');
  assert.equal(c.up(), 'm1');
  assert.equal(c.up(), 'm1');       // 已在最旧：保持
  assert.equal(c._state.pos, 2);
});

test('history 控制器：↓ 逐条往新翻，越过最新回到空并复位', () => {
  const c = core.createHistoryController();
  c.setHistory(['m1', 'm2', 'm3']);
  c.up('');
  c.up();                            // m2
  c.up();                            // m1（最旧）
  assert.equal(c.down(), 'm2');
  assert.equal(c.down(), 'm3');
  assert.equal(c.down(), '');        // 越过最新 → 空
  assert.equal(c.isNavigating(), false, '回到空后应复位（下次 ↑ 从头开始）');
  // 复位后 ↑ 再从最新开始
  assert.equal(c.up(''), 'm3');
});

test('history 控制器：非空草稿作为临时第 0 条，↓ 能翻回临时条再回空', () => {
  const c = core.createHistoryController();
  c.setHistory(['m1', 'm2']);
  assert.equal(c.up('draft-in-progress'), 'm2'); // 首次 ↑ 跳过临时条，拿最新历史
  assert.equal(c.up(), 'm1');
  assert.equal(c.down(), 'm2');
  assert.equal(c.down(), 'draft-in-progress');   // 翻回临时第 0 条
  assert.equal(c.down(), '');                    // 再往下 → 空
});

test('history 控制器：无历史时 ↑ 为 no-op；编辑复位后下次 ↑ 从头开始', () => {
  const c = core.createHistoryController();
  assert.equal(c.up(''), null);       // 无历史：无可回溯
  assert.equal(c.up('typed'), null);
  c.setHistory(['m1', 'm2']);
  c.up('');                            // → m2
  assert.equal(c.isNavigating(), true);
  c.reset();                           // 手动编辑复位
  assert.equal(c.isNavigating(), false);
  assert.equal(c.up(''), 'm2');        // 下次 ↑ 从头（最新）开始
});

test('history 控制器：setHistory 内容未变时不重置指针（导航不被打断）', () => {
  const c = core.createHistoryController();
  c.setHistory(['m1', 'm2', 'm3']);
  c.up('');                            // → m3，pos=0
  assert.equal(c._state.pos, 0);
  assert.equal(c.setHistory(['m1', 'm2', 'm3']), false, '内容未变应返回 false');
  assert.equal(c._state.pos, 0, '内容未变不应重置指针');
  assert.equal(c.setHistory(['m1', 'm2', 'm3', 'm4']), true, '新增消息应返回 true 并复位');
  assert.equal(c.isNavigating(), false);
});

// ---------------------------------------------------------------------------
// 2) 纯逻辑：内容/真实消息提取
// ---------------------------------------------------------------------------

test('contentText：仅拼接 text 块，忽略图片/未知块；非数组返回空', () => {
  assert.equal(core.contentText([{ type: 'text', text: 'hello ' }, { type: 'text', text: 'world' }]), 'hello world');
  assert.equal(core.contentText([{ type: 'image', attachment: { id: 'i1' } }]), '');
  assert.equal(core.contentText([{ type: 'text', text: 'a' }, { type: 'image' }, { type: 'text', text: 'b' }]), 'ab');
  assert.equal(core.contentText(null), '');
  assert.equal(core.contentText('nope'), '');
});

test('extractUserMessages：按 order 取 user 节点文本；跳过非 user 与纯图消息', () => {
  const nodes = new Map([
    ['k1', { kind: 'user', content: [{ type: 'text', text: 'first' }] }],
    ['k2', { kind: 'assistant', content: [{ type: 'text', text: 'reply' }] }],
    ['k3', { kind: 'user', content: [{ type: 'image' }, { type: 'text', text: 'with-image' }] }],
    ['k4', { kind: 'user', content: [{ type: 'image' }] }], // 纯图 → 跳过
  ]);
  const out = core.extractUserMessages({ chat: { nodes, order: ['k1', 'k2', 'k3', 'k4'] } });
  // vm 上下文里构造的数组原型与宿主不同，统一走 JSON 快照比对。
  assert.equal(JSON.stringify(out), JSON.stringify(['first', 'with-image']));
});

test('extractUserMessages：当前内核形状（{nodes, order} + node.data.content）', () => {
  const nodes = new Map([
    ['k1', { kind: 'user', anchorSeq: 2, data: { content: [{ type: 'text', text: 'first' }] } }],
    ['k2', { kind: 'assistant-step', data: { content: [{ type: 'text', text: 'reply' }] } }],
    ['k3', { kind: 'user', anchorSeq: 8, data: { content: [{ type: 'image' }, { type: 'text', text: 'with-image' }] } }],
    ['k4', { kind: 'user', anchorSeq: 11, data: { content: [{ type: 'image' }] } }], // 纯图 → 跳过
  ]);
  const out = core.extractUserMessages({ nodes, order: ['k1', 'k2', 'k3', 'k4'] });
  assert.equal(JSON.stringify(out), JSON.stringify(['first', 'with-image']));
});

test('extractUserMessages：字符串 content 与块数组 content 同样可读', () => {
  const nodes = new Map([
    ['k1', { kind: 'user', data: { content: 'plain-string' } }],
    ['k2', { kind: 'user', content: [{ type: 'text', text: 'blocks' }] }],
  ]);
  const out = core.extractUserMessages({ nodes, order: ['k1', 'k2'] });
  assert.equal(JSON.stringify(out), JSON.stringify(['plain-string', 'blocks']));
});

test('extractUserMessages：当前内核 ChatNodeStore（get + values，无 forEach）可读', () => {
  const backing = new Map([
    ['k1', { kind: 'user', data: { content: [{ type: 'text', text: 'u1' }] } }],
    ['k2', { kind: 'user', data: { content: [{ type: 'text', text: 'u2' }] } }],
  ]);
  // 内核真实形：只有 get/source/processSource/values()，没 forEach —— 当作 Map 判定会漏。
  const store = { get: (k) => backing.get(k), values: () => [...backing.values()] };
  assert.equal(core.isNodeStore(store), true, '无 forEach 也应认作节点表');
  assert.equal(core.isMapLike(store), false, '它确实不是 Map 形态');
  const out = core.extractUserMessages({ nodes: store, order: ['k1', 'k2'] });
  assert.equal(JSON.stringify(out), JSON.stringify(['u1', 'u2']));
});

test('extractUserMessages：不可读形态返回 null', () => {
  assert.equal(core.extractUserMessages(null), null);
  assert.equal(core.extractUserMessages({}), null);
  assert.equal(core.extractUserMessages({ chat: { nodes: {}, order: [] } }), null); // 非 Map 形态
  assert.equal(core.extractUserMessages({ chat: { nodes: new Map(), order: 'x' } }), null); // order 非数组
});

// ---------------------------------------------------------------------------
// 3) vm 端到端
// ---------------------------------------------------------------------------

/** 带 DOM stub 的 vm 装载（textarea / document / window）。 */
function makeDomSandbox() {
  const dispatched = [];
  const textarea = {
    tagName: 'TEXTAREA',
    value: '',
    focus() {},
    setSelectionRange() {},
    dispatchEvent(ev) { dispatched.push(ev); },
  };
  const listeners = { document: {}, window: {} };
  const sandbox = {
    console,
    Date,
    Promise,
    document: {
      activeElement: textarea,
      body: null,
      addEventListener(type, fn) { (listeners.document[type] = listeners.document[type] || []).push(fn); },
      removeEventListener(type, fn) {
        if (listeners.document[type]) listeners.document[type] = listeners.document[type].filter((x) => x !== fn);
      },
      querySelector: () => textarea,
    },
  };
  sandbox.window = {
    addEventListener(type, fn) { (listeners.window[type] = listeners.window[type] || []).push(fn); },
  };
  return { sandbox, listeners, textarea, dispatched };
}

async function setupApplied() {
  const dom = makeDomSandbox();
  const load = loadClient(PLUGIN, dom.sandbox);
  const setDraftCalls = [];
  const submitted = [];
  const inputActions = {
    setDraft: (text) => { setDraftCalls.push(text); dom.textarea.value = text; },
    submit: () => { submitted.push(dom.textarea.value); },
    addImages: () => true,
  };
  // 当前内核：节点表是 ChatSnapshot，nodes 为 ChatNodeStore（get + values()，
  // 没有 forEach），用户消息文本在 data.content。
  const chatBacking = new Map([
    ['k1', { kind: 'user', anchorSeq: 3, data: { content: [{ type: 'text', text: 'hello' }] } }],
    ['k2', { kind: 'user', anchorSeq: 9, data: { content: [{ type: 'text', text: 'world' }] } }],
  ]);
  const chat = {
    nodes: { get: (k) => chatBacking.get(k), values: () => [...chatBacking.values()] },
    order: ['k1', 'k2'],
  };
  // 旧内核：SessionSnapshot.chat，文本在 node.content（内容故意不同，用于区分通道）。
  const session = {
    chat: {
      nodes: new Map([
        ['k1', { kind: 'user', content: [{ type: 'text', text: 'old-hello' }] }],
        ['k2', { kind: 'user', content: [{ type: 'text', text: 'old-world' }] }],
      ]),
      order: ['k1', 'k2'],
    },
  };
  const input = { draft: '', phase: 'plain', imageIds: [] };
  const slotRegistrations = [];
  const ctx = {
    get: (name) => { throw new Error('no service ' + name); },
    slots: {
      inject: (name, fn, label) => { slotRegistrations.push({ name, register: fn, label }); },
      register: (options, component) => ({ options, component }),
    },
  };
  const react = makeReactStub();
  const mod = load.captured.factory(makeRequire({ react }));
  mod.apply(ctx);
  // 槽位 props：当前内核只下发 hook（useChat / useSession / useInput），
  // 不再直下 input、session 快照对象；两条快照通道同时在场时 chat 优先。
  const props = {
    inputActions,
    useChat: (sel) => sel(chat),
    useSession: (sel) => sel(session),
    useInput: (sel) => sel(input),
  };
  return {
    ...load, mod, ctx, inputActions, input, session, chat, props, slotRegistrations, react, setDraftCalls, submitted,
    dom, textarea: dom.textarea, listeners: dom.listeners, dispatched: dom.dispatched,
    store: load.sandbox.window.__dshInputHistoryStore,
    core: mod.core,
  };
}

function keydown(e, ev) {
  if (typeof ev.preventDefault !== 'function') ev.preventDefault = () => { ev.defaultPrevented = true; };
  if (typeof ev.stopPropagation !== 'function') ev.stopPropagation = () => {};
  return e.listeners.document.keydown[0](ev);
}
function inputEvent(e, ev) {
  return e.listeners.document.input[0](ev);
}

test('e2e: factory 物化 + apply 注册槽位与全局监听', async () => {
  const e = await setupApplied();
  assert.equal(e.slotRegistrations.length, 1);
  assert.equal(e.slotRegistrations[0].name, 'conversation.input.left');
  const entry = e.slotRegistrations[0].register();
  assert.equal(entry.options.id, 'dsh-input-history');
  assert.equal(typeof entry.component, 'function');
  // 渲染组件（hook stub）：返回 null（无视觉元素），effect 注册 activeEnv。
  const tree = entry.component(e.props);
  assert.equal(tree, null);
  assert.equal(e.listeners.document.keydown.length, 1, '应注册 keydown 捕获监听');
  assert.equal(e.listeners.document.input.length, 1, '应注册 input 捕获监听');
});

test('e2e: 空草稿才触发 ↑；历史从最新往回翻并写回草稿', async () => {
  const e = await setupApplied();
  e.slotRegistrations[0].register().component(e.props);
  e.textarea.value = '';
  keydown(e, { key: 'ArrowUp', target: e.textarea });
  assert.deepEqual(e.setDraftCalls, ['world'], '首次 ↑ 应写回最新一条用户消息');
  keydown(e, { key: 'ArrowUp', target: e.textarea });
  assert.deepEqual(e.setDraftCalls, ['world', 'hello'], '再次 ↑ 应写回更旧一条');
});

test('e2e: 非空草稿不触发 ↑（避免打断正在输入的内容）', async () => {
  const e = await setupApplied();
  e.slotRegistrations[0].register().component(e.props);
  e.textarea.value = '正在输入';
  keydown(e, { key: 'ArrowUp', target: e.textarea });
  assert.deepEqual(e.setDraftCalls, [], '非空草稿不得回溯');
});

test('e2e: 回溯中 ↓ 逐条翻回较新，越过最新回到空', async () => {
  const e = await setupApplied();
  e.slotRegistrations[0].register().component(e.props);
  e.textarea.value = '';
  keydown(e, { key: 'ArrowUp', target: e.textarea });       // world
  keydown(e, { key: 'ArrowUp', target: e.textarea });       // hello
  keydown(e, { key: 'ArrowDown', target: e.textarea });     // world
  keydown(e, { key: 'ArrowDown', target: e.textarea });     // ''（越过最新）
  assert.deepEqual(e.setDraftCalls, ['world', 'hello', 'world', '']);
});

test('e2e: 手动编辑（input 事件）复位指针，下次 ↑ 从头开始', async () => {
  const e = await setupApplied();
  e.slotRegistrations[0].register().component(e.props);
  e.textarea.value = '';
  keydown(e, { key: 'ArrowUp', target: e.textarea });       // world
  // 用户手动编辑：原生 input 事件 → 复位
  inputEvent(e, { target: e.textarea });
  const ctrl = e.store.snapshotController(e.inputActions);
  assert.equal(ctrl.pos, -1, '编辑后应复位指针');
  // 草稿已被编辑为非空，再 ↑ 不触发
  e.textarea.value = 'edited';
  keydown(e, { key: 'ArrowUp', target: e.textarea });
  assert.deepEqual(e.setDraftCalls, ['world'], '非空草稿（已编辑）不再回溯');
  // 清空后再 ↑ 从头开始（最新）
  e.textarea.value = '';
  keydown(e, { key: 'ArrowUp', target: e.textarea });
  assert.deepEqual(e.setDraftCalls, ['world', 'world'], '复位后 ↑ 从最新重新开始');
});

test('e2e: 发送两条路径（submit 包装 + 回车捕获）都记录历史', async () => {
  const e = await setupApplied();
  e.slotRegistrations[0].register().component(e.props);
  const hist = () => JSON.stringify(e.store.snapshotHistory(e.inputActions));
  // 初始播种：当前内核 chat 通道（useChat）的 hello/world
  assert.equal(hist(), JSON.stringify(['hello', 'world']));

  // 路径 1：点击发送按钮（包装后的 submit）
  e.textarea.value = 'button-send';
  e.inputActions.submit();
  assert.equal(hist(), JSON.stringify(['hello', 'world', 'button-send']));

  // 路径 2：回车发送（捕获阶段 keydown 记录草稿，但不自己调用 submit——交内核）
  e.textarea.value = 'enter-send';
  keydown(e, { key: 'Enter', keyCode: 13, target: e.textarea });
  assert.equal(hist(), JSON.stringify(['hello', 'world', 'button-send', 'enter-send']));
  // submit mock 只在按钮路径被调用一次（回车路径由内核负责发送，本插件只记录不拦发）。
  assert.deepEqual(e.submitted, ['button-send']);
});

test('e2e: 回车连续重复（去重）与 shift+enter 不记录', async () => {
  const e = await setupApplied();
  e.slotRegistrations[0].register().component(e.props);
  const hist = () => JSON.stringify(e.store.snapshotHistory(e.inputActions));
  assert.equal(hist(), JSON.stringify(['hello', 'world']));

  e.textarea.value = 'world'; // 与末尾相同 → 连续去重
  keydown(e, { key: 'Enter', keyCode: 13, target: e.textarea });
  assert.equal(hist(), JSON.stringify(['hello', 'world']), '连续重复不重复记录');

  e.textarea.value = 'shift-newline';
  keydown(e, { key: 'Enter', keyCode: 13, shiftKey: true, target: e.textarea });
  assert.equal(hist(), JSON.stringify(['hello', 'world']), 'shift+enter（换行）不记录');
});

test('e2e: 按会话隔离（不同 inputActions 各自历史）', async () => {
  const e = await setupApplied();
  const entry = e.slotRegistrations[0].register();
  entry.component(e.props);

  const otherActions = { setDraft: () => {}, submit: () => {}, addImages: () => true };
  const otherChat = {
    nodes: (() => {
      const m = new Map([['k1', { kind: 'user', data: { content: [{ type: 'text', text: 'other' }] } }]]);
      return { get: (k) => m.get(k), values: () => [...m.values()] };
    })(),
    order: ['k1'],
  };
  entry.component({ inputActions: otherActions, useChat: (sel) => sel(otherChat) });

  assert.equal(JSON.stringify(e.store.snapshotHistory(e.inputActions)), JSON.stringify(['hello', 'world']));
  assert.equal(JSON.stringify(e.store.snapshotHistory(otherActions)), JSON.stringify(['other']));
});

test('e2e: 无 useChat（旧内核）时回退到 useSession().chat 仍能播种', async () => {
  const e = await setupApplied();
  const otherActions = { setDraft: () => {}, submit: () => {}, addImages: () => true };
  e.slotRegistrations[0].register().component({
    inputActions: otherActions,
    useSession: (sel) => sel(e.session),   // 只有旧通道：old-hello / old-world
  });
  assert.equal(
    JSON.stringify(e.store.snapshotHistory(otherActions)),
    JSON.stringify(['old-hello', 'old-world']),
  );
});

test('e2e: input 快照经 useInput 镜像，phase 忙时回车不记草稿', async () => {
  const e = await setupApplied();
  const busyActions = { setDraft: () => {}, submit: () => {}, addImages: () => true };
  e.slotRegistrations[0].register().component({
    inputActions: busyActions,
    useChat: (sel) => sel(e.chat),
    useInput: (sel) => sel({ draft: '', phase: 'submitting' }),
  });
  e.textarea.value = 'busy-send';
  keydown(e, { key: 'Enter', keyCode: 13, target: e.textarea });
  assert.equal(
    JSON.stringify(e.store.snapshotHistory(busyActions)),
    JSON.stringify(['hello', 'world']),
    'submitting 中回车不会真发送，不应记入历史',
  );
  // 回到 plain 后同一条可记录
  e.slotRegistrations[0].register().component({
    inputActions: busyActions,
    useChat: (sel) => sel(e.chat),
    useInput: (sel) => sel({ draft: '', phase: 'plain' }),
  });
  keydown(e, { key: 'Enter', keyCode: 13, target: e.textarea });
  assert.equal(
    JSON.stringify(e.store.snapshotHistory(busyActions)),
    JSON.stringify(['hello', 'world', 'busy-send']),
  );
});

// ---------------------------------------------------------------------------
// 4) rc8 契约自检：本插件的 require 面落在种子表内
// ---------------------------------------------------------------------------

test('rc8 契约: dsh-input-history client 的 require 全部在 rc8 种子表', () => {
  const RC8_SEED = ['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client',
    '@deepseek-ai/cordis', '@deepseek-ai/dsh-client-ui-slots', '@deepseek-ai/dsh-client-ui-primitives'];
  const src = fs.readFileSync(PLUGIN, 'utf8');
  const specs = [...src.matchAll(/require\((['"])([^'"]+)\1\)/g)].map((m) => m[2]);
  assert.ok(specs.length >= 1, `应扫描到 require（react），实际 ${specs.length}`);
  for (const spec of specs) {
    assert.ok(RC8_SEED.includes(spec), `require("${spec}") 不在 rc8 种子表（#124 形态）`);
  }
  assert.ok(specs.includes('react'), '应有 react 依赖（槽位组件 hooks）');
});
