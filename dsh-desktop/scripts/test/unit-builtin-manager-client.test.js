'use strict';

// unit-builtin-manager-client.test.js — dsh-builtin-manager 页内半边（lib/client.js）回归套件。
//
// 需求：随包内置的插件要能在界面里被管理。内核那份插件页做不到——它的包级开关把名字从
// dsh.profile.bundles 摘掉后，listBundles 的行名单 = bundles ∪ dependencies ∪ 安装锚点，
// 内置件三处都不在，一关就从页面上消失、开不回来；条目级开关的解锁条件 row.entryId !== void 0
// 又只认「当前活着的条目」。所以本页走桌面壳已接线的 dsh:plugin-list / dsh:plugin-set-enabled，
// 文件写入只有 sidecar 一个写者。
//
// 0.2.0 重做（用户裁定「搜索+筛选+单列表」）后本套件同步重写：
//   - 页面改为「工具栏（搜索+重新读取）+ 状态筛选（带计数）+ 单列表卡片行」，
//     全套内核原语（Button/Input/SegmentedControl/Switch/Tag + 官方图标）。
//   - 原语在测试里是**桩**：真原语需要 clsx 等运行期依赖，迷你挂载器解不了；
//     桩只做「可被 walk 找到、props 即行为」这件事——Switch 的点击语义按真实实现
//     逐字复刻（onClick 即 onChange(!checked)），驱动入口与真机一致。
//   - 行内反馈按 data-plugin-id 作用域断言（成功/失败只落在对应行，不再全页咬字样）。
//
// 更新链（版本 / 检查更新 / 单个更新）的用例在「包面一致」之前：版本渲染、可更新行出按钮、
// 检查失败不炸页、更新在途禁用与成功刷新、失败原文、better-sidebar 按 id 兜底。
// 反证 5-7 分别咬「排除」「hasUpdate 判据」「更新失败分支」三条守卫。
//
// 挂载方式与 unit-prompt-custom-client 同族：本机没有 jsdom / react-test-renderer，用仓库里
// 真实的 React 18 + react/jsx-runtime，通过 React 内部 dispatcher 槽位手驱
// useState/useCallback/useEffect，把真实 client 源码里的组件跑起来。证据强度记为
// 「真实插件源码 + 复刻渲染夹具（非浏览器语义，仅本组件用到的钩子面）」——不冒充浏览器实测。
//
// 反证七条在文件末尾：摘掉 group 过滤、摘掉 ok===false 分支、摘掉自锁分支、摘掉搜索过滤、
// 摘掉 better-sidebar 排除、摘掉 hasUpdate 判据、摘掉更新失败分支——判据必须按预期变形
// （否则前面的用例是在为不存在的守卫作证）。

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const React = require('react');
const jsxRuntime = require('react/jsx-runtime');

const DSH = path.resolve(__dirname, '..', '..');
const PKG_DIR = path.join(DSH, 'assets', 'plugins', 'dsh-builtin-manager');
const CLIENT_FILE = path.join(PKG_DIR, 'lib', 'client.js');
const HOST_FILE = path.join(PKG_DIR, 'lib', 'index.js');
const PATCH_FILE = path.join(PKG_DIR, 'cordis.patch.yml');

// ---------------------------------------------------------------------------
// 内核原语桩：桩体不渲染（夹具只读 props），组件身份用于在树里定位。
// Switch 的桩保留真实实现的关键约定：用户点击 = onChange(!checked)。
// ---------------------------------------------------------------------------
const StubButton = function Button() { return null; };
const StubInput = function Input() { return null; };
const StubSegmentedControl = function SegmentedControl() { return null; };
const StubSwitch = function Switch() { return null; };
const StubTag = function Tag() { return null; };
const StubIcon = function Icon() { return null; };
const primitivesStub = {
  Button: StubButton,
  Input: StubInput,
  SegmentedControl: StubSegmentedControl,
  Switch: StubSwitch,
  Tag: StubTag,
  IconRefreshOutlineRegular: StubIcon,
  IconSearchOutlineRegular: StubIcon
};

const fakeRequire = (name) => {
  if (name === 'react') return React;
  if (name === 'react/jsx-runtime') return jsxRuntime;
  if (name === '@deepseek-ai/dsh-client-ui-primitives') return primitivesStub;
  throw new Error('client 不得 require 模块：' + name);
};

// ---------------------------------------------------------------------------
// 在 vm 里跑真实 client 源码：window.__ModuleLoader__ 捕获模块，apply(ctx) 截获注册
// ---------------------------------------------------------------------------

/**
 * @param win 注入 vm 的 window 内容（例如 { dshDesktop: { pluginManager: bridge } }）
 * @param opts.mutate 对**内存副本**做最后一改（反证用，绝不写回仓库文件）
 * @param opts.exposeInternals 追加一行透出闭包内部名（只用于直测纯函数）
 * @returns {{ exports: object, registration: {name,id,order,label}, Component: function }}
 */
function loadPanel(win, opts = {}) {
  let src = fs.readFileSync(CLIENT_FILE, 'utf8');
  if (opts.exposeInternals) {
    assert.ok(src.includes('exports.inject = inject;'), '内部导出锚点必须存在（client.js 形状变了要同步本套件）');
    src = src.replace('exports.inject = inject;', 'exports.inject = inject;\n    exports.__test = { normalize };');
  }
  if (opts.mutate) src = opts.mutate(src);

  const sandbox = {
    window: Object.assign({ __ModuleLoader__: { load(mod) { sandbox.__loaded = mod; } } }, win),
    console,
    navigator: { language: 'zh-CN' }
  };
  vm.runInNewContext(src, sandbox, { filename: 'dsh-builtin-manager-client.js' });

  const loaded = sandbox.__loaded;
  assert.ok(loaded && typeof loaded.factory === 'function', 'client.js 必须经 __ModuleLoader__.load 注册 factory');
  assert.equal(loaded.id, 'dsh-builtin-manager', '模块 id 必须等于包名（内核按它取 client bundle）');
  const exports = loaded.factory(fakeRequire);

  let registration = null;
  let Component = null;
  const ctx = {
    slots: {
      // 真实写法是 inject(name, () => ctx.slots.register(options, Component))，
      // 所以这里跑一次 build() 让 register 把两份入参交给我们。
      inject(_name, build) { build(); },
      register(options, C) { registration = options; Component = C; }
    }
  };
  exports.apply(ctx);
  assert.ok(registration, 'apply 必须向槽位注册一次');
  assert.ok(Component, '注册必须带上组件');
  return { exports, registration, Component };
}

