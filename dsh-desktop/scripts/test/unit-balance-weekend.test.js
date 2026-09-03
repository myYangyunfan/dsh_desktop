'use strict';

// ===========================================================================
// issue #168（1/3）：balance.js isPeakHour 周末规则 + 峰谷计价档位契约。
//
// 官方 2026-08-23 00:00（北京时间）起周六/周日全天按空闲价计；该规则此前缺失，
// 导致周末高峰时段被按全价展示与计价。本文件守住三件事：
//   1. 周末全天空闲（含生效门槛，且**不溯及既往**——门槛之前的周末仍按旧窗口）；
//   2. 与 assets/plugins/dsh-offpeak（issue #158 产物）的口径交叉一致：
//      生效日历日 + 高峰窗口边界 + 逐时刻对拍（两边实现独立，漂移即失败）；
//   3. issue #168 新增的 pricingTier()/periodTables()/pricingSince() 契约。
//
// 全部时刻用 UTC ISO 串或 Date.UTC 显式表达，不跟机器本地时区（CI 时区无关）。
// ===========================================================================

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const balance = require('../../balance');

const BEIJING_OFFSET_MS = 8 * 3600 * 1000;

/** 北京时间日历字段 → UTC 时刻（与 balance.js 同一固定 +8 偏移）。 */
function bj(year, month, day, hour = 0, minute = 0) {
  return new Date(Date.UTC(year, month - 1, day, hour, minute) - BEIJING_OFFSET_MS);
}

/** 北京日历日字符串 YYYY-MM-DD（与 dsh-offpeak 的 beijingNow().date 同构）。 */
function beijingDateStr(date) {
  const shifted = new Date(date.getTime() + BEIJING_OFFSET_MS);
  const p = (n) => String(n).padStart(2, '0');
  return `${shifted.getUTCFullYear()}-${p(shifted.getUTCMonth() + 1)}-${p(shifted.getUTCDate())}`;
}

// 2026 年 8 月星期事实（node 核实）：8/15 周六、8/16 周日、8/17 周一、
// 8/22 周六、8/23 周日、8/24 周一、8/29 周六、8/30 周日。
const SAT_BEFORE_GATE = bj(2026, 8, 22, 10, 30); // 北京周六 10:30（周末规则生效前）
const SUN_AT_GATE = bj(2026, 8, 23, 0, 0);       // 北京周日 00:00（生效瞬间）
const SUN_AFTER_GATE = bj(2026, 8, 23, 15, 0);   // 北京周日 15:00（旧规则下的高峰窗口内）
const MON_AFTER_GATE = bj(2026, 8, 24, 10, 30);  // 北京周一 10:30

// ---------------------------------------------------------------------------
// 1. 周末全天空闲 + 生效门槛
// ---------------------------------------------------------------------------

test('#168 门槛前（北京 2026-08-22 周六）周末沿用旧窗口，判定不溯及既往', () => {
  assert.equal(balance.WEEKEND_OFFPEAK_SINCE_UTC, Date.UTC(2026, 7, 22, 16, 0, 0), '门槛常量 = 北京 8/23 00:00');
  // 周六 9:00-12:00 / 14:00-18:00 仍算高峰（旧行为，历史时刻不得用新规则重算）
  for (const hour of [9, 10, 11, 14, 15, 16, 17]) {
    assert.equal(balance.isPeakHour(bj(2026, 8, 22, hour, 30)), true, `门槛前周六北京 ${hour}:30 应为高峰`);
  }
  // 边界可求值：门槛前 1ms（北京 8/22 23:59:59.999）本身已超出旧窗口 → false
  assert.equal(balance.isPeakHour(new Date(balance.WEEKEND_OFFPEAK_SINCE_UTC - 1)), false, '北京周六 23:59 本就不在窗口内');
  assert.equal(balance.isPeakHour(new Date(balance.WEEKEND_OFFPEAK_SINCE_UTC - 7 * 3600 * 1000)), true, '门槛前 7h（北京周六 17:00）仍按旧窗口计高峰');
});

test('#168 门槛后（北京 2026-08-23 起）周六/周日全天 24 小时均为空闲', () => {
  assert.equal(balance.isPeakHour(SUN_AT_GATE), false, '生效瞬间（周日 00:00）即空闲');
  assert.equal(balance.isPeakHour(SUN_AFTER_GATE), false, '周日 15:00 落在旧高峰窗口内也必须空闲');
  for (const weekendDay of [23, 29, 30]) {
    for (let hour = 0; hour < 24; hour += 1) {
      const at = bj(2026, 8, weekendDay, hour, 15);
      assert.equal(balance.isPeakHour(at), false, `周末门槛后 8/${weekendDay} 北京 ${hour}:15 应全天空闲`);
    }
  }
});

