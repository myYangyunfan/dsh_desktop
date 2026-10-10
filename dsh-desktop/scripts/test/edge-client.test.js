'use strict';

// dsh-balance 客户端展示层边界测试（vm 沙箱加载真实 client.js 产物）。
// 覆盖范围与缺陷对照见 docs/balance-architecture.md 第 9 节：
//   tokenUsage 归一化（NaN 清零回归 / inputTokens 形态兼容 / 每操作数守卫）
//   priceTable 按真实模型取价 + 「按默认模型估算」标注
//   sessionCost 下限保护（负 token 不产生负费用）
//   money 格式化边界（0/超大/非有限）
//   rel=noopener noreferrer
//   goUsageText 全空返回 null（不渲染空白 chip）
//   单一投递（/refresh 只触发查询、数据只从 /state 进入）
// 隔离承诺：纯内存 vm + 沙箱内注入的假 fetch，不触碰文件系统/真实网络/真实 React。

const test = require('node:test');
const assert = require('node:assert');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

const CLIENT_PATH = path.join(__dirname, '..', '..', 'assets', 'plugins', 'dsh-balance', 'lib', 'client.js');
const SRC = fs.readFileSync(CLIENT_PATH, 'utf8');

// ---------------------------------------------------------------------------
// 测试床：每次 loadClient() 生成全新沙箱（模块级状态如 hostPolledOnce/hostAbsent 隔离）
//
// 0.1.2 起余额数据面换成插件宿主半边在内核 webServer 上注册的两条路由
// （GET /state 读载荷、POST /refresh 触发一轮查询）；自制壳时代的
// window.dshDesktop.refreshBalance 与 dsh-balance-changed 事件已退役，
// 所以这里注入的是沙箱内 window.fetch，而不是桥对象。URL 一律取自
// __internals，不手抄字面量（改路由不改测试锚 = 假绿）。
// ---------------------------------------------------------------------------