// ---------------------------------------------------------------------------
// mini 钩子驱动：够本组件用（useState / useCallback / useEffect）
// ---------------------------------------------------------------------------

function createMounter(Component, props) {
  const internals = React.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;
  assert.ok(internals && internals.ReactCurrentDispatcher, 'React 18 内部 dispatcher 槽位缺失（升级 React 需同步本夹具）');
  const slot = internals.ReactCurrentDispatcher;

  const cells = [];
  const pendingEffects = [];
  let scheduled = false;
  let cursor = 0;
  let tree = null;

  const sameDeps = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));

  const hooks = {
    useState(init) {
      const i = cursor++;
      if (!(i in cells)) cells[i] = { value: typeof init === 'function' ? init() : init };
      const cell = cells[i];
      const set = (next) => {
        const v = typeof next === 'function' ? next(cell.value) : next;
        if (Object.is(v, cell.value)) return;
        cell.value = v;
        scheduled = true;
      };
      return [cell.value, set];
    },
    useCallback(fn, deps) {
      const i = cursor++;
      const prev = cells[i];
      if (!prev || !sameDeps(prev.deps, deps)) cells[i] = { value: fn, deps };
      return cells[i].value;
    },
    useEffect(fn, deps) {
      const i = cursor++;
      const prev = cells[i];
      if (!prev || !sameDeps(prev.deps, deps)) pendingEffects.push(fn);
      cells[i] = { deps };
    }
  };

  const render = () => {
    cursor = 0;
    const prev = slot.current;
    slot.current = hooks;
    try {
      // 注册进槽里的是 (props) => jsx(PanelSection, props) —— 展开这一层才拿到真正的树，
      // 组件因此必须保持单层（夹具只钻一层）。
      const out = Component(props);
      tree = out && typeof out.type === "function" ? out.type(props) : out;
    } finally { slot.current = prev; }
    return tree;
  };
  const flushEffects = () => { for (const fn of pendingEffects.splice(0)) fn(); };

  /** 渲染 → 跑 effect → 等异步沉降 → 有 setState 就再渲染（有界轮次）。 */
  const settle = async (rounds = 16) => {
    for (let i = 0; i < rounds; i++) {
      scheduled = false;
      render();
      flushEffects();
      await new Promise((r) => setImmediate(r));
      if (!scheduled && pendingEffects.length === 0) break;
    }
    return tree;
  };
  /** 渲染一次并沉降，返回最新树（点击后复用同一个 cell 数组，所以走 settle 而不是新建）。 */
  return { settle, rerender: settle };
}

// ---- React 元素树小工具 ----
function textAll(node) {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textAll).join('');
  if (typeof node === 'object' && node.props) return textAll(node.props.children);
  return '';
}
function walk(node, fn) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { node.forEach((n) => walk(n, fn)); return; }
  fn(node);
  if (node.props && node.props.children !== undefined) walk(node.props.children, fn);
}
/** 树上所有开关（真原语 Switch 的桩；点击语义与实现一致）。 */
function switches(node) {
  const out = [];
  walk(node, (n) => { if (n.type === StubSwitch) out.push(n); });
  return out;
}
/** 单条插件卡片（行内作用域断言用；卡片带 data-plugin-id）。 */
function cards(node) {
  const out = [];
  walk(node, (n) => { if (n.props && typeof n.props['data-plugin-id'] === 'string') out.push(n); });
  return out;
}
function cardOf(tree, id) {
  const hit = cards(tree).filter((c) => c.props['data-plugin-id'] === id);
  assert.equal(hit.length, 1, '行 ' + id + ' 的卡片必须唯一命中');
  return hit[0];
}
function segmented(tree) {
  const out = [];
  walk(tree, (n) => { if (n.type === StubSegmentedControl) out.push(n); });
  assert.equal(out.length, 1, '页面上应恰有一个状态筛选控件');
  return out[0];
}
function searchInput(tree) {
  const out = [];
  walk(tree, (n) => { if (n.type === StubInput) out.push(n); });
  assert.equal(out.length, 1, '页面上应恰有一个搜索框');
  return out[0];
}
/** 模拟真实 Switch 的点击：onClick = () => onChange(!checked)。 */
function clickSwitch(sw) { sw.props.onChange(!sw.props.checked); }

/** 树上所有原语按钮（桩）；按钮文案就是本页对用户的承诺口径，按它定位最稳。 */
function buttons(node) {
  const out = [];
  walk(node, (n) => { if (n.type === StubButton) out.push(n); });
  return out;
}
function buttonText(btn) { return textAll(btn.props && btn.props.children); }
function buttonsWithText(node, label) {
  return buttons(node).filter((btn) => buttonText(btn) === label);
}

const row = (over) => ({
  id: 'better-sidebar', name: 'dsh-better-sidebar', description: '侧栏工作台',
  enabled: true, toggleable: true, group: 'companion', removed: false, hasConfig: false, ...over
});

// ---------------------------------------------------------------------------