test('#168 周末规则不影响工作日：周一~周五高峰窗口不变', () => {
  assert.equal(balance.isPeakHour(MON_AFTER_GATE), true, '周一 10:30 高峰');
  for (const day of [24, 25, 26, 27, 28]) { // 8/24 周一 … 8/28 周五
    for (const hour of [9, 10, 11, 14, 15, 16, 17]) {
      assert.equal(balance.isPeakHour(bj(2026, 8, day, hour, 0)), true, `8/${day} 北京 ${hour}:00 高峰`);
    }
    for (const hour of [0, 8, 12, 13, 18, 23]) {
      assert.equal(balance.isPeakHour(bj(2026, 8, day, hour, 0)), false, `8/${day} 北京 ${hour}:00 空闲`);
    }
  }
});

test('#168 峰谷生效前（legacy 期）恒非高峰，周末规则不得反超 legacy 门槛', () => {
  // 2026-08-15 是周六，且早于峰谷生效节点 → 旧版固定价期没有峰谷概念
  const legacySaturday = bj(2026, 8, 15, 10, 30);
  assert.equal(balance.isPeakHour(legacySaturday), false, '峰谷生效前一律 false');
  assert.equal(balance.isPeakHour(new Date(balance.PEAK_PRICING_SINCE_UTC - 1)), false);
  assert.equal(balance.isPeakHour(new Date(balance.PEAK_PRICING_SINCE_UTC)), false, '生效瞬间（北京 8/17 00:00）本身不在高峰窗口');
});

test('#168 无效日期与缺参：isPeakHour 保守返回 false / 按当前时刻可求值', () => {
  assert.equal(balance.isPeakHour('not-a-date'), false, '非法日期不得抛错');
  assert.equal(balance.isPeakHour(new Date(NaN)), false);
  assert.equal(typeof balance.isPeakHour(), 'boolean', '无参调用按当前时刻');
});

// ---------------------------------------------------------------------------
// 2. 与 dsh-offpeak（issue #158 产物）口径交叉一致
// ---------------------------------------------------------------------------

const OFFPEAK_SRC_PATH = path.join(__dirname, '..', '..', 'assets', 'plugins', 'dsh-offpeak', 'src', 'index.js');
const offpeakSrc = fs.readFileSync(OFFPEAK_SRC_PATH, 'utf8');

