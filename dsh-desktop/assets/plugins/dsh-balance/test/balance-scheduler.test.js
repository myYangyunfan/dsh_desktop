/**
 * 编排器与出站载荷契约单测（宿主半边）。
 *
 * 守住两条易碎的性质：
 *   1. BalancePush 字段契约（含 docs/balance-architecture.md §2 的对象身份不变量
 *      periodTables[pricingTier] === priceTable）；
 *   2. 节流 / in-flight 去重 / latest-sequence 守卫 / 指数退避 / disabled 不重试。
 *
 * 运行：node --test test/（本插件目录下）。全部依赖注入，零网络、零真实 ~/.dsh。
 */
import test from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  effectivePrice,
  isPeakHour,
  periodTables,
  priceTable,
  pricingSince,
  pricingTier,
} from "../lib/balance-core.js";
import {
  DEFAULT_POLL_MS,
  DEFAULT_RETRY_DELAYS_MS,
  DEFAULT_THROTTLE_MS,
  createBalanceScheduler,
} from "../lib/balance-scheduler.js";
import { __internals as host } from "../lib/index.js";

const HOME = join(tmpdir(), "dsh-balance-scheduler-test");

/** 最小装配：定价函数用真实实现，取数与推送用替身。 */
function harness(overrides = {}) {
  const pushed = [];
  const logs = [];
  const calls = { balance: 0, opencode: 0 };
  const config = {
    getHome: () => HOME,
    getSettings: () => ({}),
    queryBalance: async () => { calls.balance += 1; return { ok: true, isAvailable: true, balances: [{ currency: "CNY", total: 10, granted: 0, toppedUp: 10 }] }; },
    queryOpencodeUsage: async () => { calls.opencode += 1; return { ok: false, reason: "no-key" }; },
    readActiveModel: () => "deepseek-v4-pro",
    effectivePrice,
    priceTable,
    isPeakHour,
    periodTables,
    pricingSince,
    pricingTier,
    push: (r) => pushed.push(r),
    log: (tag, msg) => logs.push(tag + ": " + msg),
    pollMs: 0,
    throttleMs: DEFAULT_THROTTLE_MS,
    retryDelaysMs: [5, 10, 20, 40],
    ...overrides,
  };
  return { s: createBalanceScheduler(config), pushed, logs, calls };
}

test("常量与移植口径一致（防手改漂移）", () => {
  assert.equal(DEFAULT_THROTTLE_MS, 30_000);
  assert.deepEqual(DEFAULT_RETRY_DELAYS_MS, [30_000, 60_000, 120_000, 300_000]);
  assert.equal(DEFAULT_POLL_MS, 180_000);
  assert.equal(host.ROUTE_THROTTLE_MS, 30_000);
  assert.equal(host.STATE_ROUTE, "/api/dsh-balance/state");
  assert.equal(host.REFRESH_ROUTE, "/api/dsh-balance/refresh");
});

test("载荷补齐定价字段，且 periodTables[pricingTier] === priceTable（对象身份）", async () => {
  const { s, pushed } = harness();
  const result = await s.refresh();
  assert.equal(pushed.length, 1, "数据只有一个出口（push）");
  assert.equal(pushed[0], result);
  for (const field of ["ok", "balances", "prices", "priceTable", "model", "peak", "at"]) {
    assert.ok(field in result, "必备字段缺席：" + field);
  }
  assert.equal(typeof result.pricingTier, "string");
  assert.equal(typeof result.at, "string");
  assert.equal(Number.isNaN(Date.parse(result.at)), false);
  assert.deepEqual(Object.keys(result.periodTables).sort(), ["legacy", "off", "peak"]);
  assert.equal(result.periodTables[result.pricingTier], result.priceTable, "§2 不变量：同一次推送内对象身份相等");
  assert.equal(result.prices, result.priceTable["deepseek-v4-pro"], "prices 恒等于价目表的默认模型档");
  assert.equal(result.pricingSince.peakPricing, pricingSince().peakPricing);
});