test('模块契约：host 半边不写文件，client 半边把页注册进 settings.plugins.tab（原语 + 无硬编码色）', () => {
  const host = fs.readFileSync(HOST_FILE, 'utf8');
  // 单一写者是本功能的前提：host 侧若出现写文件，就会出现「页面显示开着、文件里写着关」的分叉。
  assert.doesNotMatch(host, /writeFileSync|writeFileAtomic|appendFile/, 'host 半边不得写文件（启停只有 sidecar 一个写者）');
  assert.match(host, /export const name = 'dsh-builtin-manager'/);

  const clientSrc = fs.readFileSync(CLIENT_FILE, 'utf8');
  assert.match(clientSrc, /require\("@deepseek-ai\/dsh-client-ui-primitives"\)/,
    '视觉必须走内核设计系统原语（与其它设置页同语言）');
  assert.doesNotMatch(clientSrc, /#[0-9a-fA-F]{6}\b/, '不得出现硬编码十六进制颜色（颜色只能取 --dsw-* 变量）');

  const { exports, registration } = loadPanel({}, { exposeInternals: true });
  assert.equal(typeof exports.apply, 'function', 'apply 必须是函数');
  assert.ok(Array.isArray(exports.inject) && exports.inject.includes('slots'), 'inject 必须声明 slots');
  assert.equal(registration.name, 'settings.plugins.tab',
    '必须挂进「设置 → 插件」的 tab 槽（内核自己那份只读清单在同槽，位置才对得上用户的直觉）');
  assert.equal(registration.id, 'builtin');
  assert.equal(typeof registration.label, 'function', 'label 必须是函数（locale 变化时要能重取）');
});

test('normalize：两种桥返回形状都收，非内置组与坏行剔除（带阳性对照）', () => {
  const { exports } = loadPanel({}, { exposeInternals: true });
  const { normalize } = exports.__test;

  const rows = [
    row({ id: 'a' }),
    row({ id: 'core-thing', group: 'core' }),
    row({ id: 'other-thing', group: 'other' }),
    row({ id: 'gone', group: 'removed', removed: true }),
    null,
    { name: '缺 id' },
    'string'
  ];
  assert.deepEqual(normalize(rows).map((r) => r.id), ['a'], '只留在册内置件，坏行与非内置组必须剔除');
  // 阳性对照：上面确实剔掉了 3 条组不符 + 3 条坏形，而不是「空集也叫绿」。
  assert.equal(normalize(rows.slice(0, 4)).length, 1);
  assert.equal(normalize([]).length, 0);
  assert.deepEqual(normalize({ plugins: [row({ id: 'b' })] }).map((r) => r.id), ['b'], '{plugins:[...]} 形状也必须收');
  assert.equal(normalize({ plugins: 'nope' }).length, 0, '形状不对时不得抛，交空集');
});

test('渲染：工具栏 + 计数 + 卡片行（状态 Tag 与锁定原因并存）', async () => {
  const bridge = {
    list: async () => ([
      row({ id: 'better-sidebar' }),
      row({ id: 'compaction-acp', name: '@deepseek-ai/dsh-compaction-acp', enabled: false, description: '压缩' }),
      row({ id: 'locked-one', name: 'dsh-locked', toggleable: false })
    ]),
    setEnabled: async () => ({ ok: true })
  };
  const { Component } = loadPanel({ dshDesktop: { pluginManager: bridge } });
  const tree = await createMounter(Component, {}).settle();

  assert.equal(cards(tree).length, 3, '三条内置件应渲染三张卡片');
  assert.equal(switches(tree).length, 3, '每张卡片一个开关');

  const c1 = cardOf(tree, 'better-sidebar');
  assert.equal(switches(c1)[0].props.checked, true, '第一条应为启用');
  assert.ok(textAll(c1).includes('已启用'), '状态 Tag 必须逐字给出状态: ' + textAll(c1));

  const c2 = cardOf(tree, 'compaction-acp');
  assert.equal(switches(c2)[0].props.checked, false, '第二条应为停用');
  assert.ok(textAll(c2).includes('已停用'), '状态 Tag 必须逐字给出状态: ' + textAll(c2));

  const c3 = cardOf(tree, 'locked-one');
  assert.equal(switches(c3)[0].props.disabled, true, '不可改的行的开关必须 disabled');
  const c3text = textAll(c3);
  assert.ok(c3text.includes('已启用'), '锁定行仍要显示真实状态（原因另起一行，不能顶替状态）: ' + c3text);
  assert.ok(c3text.includes('不能在这里改'), '锁定行必须说明原因: ' + c3text);

  // 搜索与筛选：控件在位，筛选项计数与数据同源。
  assert.equal(searchInput(tree).props.placeholder, '搜索名称、标识或描述');
  const seg = segmented(tree);
  // 展开一层再 map：options 数组产生在 vm realm，其 .map 结果带 vm 的 Array.prototype，
  // 直接 deepStrictEqual 会因原型不同假红。
  assert.deepEqual([...seg.props.options].map((o) => o.label), ['全部 3', '已启用 2', '已停用 1'],
    '筛选项计数必须与列表同源');
  assert.ok(textAll(tree).includes('共 3 条内置插件'), '计数与实际渲染条数必须同源: ' + textAll(tree).slice(0, 80));
  assert.ok(textAll(tree).includes('下次启动生效'), '必须写明生效时机: ' + textAll(tree).slice(0, 160));
});

test('搜索与筛选：按名称/描述缩列表，计数随动，无命中给出路', async () => {
  const bridge = {
    list: async () => ([
      row({ id: 'better-sidebar', description: '侧栏工作台' }),
      row({ id: 'easyrewrite', name: 'dsh-easyrewrite', description: '改写草稿', enabled: false }),
      row({ id: 'locked-one', name: 'dsh-locked', description: '被锁的件' })
    ]),
    setEnabled: async () => ({ ok: true })
  };
  const { Component } = loadPanel({ dshDesktop: { pluginManager: bridge } });
  const mounter = createMounter(Component, {});
  let tree = await mounter.settle();
  assert.equal(cards(tree).length, 3, '初始应可见全部三条');

  // 搜索：描述命中
  await searchInput(tree).props.onChange({ target: { value: '侧栏' } });
  tree = await mounter.settle();
  assert.deepEqual(cards(tree).map((c) => c.props['data-plugin-id']), ['better-sidebar'], '搜索必须按描述缩列表');
  assert.ok(textAll(tree).includes('当前显示 1 条'), '筛选态要给显示计数: ' + textAll(tree).slice(0, 120));

  // 清空 → 全量回来
  await searchInput(tree).props.onChange({ target: { value: '' } });
  tree = await mounter.settle();
  assert.equal(cards(tree).length, 3);

  // 状态筛选：只看停用
  await segmented(tree).props.onChange('off');
  tree = await mounter.settle();
  assert.deepEqual(cards(tree).map((c) => c.props['data-plugin-id']), ['easyrewrite'], '停用筛选必须只剩停用行');
  await segmented(tree).props.onChange('on');
  tree = await mounter.settle();
  assert.equal(cards(tree).length, 2, '启用筛选必须只剩启用行');
  await segmented(tree).props.onChange('all');
  tree = await mounter.settle();

  // 无命中：给出去路而不是空白
  await searchInput(tree).props.onChange({ target: { value: 'zzz-不存在' } });
  tree = await mounter.settle();
  assert.equal(cards(tree).length, 0, '无命中时列表应为空');
  assert.ok(textAll(tree).includes('没有匹配的内置插件'), '无命中必须有说明与出路: ' + textAll(tree).slice(0, 160));
});

test('开关：在途禁用 + 行内反馈；成功回写并挂「已改动」徽标；失败原文上屏且不谎报', async () => {
  const calls = [];
  let resolveWrite = null;
  let failWith = null;
  const bridge = {
    list: async () => ([row({ id: 'better-sidebar' }), row({ id: 'easyrewrite', name: 'dsh-easyrewrite' })]),
    setEnabled: (id, enabled) => {
      calls.push([id, enabled]);
      if (failWith) return Promise.resolve({ ok: false, error: failWith });
      return new Promise((resolve) => { resolveWrite = resolve; });
    }
  };
  const { Component } = loadPanel({ dshDesktop: { pluginManager: bridge } });
  const mounter = createMounter(Component, {});
  let tree = await mounter.settle();

  // —— 在途：开关禁用 + 「正在保存…」——
  clickSwitch(switches(cardOf(tree, 'easyrewrite'))[0]);
  tree = await mounter.settle(2);
  assert.equal(switches(cardOf(tree, 'easyrewrite'))[0].props.disabled, true, '写入在途时该行开关必须禁用');
  assert.ok(textAll(cardOf(tree, 'easyrewrite')).includes('正在保存'), '在途要有明确反馈');
  assert.deepEqual(calls, [['easyrewrite', false]], '必须按 (行 id, enabled) 调桥：id 是 cordis 按行寻址的键，不能传成包名');

  // —— 成功：行状态回写 + 成功反馈 + 「已改动」徽标，且只落在该行 ——
  resolveWrite({ ok: true });
  tree = await mounter.settle();
  const cEasy = cardOf(tree, 'easyrewrite');
  assert.equal(switches(cEasy)[0].props.checked, false, '行状态必须跟着实际结果走');
  assert.equal(switches(cEasy)[0].props.disabled, false, '写完后开关必须恢复可点');
  assert.ok(textAll(cEasy).includes('已保存「dsh-easyrewrite」为停用'), '成功提示要按行名与实际状态措辞: ' + textAll(cEasy));
  assert.ok(textAll(cEasy).includes('已改动'), '改过的行进内核半边还等下次启动，必须挂徽标: ' + textAll(cEasy));

  // —— 失败：sidecar 回 ok:false（例如带自定义配置被拒）时绝不能显示「已保存」——
  failWith = '该插件带自定义配置，禁止卸载: dsh-better-sidebar';
  clickSwitch(switches(cardOf(tree, 'better-sidebar'))[0]);
  tree = await mounter.settle();
  const cFail = cardOf(tree, 'better-sidebar');
  const failText = textAll(cFail);
  assert.ok(failText.includes('带自定义配置'), '失败原文必须上屏: ' + failText);
  assert.ok(!failText.includes('已保存'), '失败行不得出现任何「已保存」字样');
  assert.ok(!failText.includes('已改动'), '失败不得挂「已改动」徽标');
  assert.equal(switches(cFail)[0].props.checked, true, '保存失败后行状态不得偷偷翻转');
  assert.ok(textAll(cardOf(tree, 'easyrewrite')).includes('已保存'), '行内反馈按行独立：前一条成功反馈不因别的行失败被抹掉');
});

test('自锁：本页自己那条不可停用，且生效时机按实测措辞', async () => {
  const calls = [];
  const bridge = {
    list: async () => ([
      row({ id: 'dsh-builtin-manager', name: 'dsh-builtin-manager' }),
      row({ id: 'better-sidebar' })
    ]),
    setEnabled: async (id, enabled) => { calls.push([id, enabled]); return { ok: true }; }
  };
  const { Component } = loadPanel({ dshDesktop: { pluginManager: bridge } });
  const tree = await createMounter(Component, {}).settle();

  assert.equal(switches(tree).length, 2, '两条内置件应渲染两个开关');
  assert.equal(switches(cardOf(tree, 'dsh-builtin-manager'))[0].props.disabled, true,
    '管理页自己那条必须 disabled——关掉它就没有界面能开回来');
  assert.ok(textAll(cardOf(tree, 'dsh-builtin-manager')).includes('这是本管理页自己'), '必须说明为什么不能关');
  // 实测（2026-10-12 隔离安装布局 + 真内核页面）：disabled 写进去之后**重载页面**就读不到这条了，
  // 只有插件的内核半边才是下次启动。措辞不能一律写成「下次启动生效」。
  const text = textAll(tree);
  assert.ok(text.includes('刷新页面即更新') && text.includes('下次启动生效'),
    '生效时机要分两层写: ' + text.slice(-260));
  assert.equal(calls.length, 0, '渲染本身不得触发写');
});

test('无桥兜底：纯浏览器/WSL 直连内核时可读不可写', async () => {
  const { Component } = loadPanel({});   // window 里没有 dshDesktop
  const tree = await createMounter(Component, {}).settle();
  const text = textAll(tree);
  assert.ok(text.includes('没接到桌面客户端的插件通道'), '必须说清为什么不能改: ' + text.slice(0, 140));
  assert.equal(switches(tree).length, 0, '无桥时不得渲染可写开关');
});

test('版本：行内 muted 小字显示 v 前缀，缺 version 的行不渲染任何版本字样', async () => {
  const bridge = {
    list: async () => ([
      row({ id: 'easyrewrite', name: 'dsh-easyrewrite', version: '2.6.0' }),
      row({ id: 'offpeak', name: 'dsh-offpeak', version: 'v1.0.1' }),
      row({ id: 'no-version', name: 'dsh-no-version' })
    ]),
    setEnabled: async () => ({ ok: true })
  };
  const { Component } = loadPanel({ dshDesktop: { pluginManager: bridge } });
  const tree = await createMounter(Component, {}).settle();

  assert.ok(textAll(cardOf(tree, 'easyrewrite')).includes('v2.6.0'), '版本要带 v 前缀');
  assert.ok(textAll(cardOf(tree, 'offpeak')).includes('v1.0.1'), '上游已带 v 的版本必须原样显示');
  assert.ok(!textAll(cardOf(tree, 'offpeak')).includes('vv1.0.1'), '不得重复加 v');
  assert.doesNotMatch(textAll(cardOf(tree, 'no-version')), /v\d/i, '缺 version 的行不得渲染假版本');

  // muted 小字：版本是独立文本节点，12px + tertiary 色（不是标题、也不是状态 Tag）。
  let versionEl = null;
  walk(cardOf(tree, 'easyrewrite'), (n) => {
    if (n.props && n.props.children === 'v2.6.0' && n.props.style) versionEl = n;
  });
  assert.ok(versionEl, '版本必须是可单独定位的文本节点');
  assert.equal(versionEl.props.style.fontSize, 12);
  assert.match(versionEl.props.style.color, /label-tertiary/, '版本必须是 muted 色');
});

test('检查更新：可更新行出「更新」按钮与目标版本，已是最新给行内 muted 提示', async () => {
  const calls = [];
  const bridge = {
    list: async () => ([
      row({ id: 'better-sidebar', name: 'dsh-better-sidebar', version: '0.24.2' }),
      row({ id: 'easyrewrite', name: 'dsh-easyrewrite', version: '2.6.0' }),
      row({ id: 'offpeak', name: 'dsh-offpeak', version: '1.0.0' })
    ]),
    setEnabled: async () => ({ ok: true }),
    checkUpdates: async () => {
      calls.push(true);
      return { ok: true, items: [
        { id: 'better-sidebar', latest: '0.25.0', hasUpdate: true },
        { id: 'easyrewrite', latest: '2.7.0', hasUpdate: true },
        { id: 'offpeak', latest: '1.0.0', hasUpdate: false }
      ] };
    }
  };
  const { Component } = loadPanel({ dshDesktop: { pluginManager: bridge } });
  const mounter = createMounter(Component, {});
  let tree = await mounter.settle();
  assert.equal(buttonsWithText(tree, '更新').length, 0, '检查之前不得凭空画更新按钮');
  assert.equal(buttonsWithText(tree, '检查更新').length, 1, '工具栏必须有「检查更新」');

  await buttonsWithText(tree, '检查更新')[0].props.onClick();
  tree = await mounter.settle();
  assert.equal(calls.length, 1, '点一次必须真的调一次桥');

  const cEasy = cardOf(tree, 'easyrewrite');
  assert.equal(buttonsWithText(cEasy, '更新').length, 1, '可更新行必须出「更新」按钮');
  assert.ok(textAll(cEasy).includes('可更新'), '可更新行要有 Tag 文案: ' + textAll(cEasy));
  assert.ok(textAll(cEasy).includes('最新 v2.7.0'), '必须给出目标版本: ' + textAll(cEasy));

  const cOff = cardOf(tree, 'offpeak');
  assert.equal(buttonsWithText(cOff, '更新').length, 0, '已是最新不得出更新按钮');
  assert.ok(textAll(cOff).includes('已是最新'), '已是最新要有行内 muted 提示: ' + textAll(cOff));

  const cBs = cardOf(tree, 'better-sidebar');
  assert.equal(buttonsWithText(cBs, '更新').length, 0, 'better-sidebar 不参与单插件更新（按 id 兜底）');
  assert.ok(!textAll(cBs).includes('可更新'), 'better-sidebar 连可更新 Tag 也不该有');
});

test('检查失败：错误原文落页内，列表与开关不受影响（不整页炸）', async () => {
  const bridge = {
    list: async () => ([row({ id: 'better-sidebar' }), row({ id: 'easyrewrite', name: 'dsh-easyrewrite' })]),
    setEnabled: async () => ({ ok: true }),
    checkUpdates: async () => { throw new Error('更新源不可达: ETIMEDOUT'); }
  };
  const { Component } = loadPanel({ dshDesktop: { pluginManager: bridge } });
  const mounter = createMounter(Component, {});
  let tree = await mounter.settle();

  await buttonsWithText(tree, '检查更新')[0].props.onClick();
  tree = await mounter.settle();
  let text = textAll(tree);
  assert.ok(text.includes('更新源不可达: ETIMEDOUT'), '检查抛错时原文必须上屏: ' + text.slice(0, 220));
  assert.equal(cards(tree).length, 2, '检查失败不得清空列表');
  assert.equal(switches(tree).length, 2, '检查失败不得影响开关');
  assert.equal(buttonsWithText(tree, '更新').length, 0, '失败时不得画更新按钮');

  // 桥回 {ok:false} 的分支同样按原文上屏（不是只有 throw 才算失败）。
  bridge.checkUpdates = async () => ({ ok: false, error: '更新源拒绝: HTTP 403' });
  await buttonsWithText(tree, '检查更新')[0].props.onClick();
  tree = await mounter.settle();
  text = textAll(tree);
  assert.ok(text.includes('更新源拒绝: HTTP 403'), 'ok:false 的 error 原文也必须上屏: ' + text.slice(0, 220));
  assert.equal(cards(tree).length, 2, '仍不得清空列表');
});

test('更新成功：在途禁用 → 目标版本提示 + 重新 load，按钮随后消失', async () => {
  const listCalls = [];
  const updateCalls = [];
  let resolveUpdate = null;
  const bridge = {
    list: async () => {
      listCalls.push(true);
      return [row({ id: 'easyrewrite', name: 'dsh-easyrewrite', version: '2.6.0' })];
    },
    setEnabled: async () => ({ ok: true }),
    checkUpdates: async () => ({ ok: true, items: [{ id: 'easyrewrite', latest: '2.7.0', hasUpdate: true }] }),
    update: (id) => {
      updateCalls.push(id);
      return new Promise((resolve) => { resolveUpdate = resolve; });
    }
  };
  const { Component } = loadPanel({ dshDesktop: { pluginManager: bridge } });
  const mounter = createMounter(Component, {});
  let tree = await mounter.settle();
  await buttonsWithText(tree, '检查更新')[0].props.onClick();
  tree = await mounter.settle();
  assert.equal(listCalls.length, 1, '初始只读一次清单');

  const pending = buttonsWithText(cardOf(tree, 'easyrewrite'), '更新')[0].props.onClick();
  tree = await mounter.settle(2);
  const inFlight = buttonsWithText(cardOf(tree, 'easyrewrite'), '正在更新…');
  assert.equal(inFlight.length, 1, '在途按钮文案要变成「正在更新…」');
  assert.equal(inFlight[0].props.disabled, true, '在途必须禁用');
  assert.ok(textAll(cardOf(tree, 'easyrewrite')).includes('正在更新'), '在途要有行内反馈');

  resolveUpdate({ ok: true, version: '2.7.0', restartRequired: true });
  await pending;
  tree = await mounter.settle();

  assert.deepEqual(updateCalls, ['easyrewrite'], '必须按行 id 调 update（不能传包名）');
  assert.equal(listCalls.length, 2, '成功后必须重新 load 清单');
  const text = textAll(cardOf(tree, 'easyrewrite'));
  assert.ok(text.includes('已更新到 v2.7.0'), '成功提示必须带目标版本: ' + text);
  assert.ok(text.includes('下次启动生效'), '必须写明生效时机: ' + text);
  assert.equal(buttonsWithText(cardOf(tree, 'easyrewrite'), '更新').length, 0, '更新完不得继续挂更新按钮');
});

test('更新失败：sidecar 原文上屏、不谎报成功、按钮保留可重试', async () => {
  const bridge = {
    list: async () => ([row({ id: 'easyrewrite', name: 'dsh-easyrewrite', version: '2.6.0' })]),
    setEnabled: async () => ({ ok: true }),
    checkUpdates: async () => ({ ok: true, items: [{ id: 'easyrewrite', latest: '2.7.0', hasUpdate: true }] }),
    update: async () => ({ ok: false, error: '下载失败: ECONNRESET' })
  };
  const { Component } = loadPanel({ dshDesktop: { pluginManager: bridge } });
  const mounter = createMounter(Component, {});
  let tree = await mounter.settle();
  await buttonsWithText(tree, '检查更新')[0].props.onClick();
  tree = await mounter.settle();

  await buttonsWithText(cardOf(tree, 'easyrewrite'), '更新')[0].props.onClick();
  tree = await mounter.settle();

  const card = cardOf(tree, 'easyrewrite');
  const text = textAll(card);
  assert.ok(text.includes('下载失败: ECONNRESET'), 'sidecar 的 error 原文必须上屏: ' + text);
  assert.ok(!text.includes('已更新到'), '失败行不得出现「已更新到」');
  assert.ok(!text.includes('已改动'), '失败不得挂「已改动」徽标');
  const retry = buttonsWithText(card, '更新');
  assert.equal(retry.length, 1, '失败后按钮必须保留（可重试）');
  assert.equal(retry[0].props.disabled, false, '失败后按钮必须恢复可点');
});

test('better-sidebar：后端即使回 hasUpdate 也不画任何更新控件（按 id 兜底）', async () => {
  const bridge = {
    list: async () => ([
      row({ id: 'better-sidebar', name: 'dsh-better-sidebar', version: '0.24.2' }),
      row({ id: 'easyrewrite', name: 'dsh-easyrewrite', version: '2.6.0' })
    ]),
    setEnabled: async () => ({ ok: true }),
    checkUpdates: async () => ({ ok: true, items: [
      { id: 'better-sidebar', latest: '0.25.0', hasUpdate: true }
    ] }),
    update: async () => ({ ok: false, error: '该插件不支持独立更新: better-sidebar' })
  };
  const { Component } = loadPanel({ dshDesktop: { pluginManager: bridge } });
  const mounter = createMounter(Component, {});
  let tree = await mounter.settle();
  await buttonsWithText(tree, '检查更新')[0].props.onClick();
  tree = await mounter.settle();

  const cBs = cardOf(tree, 'better-sidebar');
  assert.equal(buttonsWithText(cBs, '更新').length, 0, 'better-sidebar 不得出现更新按钮');
  assert.ok(!textAll(cBs).includes('可更新'), '不得出现可更新 Tag');
  assert.ok(!textAll(cBs).includes('最新 v0.25.0'), '不得展示不会生效的目标版本');
  assert.ok(textAll(cBs).includes('v0.24.2'), '版本号仍要正常显示');
});

test('接管期说明：bili-native 行直说「/compact 消失是接管生效」，非接管件不跟风', async () => {
  // 报障原型（2026-11-09）：「上下文压缩插件有问题」——实际是接管成功把预设的
  // compaction-basic / command-compact 停了，用户看到的是 /compact 命令消失。
  const bridge = {
    list: async () => ([
      row({ id: 'bili-native', name: 'billion-context', description: '上下文压缩' }),
      row({ id: 'easyrewrite', name: 'dsh-easyrewrite', description: '改写' })
    ])
  };
  const { Component } = loadPanel({ dshDesktop: { pluginManager: bridge } });
  const tree = await createMounter(Component, {}).settle();

  const text = textAll(cardOf(tree, 'bili-native'));
  assert.match(text, /接管期说明/, '接管类内置件必须在行内把话说明白，别指望用户去翻文档');
  assert.match(text, /\/compact/, '要指名用户实际看见消失的那个命令');
  assert.match(text, /compaction-basic/, '说清它改的是预设里的哪两行（否则读起来像玄学）');

  assert.doesNotMatch(textAll(cardOf(tree, 'easyrewrite')), /接管期说明/,
    '阳性对照：文案按 id 精确命中，不得画给所有行');

  // 中英两份字典都要有这条（页面按 navigator.language 取字典，漏一份就是半边哑）
  const src = fs.readFileSync(CLIENT_FILE, 'utf8');
  assert.equal((src.match(/takeoverCompaction:/g) || []).length, 2, 'ZH / EN 两份字典都要带这条文案');
});

test('包面一致：bundle 层 loader id 与在册清单同 id，client 入口在 exports 里可达', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(PKG_DIR, 'package.json'), 'utf8'));
  assert.equal(pkg.dsh.bundle.patch, 'cordis.patch.yml');
  assert.equal(pkg.dsh.client.entry, 'client');
  assert.ok(pkg.exports['./client'].endsWith('lib/client.js'), './client 必须指到真实文件');

  const patch = fs.readFileSync(PATCH_FILE, 'utf8');
  // 注释里写着「禁止 disabled: !!js」，判据只能看非注释行。
  const patchCode = patch.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
  const m = /- insert:\s*\n\s*- id: (\S+)\s*\n\s*name: '([^']+)'/.exec(patchCode);
  assert.ok(m, 'cordis.patch.yml 必须声明自挂载条目');
  assert.equal(m[1], 'dsh-builtin-manager', 'loader id 是本套件与台账共同的键');
  assert.equal(m[2], pkg.name, 'name 必须是包名（issue #104 的坑：不一致会双挂载）');
  assert.doesNotMatch(patchCode, /disabled:\s*!!js/, '必选行上的 !!js 抛错会中断启动，禁止');

  const { COMPANION_PLUGINS } = require(path.join(DSH, 'scripts', 'lib', 'companion-plugins.js'));
  const hit = COMPANION_PLUGINS.filter((p) => p.id === m[1]);
  assert.equal(hit.length, 1, '在册清单里该 id 必须唯一命中');
  assert.equal(hit[0].name, pkg.name, '清单包名与 bundle 声明必须同源');

  // 自锁判据用的是行 id，而行 id 由 sidecar 按清单给——三方必须同值，否则自锁静默失效。
  const clientSrc = fs.readFileSync(path.join(PKG_DIR, 'lib', 'client.js'), 'utf8');
  const selfM = /const SELF = "([^"]+)"/.exec(clientSrc);
  assert.ok(selfM, 'client 必须定义 SELF 常量');
  assert.equal(selfM[1], m[1], 'SELF 必须等于 bundle 层 loader id');
  assert.equal(selfM[1], hit[0].id, 'SELF 必须等于在册清单的行 id');
});

