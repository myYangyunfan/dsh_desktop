'use strict';

// balance-scheduler.js 编排器单测：节流 / in-flight 去重 / !stopped apply 守卫 /
// 指数退避重试 / 单一 now 一致性 / settings 单次读取 / 禁用短路 / 出站单一投递。
// 注：latest-sequence 守卫（seq === latestSeq）在当前 API 下恒真（in-flight 去重已
// 杜绝并发多请求），属防御性兜底、无独立触发路径，故不单独断言；其可达的
// 「!stopped 后才 apply」分支见下方「stop() 期间在途请求」用例。
// 全部依赖注入（查询函数/推送/设置读取），零网络、零文件系统、零 Electron。

const test = require('node:test');
const assert = require('node:assert');
const { createBalanceScheduler } = require('../../balance-scheduler');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 轮询等待条件成立（重负载下定时器可能延迟，轮询比固定 sleep 可靠）。 */
async function waitFor(cond, what, timeoutMs = 3000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (cond()) return;
    await sleep(10);
  }
  throw new Error('等待超时：' + what);
}

/** 构造一个编排器测试床。 */
function makeHarness(overrides = {}) {
  const calls = {
    queryBalance: 0,
    queryOpencode: 0,
    getSettings: 0,
    push: [],
    logs: [],
  };
  let settings = Object.assign({}, overrides.settings);

  const scheduler = createBalanceScheduler({
    getHome: () => overrides.home || 'C:/tmp-test-dsh-home',
    getSettings: () => {
      calls.getSettings += 1;
      return settings;
    },
    queryBalance: async () => {
      calls.queryBalance += 1;
      await sleep(overrides.balanceDelayMs || 5);
      if (overrides.balanceFailure) throw new Error(overrides.balanceFailure);
      return { ok: true, balances: [{ currency: 'CNY', total: 100, granted: 0, toppedUp: 100 }] };
    },
    queryOpencodeUsage: async () => {
      calls.queryOpencode += 1;
      await sleep(1);
      return { ok: true, usage: { rolling: { percent: 10 } } };
    },
    readActiveModel: () => 'deepseek-v4-flash',
    effectivePrice: (model, date) => {
      calls.priceDates.push(date);
      return { cacheMiss: 3, cacheHit: 0.1, output: 9 };
    },
    priceTable: (date) => {
      calls.tableDates.push(date);
      return { 'deepseek-v4-flash': { cacheMiss: 3, cacheHit: 0.1, output: 9 } };
    },
    isPeakHour: (date) => {
      calls.peakDates.push(date);
      return true;
    },
    push: (result) => calls.push.push(result),
    log: (...args) => calls.logs.push(args.join(' ')),
    throttleMs: 60,
    retryDelaysMs: overrides.retryDelaysMs || [15, 25, 40],
    pollMs: 0, // 默认关闭轮询，避免测试间互相干扰
    ...(overrides.schedulerOptions || {}),
  });

  calls.priceDates = [];
  calls.tableDates = [];
  calls.peakDates = [];

  return {
    scheduler,
    calls,
    setSettings(next) {
      settings = next;
    },
  };
}

test('组装契约：result 含 prices/priceTable/model/peak/at/opencodeGo，单一 now 同刻求值', async () => {
  const { scheduler, calls } = makeHarness();
  const result = await scheduler.refresh();
  assert.strictEqual(result.ok, true);
  assert.deepStrictEqual(result.prices, { cacheMiss: 3, cacheHit: 0.1, output: 9 });
  assert.deepStrictEqual(result.priceTable, { 'deepseek-v4-flash': { cacheMiss: 3, cacheHit: 0.1, output: 9 } });
  assert.strictEqual(result.model, 'deepseek-v4-flash');
  assert.strictEqual(result.peak, true);
  assert.ok(typeof result.at === 'string' && Number.isFinite(Date.parse(result.at)));
  assert.strictEqual(result.opencodeGo.ok, true);
  // 单一 now：priceTable / isPeakHour 收到同一个 Date 对象；默认模型价由
  // priceTable 内同刻求值（prices = priceTable[默认模型]），无需单独调 effectivePrice
  assert.strictEqual(calls.tableDates.length, 1);
  assert.strictEqual(calls.peakDates.length, 1);
  assert.strictEqual(calls.tableDates[0], calls.peakDates[0]);
  assert.strictEqual(calls.priceDates.length, 0, '无覆盖时不应单独调用 effectivePrice');
  // 每次刷新 settings 只读一次
  assert.strictEqual(calls.getSettings, 1);
  // 出站唯一出口：push 恰一次，且与返回值同引用
  assert.strictEqual(calls.push.length, 1);
  assert.strictEqual(calls.push[0], result);
  assert.strictEqual(scheduler.getCache(), result);
});

