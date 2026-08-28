'use strict';

// dsh-balance 客户端展示层边界测试（vm 沙箱加载真实 client.js 产物）。
// 覆盖范围与缺陷对照见 docs/balance-architecture.md 第 9 节：
//   tokenUsage 归一化（NaN 清零回归 / inputTokens 形态兼容 / 每操作数守卫）
//   priceTable 按真实模型取价 + 「按默认模型估算」标注
//   sessionCost 下限保护（负 token 不产生负费用）
//   money 格式化边界（0/超大/非有限）
//   rel=noopener noreferrer
//   goUsageText 全空返回 null（不渲染空白 chip）
//   单一投递（invoke 只触发、不消费返回值）
// 隔离承诺：纯内存 vm，不触碰任何文件系统/网络/真实 React。

const test = require('node:test');
const assert = require('node:assert');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

const CLIENT_PATH = path.join(__dirname, '..', '..', 'assets', 'plugins', 'dsh-balance', 'lib', 'client.js');
const SRC = fs.readFileSync(CLIENT_PATH, 'utf8');

// ---------------------------------------------------------------------------
// 测试床：每次 loadClient() 生成全新沙箱（模块级状态如 bridgePushedOnce 隔离）
// ---------------------------------------------------------------------------
// opts.now        —— 固定沙箱时钟（Date.now()/无参 new Date()）：时段计价用例
// opts.storage    —— 注入 localStorage mock（跨 loadClient 共享 = 模拟页面重载）
// opts.sessionId  —— sessions 服务返回的当前会话 id（费用账本键控）
// ---------------------------------------------------------------------------

function makeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

function loadClient(bridgeOverrides, opts = {}) {
  const calls = { refreshBalance: 0, handler: null };
  const listeners = new Map();
  // 时间源控制：沙箱 Date 的静态 now()/无参构造返回固定值；
  // new Date(ms) 原样透传（beijingPartsOf 的 UTC 平移读法依赖数值构造）。
  const realDate = Date;
  const fixedNow = Number.isFinite(opts.now) ? { value: opts.now } : null;
  const SandboxDate = fixedNow === null ? realDate : class extends realDate {
    constructor(...args) { super(...(args.length > 0 ? args : [fixedNow.value])); }
    static now() { return fixedNow.value; }
  };
  const storage = opts.storage !== undefined ? opts.storage : null;
  let sessionId = opts.sessionId;
  const sandboxWindow = {
    __ModuleLoader__: { load: (obj) => { calls.captured = obj; } },
    dshDesktop: bridgeOverrides && bridgeOverrides.dshDesktop !== undefined
      ? bridgeOverrides.dshDesktop
      : { refreshBalance: () => { calls.refreshBalance += 1; return Promise.resolve(); } },
    addEventListener: (name, cb) => { listeners.set(name, cb); if (name === 'dsh-balance-changed') calls.handler = cb; },
    removeEventListener: () => {},
    dispatchEvent: () => {},
  };
  sandboxWindow.window = sandboxWindow;
  const sandbox = {
    window: sandboxWindow,
    document: { querySelector: () => null, createElement: () => ({ dataset: {}, textContent: '' }), head: { appendChild: () => {} } },
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init && init.detail; } },
    console,
    // client.js 的桥推送超时降级（setTimeout 4s 兜底）在浏览器合法，但 vm
    // 沙箱默认无定时器 → ReferenceError（T1 实测「单一投递」两用例恒红）。
    // unref：不清理的挂起定时器不阻塞测试进程退出。
    setTimeout: (fn, ms, ...args) => { const t = setTimeout(fn, ms, ...args); if (t.unref) t.unref(); return t; },
    clearTimeout,
    Date: SandboxDate,
  };
  if (storage !== null) sandbox.localStorage = storage;
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox, { filename: 'client.js' });

  // ---------- 最小 React mock（与 verify-balance-dock.cjs 同构） ----------
  let hookStore = [];
  let hookIndex = 0;
  let pendingEffects = [];
  let presetData = null;

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
      const set = (next) => { slot.value = typeof next === 'function' ? next(slot.value) : next; };
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

  const mod = calls.captured.factory((name) => {
    if (name === 'react') return mockReact;
    if (name === 'react/jsx-runtime') return mockJsxRuntime;
    throw new Error('unexpected require: ' + name);
  });

  let dockComponent = null;
  // dsh-balance 槽注册走 ctx.slots.inject(key, factory)（一方包正确姿势，
  // 消除「conversation 大 bundle 未就绪时 slots.register 硬抛 slot is not
  // declared」的冷启动竞态，见 lib/client.js apply 注释）：mock 的 inject
  // 立即求值 factory，落到与旧 register 相同的捕获路径，断言语义不变。
  const fakeCtx = {
    get: (name) => (name === 'sessions' && sessionId !== undefined
      ? { list: { getSnapshot: () => ({ current: sessionId }) } }
      : undefined),
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

  function render(usage, data, opts = {}) {
    if (opts.preset !== false) presetData = data === undefined ? null : data;
    resetHooks();
    let result;
    let threw = null;
    try {
      result = dockComponent({ useProjection: () => usage });
    } catch (err) {
      threw = err;
    }
    return { result, threw };
  }

  function runEffects() {
    for (const { cb } of pendingEffects) cb();
  }

  return {
    calls, listeners, render, runEffects, resetHooks, dock: () => dockComponent, setPresetData: (d) => { presetData = d; },
    setNow: (ms) => { if (fixedNow !== null) fixedNow.value = ms; },
    setSessionId: (id) => { sessionId = id; },
  };
}