// ---------------------------------------------------------------------------
// 反证四条：守卫被摘掉时行为必须按预期变形，否则上面的判据是空的
// ---------------------------------------------------------------------------

test('反证 1：摘掉 group 过滤后，core 行会混进列表（证明那条用例真在咬这条判据）', () => {
  const { exports } = loadPanel({}, {
    exposeInternals: true,
    mutate: (src) => src.replace('.filter((r) => r.group === "companion")', '')
  });
  const { normalize } = exports.__test;
  assert.equal(normalize([row({ id: 'a' }), row({ id: 'core-thing', group: 'core' })]).length, 2,
    '过滤已被摘掉，core 行应当漏进来');
});

test('反证 2：摘掉 ok===false 分支后，失败会被报成「已保存」（本套件因此不能少那条断言）', async () => {
  const calls = [];
  const bridge = {
    list: async () => ([row({ id: 'easyrewrite', name: 'dsh-easyrewrite' })]),
    setEnabled: async (id, enabled) => { calls.push([id, enabled]); return { ok: false, error: '被拒绝' }; }
  };
  const { Component } = loadPanel({ dshDesktop: { pluginManager: bridge } }, {
    mutate: (src) => {
      // 锚点带上行内注释：check() 里也有同形守卫，单行锚点会先打中它（本套件踩过）。
      const anchor = 'if (r && r.ok === false) {\n            // sidecar 拒了就是拒了';
      assert.ok(src.includes(anchor), '反证锚点必须存在（client.js 形状变了要同步本套件）');
      return src.replace(anchor, 'if (false) {\n            // sidecar 拒了就是拒了');
    }
  });
  const mounter = createMounter(Component, {});
  let tree = await mounter.settle();
  clickSwitch(switches(tree)[0]);
  tree = await mounter.settle();
  assert.equal(calls.length, 1, '桥必须真的被调用过（否则本条反证是空转）');
  assert.ok(textAll(tree).includes('已保存'), '守卫摘掉后页面会谎报已保存——这正是上面那条断言要防的');
});