test("单一 now：prices / priceTable / peak / pricingTier 描述同一时刻", async () => {
  const stamps = [];
  const { s } = harness({
    priceTable: (date) => { stamps.push(date.getTime()); return priceTable(date); },
    isPeakHour: (date) => { stamps.push(date.getTime()); return isPeakHour(date); },
    pricingTier: (date) => { stamps.push(date.getTime()); return pricingTier(date); },
  });
  const result = await s.refresh();
  assert.ok(stamps.length >= 3, "三个定价函数都应被调用");
  assert.equal(new Set(stamps).size, 1, "同一次刷新内求值时刻必须唯一：" + JSON.stringify(stamps));
  assert.equal(result.at, new Date(stamps[0]).toISOString(), "at 即该唯一时刻");
});

test("用户 balancePrices 覆盖并入价目表与三张表（定价单一真源不外溢到账本）", async () => {
  const { s } = harness({ getSettings: () => ({ balancePrices: { "deepseek-v4-flash": { cacheMiss: 1 }, "brand-new": { cacheMiss: 2, cacheHit: 3, output: 4 } } }) });
  const result = await s.refresh();
  assert.equal(result.priceTable["deepseek-v4-flash"].cacheMiss, 1, "覆盖须作用于真实模型而非仅默认档");
  assert.equal(result.priceTable["deepseek-v4-flash"].output, result.periodTables[result.pricingTier]["deepseek-v4-flash"].output);
  assert.ok(result.priceTable["brand-new"], "未命中价目表的新模型按当前时刻兜底展开");
  assert.equal(result.priceTable["brand-new"].cacheMiss, 2);
});

test("disabled 路径同构携带定价字段，且不进入重试", async () => {
  const { s, calls, logs } = harness({ getSettings: () => ({ showBalanceDock: false }) });
  const result = await s.refresh();
  assert.equal(result.disabled, true);
  assert.equal(result.ok, false);
  assert.equal(result.pricingTier, null, "disabled 时档位无意义");
  assert.equal(calls.balance, 0, "disabled 不发余额请求");
  assert.equal("periodTables" in result, true);
  assert.equal("pricingSince" in result, true);
  s.start();
  s.stop();
  assert.equal(logs.length, 0);
});

test("in-flight 去重：并发触发只发一次 HTTP；在途结束后才起新一轮", async () => {
  let release;
  const gate = new Promise((resolveGate) => { release = resolveGate; });
  const { s, calls, pushed } = harness({
    queryBalance: async () => { calls.balance += 1; await gate; return { ok: true, balances: [] }; },
  });
  const all = [s.refresh(), s.refresh(), s.maybeRefresh(true), s.maybeRefresh(true)];
  await new Promise((r) => setImmediate(r));
  release();
  const settled = await Promise.all(all);
  assert.equal(calls.balance, 1, "四路并发共享同一次请求");
  assert.equal(settled[0], settled[1]);
  assert.equal(pushed.length, 1, "只推送一次");
  await s.refresh();
  assert.equal(calls.balance, 2, "在途请求收尾后才允许起新一轮");
});

test("stop() 期间在途请求完成后不推送、不写缓存（apply 的 !stopped 守卫）", async () => {
  // 注：latest-sequence 守卫（seq === latestSeq）在当前 API 下恒真——in-flight 去重
  // 已杜绝并发多请求，它属防御性兜底、无独立触发路径，故不单独构造（口径同
  // scripts/test/unit-balance-scheduler.test.js 的头注）。这里断言可达的那半：
  // 停止后完成的在途请求不得把结果推出去。
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const { s, pushed } = harness({
    queryBalance: async () => { await gate; return { ok: true, balances: [{ currency: "CNY", total: 1, granted: 0, toppedUp: 1 }] }; },
  });
  const inFlight = s.refresh();
  await new Promise((r) => setImmediate(r));
  s.stop();
  release();
  const result = await inFlight;
  assert.equal(result.ok, true, "在途请求自身仍拿到结果（调用方不受影响）");
  assert.equal(pushed.length, 0, "stop 后完成的在途请求不得推送");
  assert.equal(s.getCache(), null, "stop 后 cache 不应被写入");
});

