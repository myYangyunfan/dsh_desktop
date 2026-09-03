'use strict';

// ===========================================================================
// issue #168（3/3）：dsh-balance 客户端「增量计价账本」单测。
//
// 缺陷：tokenUsage 投影是「会话累计总量」，旧实现每帧做 累计量 × 推送时刻价目，
// 于是峰谷一切换，整段历史费用被按新价重算 —— 用户看到「本轮 ¥」突然跳变。
// 修复：每个「用量增量」按被观察到的时刻价目一次性入账（已结算不追溯），
// 累计费用 = 各时段分段之和，localStorage 按会话持久化。
//
// 手法：vm 沙箱加载真实 client.js 产物，经 exports.__internals 直取纯函数；
// 注入可控 localStorage（跨沙箱共享即模拟「页面重载后仍在」），零网络零真实 React。
// ===========================================================================

const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

const CLIENT_PATH = path.join(__dirname, '..', '..', 'assets', 'plugins', 'dsh-balance', 'lib', 'client.js');
const SRC = fs.readFileSync(CLIENT_PATH, 'utf8');

const MODEL = 'deepseek-v4-flash';
const TABLES = {
  peak: { [MODEL]: { cacheMiss: 3, cacheHit: 0.1, output: 9 }, 'deepseek-v4-pro': { cacheMiss: 9, cacheHit: 0.3, output: 27 } },
  off: { [MODEL]: { cacheMiss: 1.5, cacheHit: 0.05, output: 4.5 }, 'deepseek-v4-pro': { cacheMiss: 4.5, cacheHit: 0.15, output: 13.5 } },
  legacy: { [MODEL]: { cacheMiss: 1, cacheHit: 0.02, output: 2 }, 'deepseek-v4-pro': { cacheMiss: 3, cacheHit: 0.025, output: 6 } },
};

/** 新 payload（主进程推送 periodTables + pricingTier + pricingSince）。 */
function newPayload(tier) {
  return {
    ok: true,
    balances: [],
    model: MODEL,
    prices: TABLES[tier][MODEL],
    priceTable: TABLES[tier],
    periodTables: TABLES,
    pricingTier: tier,
    peak: tier === 'peak',
    pricingSince: { peakPricing: '2026-08-16T16:00:00.000Z', weekendOffpeak: '2026-08-22T16:00:00.000Z' },
  };
}

/** 旧 payload（只有 prices/priceTable/peak，无 issue #168 新字段）。 */
function legacyPayload(peak) {
  return {
    ok: true,
    balances: [],
    model: MODEL,
    prices: TABLES[peak ? 'peak' : 'off'][MODEL],
    priceTable: TABLES[peak ? 'peak' : 'off'],
    peak,
  };
}

const usageOf = (uncached, extra = {}) => ({
  uncachedInputTokens: uncached,
  cacheWriteTokens: 0,
  cacheReadTokens: 0,
  outputTokens: 0,
  model: MODEL,
  ...extra,
});

/** 简易 localStorage（可跨沙箱共享 = 模拟页面重载；带写入计数与原始写入）。 */
function makeStorage() {
  const bag = new Map();
  return {
    bag,
    writes: 0,
    getItem: (k) => (bag.has(k) ? bag.get(k) : null),
    setItem: (k, v) => { bag.set(k, String(v)); },
    removeItem: (k) => { bag.delete(k); },
  };
}

/**
 * 在 vm 沙箱里加载一份 client.js。
 * @param {object} [opts]
 * @param {object} [opts.storage] 复用的 localStorage 实例（跨沙箱共享即「重载后仍在」）
 * @param {boolean} [opts.noLocalStorage] 不提供 localStorage（纯浏览器 / 受限环境路径）
 */