/** 收集渲染树全部文本。 */
function collectText(node, out = []) {
  if (node == null) return out;
  if (Array.isArray(node)) { node.forEach((n) => collectText(n, out)); return out; }
  if (typeof node === 'string' || typeof node === 'number') { out.push(String(node)); return out; }
  if (node.__isReactElement) collectText(node.props.children, out);
  return out;
}

/** 从渲染树提取「本轮 ¥…」chip 文本。 */
function costChipText(r) {
  if (!r || !r.result || r.threw) return null;
  const texts = collectText(r.result);
  return texts.find((t) => t.startsWith('本轮 ¥')) || null;
}

/** 提取第一个 <a> 元素（余额 dock）。 */
function firstAnchor(r) {
  const walk = (n) => {
    if (n == null) return null;
    if (Array.isArray(n)) { for (const c of n) { const hit = walk(c); if (hit) return hit; } return null; }
    if (n.__isReactElement) {
      if (n.type === 'a') return n;
      return walk(n.props.children);
    }
    return null;
  };
  return r && r.result && !r.threw ? walk(r.result) : null;
}

const FLASH = { cacheMiss: 3, cacheHit: 0.1, output: 9 };
const PRO = { cacheMiss: 9, cacheHit: 0.3, output: 27 };
const BALANCE_DATA = {
  ok: true,
  balances: [{ currency: 'CNY', total: 88.5, granted: 10, toppedUp: 78.5 }],
  prices: FLASH,
  priceTable: { 'deepseek-v4-flash': FLASH, 'deepseek-v4-pro': PRO },
  model: 'deepseek-v4-flash',
};

// ---------------------------------------------------------------------------
// tokenUsage 归一化 + sessionCost 矩阵
// ---------------------------------------------------------------------------

test('sessionCost: 投影形态（uncachedInputTokens）计费正确', () => {
  const h = loadClient();
  const usage = { uncachedInputTokens: 1e6, cacheWriteTokens: 0, cacheReadTokens: 0, outputTokens: 1e6 };
  const r = h.render(usage, BALANCE_DATA);
  assert.strictEqual(costChipText(r), '本轮 ¥12.00', '1M miss × 3 + 1M out × 9 = 12');
});

test('sessionCost: provider 形态（inputTokens）同样计费（[BUG] 旧代码恒为 0）', () => {
  const h = loadClient();
  const usage = { inputTokens: 1e6, outputTokens: 1e6, cacheReadTokens: 0 };
  const r = h.render(usage, BALANCE_DATA);
  assert.strictEqual(costChipText(r), '本轮 ¥12.00', 'inputTokens 必须折算为未缓存输入计 miss 价');
});

test('sessionCost: cacheWriteTokens 缺省不再 NaN 清零（[BUG] 旧代码 undefined+undefined=NaN→0）', () => {
  const h = loadClient();
  const usage = { uncachedInputTokens: 1e6, cacheReadTokens: 0, outputTokens: 0 }; // 无 cacheWriteTokens
  const r = h.render(usage, BALANCE_DATA);
  assert.strictEqual(costChipText(r), '本轮 ¥3.000', '未缓存输入 1M × 3 = 3，绝不能因缺字段归零');
});

