'use strict';

// unit-prompt-custom-client.test.js — dsh-prompt-custom 页内半边（lib/client.js）回归套件。
//
// 由来与 host 套件相同：交接包里的 repro-client.mjs 用 jsdom 真挂载，但验证台脚本没随包交付、
// 本机也没有 F: 那台机器；本机**没有 jsdom / happy-dom / react-test-renderer**（也不许凭空
// 增设依赖）。所以这里的挂载是「mini 钩子驱动」：用仓库里真实的 React 18 + react/jsx-runtime，
// 通过 React 内部 dispatcher 槽位手驱 useState/useRef/useCallback/useEffect，直接把真实
// client 源码里的 Card 组件跑起来（fetch 走 mock）。证据强度记为「真实插件源码 + 复刻渲染夹具
// （非浏览器语义，仅本组件用到的钩子面）」——不冒充浏览器实测。
//
// 覆盖：模块加载契约 / 首渲染不抛 / statusLine 三态与「跨版本不谎报」/ 版本错配顶部告警与反例 /
// 预览退化（旧宿主只有 text）/ 未保存编辑不被开关操作偷偷提交 / POST 失败回滚 / 变量告警入 UI。
// 未覆盖（需要真 DOM）：真事件冒泡、真滚动布局、真 fetch 网络栈 —— 属 repro-client.mjs 的能力面，
// 本机无法复现，如实留档。
//
// 反证：见文件末尾 —— 去掉 statusLine 的「armed/injected 均未知则不作声」守卫，判据必须变红。

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const React = require('react');
const jsxRuntime = require('react/jsx-runtime');

const DSH = path.resolve(__dirname, '..', '..');
const CLIENT_FILE = path.join(DSH, 'assets', 'plugins', 'dsh-prompt-custom', 'lib', 'client.js');
const PKG_FILE = path.join(DSH, 'assets', 'plugins', 'dsh-prompt-custom', 'package.json');
const HOST_FILE = path.join(DSH, 'assets', 'plugins', 'dsh-prompt-custom', 'lib', 'index.js');

const CONFIG_URL = '/api/dsh-prompt-custom/config';
const PREVIEW_URL = '/api/dsh-prompt-custom/preview';

// ---------------------------------------------------------------------------
// 加载真实 client 源码（vm，window.__ModuleLoader__ 捕获）
// ---------------------------------------------------------------------------

/**
 * 在 vm 里执行 client.js，拿到模块工厂。
 * @param opts.exposeInternals 追加一行 `exports.__test = { statusLine, L };`（仅内存副本，
 *   不动仓库文件）——statusLine / L 是闭包内部名，不透出就只能复述实现，那还不如不透出。
 */
function evalClient(opts = {}) {
  let src = fs.readFileSync(CLIENT_FILE, 'utf8');
  if (opts.exposeInternals) {
    assert.ok(src.includes('exports.inject = inject;'), '内部导出锚点必须存在（client.js 形状变了要同步本套件）');
    src = src.replace('exports.inject = inject;', 'exports.inject = inject;\n    exports.__test = { statusLine, L };');
  }
  const sandbox = {
    window: { __ModuleLoader__: { load(mod) { sandbox.__loaded = mod; } } },
    console,
    // vm 沙箱没有 fetch：转发到宿主 global（mock 由 mockFetch 在宿主换掉）
    fetch: (...args) => global.fetch(...args)
  };
  vm.runInNewContext(src, sandbox, { filename: 'dsh-prompt-custom-client.js' });
  const loaded = sandbox.__loaded;
  assert.ok(loaded && typeof loaded.factory === 'function', 'client.js 必须经 __ModuleLoader__.load 注册 factory');
  const fakeRequire = (name) => {
    if (name === 'react') return React;
    if (name === 'react/jsx-runtime') return jsxRuntime;
    throw new Error('client 不得 require 模块：' + name);
  };
  return { loaded, exports: loaded.factory(fakeRequire) };
}