function loadClient(opts = {}) {
  const logs = [];
  const storage = opts.storage || makeStorage();
  let captured = null;
  const sandboxWindow = {
    __ModuleLoader__: { load: (obj) => { captured = obj; } },
    dshDesktop: { refreshBalance: () => Promise.resolve() },
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  };
  if (!opts.noLocalStorage) sandboxWindow.localStorage = storage;
  sandboxWindow.window = sandboxWindow;

  const sandbox = {
    window: sandboxWindow,
    document: { querySelector: () => null, createElement: () => ({ dataset: {}, textContent: '' }), head: { appendChild: () => {} } },
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init && init.detail; } },
    console: {
      info: (...args) => logs.push(args.join(' ')),
      log: (...args) => logs.push(args.join(' ')),
      warn: (...args) => logs.push(args.join(' ')),
      error: (...args) => logs.push(args.join(' ')),
    },
    setTimeout: (fn, ms, ...args) => { const t = setTimeout(fn, ms, ...args); if (t.unref) t.unref(); return t; },
    clearTimeout,
    Date,
    Math,
    JSON,
    Number,
    Object,
    Array,
    Map,
    Set,
    String,
    Boolean,
    Intl,
    Error,
    TypeError,
    RangeError,
    Infinity,
    NaN,
    undefined,
    parseFloat,
    parseInt,
    isFinite,
    isNaN,
  };
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox, { filename: 'client.js' });
  assert.ok(captured, '必须捕获到 __ModuleLoader__.load');

  // ---------- 最小 React mock（只有 useState / useEffect，与既有测试床同构） ----------
  let hookStore = [];
  let hookIndex = 0;
  let presetData = null;
  const mockReact = {
    useState(init) {
      const i = hookIndex++;
      if (i === 0 && presetData !== null) { hookStore[0] = { value: presetData }; return [presetData, () => {}]; }
      if (hookStore[i] === undefined) hookStore[i] = { value: typeof init === 'function' ? init() : init };
      const slot = hookStore[i];
      return [slot.value, (next) => { slot.value = typeof next === 'function' ? next(slot.value) : next; }];
    },
    useEffect(cb) { hookIndex += 1; },
  };
  const mockJsx = { jsx: (type, props, key) => ({ __isReactElement: true, type, props: props || {}, key: key === undefined ? null : key }) };
  const mod = captured.factory((name) => {
    if (name === 'react') return mockReact;
    if (name === 'react/jsx-runtime') return mockJsx;
    throw new Error('unexpected require: ' + name);
  });
  assert.ok(mod.__internals, 'client.js 必须导出 __internals 供单测（issue #168）');

  let dockComponent = null;
  mod.apply({
    slots: {
      register(_info, Comp) { dockComponent = Comp; },
      inject(key, factory) { if (key !== 'conversation.composer.dock') throw new Error('unexpected slot: ' + key); factory(); },
    },
    effect: (cb) => cb(),
  });

  /** 渲染一帧（data 走 useState 预设，sessionId 走 slot 标准 props）。 */
  function render(usage, data, sessionId) {
    presetData = data === undefined ? null : data;
    hookIndex = 0;
    hookStore = [];
    return dockComponent({ useProjection: () => usage, sessionId });
  }

  return { it: mod.__internals, storage, logs, render, ledgerWrites: () => storage.writes };
}

/** 取渲染树全部文本。 */
function texts(node, out = []) {
  if (node == null) return out;
  if (Array.isArray(node)) { node.forEach((n) => texts(n, out)); return out; }
  if (typeof node === 'string' || typeof node === 'number') { out.push(String(node)); return out; }
  if (node.__isReactElement) texts(node.props.children, out);
  return out;
}

const costText = (node) => texts(node).find((t) => t.startsWith('本轮 ¥')) || null;

/**
 * 沙箱内构造的对象原型与宿主不同，deepStrictEqual 会因原型判不等 → 展开为宿主要求。
 * 只用于纯数据对象（一层数值）。
 */
const asHost = (obj) => ({ ...obj });