test("节流：非强制刷新在窗口内吃缓存且不发请求；强制穿透", async () => {
  const { s, calls } = harness({ throttleMs: 10_000 });
  await s.maybeRefresh();
  assert.equal(calls.balance, 1);
  await s.maybeRefresh();
  await s.maybeRefresh();
  assert.equal(calls.balance, 1, "窗口内的非强制刷新不重复发 HTTP");
  await s.maybeRefresh(true);
  assert.equal(calls.balance, 2, "force 穿透节流");
});

test("shouldSkipRefresh：命中时跳过且不推进节流时间戳；force 穿透", async () => {
  let skip = true;
  const { s, calls } = harness({ throttleMs: 1, shouldSkipRefresh: () => skip });
  await s.maybeRefresh();
  assert.equal(calls.balance, 0, "隐藏态不发请求");
  assert.equal(s.state().lastAttemptAt, 0, "跳过不得占用节流窗口");
  skip = false;
  await s.maybeRefresh();
  assert.equal(calls.balance, 1, "恢复可见后下一次刷新立即可达");
  skip = true;
  await s.maybeRefresh(true);
  assert.equal(calls.balance, 2, "force 穿透暂停门");
});

test("失败按退避序列重试，成功即清零；stop 后不再重试", async () => {
  const { s, calls } = harness({
    queryBalance: async () => { calls.balance += 1; return { ok: false, error: "HTTP 503", balances: [] }; },
  });
  await s.refresh();
  assert.equal(s.state().consecutiveFailures, 1);
  await new Promise((r) => setTimeout(r, 90));
  assert.ok(calls.balance >= 3, "退避 5/10/20ms 内至少重试到第 3 次，实测 " + calls.balance);
  const beforeStop = calls.balance;
  s.stop();
  await new Promise((r) => setTimeout(r, 90));
  assert.equal(calls.balance, beforeStop, "stop 清掉重试定时器");
  // 成功清零
  const ok = harness({ queryBalance: async () => ({ ok: true, balances: [] }) });
  await ok.s.refresh();
  assert.equal(ok.s.state().consecutiveFailures, 0);
  ok.s.stop();
});

test("disabled 不重试（恢复靠用户重新开启触发）", async () => {
  let settings = { showBalanceDock: false };
  const { s, calls } = harness({ getSettings: () => settings, queryBalance: async () => ({ ok: false, error: "x", balances: [] }) });
  await s.maybeRefresh(true);
  assert.equal(calls.balance, 0);
  settings = {};
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(calls.balance, 0, "没有任何重试定时器被排上");
  s.stop();
});

test("OpenCode Go 关闭时不查询，失败也不阻断余额推送", async () => {
  const { s, calls } = harness({ getSettings: () => ({ showOpenCodeGoUsage: false }) });
  const r = await s.refresh();
  assert.equal(calls.opencode, 0);
  assert.deepEqual(r.opencodeGo, { ok: false, disabled: true });
  assert.equal(r.ok, true);
});

test("取数抛异常被结构化为失败载荷（绝不让一轮刷新炸掉编排器）", async () => {
  const { s, logs } = harness({ queryBalance: async () => { throw new Error("socket hang up"); } });
  const r = await s.refresh();
  assert.equal(r.ok, false);
  assert.equal(r.error, "socket hang up");
  assert.deepEqual(r.balances, []);
  assert.equal("priceTable" in r, true, "失败路径也补齐定价字段，保持字段集合一致");
  assert.equal(logs.length, 0, "取数失败由载荷承载，不额外刷日志");
  s.stop();
});

// ---------------------------------------------------------------------------
// 路由层
// ---------------------------------------------------------------------------

test("isLoopback：只认回环地址", () => {
  const at = (ra) => host.isLoopback({ socket: { remoteAddress: ra } });
  assert.equal(at("127.0.0.1"), true);
  assert.equal(at("::1"), true);
  assert.equal(at("::ffff:127.0.0.1"), true);
  assert.equal(at("10.0.0.8"), false);
  assert.equal(at("2001:db8::1"), false);
  assert.equal(host.isLoopback(null), false);
  assert.equal(host.isLoopback({}), false);
});