test('sessionCost: 四桶组合（含缓存写按 miss 价）', () => {
  const h = loadClient();
  const usage = { inputTokens: 2e6, cacheReadTokens: 1e6, cacheWriteTokens: 5e5, outputTokens: 0 };
  const r = h.render(usage, BALANCE_DATA);
  // miss = input(2M) + write(0.5M) = 2.5M × 3 = 7.5；hit = 1M × 0.1 = 0.1 → 7.6
  assert.strictEqual(costChipText(r), '本轮 ¥7.600');
});

test('sessionCost: 字符串 token 值兼容；非法值（NaN/Infinity/负数）归零且不出负费用', () => {
  const h = loadClient();
  // 字符串数值
  let r = h.render({ uncachedInputTokens: '1000000', outputTokens: '0', cacheReadTokens: '0', cacheWriteTokens: '0' }, BALANCE_DATA);
  assert.strictEqual(costChipText(r), '本轮 ¥3.000');
  // 负数 token → 桶归零 → 无用量 → 不渲染费用（下限保护）
  r = h.render({ uncachedInputTokens: -1e6, outputTokens: -1e6, cacheReadTokens: -5, cacheWriteTokens: -1 }, BALANCE_DATA);
  const texts = collectText(r.result);
  assert.ok(!texts.some((t) => String(t).startsWith('本轮')), '负 token 不应产生费用 chip');
  // NaN / Infinity
  r = h.render({ uncachedInputTokens: NaN, outputTokens: Infinity, cacheReadTokens: 'abc', cacheWriteTokens: null }, BALANCE_DATA);
  assert.ok(!collectText(r.result).some((t) => String(t).startsWith('本轮')), '非法 token 值不应产生费用 chip');
  // 混合：合法桶仍正常计费，非法桶归零
  r = h.render({ inputTokens: 1e6, outputTokens: 'abc', cacheReadTokens: Infinity, cacheWriteTokens: '2e5' }, BALANCE_DATA);
  assert.strictEqual(costChipText(r), '本轮 ¥3.600', 'miss=(1M+0.2M)×3=3.6，其余桶归零');
});

test('hasUsage: 任一桶 > 0 即真；全零/空/非对象为假', () => {
  const h = loadClient();
  const cases = [
    [{ uncachedInputTokens: 1, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }, true],
    [{ inputTokens: 1, outputTokens: 0, cacheReadTokens: 0 }, true],
    [{ uncachedInputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }, false],
    [{ outputTokens: 0, uncachedInputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }, false],
    [null, false],
    [undefined, false],
    ['str', false],
    [{}, false],
    [{ outputTokens: -5, uncachedInputTokens: -1, cacheReadTokens: -1, cacheWriteTokens: -1 }, false],
  ];
  for (const [usage, expected] of cases) {
    const r = h.render(usage, BALANCE_DATA);
    const hasChip = !!costChipText(r);
    assert.strictEqual(hasChip, expected, JSON.stringify(usage) + ' → usageKnown=' + expected);
  }
});

// ---------------------------------------------------------------------------
// 按模型取价
// ---------------------------------------------------------------------------

test('priceTable: usage 携带模型且价目表含该模型 → 按真实模型计价', () => {
  const h = loadClient();
  const usage = { uncachedInputTokens: 1e6, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, model: 'deepseek-v4-pro' };
  const r = h.render(usage, BALANCE_DATA); // data.prices 是 flash，但 usage.model=pro
  assert.strictEqual(costChipText(r), '本轮 ¥9.000', '按 pro 的 miss 价 9 计，而不是 flash 的 3');
  const anchor = firstAnchor(r);
  assert.ok(String(anchor.props.title).includes('按会话模型 deepseek-v4-pro 单价估算'));
});

test('priceTable: usage 模型不在价目表 → 回退默认模型并明确标注', () => {
  const h = loadClient();
  const usage = { uncachedInputTokens: 1e6, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, model: 'some-unknown-model' };
  const r = h.render(usage, BALANCE_DATA);
  assert.strictEqual(costChipText(r), '本轮 ¥3.000', '回退默认模型 flash 的单价');
  const anchor = firstAnchor(r);
  assert.ok(String(anchor.props.title).includes('按默认模型 deepseek-v4-flash 单价估算（会话模型 some-unknown-model 不在价目表内）'));
});