// ---------------------------------------------------------------------------
// 1. 核心修复：增量入账后价目切换不再重算历史
// ---------------------------------------------------------------------------

test('#168 峰谷切换不再重算历史：已入账分段金额锁定，只按增量选档', () => {
  const { it } = loadClient();
  const sid = 'sess-switch';
  // 空闲时段消耗 1M（1.5/百万）
  assert.equal(it.observeSessionCost(sid, usageOf(1e6), newPayload('off')), 1.5);
  // 切到高峰价目、用量不变 → 历史不得按高峰价重算（旧实现这里会跳到 3.0）
  assert.equal(it.observeSessionCost(sid, usageOf(1e6), newPayload('peak')), 1.5, '价目切换后同一累计量必须仍为 1.5');
  assert.equal(it.observeSessionCost(sid, usageOf(1e6), legacyPayload(true)), 1.5, '旧载荷同样不得重算');
  // 高峰时段新增 1M → 按 peak 价入新分段
  assert.equal(it.observeSessionCost(sid, usageOf(2e6), newPayload('peak')), 1.5 + 3);
  // 再切回空闲、用量不变 → 总额继续锁定
  assert.equal(it.observeSessionCost(sid, usageOf(2e6), newPayload('off')), 4.5);
  const segs = it.ledgerSegments(sid);
  assert.equal(segs.length, 2, '两段：空闲 + 高峰');
  assert.deepEqual(segs.map((s) => s.tier).sort(), ['off', 'peak']);
  assert.deepEqual(segs.find((s) => s.tier === 'off').cost, 1.5);
  assert.deepEqual(segs.find((s) => s.tier === 'peak').cost, 3);
});

test('#168 旧实现的跳变被反证：同样两步、旧口径会翻倍', () => {
  const { it } = loadClient();
  const sid = 'sess-anti';
  it.observeSessionCost(sid, usageOf(1e6), newPayload('off'));
  it.observeSessionCost(sid, usageOf(2e6), newPayload('peak'));
  const ledger = it.ledgerTotal(sid);
  const naive = it.sessionCost(usageOf(2e6), TABLES.peak[MODEL]); // 旧口径：整份累计 × 当前价
  assert.equal(ledger, 4.5);
  assert.equal(naive, 6, '旧口径给 6.0 —— 差值正是被错误追溯重算的首个分段');
  assert.notEqual(ledger, naive);
});

// ---------------------------------------------------------------------------
// 2. 幂等性与投影抖动
// ---------------------------------------------------------------------------

test('#168 同一观测重复入账（StrictMode 双渲染 / 无新 token 轮询）幂等', () => {
  const { it } = loadClient();
  const sid = 'sess-idem';
  const once = it.observeSessionCost(sid, usageOf(1e6, { outputTokens: 5e5 }), newPayload('peak'));
  for (let i = 0; i < 50; i += 1) {
    assert.equal(it.observeSessionCost(sid, usageOf(1e6, { outputTokens: 5e5 }), newPayload('off')), once, `第 ${i} 次重复观测不得改变金额`);
  }
  assert.equal(it.ledgerSegments(sid).length, 1, '不得因价目变化新开分段');
});

test('#168 投影累计小幅回退（重试替换）按不追溯处理：水位不下调、差额丢弃', () => {
  const { it } = loadClient();
  const sid = 'sess-regress';
  it.observeSessionCost(sid, usageOf(2e6), newPayload('peak')); // 6.0
  assert.equal(it.observeSessionCost(sid, usageOf(1.5e6), newPayload('peak')), 6, '回退帧不产生负增量');
  assert.equal(it.ledgerTotal(sid), 6);
  // 再涨到 2.5M：增量按高水位 2M 起算（0.5M），而非从 1.5M 起算
  assert.equal(it.observeSessionCost(sid, usageOf(2.5e6), newPayload('peak')), 6 + 1.5);
  assert.deepEqual(it.loadLedgerStore().sessions[sid].seen.uncached, 2.5e6, '水位保持历史最高');
});