// ---------------------------------------------------------------------------
// mini 钩子驱动：够本组件用（useState / useRef / useCallback / useEffect）
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
    useRef(init) {
      const i = cursor++;
      if (!(i in cells)) cells[i] = { value: { current: init } };
      return cells[i].value;
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
    },
    useLayoutEffect(fn, deps) { return hooks.useEffect(fn, deps); }
  };

  const render = () => {
    cursor = 0;
    const prev = slot.current;
    slot.current = hooks;
    try { tree = Component(props); } finally { slot.current = prev; }
    return tree;
  };

  const flushEffects = () => {
    for (const fn of pendingEffects.splice(0)) fn();
  };

  /** 渲染 → 跑新 effect → 等异步流沉降 → 若有 setState 再渲染，直到稳定（有界）。 */
  const settle = async (rounds = 12) => {
    for (let i = 0; i < rounds; i++) {
      scheduled = false;
      render();
      flushEffects();
      await new Promise((r) => setTimeout(r, 1));
      if (!scheduled && pendingEffects.length === 0) break;
    }
    return tree;
  };

  return { settle, deep: () => tree };
}

// ---- React 元素树小工具 ----
function textAll(node) {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textAll).join('');
  if (typeof node === 'object' && node.props) return textAll(node.props.children);
  return '';
}
function collect(node, out = []) {
  if (node === null || node === undefined || typeof node === 'boolean') return out;
  if (Array.isArray(node)) { node.forEach((n) => collect(n, out)); return out; }
  if (typeof node !== 'object' || !node.props) return out;
  out.push(node);
  collect(node.props.children, out);
  return out;
}
/** 按可见文本找元素（元素自身子树文本 === 期望值）。 */
const byText = (tree, text) => collect(tree).find((el) => textAll(el) === text) || null;
const byTextIncludes = (tree, text) => collect(tree).find((el) => textAll(el).includes(text)) || null;
/** 从模块里取出 Card 组件（apply → slots.register 的 render 回调 → jsx(Card) → type）。 */
function cardOf(exports) {
  let render = null;
  exports.apply({ slots: { inject(n, cb) { cb(); }, register(spec, r) { render = r; } } });
  assert.ok(typeof render === 'function', 'client 必须注册 settings.section 渲染回调');
  return render({}).type;
}

// ---------------------------------------------------------------------------
// fetch mock
// ---------------------------------------------------------------------------

function mockFetch(t, handler) {
  const prev = global.fetch;
  const calls = [];
  global.fetch = async (url, opts = {}) => {
    calls.push({ url: String(url), method: opts.method || 'GET', body: opts.body ? JSON.parse(opts.body) : null });
    return handler(String(url), opts, calls.length - 1);
  };
  t.after(() => { global.fetch = prev; });
  return calls;
}
const jsonResponse = (body, ok = true, status = 200) => ({ ok, status, json: async () => body });

const CONFIG_OK = {
  ok: true,
  config: { enabled: true, mode: 'append', text: 'SAVED-TEXT' },
  proto: 2,
  armed: true,
  injected: 2,
  lastError: null,
  unknownConfigKeys: [],
  unknownVariables: [],
  malformedVariables: [],
  path: 'X'
};

/** 默认路由：config GET/POST 与 preview 都按可配置 payload 应答。 */
function defaultHandler(t, over = {}) {
  return mockFetch(t, (url, opts) => {
    if (url === CONFIG_URL) {
      if ((opts.method || 'GET') === 'POST') {
        return jsonResponse(over.postBody || { ...CONFIG_OK, config: { enabled: JSON.parse(opts.body).enabled, mode: 'append', text: 'SAVED-TEXT' } });
      }
      return jsonResponse(over.config || CONFIG_OK);
    }
    if (url === PREVIEW_URL) return jsonResponse(over.preview || { ok: true, text: 'PREVIEW-TEXT', proto: 2 });
    return jsonResponse({ ok: false, message: 'unexpected url ' + url }, false, 404);
  });
}

