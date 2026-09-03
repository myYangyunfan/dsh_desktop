'use strict';

// ===========================================================================
// issue #168（2/3）：balance-scheduler.js 出站载荷的「增量计价」字段契约。
//
// 主进程新增三个字段（只增字段、不改既有字段语义）：
//   · periodTables  { peak, off, legacy } —— 三张全模型价目表（与时刻无关）
//   · pricingTier   'peak' | 'off' | 'legacy' —— 本次推送时刻所属档位
//   · pricingSince  { peakPricing, weekendOffpeak } —— 规则生效节点（ISO）
//
// 双向兼容承诺（本文件重点守住）：
//   A. 旧宿主（不注入新依赖，如 Tauri sidecar cli.js）→ 新字段缺席或降级，
//      既有字段集合与语义逐字不变，旧/新客户端都能按老路消费；
//   B. 旧客户端收新载荷 → 只增字段，未知字段被忽略（语义不变由 A 的同构断言佐证）；
//   C. 任何新字段组装异常都不得影响余额推送。
// ===========================================================================

const test = require('node:test');
const assert = require('node:assert/strict');

const { createBalanceScheduler } = require('../../balance-scheduler');
const balance = require('../../balance');

const FLASH_PEAK = { cacheMiss: 3, cacheHit: 0.1, output: 9 };
const PRO_PEAK = { cacheMiss: 9, cacheHit: 0.3, output: 27 };

/**
 * @param {object} [overrides]
 * @param {object} [overrides.settings]        getSettings 返回值
 * @param {boolean} [overrides.peak]           isPeakHour 返回值
 * @param {boolean} [overrides.injectPricing]  是否注入 issue #168 的三个新依赖
 * @param {boolean} [overrides.showDock]       showBalanceDock（默认 true）
 * @param {Function|false} [overrides.periodTables] 覆盖 periodTables（false=抛错）
 */
function makeHarness(overrides = {}) {
  const calls = { push: [], logs: [], getSettings: 0, tableDates: [], peakDates: [], tierDates: [] };
  const settings = overrides.settings || {};
  const injectPricing = overrides.injectPricing !== false;
  const scheduler = createBalanceScheduler({
    getHome: () => 'C:/tmp-issue168-home',
    getSettings: () => { calls.getSettings += 1; return settings; },
    queryBalance: async () => ({ ok: true, balances: [{ currency: 'CNY', total: 50, granted: 0, toppedUp: 50 }] }),
    queryOpencodeUsage: async () => ({ ok: false, disabled: true }),
    readActiveModel: () => 'deepseek-v4-flash',
    effectivePrice: (model) => (model === 'deepseek-v4-pro' ? { ...PRO_PEAK } : { ...FLASH_PEAK }),
    priceTable: (date) => {
      calls.tableDates.push(date);
      const half = overrides.peak === false;
      const scale = half ? 0.5 : 1;
      return {
        'deepseek-v4-flash': { cacheMiss: 3 * scale, cacheHit: 0.1 * scale, output: 9 * scale },
        'deepseek-v4-pro': { cacheMiss: 9 * scale, cacheHit: 0.3 * scale, output: 27 * scale },
      };
    },
    isPeakHour: (date) => { calls.peakDates.push(date); return overrides.peak !== false; },
    ...(injectPricing ? {
      pricingTier: typeof overrides.pricingTier === 'function'
        ? overrides.pricingTier
        : (date) => { calls.tierDates.push(date); return overrides.peak === false ? 'off' : 'peak'; },
      pricingSince: () => ({ peakPricing: '2026-08-16T16:00:00.000Z', weekendOffpeak: '2026-08-22T16:00:00.000Z' }),
      periodTables: overrides.periodTables === false
        ? () => { throw new Error('periodTables boom'); }
        : () => ({
          peak: {
            'deepseek-v4-flash': { ...FLASH_PEAK },
            'deepseek-v4-pro': { ...PRO_PEAK },
          },
          off: {
            'deepseek-v4-flash': { cacheMiss: 1.5, cacheHit: 0.05, output: 4.5 },
            'deepseek-v4-pro': { cacheMiss: 4.5, cacheHit: 0.15, output: 13.5 },
          },
          legacy: {
            'deepseek-v4-flash': { cacheMiss: 1, cacheHit: 0.02, output: 2 },
            'deepseek-v4-pro': { cacheMiss: 3, cacheHit: 0.025, output: 6 },
          },
        }),
    } : {}),
    push: (r) => calls.push.push(r),
    log: (topic, msg) => calls.logs.push(topic + '|' + msg),
    pollMs: 0,
    throttleMs: 0,
  });
  return { scheduler, calls };
}

