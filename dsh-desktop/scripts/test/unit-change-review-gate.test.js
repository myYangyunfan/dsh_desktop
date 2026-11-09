'use strict';

// unit-change-review-gate.test.js —— 「替用户提交前先过草稿与空闲两道闸门」的回归锁
// （原 unit-auto-compact-gate.test.js 的 change-review 半边；auto-compact 已于
// 2026-11-08 按用户要求退役，其 compact 半边随源目录一并下线）。
//
// 用户报障（2026-10-18）：正在会话里打一大段引导词，插件以用户身份发出一条命令后，
// 半篇内容一并没了。取证结论：提示不是凶手，`inputActions.setDraft(text)` 才是——
// 内核这条 API 的契约是**整篇替换**（dsh-client-ui-conversation/lib/client.js:15023
// "Replace the whole draft (persisted-draft seed and programmatic writes)"），且
// publish() 会立刻把它写进该会话的持久化草稿（:15708-15716 + :17965 bindDraftPersistence），
// 成功提交后 commit-draft 还会砍掉 undo 栈（contract/input.d.ts:380-388）。
// change-review 手动模式下「立即审核当前会话变更」就是把一大段审核请求写进草稿，
// 草稿非空时覆盖掉用户正在写的内容是不可恢复的。
//
// 本套件咬两层：
//   ① 纯函数 composerGate 的判据表（照内核 InputBar 的同源口径 :18803-18806）；
//   ② 设置页按钮与 dock occupant 的**渲染级**证据：草稿非空时 setDraft 一次都不许被调用，
//      且被挡不能把 pendingChanges 吞掉（否则这轮变更永远没人审）。
// 快照必须走 useInput / useSession（:19738-19753 的 `hooks.input = shell.state`），
// 不能走 inputActions——那个对象只有 8 个方法（:14932-14958），没有 state / getDraft /
// draft / busy 任何一项，按那些字段读会恒 undefined、把守卫做成静默死的。
//
// 挂载方式与 unit-goal-completion-client / unit-builtin-manager-client 同族：本机没有 jsdom /
// react-test-renderer，用仓库里真实的 React + React 内部 dispatcher 槽位手驱
// useState/useEffect/useRef/useMemo/useCallback。证据强度记为
// 「真实插件源码 + 复刻渲染夹具（非浏览器语义，仅本组件用到的钩子面）」——不冒充浏览器实测。
//
// 反证两条在文件末尾：把 composerGate 改成恒 ready、把 blocked 分支摘掉——前面的用例
// 必须按预期变红，否则是在为不存在的守卫作证。
// 运行：node --test scripts/test/unit-change-review-gate.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const React = require('react');

const DSH = path.resolve(__dirname, '..', '..');
const HALF = {
  review: {
    file: path.join(DSH, 'assets', 'plugins', 'dsh-change-review', 'lib', 'client.js'),
    storeKey: 'dsh-change-review-config-v1',
    button: '立即审核当前会话变更',
    dict: { now: '立即审核当前会话变更' },
  },
};

// ---------------------------------------------------------------------------
// 浏览器侧最小夹具：__ModuleLoader__ 捕获模块；document / localStorage / rAF 够本组件用
// ---------------------------------------------------------------------------