/** 从 dsh-offpeak 源码读出「周末全天空闲生效日」常量（口径漂移即失败）。 */
function readOffpeakGate() {
  const m = offpeakSrc.match(/WEEKEND_OFFPEAK_EFFECTIVE_FROM\s*=\s*"(\d{4})-(\d{2})-(\d{2})"/);
  assert.ok(m, 'dsh-offpeak 的 WEEKEND_OFFPEAK_EFFECTIVE_FROM 常量必须可解析（两侧口径需同步维护）');
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

/** 从 dsh-offpeak 源码读出高峰窗口（分钟数）→ 小时区间数组。 */
function readOffpeakWindows() {
  const block = offpeakSrc.match(/const DEFAULT_PEAK_WINDOWS\s*=\s*\[([\s\S]*?)\];/);
  assert.ok(block, 'dsh-offpeak 的 DEFAULT_PEAK_WINDOWS 必须可解析');
  const wins = [...block[1].matchAll(/\{\s*start:\s*(\d+)\s*\*\s*60\s*,\s*end:\s*(\d+)\s*\*\s*60\s*\}/g)];
  assert.ok(wins.length > 0, '高峰窗口至少一段');
  return wins.map((w) => ({ start: Number(w[1]), end: Number(w[2]) }));
}

test('#168 交叉一致：生效门槛与 dsh-offpeak 常量指同一北京日历日', () => {
  const gate = readOffpeakGate();
  const p = (n) => String(n).padStart(2, '0');
  const offpeakDay = `${gate.year}-${p(gate.month)}-${p(gate.day)}`;
  assert.equal(
    beijingDateStr(new Date(balance.WEEKEND_OFFPEAK_SINCE_UTC)),
    offpeakDay,
    `balance.js 门槛平移 +8 后的北京日历日必须等于 dsh-offpeak 的 ${offpeakDay}`,
  );
  // offpeak 侧的周末判定语句仍在（被删除即为口径单方面漂移）
  assert.match(offpeakSrc, /weekday === 6 \|\| weekday === 7/, 'dsh-offpeak 周末判定锚点');
});

test('#168 交叉一致：高峰窗口边界与 dsh-offpeak 的分钟窗口逐点对齐', () => {
  const windows = readOffpeakWindows();
  // 取一个「周末门槛后、峰谷生效后的工作日」（8/25 周二）比对，排除两条豁免规则的干扰
  const weekday = 25;
  for (const w of windows) {
    assert.equal(balance.isPeakHour(bj(2026, 8, weekday, w.start, 0)), true, `窗口起点 ${w.start}:00 含`);
    assert.equal(balance.isPeakHour(bj(2026, 8, weekday, w.start - 1, 59)), false, `窗口起点前一分钟不含`);
    assert.equal(balance.isPeakHour(bj(2026, 8, weekday, w.end, 0)), false, `窗口终点 ${w.end}:00 不含（含起不含终）`);
    assert.equal(balance.isPeakHour(bj(2026, 8, weekday, w.end - 1, 59)), true, '窗口终点前一分钟含');
  }
});

test('#168 交叉一致：按 dsh-offpeak 语义复刻的参考实现逐小时对拍（三周窗口）', () => {
  const gate = readOffpeakGate();
  const windows = readOffpeakWindows();
  /** 参考实现：dsh-offpeak 的 beijingNow() + isPeak() 语义（Intl 之外的等价手法）。 */
  function offpeakStyleIsPeak(at) {
    const shifted = new Date(at.getTime() + BEIJING_OFFSET_MS);
    const jsWeekday = new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate())).getUTCDay();
    const weekday = jsWeekday === 0 ? 7 : jsWeekday;
    const date = beijingDateStr(at);
    const minutes = shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
    // if ((weekday === 6 || weekday === 7) && date >= WEEKEND_OFFPEAK_EFFECTIVE_FROM) return false;
    if ((weekday === 6 || weekday === 7) && date >= `${gate.year}-${String(gate.month).padStart(2, '0')}-${String(gate.day).padStart(2, '0')}`) {
      return false;
    }
    return windows.some((w) => minutes >= w.start * 60 && minutes < w.end * 60);
  }
  let sampledWeekendPeak = 0;
  let sampledWeekendHours = 0;
  let sampledWeekdayPeak = 0;
  for (let ms = balance.PEAK_PRICING_SINCE_UTC; ms < Date.UTC(2026, 8, 14); ms += 3600 * 1000) {
    const at = new Date(ms);
    const mine = balance.isPeakHour(at);
    const theirs = offpeakStyleIsPeak(at);
    assert.equal(
      mine, theirs,
      `口径漂移：${at.toISOString()}（北京 ${beijingDateStr(at)} ${new Date(at.getTime() + BEIJING_OFFSET_MS).getUTCHours()}:00）` +
      ` balance=${mine} dsh-offpeak=${theirs}`,
    );
    const jsDay = new Date(at.getTime() + BEIJING_OFFSET_MS).getUTCDay();
    const isWeekendDay = jsDay === 0 || jsDay === 6;
    // 周末零高峰只对「门槛之后」成立（之前的周末沿用旧窗口，属不溯及既往）。
    if (isWeekendDay && ms >= balance.WEEKEND_OFFPEAK_SINCE_UTC) {
      sampledWeekendHours += 1;
      if (mine) sampledWeekendPeak += 1;
    }
    if (mine && !isWeekendDay) sampledWeekdayPeak += 1;
  }
  assert.ok(sampledWeekdayPeak > 0, '对拍需覆盖到工作日高峰（否则用例空转）');
  assert.ok(sampledWeekendHours >= 24, `对拍需覆盖周末门槛后整日（实际 ${sampledWeekendHours} 小时）`);
  assert.equal(sampledWeekendPeak, 0, '周末门槛后不得出现任何高峰小时');
});

// ---------------------------------------------------------------------------
// 3. issue #168 新增契约：pricingTier / periodTables / pricingSince
// ---------------------------------------------------------------------------