// ---------------------------------------------------------------------------
// A. 旧宿主（未注入新依赖）→ 降级为旧载荷形态
// ---------------------------------------------------------------------------

test('#168 旧宿主未注入新依赖：不抛错，新字段降级，既有字段语义不变', async () => {
  const { scheduler } = makeHarness({ injectPricing: false, peak: true });
  const result = await scheduler.refresh();
  assert.equal(result.ok, true);
  assert.equal(result.periodTables, undefined, 'periodTables 未注入即缺席（旧载荷形态）');
  assert.equal(result.pricingSince, undefined, 'pricingSince 未注入即缺席');
  assert.equal(result.pricingTier, 'peak', '档位由既有 peak 字段兜底推导，客户端仍可分档入账');
  // 既有字段一字不变
  assert.deepEqual(result.priceTable, {
    'deepseek-v4-flash': { cacheMiss: 3, cacheHit: 0.1, output: 9 },
    'deepseek-v4-pro': { cacheMiss: 9, cacheHit: 0.3, output: 27 },
  });
  assert.deepEqual(result.prices, { cacheMiss: 3, cacheHit: 0.1, output: 9 });
  assert.equal(result.model, 'deepseek-v4-flash');
  assert.equal(result.peak, true);
  scheduler.stop();
});

test('#168 未注入时 peak=false 推导为 off（旧载荷也能选对档）', async () => {
  const { scheduler } = makeHarness({ injectPricing: false, peak: false });
  const result = await scheduler.refresh();
  assert.equal(result.pricingTier, 'off');
  assert.equal(result.peak, false);
  scheduler.stop();
});

// ---------------------------------------------------------------------------
// B. 注入新依赖 → 三个新字段齐备且不变量成立
// ---------------------------------------------------------------------------

test('#168 高峰推送：periodTables 三表齐备，当前档位表 === priceTable（对象身份）', async () => {
  const { scheduler, calls } = makeHarness({ peak: true });
  const result = await scheduler.refresh();
  assert.deepEqual(Object.keys(result.periodTables).sort(), ['legacy', 'off', 'peak']);
  assert.equal(result.pricingTier, 'peak');
  assert.equal(result.periodTables.peak, result.priceTable, '当前档位表就是本次 priceTable（首帧金额与旧实现一致）');
  assert.equal(result.prices, result.priceTable['deepseek-v4-flash'], '既有不变量 prices === priceTable[默认模型] 保持');
  // 其余两张表按档位取（不被本次时刻的 peak/off 状态污染）
  assert.deepEqual(result.periodTables.off['deepseek-v4-flash'], { cacheMiss: 1.5, cacheHit: 0.05, output: 4.5 });
  assert.deepEqual(result.periodTables.legacy['deepseek-v4-pro'], { cacheMiss: 3, cacheHit: 0.025, output: 6 });
  assert.deepEqual(result.pricingSince, { peakPricing: '2026-08-16T16:00:00.000Z', weekendOffpeak: '2026-08-22T16:00:00.000Z' });
  // 单一 now：新字段与 prices/priceTable/peak 同刻求值，不引入第二个时间源
  assert.equal(calls.tableDates.length, 1, 'priceTable 只调用一次');
  assert.equal(calls.tierDates.length, 1, 'pricingTier 只调用一次');
  assert.equal(calls.tableDates[0], calls.peakDates[0], 'priceTable 与 isPeakHour 同一 Date 实例');
  assert.equal(calls.tierDates[0], calls.tableDates[0], 'pricingTier 与 priceTable 同一 Date 实例');
  assert.equal(calls.getSettings, 1, 'settings 仍每次刷新只读一次（新字段不得重复读盘）');
  scheduler.stop();
});