function loadClient(which, opts = {}) {
  const meta = HALF[which];
  // 行尾归一：这份 lib 在工作树里可能是 CRLF（`git ls-files --eol` 实测 i/lf w/crlf
  // ——本机 core.autocrlf=true 的老账，仓库级修法见根目录 .gitattributes）。多行锚点在这种
  // 落差下会**静默空转**：replace 什么都没换、变异体等于原件，反证用例就变成在为不存在的
  // 守卫作证。所以夹具进门先把 \r\n 拍平，本机与 CI 从同一字节起步。
  let src = fs.readFileSync(meta.file, 'utf8').replace(/\r\n/g, '\n');
  if (opts.mutate) src = opts.mutate(src);

  const appended = [];
  const warns = [];
  const store = new Map(Object.entries(opts.config || {})
    .map(([k, v]) => [meta.storeKey, JSON.stringify({ [k]: v })]));

  const node = () => ({ style: { cssText: '' }, dataset: {}, textContent: '', remove() {} });
  const sandbox = {
    window: {
      __ModuleLoader__: { load(mod) { sandbox.__loaded = mod; } },
      localStorage: {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => store.set(k, String(v)),
      },
    },
    document: {
      createElement: () => node(),
      querySelector: () => null,
      head: { appendChild() {} },
      body: { appendChild(n) { appended.push(n); } },
    },
    console: { warn: (...a) => warns.push(a.join(' ')), log() {}, error() {} },
    setTimeout,
    clearTimeout,
    requestAnimationFrame: (fn) => setTimeout(fn, 0),
    require: (name) => {
      if (name === 'react') return React;
      throw new Error('client 不得 require 模块：' + name);
    },
  };
  vm.runInNewContext(src, sandbox, { filename: `dsh-${which}-client.js` });
  const loaded = sandbox.__loaded;
  assert.ok(loaded && typeof loaded.factory === 'function', 'client.js 必须经 __ModuleLoader__.load 注册 factory');
  const exports = loaded.factory(sandbox.require);

  const slots = { dock: null, section: null };
  exports.apply({
    effect: (fn) => { const off = fn(); return typeof off === 'function' ? off : () => {}; },
    locale: { register: () => () => {}, bind: () => (key) => key },
    slots: {
      inject(_name, build) { build(); return () => {}; },
      register(options, Component) {
        if (options.name === 'conversation.composer.dock') slots.dock = Component;
        if (options.name === 'settings.section') slots.section = Component;
        return () => {};
      },
    },
  });
  assert.ok(slots.dock, `${which}: dock occupant 必须注册（否则本套件在测一个不存在的挂载点）`);
  assert.ok(slots.section, `${which}: 设置页分区必须注册`);
  return { exports, slots, appended, warns };
}

/** 设置页的 t：查不到就把 key 原样印上屏（内核坏形），再用小词典把按钮名换成可定位的中文。 */
const tFor = (which) => (key) => (HALF[which].dict[key] || key);

/** 遍历元素树，按按钮文字找 props.onClick。 */
function findButton(tree, label) {
  let hit = null;
  (function walk(node) {
    if (!node || typeof node !== 'object' || hit) return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (node.props) {
      const text = JSON.stringify(node.props.children ?? '');
      if (typeof node.props.onClick === 'function' && text.includes(label)) hit = node.props;
      walk(node.props.children);
    }
  })(tree);
  return hit;
}

// ---------------------------------------------------------------------------
// mini 钩子驱动：useState / useEffect / useRef / useMemo / useCallback
// ---------------------------------------------------------------------------

function mount(Component, makeProps) {
  const internals = React.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;
  assert.ok(internals && internals.ReactCurrentDispatcher, 'React 内部 dispatcher 槽位缺失（升级 React 需同步本夹具）');
  const slot = internals.ReactCurrentDispatcher;
  const cells = [];
  let cursor = 0;
  let scheduled = false;
  let tree = null;
  const sameDeps = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));

  const hooks = {
    useState(init) {
      const i = cursor++;
      if (!(i in cells)) cells[i] = { value: typeof init === 'function' ? init() : init };
      const cell = cells[i];
      return [cell.value, (next) => {
        const v = typeof next === 'function' ? next(cell.value) : next;
        if (Object.is(v, cell.value)) return;
        cell.value = v;
        scheduled = true;
      }];
    },
    useRef(initial) {
      const i = cursor++;
      if (!(i in cells)) cells[i] = { current: initial };
      return cells[i];
    },
    useMemo(fn, deps) {
      const i = cursor++;
      if (!(i in cells) || !sameDeps(cells[i].deps, deps)) cells[i] = { value: fn(), deps };
      return cells[i].value;
    },
    useCallback: (fn) => fn,
    useEffect(fn, deps) {
      const i = cursor++;
      const cell = cells[i];
      if (!cell || !sameDeps(cell.deps, deps)) {
        if (cell && typeof cell.off === 'function') cell.off();
        cells[i] = { deps, off: null, run: fn };
      }
    },
  };

  function render() {
    scheduled = false;
    cursor = 0;
    const prev = slot.current;
    slot.current = hooks;
    try {
      // 注册进 settings.section 的是 `function (props) { return h(Section, props); }` 这层壳，
      // 所以要在 dispatcher 之下把函数型元素往下走一层，否则拿到的树里只有壳、没有按钮。
      let out = Component(makeProps());
      let depth = 0;
      while (out && typeof out.type === 'function' && depth++ < 4) out = out.type(out.props);
      tree = out;
    } finally { slot.current = prev; }
    for (const cell of cells) {
      if (cell && cell.run) { const run = cell.run; cell.run = null; cell.off = run() || null; }
    }
    let guard = 0;
    while (scheduled && guard++ < 20) render();
  }
  render();
  return {
    tree: () => tree,
    render,
    settle: async () => { await new Promise((r) => setTimeout(r, 90)); if (scheduled) render(); },
    click: (label) => {
      const btn = findButton(tree, label);
      assert.ok(btn, `设置页里找不到按钮：${label}`);
      btn.onClick();
      // onClick 里的 setMsg 只置了 scheduled 位，必须立刻重渲染才能在树里看到反馈文案
      // （真实 React 会在下一个 commit 做这件事；本夹具等价、且不依赖 90ms 定时器）。
      if (scheduled) render();
    },
  };
}

