'use strict';
// 逻辑级验证：dsh-balance 客户端 BalanceDock（CI 独立校验器，见 .github/workflows/ci.yml）
// 1) 不抛 ReferenceError；2) Go 用量 chip 正常渲染；3) children 为数组而非 join 字符串；
// 4) 0.1.2 宿主 HTTP 通道链路（场景4/4b）：首轮强制 → POST /refresh + GET /state，
//    重挂载只读缓存、404 后短路，且自制壳的 window 事件通道不再回来。
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

const file = path.join(__dirname, '..', '..', 'assets', 'plugins', 'dsh-balance', 'lib', 'client.js');
const src = fs.readFileSync(file, 'utf8');

// ---------- 最小 React mock：支持 useState / useEffect / jsx ----------
// hookStore[0] = balance data state；presetData 非 null 时直接作为 useState 初始值
// （模拟「数据已到手的那一帧」），为 null 时读回 hookStore[0]（= setData 之后）。
let hookStore = [];
let hookIndex = 0;
let pendingEffects = [];
let presetData = null; // 非 null 时 = 第一个 useState 的直接初始值（模拟推送后）

function resetHooks() {
  hookIndex = 0;
  pendingEffects = [];
}

const mockReact = {
  useState(init) {
    const i = hookIndex++;
    if (i === 0 && presetData !== null) {
      hookStore[0] = { value: presetData };
      return [presetData, () => {}];
    }
    if (hookStore[i] === undefined) {
      hookStore[i] = { value: typeof init === 'function' ? init() : init };
    }
    const slot = hookStore[i];
    const set = (next) => {
      slot.value = typeof next === 'function' ? next(slot.value) : next;
    };
    return [slot.value, set];
  },
  useEffect(cb) {
    hookIndex++;
    pendingEffects.push({ cb });
    return undefined;
  },
};

const mockJsxRuntime = {
  jsx(type, props, key) {
    return { __isReactElement: true, type, props: props || {}, key: key === undefined ? null : key };
  },
};

function runEffects() {
  for (const { cb } of pendingEffects) cb();
}

// ---------- 加载插件（window.__ModuleLoader__ 捕获 factory） ----------
// 0.1.2 起余额数据面换成插件宿主半边在内核 webServer 上的两条路由
// （GET /state 读载荷、POST /refresh 触发一轮查询）；自制壳时代的
// window.dshDesktop.refreshBalance 与 dsh-balance-changed 事件已退役，所以这里
// 注入的是沙箱内假 fetch，URL 待 mod 捕获后从 __internals 回填（不手抄字面量）。
let capturedLoad = null;
const URLS = { state: null, refresh: null };
const hostCalls = { state: 0, refresh: 0 };
const windowListenerCalls = [];
// 场景4 的宿主响应开关：{ kind: 'ok' | 'absent' | 'error', payload }
const hostState = { kind: 'ok', payload: null };
const sandboxWindow = {
  __ModuleLoader__: { load: (obj) => { capturedLoad = obj; } },
  // 退役反向锁的取证面：客户端若重新注册 window 事件监听，这里会记录到名字
  addEventListener: (name) => { windowListenerCalls.push(name); },
  removeEventListener: () => {},
  fetch: async (url, init) => {
    const method = (init && init.method) || 'GET';
    if (url === URLS.refresh && method === 'POST') {
      hostCalls.refresh += 1;
      return { status: 200, ok: true, json: async () => hostState.payload || {} };
    }
    if (url === URLS.state && method === 'GET') {
      hostCalls.state += 1;
      if (hostState.kind === 'absent') return { status: 404, ok: false, json: async () => ({}) };
      if (hostState.kind === 'error') throw new Error('HTTP 500');
      return { status: 200, ok: true, json: async () => hostState.payload };
    }
    throw new Error('unexpected fetch: ' + method + ' ' + url);
  },
};
sandboxWindow.window = sandboxWindow;