test('#168 空闲推送：pricingTier=off 且 off 表 === priceTable', async () => {
  const { scheduler } = makeHarness({ peak: false });
  const result = await scheduler.refresh();
  assert.equal(result.pricingTier, 'off');
  assert.equal(result.periodTables.off, result.priceTable);
  assert.notEqual(result.periodTables.peak, result.priceTable, '非当前档位表是独立对象（未被本次时刻覆盖）');
  assert.deepEqual(result.periodTables.peak['deepseek-v4-pro'], { cacheMiss: 9, cacheHit: 0.3, output: 27 });
  scheduler.stop();
});

test('#168 用户 balancePrices 覆盖同时并入三张表（定价单一真源不外溢到账本）', async () => {
  const { scheduler } = makeHarness({
    peak: true,
    settings: { balancePrices: { 'deepseek-v4-flash': { cacheMiss: 1, cacheHit: 0.5, output: 8 } } },
  });
  const result = await scheduler.refresh();
  const overridden = { cacheMiss: 1, cacheHit: 0.5, output: 8 };
  assert.deepEqual(result.prices, overridden);
  assert.deepEqual(result.priceTable['deepseek-v4-flash'], overridden);
  for (const tier of ['peak', 'off', 'legacy']) {
    assert.deepEqual(result.periodTables[tier]['deepseek-v4-flash'], overridden, `${tier} 表须同样携带用户覆盖`);
  }
  // 未覆盖的模型仍按各自档位原值（覆盖不是「一把梭」）
  assert.deepEqual(result.periodTables.peak['deepseek-v4-pro'], { cacheMiss: 9, cacheHit: 0.3, output: 27 });
  assert.deepEqual(result.periodTables.off['deepseek-v4-pro'], { cacheMiss: 4.5, cacheHit: 0.15, output: 13.5 });
  assert.equal(result.periodTables[result.pricingTier], result.priceTable, '覆盖后身份不变量仍成立');
  scheduler.stop();
});

test('#168 价目表为覆盖新增的未知模型补兜底档（三表模型集合一致）', async () => {
  const { scheduler } = makeHarness({
    peak: false,
    settings: { balancePrices: { 'brand-new-model': { cacheMiss: 2, cacheHit: 0.2, output: 5 } } },
  });
  const result = await scheduler.refresh();
  assert.ok(result.priceTable['brand-new-model']);
  for (const tier of ['peak', 'off', 'legacy']) {
    assert.deepEqual(result.periodTables[tier]['brand-new-model'], { cacheMiss: 2, cacheHit: 0.2, output: 5 });
  }
  scheduler.stop();
});

// ---------------------------------------------------------------------------
// C. 新字段异常不得影响余额推送
// ---------------------------------------------------------------------------

test('#168 periodTables 抛错：降级为旧载荷，余额字段完好并记日志', async () => {
  const { scheduler, calls } = makeHarness({ peak: true, periodTables: false });
  const result = await scheduler.refresh();
  assert.equal(result.ok, true, '余额取数不受影响');
  assert.equal(result.error, undefined);
  assert.deepEqual(result.balances, [{ currency: 'CNY', total: 50, granted: 0, toppedUp: 50 }]);
  assert.equal(result.periodTables, undefined, '异常时不写出半成品 periodTables');
  assert.equal(result.pricingTier, 'peak', '档位仍可由 peak 兜底推导（账本仍可用）');
  assert.ok(result.pricingSince, 'pricingSince 在异常前已组装成功');
  assert.ok(calls.logs.some((l) => l.startsWith('balance|') && l.includes('峰谷计价字段')), '降级须留日志');
  assert.equal(calls.push.length, 1, '仍然唯一一次出站推送');
  scheduler.stop();
});

