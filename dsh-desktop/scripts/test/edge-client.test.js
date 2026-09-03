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

function loadClient(bridgeOverrides) {
  const calls = { refreshBalance: 0, handler: null };
  const listeners = new Map();
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
  };
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
      result = dockComponent({ useProjection: () => usage, sessionId: opts.sessionId });
    } catch (err) {
      threw = err;
    }
    return { result, threw };
  }

  function runEffects() {
    for (const { cb } of pendingEffects) cb();
  }

  return { calls, listeners, render, runEffects, resetHooks, dock: () => dockComponent, setPresetData: (d) => { presetData = d; } };
}

/**
 * 在全新沙箱里渲染一帧（issue #168 后的必需手段）：本轮费用已改为「增量
 * 计价账本」——同一会话的重复观测不重算历史，所以同一沙箱内用相同累计
 * 量 + 不同价目二次渲染不再会重新定价。只验单帧取价 / 归一化语义的用例
 * 应用本助手，避免“靠累加巧合通过”。
 */
function renderFresh(usage, data, opts = {}) {
  const h = loadClient(opts.bridge);
  return { h, r: h.render(usage, data, opts) };
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
  // 合法覆盖 / 非法值归零都是「单帧取价」语义，逐帧独立沙箱（见 renderFresh 注释）。
  // 字符串数值
  let { r } = renderFresh({ uncachedInputTokens: '1000000', outputTokens: '0', cacheReadTokens: '0', cacheWriteTokens: '0' }, BALANCE_DATA);
  assert.strictEqual(costChipText(r), '本轮 ¥3.000');
  // 负数 token → 桶归零 → 无用量 → 不渲染费用（下限保护）
  ({ r } = renderFresh({ uncachedInputTokens: -1e6, outputTokens: -1e6, cacheReadTokens: -5, cacheWriteTokens: -1 }, BALANCE_DATA));
  const texts = collectText(r.result);
  assert.ok(!texts.some((t) => String(t).startsWith('本轮')), '负 token 不应产生费用 chip');
  // NaN / Infinity
  ({ r } = renderFresh({ uncachedInputTokens: NaN, outputTokens: Infinity, cacheReadTokens: 'abc', cacheWriteTokens: null }, BALANCE_DATA));
  assert.ok(!collectText(r.result).some((t) => String(t).startsWith('本轮')), '非法 token 值不应产生费用 chip');
  // 混合：合法桶仍正常计费，非法桶归零
  ({ r } = renderFresh({ inputTokens: 1e6, outputTokens: 'abc', cacheReadTokens: Infinity, cacheWriteTokens: '2e5' }, BALANCE_DATA));
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
  // issue #168 后两个分支必须各自独立会话（独立账本）：同一会话里价目切换
  // 不再重算已入账部分（正是本 issue 的修复点），所以不能再复用同一沙箱。
  const usage = { uncachedInputTokens: 1e6, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
  // 合法覆盖
  let { r } = renderFresh(usage, { prices: { cacheMiss: 1, cacheHit: 0.5, output: 8 } });
  assert.strictEqual(costChipText(r), '本轮 ¥1.000');
  // 非法覆盖（NaN/负数）→ 回退默认档（FALLBACK_PRICES，与 deepseek-v4-pro 一致）
  ({ r } = renderFresh(usage, { prices: { cacheMiss: NaN, cacheHit: -1, output: 8 } }));
  assert.strictEqual(costChipText(r), '本轮 ¥9.000');
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