test('反证 3：摘掉自锁分支后，本页自己那条变成可停用（自锁那条用例因此在咬真判据）', async () => {
  const calls = [];
  const bridge = {
    list: async () => ([row({ id: 'dsh-builtin-manager', name: 'dsh-builtin-manager' })]),
    setEnabled: async (id, enabled) => { calls.push([id, enabled]); return { ok: true }; }
  };
  const { Component } = loadPanel({ dshDesktop: { pluginManager: bridge } }, {
    mutate: (src) => src.replace('const locked = self || row.toggleable', 'const locked = row.toggleable')
  });
  const mounter = createMounter(Component, {});
  let tree = await mounter.settle();
  assert.equal(switches(tree)[0].props.disabled, false, '守卫摘掉后自己那条就该是可点的');
  clickSwitch(switches(tree)[0]);
  tree = await mounter.settle();
  assert.deepEqual(calls, [['dsh-builtin-manager', false]], '摘掉守卫后「关掉管理页」会被真的写下去');
});

test('反证 4：摘掉搜索过滤后，查询不再缩列表（搜索那条用例因此在咬真判据）', async () => {
  const bridge = {
    list: async () => ([row({ id: 'better-sidebar', description: '侧栏工作台' }), row({ id: 'easyrewrite', name: 'dsh-easyrewrite', description: '改写草稿' })]),
    setEnabled: async () => ({ ok: true })
  };
  const { Component } = loadPanel({ dshDesktop: { pluginManager: bridge } }, {
    mutate: (src) => src.replace('if (q === "") return true;', 'if (true) return true;')
  });
  const mounter = createMounter(Component, {});
  let tree = await mounter.settle();
  assert.equal(cards(tree).length, 2, '初始两条都在位（否则本条反证是空转）');
  await searchInput(tree).props.onChange({ target: { value: 'zzz-不存在' } });
  tree = await mounter.settle();
  assert.equal(cards(tree).length, 2, '过滤被摘掉后，无命中的查询也缩不动列表——正是搜索用例要防的');
});