test('节流：30s 窗口内重复 maybeRefresh 不重复请求；force 绕过', async () => {
  const { scheduler, calls } = makeHarness();
  await scheduler.maybeRefresh();      // 第一次实际请求
  const r2 = await scheduler.maybeRefresh(); // 窗口内 → 复用缓存
  assert.strictEqual(calls.queryBalance, 1);
  assert.strictEqual(r2, calls.push[0]);
  await scheduler.maybeRefresh(true);  // force 绕过
  assert.strictEqual(calls.queryBalance, 2);
  await sleep(70);                     // 越过节流窗口
  await scheduler.maybeRefresh();
  assert.strictEqual(calls.queryBalance, 3);
});

test('in-flight 去重：并发触发共享同一次请求，只查询/推送一次', async () => {
  const { scheduler, calls } = makeHarness({ balanceDelayMs: 40 });
  const [a, b, c] = await Promise.all([scheduler.refresh(), scheduler.refresh(), scheduler.refresh()]);
  assert.strictEqual(calls.queryBalance, 1, '三次并发触发只应发起一次查询');
  assert.strictEqual(a, b);
  assert.strictEqual(b, c, '并发调用拿到同一结果（去重语义）');
  assert.strictEqual(calls.push.length, 1, '结果只推送一次');
});

test('去重语义：后触发者等待 in-flight 结果，不另发请求覆盖（无 last-writer-wins）', async () => {
  const { scheduler, calls } = makeHarness({ balanceDelayMs: 50 });
  const first = scheduler.refresh();
  await sleep(5);
  const second = scheduler.refresh(); // in-flight 期间触发 → 复用
  const [r1, r2] = await Promise.all([first, second]);
  assert.strictEqual(r1, r2);
  assert.strictEqual(calls.queryBalance, 1);
  assert.strictEqual(calls.push.length, 1);
  assert.strictEqual(scheduler.getCache(), r1);
  // in-flight 结束后再触发 → 新一轮请求（新数据）
  await scheduler.refresh();
  assert.strictEqual(calls.queryBalance, 2);
  assert.strictEqual(calls.push.length, 2);
});

test('stop() 期间在途请求完成后不推送（!stopped apply 守卫）', async () => {
  const { scheduler, calls } = makeHarness({ balanceDelayMs: 60 });
  const p = scheduler.refresh(); // 发起慢请求
  await sleep(10);
  scheduler.stop(); // 请求完成前停止
  await p; // 等在途请求完成
  assert.strictEqual(calls.push.length, 0, 'stop 后完成的在途请求不得推送结果');
  assert.strictEqual(scheduler.getCache(), null, 'stop 后 cache 不应被写入');
});