test('#168 只注入 pricingTier（不注入 periodTables/pricingSince）：字段按可用性增量出现', async () => {
  const calls = { push: [] };
  const scheduler = createBalanceScheduler({
    getHome: () => 'C:/tmp-issue168-home',
    getSettings: () => ({}),
    queryBalance: async () => ({ ok: true, balances: [] }),
    queryOpencodeUsage: async () => ({ ok: false, disabled: true }),
    readActiveModel: () => 'deepseek-v4-pro',
    effectivePrice: () => ({ ...PRO_PEAK }),
    priceTable: () => ({ 'deepseek-v4-pro': { ...PRO_PEAK } }),
    isPeakHour: () => false,
    pricingTier: () => 'off',
    push: (r) => calls.push.push(r),
    log: () => {},
    pollMs: 0,
  });
  const result = await scheduler.refresh();
  assert.equal(result.pricingTier, 'off');
  assert.equal(result.periodTables, undefined);
  assert.equal(result.pricingSince, undefined);
  scheduler.stop();
});

// ---------------------------------------------------------------------------
// D. disabled 退化路径与正常路径字段同构
// ---------------------------------------------------------------------------

test('#168 disabled 路径：字段集合与正常路径同构（档位置 null，不产生假档位）', async () => {
  const normal = makeHarness({ peak: true });
  const disabled = makeHarness({ peak: true, settings: { showBalanceDock: false } });
  const okResult = await normal.scheduler.refresh();
  const offResult = await disabled.scheduler.refresh();
  assert.equal(offResult.disabled, true);
  assert.ok(offResult.at && Number.isFinite(Date.parse(offResult.at)));
  assert.equal(offResult.pricingTier, null, '禁用期不得给出可用于入账的档位');
  assert.ok(offResult.periodTables && typeof offResult.periodTables === 'object', '同构携带三表');
  assert.ok(offResult.pricingSince);
  const okKeys = Object.keys(okResult).sort();
  const offKeys = Object.keys(offResult).sort();
  // 正常路径独有字段（余额取数结果）之外的计价字段必须两侧都在
  for (const key of ['periodTables', 'pricingSince', 'pricingTier']) {
    assert.ok(offKeys.includes(key), `disabled 路径须含计价字段 ${key}`);
    assert.ok(okKeys.includes(key), `正常路径须含计价字段 ${key}`);
  }
  normal.scheduler.stop();
  disabled.scheduler.stop();
});

// ---------------------------------------------------------------------------
// E. 与真实 balance.js 直连的契约不变量（防「档位 ↔ 价目」自相矛盾）
// ---------------------------------------------------------------------------

test('#168 真实 balance.js 接线：periodTables[tier] 恒等于 priceTable(同刻)', () => {
  const samples = [
    '2026-08-16T15:59:59Z', // legacy 前 1s
    '2026-08-16T16:00:00Z', // 峰谷生效瞬间
    '2026-08-17T02:30:00Z', // 北京周一 10:30 → peak
    '2026-08-17T05:00:00Z', // 北京周一 13:00 → off
    '2026-08-22T01:30:00Z', // 北京周六 09:30（周末门槛前）→ peak
    '2026-08-23T01:30:00Z', // 北京周日 09:30（门槛后）→ off
    '2026-08-24T01:30:00Z', // 北京周一 09:30 → peak
  ];
  const tables = balance.periodTables();
  const expectedTier = ['legacy', 'off', 'peak', 'off', 'peak', 'off', 'peak'];
  samples.forEach((iso, i) => {
    const at = new Date(iso);
    const tier = balance.pricingTier(at);
    assert.equal(tier, expectedTier[i], `${iso} 档位`);
    assert.deepEqual(tables[tier], balance.priceTable(at), `${iso}：${tier} 表须等于同刻 priceTable`);
    for (const model of Object.keys(balance.priceTable(at))) {
      assert.deepEqual(tables[tier][model], balance.effectivePrice(model, at), `${iso} ${model} 单价一致`);
    }
  });
});

test('#168 载荷可结构化克隆（IPC/emit 通道不接受函数与循环引用）', async () => {
  const { scheduler } = makeHarness({ peak: true });
  const result = await scheduler.refresh();
  const cloned = structuredClone(result);
  assert.deepEqual(cloned.periodTables, result.periodTables);
  assert.deepEqual(cloned.pricingSince, result.pricingSince);
  assert.equal(cloned.pricingTier, 'peak');
  scheduler.stop();
});