test('反证 5：摘掉 better-sidebar 排除后，界面会画出必然失败的更新按钮（兜底那条在咬真判据）', async () => {
  const bridge = {
    list: async () => ([row({ id: 'better-sidebar', name: 'dsh-better-sidebar' })]),
    setEnabled: async () => ({ ok: true }),
    checkUpdates: async () => ({ ok: true, items: [{ id: 'better-sidebar', latest: '0.25.0', hasUpdate: true }] })
  };
  const anchor = 'const excluded = row.id === UPDATE_EXCLUDED_ID;';
  const { Component } = loadPanel({ dshDesktop: { pluginManager: bridge } }, {
    mutate: (src) => {
      assert.ok(src.includes(anchor), '反证锚点必须存在（client.js 形状变了要同步本套件）');
      return src.replace(anchor, 'const excluded = false;');
    }
  });
  const mounter = createMounter(Component, {});
  let tree = await mounter.settle();
  await buttonsWithText(tree, '检查更新')[0].props.onClick();
  tree = await mounter.settle();
  assert.equal(buttonsWithText(cardOf(tree, 'better-sidebar'), '更新').length, 1,
    '守卫摘掉后按钮就会画出来——这正是按 id 兜底要防的');
});

test('反证 6：摘掉 hasUpdate 判据后，已是最新的行也会长出更新按钮', async () => {
  const bridge = {
    list: async () => ([row({ id: 'offpeak', name: 'dsh-offpeak', version: '1.0.1' })]),
    setEnabled: async () => ({ ok: true }),
    checkUpdates: async () => ({ ok: true, items: [{ id: 'offpeak', latest: '1.0.1', hasUpdate: false }] })
  };
  const anchor = 'const updateOffered = !!upd && upd.hasUpdate === true';
  const { Component } = loadPanel({ dshDesktop: { pluginManager: bridge } }, {
    mutate: (src) => {
      assert.ok(src.includes(anchor), '反证锚点必须存在');
      return src.replace(anchor, 'const updateOffered = !!upd');
    }
  });
  const mounter = createMounter(Component, {});
  let tree = await mounter.settle();
  await buttonsWithText(tree, '检查更新')[0].props.onClick();
  tree = await mounter.settle();
  assert.equal(buttonsWithText(cardOf(tree, 'offpeak'), '更新').length, 1,
    '判据摘掉后「已是最新」也会出更新按钮——正是检查用例要防的');
});