// ---------------------------------------------------------------------------
// 快照夹具（形状照内核 InputState / SessionSnapshot 读到的字段）
// ---------------------------------------------------------------------------

const FILE_CHANGES = { changes: [{ path: 'a.js', op: 'write', before: '', after: 'x', seq: 3 }] };
const idleInput = (over = {}) => ({ draft: '', attachmentIds: [], phase: 'plain', ...over });
const idleSession = (over = {}) => ({ running: false, pendingSubmissions: [], ...over });

/**
 * 挂 dock occupant，快照与调用计数都由调用方掌控。
 * @returns {{calls:{setDraft:string[],submit:number}, m, appended, warns}}
 */
function mountDock(which, spec = {}) {
  const loaded = loadClient(which, spec.loadOpts || {});
  const calls = { setDraft: [], submit: 0 };
  const props = {
    sessionId: spec.sessionId || 's1',
    inputActions: {
      setDraft: (text) => { calls.setDraft.push(text); },
      submit: () => { calls.submit += 1; },
    },
    useProjection: (key) => (key === 'fileChanges'
      ? (spec.changes === undefined ? FILE_CHANGES : spec.changes)
      : undefined),
    useInput: spec.noInput ? undefined : ((sel) => sel(typeof spec.input === 'function' ? spec.input() : (spec.input ?? idleInput()))),
    useSession: spec.noSession ? undefined : ((sel) => sel(spec.session ?? idleSession())),
  };
  const m = mount(loaded.slots.dock, () => props);
  return { calls, m, appended: loaded.appended, warns: loaded.warns, loaded };
}

// ---------------------------------------------------------------------------
// ① 闸门判据表
// ---------------------------------------------------------------------------

test('composerGate 判据表：只有「空草稿 + plain + 不忙」放行', () => {
  const which = 'review';
  const gate = loadClient(which).exports.__internals.composerGate;
  assert.equal(gate(idleInput(), idleSession()), 'ready', `${which}: 空草稿 + plain + 不忙 必须放行`);
  assert.equal(gate(idleInput({ draft: '把说明改清楚' }), idleSession()), 'has-content', `${which}: 草稿非空`);
  assert.equal(gate(idleInput({ draft: '   \n  ' }), idleSession()), 'ready',
    `${which}: 纯空白按内核 trim 口径算空（:18806 empty = draft.trim() === ""）——判据与内核同源，不自立口径`);
  assert.equal(gate(idleInput({ attachmentIds: ['att-1'] }), idleSession()), 'has-content', `${which}: 附件也是内容`);
  for (const phase of ['adjudicating', 'claimed', 'submitting']) {
    assert.equal(gate(idleInput({ phase }), idleSession()), 'busy', `${which}: phase=${phase} 不算空闲`);
  }
  assert.equal(gate(idleInput(), idleSession({ running: true })), 'busy', `${which}: 轮次在跑`);
  assert.equal(gate(idleInput(), idleSession({ pendingSubmissions: ['echo-1'] })), 'busy', `${which}: 本地回声还没落 turn/start`);
  assert.equal(gate(null, idleSession()), 'unknown', `${which}: 读不到输入快照`);
  assert.equal(gate({ draft: 'x' }, idleSession()), 'unknown', `${which}: 形状不认识（attachmentIds 缺失）`);
  assert.equal(gate({ draft: '', attachmentIds: [] }, idleSession()), 'unknown', `${which}: phase 缺失不许当成 plain`);
  assert.equal(gate(idleInput(), null), 'unknown', `${which}: 读不到会话快照`);
});