// ---------------------------------------------------------------------------
// 1. 模块加载契约
// ---------------------------------------------------------------------------

test('模块加载契约：注册 id 与包名一致、apply/inject 形状、settings.section 槽位注册参数', (t) => {
  const pkg = JSON.parse(fs.readFileSync(PKG_FILE, 'utf8'));
  const { loaded, exports } = evalClient();

  assert.equal(loaded.id, pkg.name, 'loader id 必须等于包名（内核按 id 装载）');
  assert.equal(typeof exports.apply, 'function');
  assert.deepEqual([...exports.inject], ['slots'], 'inject 必须声明 slots');

  const bets = [];
  const fakeCtx = {
    slots: {
      inject(name, cb) { bets.push(['inject', name]); cb(); },
      register(spec, render) { bets.push(['register', spec, render]); return () => {}; }
    }
  };
  exports.apply(fakeCtx);
  assert.deepEqual(bets[0], ['inject', 'settings.section'], '必须经 settings.section 槽注入');
  const [kind, spec, render] = bets[1];
  assert.equal(kind, 'register');
  assert.equal(spec.name, 'settings.section');
  assert.equal(spec.id, 'dsh-prompt-custom');
  assert.equal(spec.order, 60);
  assert.equal(spec.label(), '自定义提示词');
  const el = render({});
  assert.ok(el && typeof el.type === 'function', 'render 回调必须产出 Card 元素');
});

test('首渲染不抛：真实 React 下 Card 初始渲染为「加载中…」', async (t) => {
  const { exports } = evalClient({ exposeInternals: true });
  const specRender = (() => {
    let out = null;
    exports.apply({ slots: { inject(n, cb) { cb(); }, register(spec, render) { out = render; } } });
    return out;
  })();
  const el = specRender({});
  const html = require('react-dom/server').renderToStaticMarkup(el);
  assert.ok(html.includes(exports.__test.L.loading), '首渲染应显示加载中，且不得抛');
});

// ---------------------------------------------------------------------------
// 2. statusLine 三态（0.3.0/0.3.1 的「状态要么真实、要么沉默」）
// ---------------------------------------------------------------------------

test('statusLine：lastError > 未知字段沉默 > 停用 > armed > 已注入', async (t) => {
  const { exports } = evalClient({ exposeInternals: true });
  const { statusLine, L } = exports.__test;
  // statusLine 的返回值是 vm 域的普通对象：先搬进宿主域再断言（否则 deepStrictEqual 比原型必红）
  const norm = (s) => (s === null ? null : { text: String(s.text), tone: String(s.tone) });

  assert.equal(statusLine(undefined), null, '无 payload 时不得编状态');
  assert.equal(statusLine({}), null, 'armed/injected 均未知（旧宿主）必须沉默——宁可不显示也不谎报「已停用」');

  assert.deepEqual(norm(statusLine({ lastError: 'boom' })), { text: L.stError('boom'), tone: 'error' }, 'lastError 优先级最高');
  assert.deepEqual(norm(statusLine({ armed: false, injected: 0 })), { text: L.stOff, tone: 'muted' });
  assert.deepEqual(norm(statusLine({ armed: true, injected: 0 })), { text: L.stArmed, tone: 'muted' });
  assert.deepEqual(norm(statusLine({ armed: true, injected: 3 })), { text: L.stInjected(3), tone: 'ok' });
  assert.equal(statusLine({ armed: true, injected: 3, lastError: 'x' }).tone, 'error', 'lastError 压过一切');
});

// ---------------------------------------------------------------------------
// 3. 挂载后的交互（mini 钩子驱动）
// ---------------------------------------------------------------------------