test('priceTable: usage 无模型字段 → 默认模型 + 「会话实际模型未知」标注', () => {
  const h = loadClient();
  const usage = { uncachedInputTokens: 1e6, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
  const r = h.render(usage, BALANCE_DATA);
  const anchor = firstAnchor(r);
  assert.ok(String(anchor.props.title).includes('按默认模型 deepseek-v4-flash 单价估算（会话实际模型未知）'));
});

test('纯浏览器降级：无 data 时按 FALLBACK_PRICES 计价', () => {
  const h = loadClient({ dshDesktop: null }); // 无桌面壳 → hasBridge=false → data=null
  const usage = { uncachedInputTokens: 1e6, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
  const r = h.render(usage, null);
  assert.strictEqual(costChipText(r), '本轮 ¥9.000', 'FALLBACK_PRICES.cacheMiss=9（与默认模型 deepseek-v4-pro 一致）');
});

test('sessionCost: prices 覆盖生效；非法价格字段回退内置默认档', () => {
  const usage = { uncachedInputTokens: 1e6, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
  // 合法覆盖（新账本 → 基线按覆盖价入账）
  let h = loadClient();
  let r = h.render(usage, { prices: { cacheMiss: 1, cacheHit: 0.5, output: 8 } });
  assert.strictEqual(costChipText(r), '本轮 ¥1.000');
  // 非法覆盖（NaN/负数）→ 回退默认档（FALLBACK_PRICES，与 deepseek-v4-pro 一致）。
  // 必须用全新账本：增量计价语义下同一 usage 换价不再重算已入账部分（见下一条用例）。
  h = loadClient();
  r = h.render(usage, { prices: { cacheMiss: NaN, cacheHit: -1, output: 8 } });
  assert.strictEqual(costChipText(r), '本轮 ¥9.000');
});

test('增量计价回归（issue #168）：同一用量、推送价目变化 → 费用不重算', () => {
  const usage = { uncachedInputTokens: 1e6, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
  const h = loadClient();
  // 基线：合法覆盖价 1 元/百万 → 1M miss = ¥1。
  let r = h.render(usage, { prices: { cacheMiss: 1, cacheHit: 0.5, output: 8 } });
  assert.strictEqual(costChipText(r), '本轮 ¥1.000');
  // 推送换价（含非法字段回退默认档 9 元）：已入账的 1M 仍按入账时的 1 元计，
  // 绝不随新推送整段重算——旧实现此处显示 ¥9.000（峰谷切换费用跳变的根因）。
  r = h.render(usage, { prices: { cacheMiss: NaN, cacheHit: -1, output: 8 } });
  assert.strictEqual(costChipText(r), '本轮 ¥1.000');
  // 新增量才按新价入账：再消耗 1M miss × 9 = +¥9 → 累计 ¥10。
  r = h.render({ uncachedInputTokens: 2e6, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }, { prices: { cacheMiss: NaN, cacheHit: -1, output: 8 } });
  assert.strictEqual(costChipText(r), '本轮 ¥10.00');
});

// ---------------------------------------------------------------------------
// money 格式化边界
// ---------------------------------------------------------------------------

test('money: 0 / 大额 / 超大 / 非有限 的显示形态', () => {
  const h = loadClient();
  const renderTotal = (total) => {
    const data = { ok: true, balances: [{ currency: 'CNY', total, granted: 0, toppedUp: total }], prices: FLASH };
    const r = h.render(null, data);
    const texts = collectText(r.result);
    return texts.find((t) => String(t).startsWith('余额 ¥'));
  };
  assert.strictEqual(renderTotal(0), '余额 ¥0.00');
  assert.strictEqual(renderTotal(88.5), '余额 ¥88.50');
  assert.strictEqual(renderTotal(1234567.89), '余额 ¥1,234,567.89');
  assert.ok(String(renderTotal(9999.999)).startsWith('余额 ¥10,000.00'), '跨数量级进位不出现 10000.00 之外的形态');
  const huge = renderTotal(1e21);
  assert.ok(huge && !huge.includes('e+') && !huge.includes('Infinity'), '超大值不得出现 1e+21（实际：' + huge + '）');
  assert.strictEqual(renderTotal(Infinity), '余额 ¥—');
  assert.strictEqual(renderTotal(NaN), '余额 ¥—');
  assert.strictEqual(renderTotal(undefined), '余额 ¥—');
});

// ---------------------------------------------------------------------------
// goUsageText / rel / 渲染形态
// ---------------------------------------------------------------------------

test('goUsageText: percent=null 显示「?」，percent=0 显示「0%」，全空不渲染 chip', () => {
  const h = loadClient();
  // 单窗口 null percent
  let data = { ok: false, balances: [], opencodeGo: { ok: true, usage: { rolling: { status: 'ok', percent: null, resetsAt: 'x' } } } };
  let r = h.render(null, data);
  let texts = collectText(r.result);
  assert.ok(texts.includes('Go 5h?'), 'null percent 显示 ?（实际：' + JSON.stringify(texts) + '）');
  // percent=0 显示 0%
  data = { ok: false, balances: [], opencodeGo: { ok: true, usage: { rolling: { status: 'ok', percent: 0, resetsAt: 'x' } } } };
  r = h.render(null, data);
  assert.ok(collectText(r.result).includes('Go 5h0%'));
  // 全窗口 null → 无 Go chip，整体 null（无余额无用量）
  data = { ok: false, balances: [], opencodeGo: { ok: true, usage: { rolling: null, weekly: null, monthly: null } } };
  r = h.render(null, data);
  assert.strictEqual(r.result, null, '全空窗口不渲染空白 Go chip');
  // usage: {} 形态同样不渲染
  data = { ok: false, balances: [], opencodeGo: { ok: true, usage: {} } };
  r = h.render(null, data);
  assert.strictEqual(r.result, null);
});

test('rel: 余额 dock 与 Go dock 均携带 noopener noreferrer', () => {
  const h = loadClient();
  const data = {
    ok: true,
    balances: [{ currency: 'CNY', total: 1, granted: 0, toppedUp: 1 }],
    opencodeGo: { ok: true, usage: { rolling: { status: 'ok', percent: 5, resetsAt: '' } } },
    prices: FLASH,
  };
  const r = h.render({ uncachedInputTokens: 1e6, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }, data);
  const anchors = [];
  (function walk(n) {
    if (n == null) return;
    if (Array.isArray(n)) return n.forEach(walk);
    if (n.__isReactElement) { if (n.type === 'a') anchors.push(n); walk(n.props.children); }
  })(r.result);
  assert.strictEqual(anchors.length, 2);
  for (const a of anchors) {
    assert.strictEqual(a.props.rel, 'noopener noreferrer');
    assert.strictEqual(a.props.target, '_blank');
  }
});

// ---------------------------------------------------------------------------
// 单一投递
// ---------------------------------------------------------------------------

test('单一投递: invoke 只触发刷新，不消费返回值（数据仅从事件通道进入）', () => {
  const h = loadClient({
    dshDesktop: { refreshBalance: () => { h.calls.refreshBalance += 1; return Promise.resolve(BALANCE_DATA); } },
  });
  // 首次挂载：loading 态隐藏；effect 触发一次 invoke
  let r = h.render(null, undefined, { preset: false });
  assert.strictEqual(r.result, null, '首挂载 loading 期不渲染');
  h.runEffects();
  assert.strictEqual(h.calls.refreshBalance, 1, '首挂载应触发一次主动刷新');
  // invoke 返回值被忽略：即便 resolve 了数据，状态仍是 loading → 不渲染
  r = h.render(null, undefined, { preset: false });
  assert.strictEqual(r.result, null, 'invoke 返回值不得作为数据源');
  // 事件推送后才渲染数据
  h.calls.handler({ detail: BALANCE_DATA });
  h.setPresetData(BALANCE_DATA);
  r = h.render(null, BALANCE_DATA);
  assert.ok(collectText(r.result).includes('余额 ¥88.50'), '事件推送后才显示数据');
});

test('单一投递: 收到过推送后，后续挂载不再重复触发刷新（会话切换零额外请求）', () => {
  const h = loadClient();
  h.render(null, undefined, { preset: false }); // 首挂载：注册 effect
  h.runEffects();
  assert.strictEqual(h.calls.refreshBalance, 1);
  h.calls.handler({ detail: BALANCE_DATA }); // 收到推送 → bridgePushedOnce=true
  // 模拟组件重挂载：effect 再次执行
  h.render(null, undefined, { preset: false });
  h.runEffects();
  assert.strictEqual(h.calls.refreshBalance, 1, '已有数据后重挂载不应再触发刷新');
});

test('渲染形态：loading / disabled 隐藏；有余额+用量+Go 三合一正常', () => {
  const h = loadClient();
  assert.strictEqual(h.render(null, { loading: true }).result, null);
  assert.strictEqual(h.render(null, { ok: false, disabled: true }).result, null);
  const data = {
    ok: true,
    peak: true,
    balances: [{ currency: 'CNY', total: 88.5, granted: 10, toppedUp: 78.5 }],
    prices: FLASH,
    priceTable: { 'deepseek-v4-flash': FLASH, 'deepseek-v4-pro': PRO },
    model: 'deepseek-v4-flash',
    opencodeGo: { ok: true, usage: { rolling: { status: 'ok', percent: 14, resetsAt: '' } } },
  };
  const r = h.render({ uncachedInputTokens: 1e6, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }, data);
  const texts = collectText(r.result);
  assert.ok(texts.includes('⛰ 高峰价'));
  assert.ok(texts.includes('本轮 ¥3.000'));
  assert.ok(texts.includes('余额 ¥88.50'));
  assert.ok(texts.includes('Go 5h14%'));
  assert.strictEqual(r.result.type, 'span');
  assert.strictEqual(r.result.props.className, 'dsh-balance-wrap');
  assert.ok(Array.isArray(r.result.props.children));
});

test('渲染形态：仅用量（无余额无 Go）→ 单 dock 元素', () => {
  const h = loadClient({ dshDesktop: null }); // 纯浏览器：无推送数据，仅显示本轮费用
  const r = h.render({ uncachedInputTokens: 1e6, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }, null);
  assert.strictEqual(r.result.type, 'a');
  assert.ok(!r.threw);
});

test('渲染形态：仅 Go（无余额无用量）→ 直接 goDock', () => {
  const h = loadClient();
  const data = { ok: false, balances: [], opencodeGo: { ok: true, usage: { weekly: { status: 'ok', percent: 33, resetsAt: 'x' } } } };
  const r = h.render(null, data);
  assert.strictEqual(r.result.type, 'a');
  assert.ok(String(r.result.props.className).includes('dsh-balance-go'));
});

// ---------------------------------------------------------------------------
// 按消耗时段计价（issue #168）：增量账本 + periodTables 三张表 + 周末规则
//
// 官方计费口径：每个 token 按其消耗时刻的时段价结算，已结算量不随后续
// 峰谷切换重算。旧实现「累计 token × 推送时刻价」在峰谷切换后整段跳变。
// 时间锚点（北京 = UTC+8）：
//   周三 2026-08-26 10:30（02:30Z）→ 高峰（9-12 窗口内）
//   周三 2026-08-26 20:00（12:00Z）→ 空闲
//   周三 2026-08-26 11:30（03:30Z）→ 高峰；12:30（04:30Z）→ 空闲（跨边界）
//   周六 2026-08-29 10:00（02:00Z）→ 周末全天空闲（2026-08-23 起）
//   周六 2026-08-22 10:00（02:00Z）→ 生效日前：仍按小时窗口（高峰）
//   2026-08-10 10:00（02:00Z）→ 峰谷生效日前 → legacy 固定价
// ---------------------------------------------------------------------------

const FLASH_PEAK = { cacheMiss: 3, cacheHit: 0.1, output: 9 };
const FLASH_OFF = { cacheMiss: 1.5, cacheHit: 0.05, output: 4.5 };
const FLASH_LEGACY = { cacheMiss: 1, cacheHit: 0.02, output: 2 };
const PRO_PEAK = { cacheMiss: 9, cacheHit: 0.3, output: 27 };
const PERIOD_DATA = {
  ok: true,
  balances: [{ currency: 'CNY', total: 88.5, granted: 10, toppedUp: 78.5 }],
  prices: FLASH_PEAK, // 推送时刻的解析价（可能滞后于真实时段）
  priceTable: { 'deepseek-v4-flash': FLASH_PEAK, 'deepseek-v4-pro': PRO_PEAK },
  periodTables: {
    peak: { 'deepseek-v4-flash': FLASH_PEAK, 'deepseek-v4-pro': PRO_PEAK },
    off: { 'deepseek-v4-flash': FLASH_OFF, 'deepseek-v4-pro': { cacheMiss: 4.5, cacheHit: 0.15, output: 13.5 } },
    legacy: { 'deepseek-v4-flash': FLASH_LEGACY, 'deepseek-v4-pro': { cacheMiss: 3, cacheHit: 0.025, output: 6 } },
  },
  pricingSince: '2026-08-16T16:00:00.000Z',
  model: 'deepseek-v4-flash',
  peak: true, // 推送时刻=高峰（对空闲时刻的用例构成「推送滞后」场景）
};
const U1M = { uncachedInputTokens: 1e6, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
const U2M = { uncachedInputTokens: 2e6, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };

test('时段计价（#168）：高峰基线 → 空闲时段同用量重渲染 → 费用不整段重算', () => {
  const peakMs = Date.parse('2026-08-26T02:30:00.000Z'); // 周三 10:30 北京
  const offMs = Date.parse('2026-08-26T12:00:00.000Z');  // 周三 20:00 北京
  const h = loadClient({}, { now: peakMs });
  // 基线：1M miss × 高峰价 3 = ¥3。
  let r = h.render(U1M, PERIOD_DATA);
  assert.strictEqual(costChipText(r), '本轮 ¥3.000');
  assert.ok(collectText(r.result).includes('⛰ 高峰价'), '高峰时刻 chip 为高峰');
  // 跨到空闲时段：同用量、新推送（prices 仍是高峰解析价 + peak=true 滞后）。
  // 已入账的 1M 仍按消耗时（高峰）的 3 元计——旧实现此处显示 ¥1.500。
  h.setNow(offMs);
  r = h.render(U1M, PERIOD_DATA);
  assert.strictEqual(costChipText(r), '本轮 ¥3.000', '峰谷切换后同用量费用不得重算');
  // chip 用客户端本地判定即时切换（不受推送 peak=true 滞后影响）。
  assert.ok(collectText(r.result).includes('🌙 空闲价'), '空闲时刻 chip 应即时切换');
});

test('时段计价（#168）：跨峰谷边界的增量分段计价', () => {
  const peakMs = Date.parse('2026-08-26T03:30:00.000Z'); // 周三 11:30 北京（高峰）
  const offMs = Date.parse('2026-08-26T04:30:00.000Z');  // 周三 12:30 北京（空闲）
  const h = loadClient({}, { now: peakMs });
  let r = h.render(U1M, PERIOD_DATA);
  assert.strictEqual(costChipText(r), '本轮 ¥3.000', '高峰段 1M × 3');
  h.setNow(offMs);
  r = h.render(U2M, PERIOD_DATA); // 新增 1M miss 在空闲段消耗 × 1.5
  assert.strictEqual(costChipText(r), '本轮 ¥4.500', '3 + 1.5：增量按空闲价，基线不重算');
});

test('时段计价（#168）：2026-08-23 起周末全天空闲（客户端判定与计价一致）', () => {
  const satMs = Date.parse('2026-08-29T02:00:00.000Z'); // 周六 10:00 北京
  const h = loadClient({}, { now: satMs });
  const r = h.render(U1M, PERIOD_DATA); // 推送 peak=true（滞后/旧规则）也不影响
  assert.strictEqual(costChipText(r), '本轮 ¥1.500', '周末 1M × 空闲价 1.5');
  assert.ok(collectText(r.result).includes('🌙 空闲价'), '周末 chip 为空闲');
});

test('时段计价（#168）：生效日前的周六仍按小时窗口判高峰（不溯及既往）', () => {
  const satBeforeMs = Date.parse('2026-08-22T02:00:00.000Z'); // 周六 10:00 北京（8-23 前）
  const h = loadClient({}, { now: satBeforeMs });
  const r = h.render(U1M, PERIOD_DATA);
  assert.strictEqual(costChipText(r), '本轮 ¥3.000', '生效日前周六 10:00 仍为高峰全价');
  assert.ok(collectText(r.result).includes('⛰ 高峰价'));
});

test('时段计价（#168）：峰谷生效日之前按 legacy 固定价表计价', () => {
  const legacyMs = Date.parse('2026-08-10T02:00:00.000Z'); // 周一 10:00 北京（8-17 前）
  const h = loadClient({}, { now: legacyMs });
  const r = h.render(U1M, PERIOD_DATA);
  assert.strictEqual(costChipText(r), '本轮 ¥1.000', '旧版固定价 flash miss=1');
  assert.ok(collectText(r.result).includes('🌙 空闲价') || !collectText(r.result).includes('⛰ 高峰价'), 'legacy 期无高峰概念');
});

test('时段计价（#168）：会话切换账本键控——回切原会话费用保留', () => {
  const peakMs = Date.parse('2026-08-26T02:30:00.000Z');
  const h = loadClient({}, { now: peakMs, sessionId: 'sess-a' });
  let r = h.render(U1M, PERIOD_DATA);
  assert.strictEqual(costChipText(r), '本轮 ¥3.000');
  // 切到会话 B：2M 存量按 B 自己的基线（高峰全价）入账。
  h.setSessionId('sess-b');
  r = h.render(U2M, PERIOD_DATA);
  assert.strictEqual(costChipText(r), '本轮 ¥6.000', '会话 B 独立基线 2M × 3');
  // 切回会话 A：账本保留，仍为 ¥3（不受 B 的基线污染）。
  h.setSessionId('sess-a');
  r = h.render(U1M, PERIOD_DATA);
  assert.strictEqual(costChipText(r), '本轮 ¥3.000', '回切 A 费用保留');
});

test('时段计价（#168）：页面重载（localStorage）延续账本，不重置不重算', () => {
  const peakMs = Date.parse('2026-08-26T02:30:00.000Z');
  const offMs = Date.parse('2026-08-26T12:00:00.000Z');
  const storage = makeStorage();
  // 第一段页面生命：高峰段 1M 入账 ¥3，写入 localStorage。
  const h1 = loadClient({}, { now: peakMs, storage, sessionId: 'sess-a' });
  let r = h1.render(U1M, PERIOD_DATA);
  assert.strictEqual(costChipText(r), '本轮 ¥3.000');
  // 模拟页面重载：全新沙箱（模块级账本清空）、共享 storage、时钟已到空闲段。
  const h2 = loadClient({}, { now: offMs, storage, sessionId: 'sess-a' });
  r = h2.render(U1M, PERIOD_DATA);
  assert.strictEqual(costChipText(r), '本轮 ¥3.000', '重载后延续账本（旧实现按空闲价重算成 ¥1.500）');
  // 新增量按当前（空闲）时段价入账。
  r = h2.render(U2M, PERIOD_DATA);
  assert.strictEqual(costChipText(r), '本轮 ¥4.500', '重载后增量 1M × 1.5');
});

test('时段计价（#168）：localStorage 脏数据/不可用 → 空账本降级不炸', () => {
  const peakMs = Date.parse('2026-08-26T02:30:00.000Z');
  // 脏数据（非法 JSON）→ 解析失败按空账本，功能不受影响。
  const badStorage = { getItem: () => '{not-json', setItem: () => {}, removeItem: () => {} };
  const h = loadClient({}, { now: peakMs, storage: badStorage, sessionId: 'sess-a' });
  let r = h.render(U1M, PERIOD_DATA);
  assert.strictEqual(costChipText(r), '本轮 ¥3.000', '脏 storage 降级为内存账本');
  // setItem 抛异常（配额满/隐私模式）→ 静默转纯内存账本。
  const throwStorage = { getItem: () => null, setItem: () => { throw new Error('quota'); }, removeItem: () => {} };
  const h2 = loadClient({}, { now: peakMs, storage: throwStorage, sessionId: 'sess-a' });
  r = h2.render(U1M, PERIOD_DATA);
  assert.ok(!r.threw && costChipText(r) === '本轮 ¥3.000', '写失败不传染渲染');
  r = h2.render(U2M, PERIOD_DATA);
  assert.strictEqual(costChipText(r), '本轮 ¥6.000', '内存账本继续增量计价');
});

test('时段计价（#168）：usage 模型档在 periodTables 下同样生效', () => {
  const peakMs = Date.parse('2026-08-26T02:30:00.000Z');
  const h = loadClient({}, { now: peakMs });
  const usage = { ...U1M, model: 'deepseek-v4-pro' };
  const r = h.render(usage, PERIOD_DATA);
  assert.strictEqual(costChipText(r), '本轮 ¥9.000', 'usage.model=pro → 高峰 pro 档 miss=9');
});