const sandbox = {
  window: sandboxWindow,
  document: { querySelector: () => null, createElement: () => ({ dataset: {}, textContent: '' }), head: { appendChild: () => {} } },
  CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init && init.detail; } },
  console,
  // 定时器兜底：0.1.2 起客户端改用 AbortSignal.timeout（vm 无此全局 → 被 typeof 守卫
  // 跳过）+ setInterval 轮询（同样被 typeof 守卫跳过），本项已非必需；保留是防止上游
  // 重新引入定时器时复现「CI 独立校验器在此崩掉即 main CI 变红」（旧坑见 53e0a4c 后记）。
  // unref：不阻塞进程退出（注意只对本沙箱生效，校验器自身的 flush 必须用存活定时器）。
  setTimeout: (fn, ms, ...args) => { const t = setTimeout(fn, ms, ...args); if (t.unref) t.unref(); return t; },
  clearTimeout,
};
vm.createContext(sandbox);
vm.runInContext(src, sandbox, { filename: 'client.js' });

if (!capturedLoad) throw new Error('未能捕获 ModuleLoader.load');
const mod = capturedLoad.factory((name) => {
  if (name === 'react') return mockReact;
  if (name === 'react/jsx-runtime') return mockJsxRuntime;
  throw new Error('unexpected require: ' + name);
});
if (typeof mod.apply !== 'function') throw new Error('exports.apply 缺失');

// ---------- 通过 slots 注册捕获 BalanceDock ----------
// dsh-balance 槽注册走 ctx.slots.inject(key, factory)（一方包正确姿势，
// 消除 conversation bundle 未就绪时 slots.register 硬抛竞态，见
// assets/plugins/dsh-balance/lib/client.js apply 注释）：mock 的 inject
// 立即求值 factory，捕获路径与旧 register 等价。
let dockComponent = null;
const fakeCtx = {
  slots: {
    register(slotInfo, Component) { dockComponent = Component; },
    inject(key, factory) {
      if (key !== 'conversation.composer.dock') throw new Error('unexpected slot key: ' + key);
      factory();
    },
  },
  effect(cb) { cb(); },
};
mod.apply(fakeCtx);
if (typeof dockComponent !== 'function') throw new Error('未能从 slots.inject/register 捕获 BalanceDock');

// 路由字面量取自插件自身常量：改路由不改测试锚 = 假绿
URLS.state = mod.__internals.STATE_URL;
URLS.refresh = mod.__internals.REFRESH_URL;

/**
 * 冲刷 effect 里的 await 链（fetch → json → setData 全在微任务里跑完）。
 * 定时器绝不 unref（与沙箱内 setTimeout 相反）：本校验器自身没有别的存活 handle，
 * unref 的定时器不算存活工作 → 进程会在 await 中途直接退出，实测只打印到场景4
 * 第一条断言且 EXIT=0，正是「用例没跑完却报绿」的假绿形态。
 */
function flush() {
  return new Promise((resolve) => setTimeout(resolve, 5));
}

/** 重渲染一帧：presetData 保持 null，useState 直接读回 hookStore[0]（= setData 后的状态）。 */
function reRender(usage) {
  presetData = null;
  resetHooks();
  return dockComponent({ useProjection: () => usage });
}

// ---------- 渲染驱动器：preset 为「事件已推送」的状态数据 ----------
function renderDock(data, usage) {
  presetData = data; // 模拟推送后：useState 直接拿到最新数据
  resetHooks();
  try {
    const result = dockComponent({ useProjection: () => usage });
    return { threw: null, result };
  } catch (err) {
    return { threw: err, result: undefined };
  }
}

function flattenChildren(node) {
  const out = [];
  (function walk(n) {
    if (n == null) return;
    if (Array.isArray(n)) return n.forEach(walk);
    if (typeof n === 'string' || typeof n === 'number') { out.push(String(n)); return; }
    if (n.__isReactElement) {
      out.push('<' + (typeof n.type === 'string' ? n.type : (n.type.name || 'Comp')) + (n.props.className ? ' class=' + n.props.className : ''));
      if (n.props.children !== undefined) walk(n.props.children);
    } else out.push(String(n));
  })(node);
  return out;
}

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('  ✔ ' + name);
  else { failures++; console.log('  ✘ ' + name + (detail ? '  → ' + detail : '')); }
}