// ---------------------------------------------------------------------------
// 3. 老会话兼容：一次性入账 + 日志
// ---------------------------------------------------------------------------

test('#168 老会话无账本：首帧按当前价目一次性入账，金额与旧实现一致并打日志', () => {
  const { it, logs } = loadClient();
  const sid = 'sess-legacy';
  const usage = usageOf(1e6, { cacheReadTokens: 1e6, outputTokens: 1e6 });
  const cost = it.observeSessionCost(sid, usage, newPayload('peak'));
  // 与旧实现（整份累计 × 当前价目）逐分相等 —— 兼容承诺
  assert.equal(cost, it.sessionCost(usage, TABLES.peak[MODEL]));
  assert.equal(cost, 3 + 0.1 + 9);
  assert.ok(logs.some((l) => l.includes('cost-ledger backfill') && l.includes(sid)), '一次性入账必须留日志注明');
  assert.equal(it.loadLedgerStore().sessions[sid].backfilled, true);
  // 此后进入增量模式：价目切换不再动历史
  assert.equal(it.observeSessionCost(sid, usage, newPayload('off')), cost);
});

test('#168 老会话在空闲价目下首帧入账（backfill 用当前档，不猜历史）', () => {
  const { it } = loadClient();
  const sid = 'sess-backfill-off';
  assert.equal(it.observeSessionCost(sid, usageOf(1e6), newPayload('off')), 1.5);
  assert.equal(it.ledgerSegments(sid)[0].tier, 'off');
});

// ---------------------------------------------------------------------------
// 4. 旧 payload（新 client 收旧载荷）双向兼容
// ---------------------------------------------------------------------------

test('#168 新 client 收旧 payload：按 priceTable + peak 推导档位，首帧金额等价旧行为', () => {
  const { it } = loadClient();
  const sid = 'sess-old-payload';
  assert.equal(it.tierOf(legacyPayload(true)), 'peak');
  assert.equal(it.tierOf(legacyPayload(false)), 'off');
  assert.equal(it.tierOf({ ok: true }), it.TIER_UNKNOWN, '既无 pricingTier 也无 peak → 未分档');
  assert.equal(it.observeSessionCost(sid, usageOf(1e6), legacyPayload(true)), 3);
  assert.equal(it.observeSessionCost(sid, usageOf(2e6), legacyPayload(false)), 3 + 1.5, '增量按新推送时刻价目（off）');
  assert.equal(it.tableForTier(legacyPayload(true), 'peak'), legacyPayload(true).priceTable, 'periodTables 缺席时降级到 priceTable');
});

test('#168 新 payload 下 periodTables 优先于 priceTable（跨档位增量取对表）', () => {
  const { it } = loadClient();
  const sid = 'sess-period-tables';
  // priceTable 是 peak 表，但本帧档位是 off → 增量必须走 periodTables.off
  const data = { ok: true, model: MODEL, priceTable: TABLES.peak, periodTables: TABLES, pricingTier: 'off' };
  assert.equal(it.observeSessionCost(sid, usageOf(1e6), data), 1.5, '取 off 表而非 priceTable');
  const data2 = { ...data, pricingTier: 'legacy' };
  assert.equal(it.observeSessionCost(sid, usageOf(2e6), data2), 1.5 + 1, 'legacy 表 1.0/百万');
});

test('#168 旧 client 收新 payload：既有字段语义不变，sessionCost 仍可用', () => {
  const { it } = loadClient();
  // 旧 client 的取价路径：prices = priceTable[默认模型]，整份累计 × 当前价目
  const data = newPayload('peak');
  assert.equal(data.prices, data.priceTable[MODEL], '新载荷不得改 prices 语义');
  assert.equal(it.sessionCost(usageOf(1e6), it.pricesFor(usageOf(1e6), data)), 3);
  assert.equal(it.pricesFor(usageOf(1e6), data, 'off'), TABLES.off[MODEL], 'tier 参与时按对应档表取价');
});