test('重试退避：连续失败按 30s→1m→2m→5m 指数退避，成功清零', async () => {
  const { scheduler, calls, setSettings } = makeHarness({ retryDelaysMs: [15, 25, 40] });
  const failure = new Error('boom');
  let failCount = 0;
  // 换成会失败的查询
  const s2 = createBalanceScheduler({
    getHome: () => 'C:/tmp-test-dsh-home',
    getSettings: () => ({}),
    queryBalance: async () => {
      calls.queryBalance += 1;
      failCount += 1;
      throw failure;
    },
    queryOpencodeUsage: async () => ({ ok: false, disabled: true }),
    readActiveModel: () => 'deepseek-v4-flash',
    effectivePrice: () => ({ cacheMiss: 3, cacheHit: 0.1, output: 9 }),
    priceTable: () => ({}),
    isPeakHour: () => true,
    push: (r) => calls.push.push(r),
    log: () => {},
    retryDelaysMs: [15, 25, 40],
    pollMs: 0,
  });
  await s2.refresh();
  assert.strictEqual(calls.queryBalance, 1);
  assert.strictEqual(calls.push.length, 1);
  // 第 1 次失败 → ~15ms 后自动重试
  await waitFor(() => calls.queryBalance >= 2, '第一次退避重试');
  // 第 2 次失败 → ~25ms 后重试
  await waitFor(() => calls.queryBalance >= 3, '第二次退避重试');
  // 第 3 次失败 → ~40ms 后重试
  await waitFor(() => calls.queryBalance >= 4, '第三次退避重试');
  assert.strictEqual(s2.state().consecutiveFailures, 4);
  s2.stop();
  const at = calls.queryBalance;
  await sleep(150); // 超过退避封顶档（40ms）的 3 倍
  assert.strictEqual(calls.queryBalance, at, 'stop 后不再重试');
});

test('重试状态机：成功后清零计数并取消退避定时器', async () => {
  const { scheduler, calls } = makeHarness({ retryDelaysMs: [15, 25, 40] });
  await scheduler.refresh(); // 成功
  assert.strictEqual(scheduler.state().consecutiveFailures, 0);
  assert.strictEqual(calls.queryBalance, 1);
  await sleep(60);
  assert.strictEqual(calls.queryBalance, 1, '成功后不应有任何重试');
});

test('禁用短路（showBalanceDock=false）：不查询，推送 disabled 结果，不重试', async () => {
  const { scheduler, calls } = makeHarness({ settings: { showBalanceDock: false } });
  const result = await scheduler.refresh();
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.disabled, true);
  assert.strictEqual(calls.queryBalance, 0);
  assert.strictEqual(calls.queryOpencode, 0);
  assert.strictEqual(calls.push.length, 1);
  await sleep(60);
  assert.strictEqual(calls.queryBalance, 0, '禁用状态不重试');
});

test('showOpenCodeGoUsage=false：跳过 OpenCode 查询并返回 disabled 标记', async () => {
  const { scheduler, calls } = makeHarness({ settings: { showOpenCodeGoUsage: false } });
  const result = await scheduler.refresh();
  assert.strictEqual(calls.queryOpencode, 0);
  assert.deepStrictEqual(result.opencodeGo, { ok: false, disabled: true });
});

test('OpenCode 查询失败不拖垮整体：result.opencodeGo={ok:false,error}，余额正常', async () => {
  const harness = makeHarness();
  harness.calls.queryOpencode = 0;
  const scheduler = createBalanceScheduler({
    getHome: () => 'C:/tmp-test-dsh-home',
    getSettings: () => ({}),
    queryBalance: async () => ({ ok: true, balances: [{ currency: 'CNY', total: 50, granted: 0, toppedUp: 50 }] }),
    queryOpencodeUsage: async () => {
      harness.calls.queryOpencode += 1;
      throw new Error('go boom');
    },
    readActiveModel: () => 'deepseek-v4-flash',
    effectivePrice: () => ({ cacheMiss: 3, cacheHit: 0.1, output: 9 }),
    priceTable: () => ({}),
    isPeakHour: () => true,
    push: (r) => harness.calls.push.push(r),
    log: () => {},
    pollMs: 0,
  });
  const result = await scheduler.refresh();
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.opencodeGo.ok, false);
  assert.ok(result.opencodeGo.error.includes('go boom'));
});

test('balancePrices.<model> 覆盖同时作用于 prices 与 priceTable（定价单一真源）', async () => {
  const { scheduler, calls } = makeHarness({
    settings: { balancePrices: { 'deepseek-v4-flash': { cacheMiss: 1, cacheHit: 0.5, output: 8 } } },
  });
  const result = await scheduler.refresh();
  assert.deepStrictEqual(result.prices, { cacheMiss: 1, cacheHit: 0.5, output: 8 });
  assert.deepStrictEqual(result.priceTable, { 'deepseek-v4-flash': { cacheMiss: 1, cacheHit: 0.5, output: 8 } });
  // 不变量：prices 恒等于 priceTable[默认模型]，杜绝覆盖绕过真实模型会话
  assert.strictEqual(result.prices, result.priceTable['deepseek-v4-flash']);
  assert.strictEqual(calls.getSettings, 1);
});