test('版本错配（正/反例）：告警在顶部、proto=2 沉默', async (t) => {
  const { exports } = evalClient({ exposeInternals: true });
  const { L } = exports.__test;
  const card = cardOf(exports);

  // 反例：proto=2 不出现告警
  defaultHandler(t, {});
  const good = createMounter(card, {});
  let tree = await good.settle();
  assert.equal(byTextIncludes(tree, L.staleHost), null, 'proto=2 不得误报版本错配');

  // 正例：proto=1 出现告警，且在「启用自定义提示词」之前（页面顶部）
  defaultHandler(t, { config: { ...CONFIG_OK, proto: 1 } });
  const bad = createMounter(card, {});
  tree = await bad.settle();
  const doc = textAll(tree);
  const atWarn = doc.indexOf(L.staleHost);
  const atEnabled = doc.indexOf(L.enabled);
  assert.ok(atWarn >= 0, 'proto≠2 必须给出醒目提示');
  assert.ok(atEnabled >= 0 && atWarn < atEnabled, '告警必须排在内容最前（页面顶部）');
});

test('预览退化：旧宿主只有 text → 预览框显示 text 且不得是「(空)」；新宿主用 official', async (t) => {
  const { exports } = evalClient({ exposeInternals: true });
  const { L } = exports.__test;
  const card = cardOf(exports);

  defaultHandler(t, { preview: { ok: true, text: 'LEGACY-TEXT', proto: 2 } });
  const m = createMounter(card, {});
  let tree = await m.settle();

  const officialBtn = byText(tree, L.previewOfficial);
  assert.ok(officialBtn, '应有「预览官方提示词」按钮');
  await officialBtn.props.onClick();
  tree = await m.settle();
  const box = collect(tree).find((el) => el.type === 'textarea' && el.props.readOnly === true);
  assert.ok(box, '预览框应已打开');
  assert.equal(box.props.value, 'LEGACY-TEXT', '旧接口缺 official/effective 时退化为 data.text');
  assert.notEqual(box.props.value, '(空)', '不得显示空框');

  // 新宿主：official 优先
  defaultHandler(t, { preview: { ok: true, official: 'OFFICIAL-FULL', effective: 'EFFECTIVE-FULL', text: 'COMPAT', proto: 2 } });
  await byText(m.deep(), L.previewOfficial).props.onClick();
  tree = await m.settle();
  const box2 = collect(tree).find((el) => el.type === 'textarea' && el.props.readOnly === true);
  assert.equal(box2.props.value, 'OFFICIAL-FULL', '新接口必须用 official 字段');
});

test('开关即时生效：POST 只用已保存正文；未保存编辑保持不动、dirty 提示在场', async (t) => {
  const { exports } = evalClient({ exposeInternals: true });
  const { L } = exports.__test;
  const card = cardOf(exports);

  const calls = defaultHandler(t, {});
  const m = createMounter(card, {});
  let tree = await m.settle();

  // 编辑正文（不保存）
  const editor = collect(tree).find((el) => el.type === 'textarea' && el.props.readOnly !== true);
  editor.props.onChange({ target: { value: 'UNSAVED-EDIT' } });
  tree = await m.settle();
  assert.ok(byTextIncludes(tree, L.dirty), '未保存时应显示 dirty 提示');

  // 点开关 → 立即 POST，且正文必须是「已保存」的那份
  const box = collect(tree).find((el) => el.type === 'input' && el.props.type === 'checkbox');
  assert.equal(box.props.checked, true);
  await box.props.onChange({ target: { checked: false } });
  tree = await m.settle();

  const post = calls.filter((c) => c.url === CONFIG_URL && c.method === 'POST');
  assert.equal(post.length, 1, '开关变化应立即 POST 一次（无需点保存）');
  assert.equal(post[0].body.enabled, false);
  assert.equal(post[0].body.text, 'SAVED-TEXT', '开关操作不得把未保存编辑偷偷写进去');
  assert.ok(byTextIncludes(tree, L.dirty), '开关操作后未保存编辑仍在、dirty 提示仍在');
  const editor2 = collect(tree).find((el) => el.type === 'textarea' && el.props.readOnly !== true);
  assert.equal(editor2.props.value, 'UNSAVED-EDIT');
});