// ---------------------------------------------------------------------------
// 5. 持久化与会话隔离
// ---------------------------------------------------------------------------

test('#168 localStorage 按会话持久化：跨页面重载账本仍在且继续增量', () => {
  const storage = makeStorage();
  const first = loadClient({ storage });
  first.it.observeSessionCost('sess-persist', usageOf(1e6), newPayload('off'));
  assert.ok(storage.bag.has(first.it.LEDGER_KEY), '账本落在固定键下');

  const second = loadClient({ storage }); // 同一存储 = 重载
  assert.equal(second.it.ledgerTotal('sess-persist'), 1.5, '重载后累计费用延续，不回到 0');
  assert.equal(second.it.observeSessionCost('sess-persist', usageOf(2e6), newPayload('peak')), 1.5 + 3);
  // 重载后是增量入账：不再判为首帧回填（标记保留自首次落地，且不重复打回填日志）
  assert.equal(second.it.loadLedgerStore().sessions['sess-persist'].backfilled, true, '回填标记随账本持久化，不被增量帧抹掉');
  assert.ok(!second.logs.some((l) => l.includes('cost-ledger backfill')), '重载后增量帧不得再打回填日志');
});

test('#168 会话之间互不污染（切会话不串金额、不重复回填）', () => {
  const { it } = loadClient();
  it.observeSessionCost('a', usageOf(1e6), newPayload('off'));
  it.observeSessionCost('b', usageOf(3e6), newPayload('peak'));
  assert.equal(it.ledgerTotal('a'), 1.5);
  assert.equal(it.ledgerTotal('b'), 9);
  it.observeSessionCost('a', usageOf(2e6), newPayload('peak'));
  assert.equal(it.ledgerTotal('a'), 1.5 + 3);
  assert.equal(it.ledgerTotal('b'), 9, 'b 不受 a 的增量影响');
  it.resetLedger('a');
  assert.equal(it.ledgerTotal('a'), 0);
  assert.equal(it.ledgerTotal('b'), 9);
});

test('#168 无 localStorage 环境（受限上下文 / 纯浏览器）退回内存账本，不抛错', () => {
  const { it } = loadClient({ noLocalStorage: true });
  const sid = 'sess-memory';
  assert.equal(it.observeSessionCost(sid, usageOf(1e6), newPayload('peak')), 3);
  assert.equal(it.observeSessionCost(sid, usageOf(2e6), newPayload('off')), 3 + 1.5);
  it.resetLedger();
  assert.equal(it.ledgerTotal(sid), 0, '内存账本可清');
});

test('#168 账本损坏 / 版本不符 / 存储写失败一律重建，绝不影响取价', () => {
  const storage = makeStorage();
  const { it } = loadClient({ storage });
  storage.bag.set(it.LEDGER_KEY, '{not json');
  assert.equal(it.ledgerTotal('x'), 0, 'JSON 损坏 → 空账本');
  assert.equal(it.observeSessionCost('x', usageOf(1e6), newPayload('peak')), 3);

  storage.bag.set(it.LEDGER_KEY, JSON.stringify({ v: 999, sessions: { x: { buckets: {}, seen: {} } } }));
  assert.equal(it.ledgerTotal('x'), 0, '版本不符 → 丢弃重建');

  storage.bag.set(it.LEDGER_KEY, JSON.stringify({ v: it.LEDGER_VERSION, sessions: 'garbage' }));
  assert.equal(it.ledgerTotal('x'), 0);

  const broken = makeStorage();
  broken.setItem = () => { throw new Error('QuotaExceededError'); };
  const h2 = loadClient({ storage: broken });
  assert.equal(h2.it.observeSessionCost('q', usageOf(1e6), newPayload('peak')), 3, '写盘失败仍返回本帧应计金额');
  // 无法持久时退化为本帧全量取价（等价旧行为）：金额自洽，不报错也不清零。
  assert.equal(h2.it.observeSessionCost('q', usageOf(1e6), newPayload('off')), 1.5);
});