test("pendingPayload：未刷新过时字段集合与正常路径同构", () => {
  const p = host.pendingPayload();
  assert.equal(p.ok, false);
  assert.equal(p.error, "pending");
  assert.deepEqual(p.balances, []);
  assert.equal(typeof p.at, "string");
  assert.deepEqual(Object.keys(p.periodTables).sort(), ["legacy", "off", "peak"]);
  assert.equal(p.periodTables[p.pricingTier], p.priceTable, "空载荷也守身份不变量");
});

/** 造一个只实现真实 API 的 settings 服务桩（describe 返回行数组）。 */
const settingsStub = (rows, opts = {}) => ({
  describe: () => {
    if (opts.throwOnDescribe) throw new Error("nope");
    return rows;
  },
});

test("readSettings：无 settings 服务 / 未注册命名空间一律按默认（不隐藏 dock）", () => {
  assert.deepEqual(host.readSettings({}), {});
  assert.deepEqual(host.readSettings({ settings: settingsStub([], { throwOnDescribe: true }) }), {});
  assert.deepEqual(host.readSettings({ settings: settingsStub([]) }), {});
  assert.deepEqual(
    host.readSettings({ settings: settingsStub([{ ns: "balance", value: { showBalanceDock: false, prices: { "deepseek-v4-pro": { cacheMiss: 1 } } } }]) }),
    { showBalanceDock: false, balancePrices: { "deepseek-v4-pro": { cacheMiss: 1 } } },
  );
  // 反证：只实现**不存在的** get() 的服务桩必须读不到任何东西。
  // 内核 SettingsForms 没有 get —— 若实现退回调 get，这条会静默返回 {}（就是迁移前的 bug 形态）。
  assert.deepEqual(host.readSettings({ settings: { get: () => ({ showBalanceDock: false }) } }), {},
    "不得依赖不存在的 settings.get");
});

test("makeActiveModelReader：agentDefaultModel 优先，settings 次之，抓取器兜底", () => {
  const read = host.makeActiveModelReader;
  assert.equal(read({ agentDefaultModel: { currentSelection: () => ({ provider: "deepseek", model: "deepseek-v4-flash" }) } })(), "deepseek-v4-flash");
  assert.equal(read({ agentDefaultModel: { currentSelection: () => { throw new Error("not ready"); } }, settings: settingsStub([{ ns: "agent-default-model", value: { model: "deepseek-chat" } }]) })(), "deepseek-chat");
  assert.equal(read({ agentDefaultModel: { currentSelection: () => ({ model: "  " }) } })().toString().length >= 0, true, "空白模型名继续降级，不抛");
  assert.equal(typeof read({})(), "string", "全部服务缺席时落到抓取器（返回字符串，可能为空）");
  // 反证：键不对时必须降级，而不是拿到脏值。
  // （实现故意同时试 `agent-default-model` 与 `agentDefaultModel` 两种写法，
  //  所以这里用的是两者都不是的包名形态 —— 它不该命中。）
  assert.notEqual(
    read({ settings: settingsStub([{ ns: "dsh-agent-default-model", value: { model: "wrong-key" } }]) })(),
    "wrong-key",
    "describe 的 ns 是 profile 条目 id，用包名当键不该命中",
  );
});

test("readService：ctx.get 优先、属性访问兜底、抛错归 undefined", () => {
  assert.equal(host.readService({ get: (n) => ({ marker: n }) }, "credentials").marker, "credentials");
  const svc = { marker: "prop" };
  assert.equal(host.readService({ credentials: svc }, "credentials"), svc, "无 get() 的老宿主走属性访问");
  assert.equal(host.readService({ get: () => { throw new Error("cannot get property without inject"); }, settings: svc }, "settings"), svc, "get 抛错时仍试属性");
  assert.equal(host.readService({}, "absent"), undefined);
  assert.equal(host.readService(null, "absent"), undefined);
});