function loadClient(http = {}) {
  const calls = { state: 0, refresh: 0 };
  const sandboxWindow = {
    __ModuleLoader__: { load: (obj) => { calls.captured = obj; } },
  };
  sandboxWindow.window = sandboxWindow;
  const sandbox = {
    window: sandboxWindow,
    document: { querySelector: () => null, createElement: () => ({ dataset: {}, textContent: '' }), head: { appendChild: () => {} } },
    console,
    // client.js 的宿主请求时限（BRIDGE_PUSH_TIMEOUT_MS 的 4s 兜底）在浏览器合法，但 vm
    // 沙箱默认无定时器 → ReferenceError。
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

  // ---------- 假 fetch：只服务本插件宿主半边的两条路由 ----------
  // 缺省两条都 404 = 宿主半边缺席。宁可让用例显式喂载荷，也不让默认行为
  // 凭空造出一份余额（本插件的「无数据」语义是 browserOnlyPayload，不是 200 + 空）。
  const { STATE_URL, REFRESH_URL } = mod.__internals;
  const routes = {
    [STATE_URL]: 'state' in http ? http.state : 404,
    [REFRESH_URL]: 'refresh' in http ? http.refresh : 404,
  };
  sandboxWindow.fetch = async (url, init) => {
    const method = (init && init.method) || 'GET';
    if (url === REFRESH_URL && method === 'POST') calls.refresh += 1;
    else if (url === STATE_URL && method === 'GET') calls.state += 1;
    else throw new Error('unexpected fetch: ' + method + ' ' + url);
    const spec = routes[url];
    if (spec === 404) return { status: 404, ok: false, json: async () => ({}) };
    if (spec instanceof Error) throw spec;
    return { status: 200, ok: true, json: async () => spec };
  };

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

  // setImmediate 而非 setTimeout+unref：node 22 的测试运行器在「唯一挂起句柄是
  // unref 定时器」时判定事件循环已空，await 中的用例整体 cancelledByParent
  // （"Promise resolution is still pending but the event loop has already
  // resolved"，CI node 22 上 12 例连坐；node 24 恰好容忍，本机不复现）。
  // setImmediate 默认持引、必在同一轮 check 相位触发，微任务链同样先排空。
  /** 冲刷 effect 里的 await 链（fetch → json → setData 全在微任务里跑完）。 */
  const flush = () => new Promise((resolve) => setImmediate(resolve));

  return { calls, render, runEffects, resetHooks, flush, mod, dock: () => dockComponent, setPresetData: (d) => { presetData = d; } };
}

/**
 * 在全新沙箱里渲染一帧（issue #168 后的必需手段）：本轮费用已改为「增量
 * 计价账本」——同一会话的重复观测不重算历史，所以同一沙箱内用相同累计
 * 量 + 不同价目二次渲染不再会重新定价。只验单帧取价 / 归一化语义的用例
 * 应用本助手，避免“靠累加巧合通过”。
 */
function renderFresh(usage, data, opts = {}) {
  const h = loadClient(opts.http);
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

test('纯浏览器降级：宿主半边缺席（/state 404）时按 FALLBACK_PRICES 计价', async () => {
  const h = loadClient({ state: 404, refresh: 404 });
  const usage = { uncachedInputTokens: 1e6, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
  // 首轮：载荷未落地 → loading 态不渲染（绝不闪现兜底数据）
  assert.strictEqual(h.render(usage, undefined).result, null, '首次同步期不渲染');
  h.runEffects();
  await h.flush();
  const r = h.render(usage, undefined);
  assert.strictEqual(costChipText(r), '本轮 ¥9.000', 'FALLBACK_PRICES.cacheMiss=9（与默认模型 deepseek-v4-pro 一致）');
  // 缺席确认后载荷形态：不带 peak/pricingTier，浏览器侧不做北京时区判定
  const payload = h.mod.__internals.browserOnlyPayload();
  assert.strictEqual(payload.ok, false);
  assert.strictEqual(payload.error, 'no-host');
  assert.strictEqual(payload.model, h.mod.__internals.DEFAULT_MODEL);
  assert.ok(!('peak' in payload) && !('pricingTier' in payload), '降级载荷不得自带峰谷档位');
  assert.ok(!collectText(r.result).some((t) => String(t).startsWith('余额')), '无宿主 → 不显示余额');
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

test('单一投递: /refresh 只触发查询，数据仅从 /state 进入', async () => {
  // /refresh 的响应体刻意是另一份余额（1.5），若被当作数据源就会显示 ¥1.500
  const h = loadClient({
    refresh: { ok: true, balances: [{ currency: 'CNY', total: 1.5, granted: 0, toppedUp: 1.5 }], prices: FLASH },
    state: BALANCE_DATA,
  });
  const r0 = h.render(null, undefined);
  assert.strictEqual(r0.result, null, '首次同步完成前不渲染');
  h.runEffects();
  await h.flush();
  assert.strictEqual(h.calls.refresh, 1, '首轮 force 触发一次 POST /refresh');
  assert.strictEqual(h.calls.state, 1, '触发之后只读一次 GET /state');
  const texts = collectText(h.render(null, undefined).result);
  const balanceTexts = texts.filter((t) => String(t).startsWith('余额'));
  assert.strictEqual(balanceTexts.length, 1, '余额只允许一条来源通道（实际：' + JSON.stringify(texts) + '）');
  assert.strictEqual(balanceTexts[0], '余额 ¥88.50', '数据取自 /state 载荷');
});

test('单一投递: 首轮已同步后，重挂载不再触发额外计费查询', async () => {
  const h = loadClient({ state: BALANCE_DATA });
  h.render(null, undefined); // 首挂载：注册 effect
  h.runEffects();
  await h.flush();
  assert.strictEqual(h.calls.refresh, 1);
  assert.strictEqual(h.calls.state, 1);
  // 模拟组件重挂载（切会话 / dock 重建）：effect 再次执行
  h.render(null, undefined);
  h.runEffects();
  await h.flush();
  assert.strictEqual(h.calls.refresh, 1, 'hostPolledOnce 之后不得再发 POST /refresh（零额外计费查询）');
  assert.strictEqual(h.calls.state, 2, '重挂载只多一次只读 GET /state 缓存');
});

test('宿主通道原语: force 只多加一次 POST /refresh，载荷只来自 GET /state', async () => {
  // 反证上一条「单一投递」用例的判据本身：不渲染、不走 React，直接盯 fetch 序列
  // 与返回体来源。若实现改成消费 /refresh 响应，本用例先红。
  const { fetchHostState, STATE_URL, REFRESH_URL } = loadClient().mod.__internals;
  const seen = [];
  const fetchImpl = async (url, init) => {
    const method = (init && init.method) || 'GET';
    seen.push(method + ' ' + url);
    return { status: 200, ok: true, json: async () => ({ source: method === 'POST' ? 'refresh' : 'state' }) };
  };
  const first = await fetchHostState(true, { fetchImpl });
  assert.deepStrictEqual(seen, ['POST ' + REFRESH_URL, 'GET ' + STATE_URL]);
  // 跨 realm：包装对象在 vm 里 new，deepStrictEqual 会比原型；只深比来自宿主侧的 data
  assert.strictEqual(first.status, 'ok');
  assert.deepStrictEqual(first.data, { source: 'state' }, '载荷必须取自 /state');
  seen.length = 0;
  await fetchHostState(false, { fetchImpl });
  assert.deepStrictEqual(seen, ['GET ' + STATE_URL], '非 force 轮次不得触发计费查询');
});

test('宿主通道原语: 404 归为 absent（宿主缺席），500 归为 error（本轮查询失败）', async () => {
  const { fetchHostState } = loadClient().mod.__internals;
  const absent = await fetchHostState(false, { fetchImpl: async () => ({ status: 404, ok: false }) });
  assert.strictEqual(absent.status, 'absent', '404 是「没装宿主半边」，不是「这一轮失败」');
  assert.strictEqual(absent.data, undefined);
  const errored = await fetchHostState(false, { fetchImpl: async () => ({ status: 500, ok: false }) });
  assert.strictEqual(errored.status, 'error');
  const gone = await fetchHostState(false, { fetchImpl: async () => { throw new Error('connection refused'); } });
  assert.strictEqual(gone.status, 'error');
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

test('渲染形态：仅用量（无余额无 Go）→ 单 dock 元素', async () => {
  // 纯浏览器：宿主缺席 → 载荷只有兜底价目，故既无余额也无 Go chip
  const h = loadClient({ state: 404 });
  h.render({ uncachedInputTokens: 1e6, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }, undefined);
  h.runEffects();
  await h.flush();
  const r = h.render({ uncachedInputTokens: 1e6, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }, undefined);
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