test('POST 失败：开关拨回服务端真实状态并显示错误（界面绝不显示未生效的开关）', async (t) => {
  const { exports } = evalClient({ exposeInternals: true });
  const { L } = exports.__test;
  const card = cardOf(exports);

  defaultHandler(t, { postBody: { ok: false, message: 'CONFIG-HTTP-500' } });
  const m = createMounter(card, {});
  let tree = await m.settle();

  const box = collect(tree).find((el) => el.type === 'input' && el.props.type === 'checkbox');
  await box.props.onChange({ target: { checked: false } });
  tree = await m.settle();

  const box2 = collect(tree).find((el) => el.type === 'input' && el.props.type === 'checkbox');
  assert.equal(box2.props.checked, true, 'POST 失败必须把开关拨回真实状态');
  assert.ok(byTextIncludes(tree, 'CONFIG-HTTP-500'), '失败原因应显示在界面上');
});

test('变量告警与陌生配置键进入 UI（{{name}} 加花括号显示）', async (t) => {
  const { exports } = evalClient({ exposeInternals: true });
  const { L } = exports.__test;
  const card = cardOf(exports);

  defaultHandler(t, {
    config: {
      ...CONFIG_OK,
      unknownVariables: ['nope_unknown'],
      malformedVariables: ['Bad.Name'],
      unknownConfigKeys: ['futureField']
    }
  });
  const m = createMounter(card, {});
  const tree = await m.settle();

  assert.ok(byTextIncludes(tree, '{{nope_unknown}}'), '未知变量应显示为 {{name}}');
  assert.ok(byTextIncludes(tree, '{{Bad.Name}}'), '畸形变量应显示为 {{name}}');
  assert.ok(byTextIncludes(tree, 'futureField'), '陌生配置键应显示');
});

// ---------------------------------------------------------------------------
// 4. 协议常量配对（client.EXPECT_PROTO ↔ host.API_PROTO）
// ---------------------------------------------------------------------------

test('协议常量配对：client EXPECT_PROTO === host API_PROTO（宿主不重启只刷新页面时的判据）', () => {
  const clientSrc = fs.readFileSync(CLIENT_FILE, 'utf8');
  const hostSrc = fs.readFileSync(HOST_FILE, 'utf8');
  const expect = /const EXPECT_PROTO = (\d+);/.exec(clientSrc);
  const api = /const API_PROTO = (\d+);/.exec(hostSrc);
  assert.ok(expect && api, '两侧协议常量必须可解析（改名要同步本套件）');
  assert.equal(expect[1], api[1], 'client 的错配判据必须与 host 实际协议号一致');
});

// ---------------------------------------------------------------------------
// 5. 反证：拿掉 statusLine 的「未知则沉默」守卫 → 判据必须变红
// ---------------------------------------------------------------------------

test('反证：删掉 statusLine 的未知字段守卫 → 「跨版本不谎报」判据变红', () => {
  let src = fs.readFileSync(CLIENT_FILE, 'utf8');
  const anchor = 'if (st.armed === undefined && st.injected === undefined) return null;';
  assert.ok(src.includes(anchor), '反证锚点必须存在');
  src = src.replace(anchor, '');
  src = src.replace('exports.inject = inject;', 'exports.inject = inject;\n    exports.__test = { statusLine };');
  const sandbox = { window: { __ModuleLoader__: { load(mod) { sandbox.__loaded = mod; } } }, console };
  vm.runInNewContext(src, sandbox, { filename: 'dsh-prompt-custom-client.mutant.js' });
  const mutant = sandbox.__loaded.factory((name) => {
    if (name === 'react') return React;
    if (name === 'react/jsx-runtime') return jsxRuntime;
    throw new Error(name);
  });
  const result = mutant.__test.statusLine({});
  assert.notEqual(result, null, '变异体应把「未知」谎报成停用（证明原判据确实在拦这种事）');
  assert.equal(result.tone, 'muted', '变异体走的正是误报路径');
});