test('queryBalance 抛异常：捕获为 ok:false 并触发退避重试', async () => {
  const calls = { queryBalance: 0, push: [] };
  let failNext = true;
  const scheduler = createBalanceScheduler({
    getHome: () => 'C:/tmp-test-dsh-home',
    getSettings: () => ({}),
    queryBalance: async () => {
      calls.queryBalance += 1;
      if (failNext) throw new Error('sync crash');
      return { ok: true, balances: [] };
    },
    queryOpencodeUsage: async () => ({ ok: false, disabled: true }),
    readActiveModel: () => 'deepseek-v4-flash',
    effectivePrice: () => ({ cacheMiss: 3, cacheHit: 0.1, output: 9 }),
    priceTable: () => ({}),
    isPeakHour: () => true,
    push: (r) => calls.push.push(r),
    log: () => {},
    retryDelaysMs: [15, 25, 40],
    pollMs: 0,
  });
  const r1 = await scheduler.refresh();
  assert.strictEqual(r1.ok, false);
  assert.ok(r1.error.includes('sync crash'));
  // 重试后成功 → 清零
  failNext = false;
  await waitFor(() => calls.queryBalance >= 2, '失败后自动重试');
  const cache = scheduler.getCache();
  assert.strictEqual(cache.ok, true);
  assert.strictEqual(scheduler.state().consecutiveFailures, 0);
  scheduler.stop();
});

test('start/stop：start 立即刷新并启动轮询，stop 停轮询与重试（幂等）', async () => {
  const calls = { queryBalance: 0, push: [] };
  const scheduler = createBalanceScheduler({
    getHome: () => 'C:/tmp-test-dsh-home',
    getSettings: () => ({}),
    queryBalance: async () => {
      calls.queryBalance += 1;
      return { ok: true, balances: [] };
    },
    queryOpencodeUsage: async () => ({ ok: false, disabled: true }),
    readActiveModel: () => 'deepseek-v4-flash',
    effectivePrice: () => ({ cacheMiss: 3, cacheHit: 0.1, output: 9 }),
    priceTable: () => ({}),
    isPeakHour: () => true,
    push: (r) => calls.push.push(r),
    log: () => {},
    throttleMs: 60,
    pollMs: 30,
  });
  scheduler.start();
  await waitFor(() => calls.queryBalance >= 1, 'start 立即刷新');
  assert.strictEqual(calls.queryBalance, 1);
  await waitFor(() => calls.queryBalance >= 2, '轮询持续进行', 4000);
  scheduler.stop();
  scheduler.stop(); // 幂等
  const at = calls.queryBalance;
  await sleep(150); // 超过轮询周期（30ms）的 3 倍
  assert.strictEqual(calls.queryBalance, at, 'stop 后轮询停止');
});

test('push 含 warning 时记录日志，成功数据正常出站', async () => {
  const calls = { logs: [], push: [] };
  const scheduler = createBalanceScheduler({
    getHome: () => 'C:/tmp-test-dsh-home',
    getSettings: () => ({}),
    queryBalance: async () => ({ ok: true, balances: [], warning: '余额端点使用 http://，API Key 明文传输' }),
    queryOpencodeUsage: async () => ({ ok: false, disabled: true }),
    readActiveModel: () => 'deepseek-v4-flash',
    effectivePrice: () => ({ cacheMiss: 3, cacheHit: 0.1, output: 9 }),
    priceTable: () => ({}),
    isPeakHour: () => true,
    push: (r) => calls.push.push(r),
    log: (tag, msg) => calls.logs.push(tag + ' ' + msg),
    pollMs: 0,
  });
  await scheduler.refresh();
  assert.strictEqual(calls.logs.length, 1);
  assert.ok(calls.logs[0].includes('http://'));
});