// ---------------------------------------------------------------------------
// ② 渲染级：手动入口与 occupant 都不许在草稿非空时动输入框
// ---------------------------------------------------------------------------

test('change-review：草稿非空时不发送审核请求，待审变更保留（连点两次仍在）', async () => {
  const h = mountDock('review', { sessionId: 'r1', input: idleInput({ draft: '正在写给下一轮的指令' }) });
  await h.m.settle();
  assert.deepEqual(h.calls.setDraft, [], '审核提示是一大段生成文本，绝不能顶掉用户的草稿');
  const section = mount(h.loaded.slots.section, () => ({ t: tFor('review') }));
  section.click(HALF.review.button);
  assert.deepEqual(h.calls.setDraft, []);
  assert.match(JSON.stringify(section.tree()), /nowBlocked/);
  section.click(HALF.review.button);
  assert.deepEqual(h.calls.setDraft, [], '被挡不能把 pendingChanges 吞掉——否则这轮变更永远没人审了');
});

test('change-review：空闲 + 有待审变更 → 手动入口正常发送', async () => {
  const h = mountDock('review', { sessionId: 'r2' });
  await h.m.settle();
  assert.deepEqual(h.calls.setDraft, [], '默认 mode=manual，自动链不该自己发');
  const section = mount(h.loaded.slots.section, () => ({ t: tFor('review') }));
  section.click(HALF.review.button);
  assert.equal(h.calls.setDraft.length, 1);
  assert.match(h.calls.setDraft[0], /请审核你在本会话中做出的文件变更/);
});

test('change-review：读不到 useInput / useSession 时保守停手（不静默变成「照发」）', async () => {
  const noInput = mountDock('review', { sessionId: 'r4', noInput: true });
  await noInput.m.settle();
  const section = mount(noInput.loaded.slots.section, () => ({ t: tFor('review') }));
  section.click(HALF.review.button);
  assert.deepEqual(noInput.calls.setDraft, [], '未知状态不许写草稿');
  const noSession = mountDock('review', { sessionId: 'r5', noSession: true });
  await noSession.m.settle();
  const section2 = mount(noSession.loaded.slots.section, () => ({ t: tFor('review') }));
  section2.click(HALF.review.button);
  assert.deepEqual(noSession.calls.setDraft, []);
});

// ---------------------------------------------------------------------------
// 反证两条
// ---------------------------------------------------------------------------

test('反证 1：composerGate 恒判 ready 时，草稿非空也照发（闸门是真判据，不是装饰）', async () => {
  const mutate = (src) => src.replace(
    /function composerGate\(input, session\) \{[\s\S]*?\n    \}/,
    'function composerGate(input, session) { return "ready"; }');
  const h = mountDock('review', {
    sessionId: 'r6',
    input: idleInput({ draft: '还在写' }),
    loadOpts: { mutate },
  });
  await h.m.settle();
  const section = mount(h.loaded.slots.section, () => ({ t: tFor('review') }));
  section.click(HALF.review.button);
  assert.equal(h.calls.setDraft.length, 1, '变异体必须真的把审核提示写进草稿（否则「草稿非空不发送」是空断言）');
});

test('反证 2：change-review 摘掉 blocked 分支，被挡时待审内容会被清空', async () => {
  const h = mountDock('review', {
    sessionId: 'r3',
    input: idleInput({ draft: '正在写' }),
    loadOpts: {
      mutate: (src) => src.replace(
        'if (gate !== "ready") {\n        if (gate === "unknown") warnUnknown();\n        return "blocked";\n      }',
        ''),
    },
  });
  await h.m.settle();
  const section = mount(h.loaded.slots.section, () => ({ t: tFor('review') }));
  section.click(HALF.review.button);
  assert.equal(h.calls.setDraft.length, 1, '变异体必须真的把审核提示写进草稿（否则 blocked 那条判据是空的）');
  assert.match(h.calls.setDraft[0], /请审核你在本会话中做出的文件变更/);
});