console.log('场景1：无余额、无用量、无 Go（disabled 之外的空数据）→ 整体隐藏');
{
  const r = renderDock({ ok: false }, null);
  check('不抛异常', r.threw === null, r.threw ? r.threw.message : '');
  check('渲染 null', r.result === null);
}

console.log('场景2：有余额 + 有 Go 用量（修复前此场景炸 ReferenceError）');
{
  const go = {
    rolling: { status: 'ok', percent: 14, resetsAt: '2026-08-17T08:00:00Z' },
    weekly: { status: 'ok', percent: 42, resetsAt: '2026-08-20T00:00:00Z' },
    monthly: { status: 'ok', percent: 71, resetsAt: '2026-09-01T00:00:00Z' },
  };
  const data = {
    ok: true, peak: true,
    balances: [{ currency: 'CNY', total: 88.5, granted: 10, toppedUp: 78.5 }],
    prices: { cacheMiss: 3, cacheHit: 0.1, output: 9 },
    opencodeGo: { ok: true, usage: go },
  };
  const r = renderDock(data, { outputTokens: 0, uncachedInputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 });
  check('不抛异常（核心回归点 parts 已修复）', r.threw === null, r.threw ? r.threw.message : '');
  const flat = flattenChildren(r.result).join('|');
  check('包含余额文本', flat.includes('¥88.50'), flat);
  check('包含高峰价 chip', flat.includes('<span class=dsh-balance-peak'), flat);
  check('包含 Go chip（class=dsh-balance-go）', flat.includes('dsh-balance-go'), flat);
  check('Go 文本含 5h/周/月 三窗口', flat.includes('5h14%') && flat.includes('周42%') && flat.includes('月71%'), flat);
  const wrapper = r.result;
  check('顶层为 wrapper span', wrapper && wrapper.type === 'span' && wrapper.props.className === 'dsh-balance-wrap');
  check('children 为数组（非字符串 join）', Array.isArray(wrapper && wrapper.props.children), typeof (wrapper && wrapper.props.children));
}

console.log('场景3：仅 Go 用量（无余额）');
{
  const data = {
    ok: false, balances: [],
    opencodeGo: { ok: true, usage: { rolling: { status: 'ok', percent: 5, resetsAt: '' } } },
  };
  const r = renderDock(data, null);
  check('不抛异常', r.threw === null, r.threw ? r.threw.message : '');
  check('直接渲染 goDock', r.result && r.result.type === 'a' && r.result.props.className.includes('dsh-balance-go'), JSON.stringify(r.result && r.result.props && r.result.props.className));
  check('go 文本 = Go 5h5%', r.result.props.children === 'Go 5h5%', JSON.stringify(r.result.props.children));
}