test('反证 7：摘掉更新失败分支后，失败会被报成「已更新到」（失败原文用例因此不能少）', async () => {
  const bridge = {
    list: async () => ([row({ id: 'easyrewrite', name: 'dsh-easyrewrite', version: '2.6.0' })]),
    setEnabled: async () => ({ ok: true }),
    checkUpdates: async () => ({ ok: true, items: [{ id: 'easyrewrite', latest: '2.7.0', hasUpdate: true }] }),
    update: async () => ({ ok: false, error: '下载失败: ECONNRESET' })
  };
  const anchor = 'if (!r || r.ok === false) {';
  const { Component } = loadPanel({ dshDesktop: { pluginManager: bridge } }, {
    mutate: (src) => {
      assert.ok(src.includes(anchor), '反证锚点必须存在');
      return src.replace(anchor, 'if (false) {');
    }
  });
  const mounter = createMounter(Component, {});
  let tree = await mounter.settle();
  await buttonsWithText(tree, '检查更新')[0].props.onClick();
  tree = await mounter.settle();
  await buttonsWithText(cardOf(tree, 'easyrewrite'), '更新')[0].props.onClick();
  tree = await mounter.settle();
  assert.ok(textAll(cardOf(tree, 'easyrewrite')).includes('已更新到'),
    '守卫摘掉后失败会被谎报成成功——这正是失败原文那条断言要防的');
});

test('反证 8：摘掉行内接管期说明后，bili-native 行上那句话消失（渲染断言因此真在咬）', async () => {
  const bridge = { list: async () => ([row({ id: 'bili-native', name: 'billion-context' })]) };
  const anchor = 'caveat ? note(caveat, "muted") : null,';
  const { Component } = loadPanel({ dshDesktop: { pluginManager: bridge } }, {
    mutate: (src) => {
      assert.ok(src.includes(anchor), '反证锚点必须存在（渲染行形状变了要同步本套件）');
      return src.replace(anchor, '');
    }
  });
  const tree = await createMounter(Component, {}).settle();
  assert.doesNotMatch(textAll(cardOf(tree, 'bili-native')), /接管期说明/,
    '渲染色块摘掉后文案必须消失——否则上面的用例是在为不存在的渲染作证');
});