test('#168 账本容量治理：超上限按 updatedAt 淘汰最旧会话', () => {
  const storage = makeStorage();
  const { it } = loadClient({ storage });
  const store = { v: it.LEDGER_VERSION, sessions: {} };
  for (let i = 0; i < 70; i += 1) {
    store.sessions['s' + i] = {
      seen: { uncached: 1e6, write: 0, read: 0, output: 0 },
      buckets: { [MODEL + '|peak']: { uncached: 1e6, write: 0, read: 0, output: 0, cost: 3 } },
      updatedAt: new Date(Date.UTC(2026, 7, 1, 0, 0, i)).toISOString(),
    };
  }
  it.saveLedgerStore(store);
  const kept = Object.keys(it.loadLedgerStore().sessions);
  assert.equal(kept.length, 60, `收敛到上限 60（实际 ${kept.length}）`);
  assert.ok(kept.includes('s69'), '最新会话必须保留');
  assert.ok(kept.includes('s10'));
  assert.ok(!kept.includes('s9'), '最旧会话先淘汰');
});

// ---------------------------------------------------------------------------
// 6. 纯函数边界
// ---------------------------------------------------------------------------

test('#168 usageDelta / bumpHighWater 逐桶语义', () => {
  const { it } = loadClient();
  const seen = { uncached: 100, write: 50, read: 20, output: 10 };
  let r = it.usageDelta(seen, { uncached: 250, write: 50, read: 0, output: 5 });
  assert.deepEqual(asHost(r.delta), { uncached: 150, write: 0, read: 0, output: 0 });
  assert.equal(r.grew, true);
  r = it.usageDelta(seen, { uncached: 100, write: 50, read: 20, output: 10 });
  assert.equal(r.grew, false, '完全相同的一帧无增量');
  assert.deepEqual(asHost(it.bumpHighWater(seen, { uncached: 50, write: 500, read: 1, output: 1 })), { uncached: 100, write: 500, read: 20, output: 10 });
  assert.deepEqual(it.usageDelta(null, { uncached: 7, write: 0, read: 0, output: 0 }).delta.uncached, 7, '无历史水位视为全量增量');
  assert.deepEqual(asHost(it.usageDelta({ uncached: 'abc' }, { uncached: 10, write: 0, read: 0, output: 0 }).delta), { uncached: 10, write: 0, read: 0, output: 0 }, '垃圾水位按 0 处理');
});

test('#168 非法/空 usage 不写账本也不清零已有金额', () => {
  const { it } = loadClient();
  const sid = 'sess-bads';
  it.observeSessionCost(sid, usageOf(1e6), newPayload('peak'));
  for (const bad of [null, undefined, 'str', {}, { uncachedInputTokens: NaN }, { uncachedInputTokens: -5 }]) {
    assert.equal(it.observeSessionCost(sid, bad, newPayload('off')), 3, JSON.stringify(bad) + ' 不得改变累计');
  }
  assert.equal(it.ledgerTotal(sid), 3);
});

test('#168 模型不可知时用 payload 默认模型档；未知模型回退默认档（不少报费用）', () => {
  const { it } = loadClient();
  const data = { ok: true, model: 'deepseek-v4-pro', prices: TABLES.peak['deepseek-v4-pro'], priceTable: TABLES.peak, periodTables: TABLES, pricingTier: 'peak' };
  assert.equal(it.observeSessionCost('m1', usageOf(1e6, { model: null }), data), 9, '无 usage.model → 按默认 pro 档');
  assert.equal(it.observeSessionCost('m2', usageOf(1e6, { model: 'unknown-x' }), data), 9, '未知模型 → 回退默认档');
});