test('#168 pricingTier: legacy / peak / off 三档与 isPeakHour、effectivePrice 同源', () => {
  assert.equal(balance.pricingTier(new Date(balance.PEAK_PRICING_SINCE_UTC - 1000)), 'legacy');
  assert.equal(balance.pricingTier(SAT_BEFORE_GATE), 'peak', '门槛前周六高峰时段仍是 peak（不溯及既往）');
  assert.equal(balance.pricingTier(SUN_AFTER_GATE), 'off', '门槛后周日高峰窗口 → off');
  assert.equal(balance.pricingTier(MON_AFTER_GATE), 'peak');
  assert.equal(balance.pricingTier(bj(2026, 8, 24, 13, 0)), 'off');
  assert.equal(typeof balance.pricingTier(), 'string', '无参按当前时刻');
});

test('#168 periodTables: 三张全模型表，peak 全价 / off 半峰 / legacy 旧版固定价', () => {
  const tables = balance.periodTables();
  assert.deepEqual(Object.keys(tables).sort(), ['legacy', 'off', 'peak']);
  const models = ['deepseek-v4-flash', 'deepseek-v4-pro', 'deepseek-chat', 'deepseek-reasoner'];
  for (const tier of ['peak', 'off', 'legacy']) {
    for (const m of models) {
      assert.ok(tables[tier][m], `${tier} 表须含 ${m}`);
      for (const key of ['cacheMiss', 'cacheHit', 'output']) {
        assert.ok(Number.isFinite(tables[tier][m][key]) && tables[tier][m][key] > 0, `${tier}.${m}.${key} 必须为正数`);
      }
    }
  }
  // off = peak 的一半；legacy 为旧版固定价（低于 peak）
  for (const m of models) {
    for (const key of ['cacheMiss', 'cacheHit', 'output']) {
      assert.equal(tables.off[m][key], tables.peak[m][key] / 2, `off.${m}.${key} 应为峰价一半`);
    }
  }
  assert.deepEqual(tables.peak['deepseek-v4-pro'], { cacheMiss: 9, cacheHit: 0.3, output: 27 });
  assert.deepEqual(tables.off['deepseek-v4-pro'], { cacheMiss: 4.5, cacheHit: 0.15, output: 13.5 });
  assert.deepEqual(tables.legacy['deepseek-v4-pro'], { cacheMiss: 3, cacheHit: 0.025, output: 6 });
  // 与 priceTable(时刻) 一致：档位 ↔ 价目不矛盾
  assert.deepEqual(tables.peak, balance.priceTable(SAT_BEFORE_GATE), 'peak 表 = 高峰时刻的 priceTable');
  assert.deepEqual(tables.off, balance.priceTable(SUN_AFTER_GATE), 'off 表 = 空闲时刻的 priceTable');
  assert.deepEqual(tables.legacy, balance.priceTable(new Date(balance.PEAK_PRICING_SINCE_UTC - 1000)));
  // 每次调用返回全新对象（调用方可安全叠加用户覆盖）
  assert.notEqual(balance.periodTables(), balance.periodTables());
});

test('#168 pricingSince: 两个生效节点均为 ISO 串且先后有序', () => {
  const since = balance.pricingSince();
  assert.deepEqual(Object.keys(since).sort(), ['peakPricing', 'weekendOffpeak']);
  for (const k of Object.keys(since)) {
    assert.equal(typeof since[k], 'string');
    assert.ok(since[k].endsWith('.000Z'), `${k} 应为 ISO UTC 串`);
    assert.ok(Number.isFinite(Date.parse(since[k])));
  }
  assert.equal(since.peakPricing, '2026-08-16T16:00:00.000Z');
  assert.equal(since.weekendOffpeak, '2026-08-22T16:00:00.000Z');
  assert.ok(Date.parse(since.peakPricing) < Date.parse(since.weekendOffpeak));
});

test('#168 effectivePrice 与周末规则联动：周日高峰窗口取半价', () => {
  assert.deepEqual(balance.effectivePrice('deepseek-v4-flash', SUN_AFTER_GATE), { cacheMiss: 1.5, cacheHit: 0.05, output: 4.5 });
  assert.deepEqual(balance.effectivePrice('deepseek-v4-flash', SAT_BEFORE_GATE), { cacheMiss: 3, cacheHit: 0.1, output: 9 });
  assert.deepEqual(balance.effectivePrice('deepseek-v4-flash', MON_AFTER_GATE), { cacheMiss: 3, cacheHit: 0.1, output: 9 });
});