// 场景4 起进异步：宿主通道是 fetch → json → setData 的微任务链，必须等它跑完
// 才能重渲染；汇总与 exit 也排在链尾，否则会先打印「全部通过」再判失败（假绿）。
(async () => {
  console.log('场景4：宿主 HTTP 通道链路（useBalanceData → POST /refresh + GET /state）');
  {
    // 全新 mount：useState 初值 {loading:true} → 等待首轮同步期间不渲染
    presetData = null;
    hookStore = [];
    resetHooks();
    hostCalls.state = 0;
    hostCalls.refresh = 0;
    hostState.kind = 'ok';
    hostState.payload = {
      ok: true, balances: [{ currency: 'CNY', total: 1, granted: 0, toppedUp: 1 }],
      opencodeGo: { ok: true, usage: { weekly: { status: 'ok', percent: 33, resetsAt: 'x' } } },
    };
    const r1 = dockComponent({ useProjection: () => null });
    check('loading 期不渲染', r1 === null);
    runEffects(); // 执行 useEffect：首轮强制同步（先 POST /refresh 再 GET /state）
    await flush();
    check('首轮强制：POST /refresh 恰好一次', hostCalls.refresh === 1, JSON.stringify(hostCalls));
    check('载荷只从 GET /state 读（同样恰好一次）', hostCalls.state === 1, JSON.stringify(hostCalls));
    check('自制壳事件通道已退役：客户端不再注册任何 window 监听',
      windowListenerCalls.length === 0, windowListenerCalls.join(','));
    // setData 已写入 hookStore[0]，重渲染即读到取回的载荷（同真实 React 的 re-render）
    const flat2 = flattenChildren(reRender(null)).join('|');
    check('取数后渲染出 Go 用量', flat2.includes('周33%'), flat2);
    check('取数后渲染出余额', flat2.includes('¥1.00'), flat2);
  }

  console.log('场景4b：/state 404（宿主半边缺席）→ 纯浏览器降级，且不再反复探测');
  {
    // 与场景4 共用同一沙箱：hostPolledOnce 已在场景4 置位（它在闭包里，测试无从重置），
    // 故本轮 force=false —— 只 GET /state，不再 POST /refresh。这正是要锁的行为：
    // 重挂载不得重复发起计费查询。
    presetData = null;
    hookStore = [];
    resetHooks();
    hostCalls.state = 0;
    hostCalls.refresh = 0;
    hostState.kind = 'absent';
    hostState.payload = null;
    dockComponent({ useProjection: () => null });
    runEffects();
    await flush();
    check('非首轮只读 /state，不 POST /refresh', hostCalls.state === 1 && hostCalls.refresh === 0, JSON.stringify(hostCalls));
    const flat = flattenChildren(reRender(null));
    check('降级载荷不炸（无余额/无用量/无 Go → 整体不渲染）', flat.length === 0, JSON.stringify(flat));
    // hostAbsent 已置位：再次挂载直接短路，零额外请求
    presetData = null;
    hookStore = [];
    resetHooks();
    dockComponent({ useProjection: () => null });
    runEffects();
    await flush();
    check('确认缺席后不再探测（calls 不增长）', hostCalls.state === 1 && hostCalls.refresh === 0, JSON.stringify(hostCalls));
    hostState.kind = 'ok';
  }

  console.log('场景5：disabled 配置（用户关闭显示）→ 隐藏');
  {
    const r = renderDock({ ok: false, disabled: true }, { outputTokens: 100, uncachedInputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 });
    check('不抛异常', r.threw === null, r.threw ? r.threw.message : '');
    check('渲染 null（整体隐藏）', r.result === null);
  }

  console.log('场景6：余额 dock 点击路由形态（外链点击委托 K15 依赖的 <a> 属性契约）');
  {
    const data = {
      ok: true, peak: false,
      balances: [{ currency: 'CNY', total: 88.5, granted: 10, toppedUp: 78.5 }],
      prices: { cacheMiss: 3, cacheHit: 0.1, output: 9 },
      opencodeGo: { ok: true, usage: { rolling: { status: 'ok', percent: 14, resetsAt: '' } } },
    };
    const r = renderDock(data, { outputTokens: 0, uncachedInputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 });
    check('不抛异常', r.threw === null, r.threw ? r.threw.message : '');
    const wrapper = r.result;
    check('顶层 wrapper 为 dsh-balance-wrap span', wrapper && wrapper.type === 'span' && wrapper.props.className === 'dsh-balance-wrap');
    const dock = wrapper && Array.isArray(wrapper.props.children) && wrapper.props.children[0];
    const goDock = wrapper && Array.isArray(wrapper.props.children) && wrapper.props.children[1];
    check('余额 dock 为 <a>（class=dsh-balance-dock）', dock && dock.type === 'a' && dock.props.className === 'dsh-balance-dock');
    check('余额 dock href = top_up（外链充值页）', dock && dock.props.href === 'https://platform.deepseek.com/top_up', dock && dock.props.href);
    check('余额 dock target=_blank（点击委托拦截信号）', dock && dock.props.target === '_blank');
    check('余额 dock rel 含 noopener', dock && typeof dock.props.rel === 'string' && dock.props.rel.indexOf('noopener') !== -1, dock && dock.props.rel);
    check('Go dock href = opencode.ai', goDock && goDock.type === 'a' && goDock.props.href === 'https://opencode.ai', goDock && goDock.props.href);
    check('Go dock target=_blank', goDock && goDock.props.target === '_blank');
  }

  console.log('\n' + (failures === 0 ? '🎉 全部断言通过' : '❌ ' + failures + ' 项失败'));
  process.exit(failures === 0 ? 0 : 1);
})().catch((err) => {
  console.error('校验器异常：', err);
  process.exit(1);
});