// ---------------------------------------------------------------------------
// 7. 渲染层端到端（BalanceDock 读账本 + sessionId 来自 slot 标准 props）
// ---------------------------------------------------------------------------

test('#168 渲染：本轮费用取账本累计，峰谷切换 chip 不跳变', () => {
  const h = loadClient();
  const sid = 'sess-render';
  const withBalance = (tier) => ({
    ...newPayload(tier),
    balances: [{ currency: 'CNY', total: 88.5, granted: 10, toppedUp: 78.5 }],
  });
  assert.equal(costText(h.render(usageOf(1e6), withBalance('off'), sid)), '本轮 ¥1.500');
  assert.equal(costText(h.render(usageOf(1e6), withBalance('peak'), sid)), '本轮 ¥1.500', '切换瞬间不得跳变（本 issue 的复现点）');
  assert.equal(costText(h.render(usageOf(2e6), withBalance('peak'), sid)), '本轮 ¥4.500');
  const tip = h.render(usageOf(2e6), withBalance('peak'), sid).props.title;
  assert.match(tip, /分段计价/);
  assert.match(tip, /已结算不追溯/);
  assert.match(tip, /空闲 ¥1\.500 \+ 高峰 ¥3\.000/, 'tooltip 按入账先后列出各时段分段');
  assert.match(tip, /工作日 9:00-12:00/);
  assert.match(tip, /周六\/周日全天空闲价/, '周末规则说明随 pricingSince 一并展示');
});

test('#168 渲染：无余额（浏览器/无密钥）也携带分段说明', () => {
  const h = loadClient();
  const sid = 'sess-nobal';
  h.render(usageOf(1e6), newPayload('off'), sid);
  const tip = h.render(usageOf(2e6), newPayload('peak'), sid).props.title;
  assert.match(tip, /分段计价（已结算不追溯，峰谷切换不重算历史）/);
  assert.match(tip, /无法显示余额/);
});

test('#168 渲染：多会话切换各自显示自己的累计费用', () => {
  const h = loadClient();
  h.render(usageOf(1e6), newPayload('off'), 'r-a');
  h.render(usageOf(4e6), newPayload('peak'), 'r-b');
  assert.equal(costText(h.render(usageOf(1e6), newPayload('peak'), 'r-a')), '本轮 ¥1.500');
  assert.equal(costText(h.render(usageOf(4e6), newPayload('off'), 'r-b')), '本轮 ¥12.00');
});

test('#168 渲染：无 sessionId（旧宿主 slot 不传）归入临时键，仍能增量', () => {
  const h = loadClient();
  assert.equal(costText(h.render(usageOf(1e6), newPayload('off'))), '本轮 ¥1.500');
  assert.equal(costText(h.render(usageOf(2e6), newPayload('peak'))), '本轮 ¥4.500');
  assert.ok(h.it.loadLedgerStore().sessions[h.it.LEDGER_EPHEMERAL], '临时键账本存在');
});

test('#168 渲染：无用量帧不新开分段、disabled/loading 期间不写账本', () => {
  const h = loadClient();
  const sid = 'sess-idle';
  h.render(usageOf(1e6), newPayload('off'), sid);
  const before = h.it.ledgerSegments(sid).length;
  h.render(usageOf(1e6), newPayload('peak'), sid);       // 重复帧
  h.render(null, newPayload('peak'), sid);               // 无投影
  h.render({ uncachedInputTokens: 0, outputTokens: 0 }, newPayload('peak'), sid); // 全零
  h.render(usageOf(2e6), { ok: false, disabled: true }, sid);  // disabled 早退
  h.render(usageOf(2e6), { loading: true }, sid);              // loading 早退
  assert.equal(h.it.ledgerSegments(sid).length, before, '以上各帧都不得新开分段');
  assert.equal(h.it.ledgerTotal(sid), 1.5, '早退帧也不得入账');
});
