/**
 * balance-core 纯函数与安全边界单测（插件宿主半边，自壳层 balance.js 移植）。
 *
 * 覆盖：金额解析钳位、价目档位与峰谷门槛、代理选择、**重定向剥离 Authorization**
 * （安全相关）、凭据文件解析（列 0 / 两格缩进 / 深层不读）、mtime 缓存、
 * 账号平台钱包 → 统一 balances 形态。
 *
 * 运行：node --test test/（本插件目录下）。零网络、零真实 ~/.dsh。
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, utimesSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DEFAULT_MODEL,
  PEAK_PRICING_SINCE_UTC,
  PRICING_MODELS,
  PRICING_TIERS,
  WEEKEND_OFFPEAK_SINCE_UTC,
  effectivePrice,
  isPeakHour,
  parseAmount,
  periodTables,
  pickUsageWindow,
  priceTable,
  pricingKeyOf,
  pricingSince,
  pricingTier,
  proxyFor,
  readCredentialLine,
  readFileCached,
  redirectAuthorization,
  resolveCredentialValue,
  walletsToBalances,
} from "../lib/balance-core.js";

const tempHome = () => mkdtempSync(join(tmpdir(), "dsh-balance-core-"));

/** 北京时间字段构造一个 UTC 时刻（+8 固定偏移，与被测函数同一口径）。 */
const beijing = (y, mo, d, h, mi = 0) => Date.UTC(y, mo - 1, d, h - 8, mi);

// ---------------------------------------------------------------------------
// parseAmount
// ---------------------------------------------------------------------------

test("parseAmount：脏值归 null 而不是 0（绝不静默掩盖脏数据）", () => {
  for (const dirty of [null, undefined, "", " ", "abc", {}, [], "NaN", "-", "."]) {
    assert.equal(parseAmount(dirty), null, `应判为不可解析：${JSON.stringify(dirty)}`);
  }
  assert.equal(parseAmount(Number.NaN), null);
  assert.equal(parseAmount(Number.POSITIVE_INFINITY), null);
  assert.equal(parseAmount(Number.EPSILON * 0), 0);
});

test("parseAmount：千分位 / 货币符号 / 全半角空格剥离", () => {
  assert.equal(parseAmount("1,234.5"), 1234.5);
  assert.equal(parseAmount("¥ 12.50"), 12.5);
  assert.equal(parseAmount("$1,000"), 1000);
  assert.equal(parseAmount("  7 "), 7);
  assert.equal(parseAmount(0.02), 0.02);
});

test("parseAmount：负数按业务钳为 0（余额不可能为负）", () => {
  assert.equal(parseAmount(-3), 0);
  assert.equal(parseAmount("-1,000.5"), 0);
  assert.equal(parseAmount(-0.0001), 0);
  assert.equal(parseAmount(0), 0);
});

// ---------------------------------------------------------------------------
// 定价：模型名解析 + 峰谷门槛
// ---------------------------------------------------------------------------

test("pricingKeyOf：变体名不得回退到 v4-pro（曾致 flash 高估 3 倍）", () => {
  assert.equal(pricingKeyOf("deepseek-v4-flash-250610"), "deepseek-v4-flash");
  assert.equal(pricingKeyOf("deepseek-v4-pro-0813"), "deepseek-v4-pro");
  assert.equal(pricingKeyOf("deepseek-chat-V3"), "deepseek-chat");
  assert.equal(pricingKeyOf(""), DEFAULT_MODEL);
  assert.equal(pricingKeyOf(null), DEFAULT_MODEL);
  assert.equal(pricingKeyOf("gpt-9-turbo"), "gpt-9-turbo", "未知模型保持原值（沿用老行为）");
  for (const m of PRICING_MODELS) assert.equal(pricingKeyOf(m), m, "规范键须自映射");
});

test("isPeakHour：峰谷生效前一律 false（旧版期没有峰谷概念）", () => {
  assert.equal(isPeakHour(new Date(PEAK_PRICING_SINCE_UTC - 1)), false);
  assert.equal(isPeakHour(new Date(beijing(2026, 8, 10, 10))), false, "生效前工作日高峰窗口也不算高峰");
});

test("isPeakHour：工作日窗口 9-12 / 14-18（含起点不含终点）", () => {
  const monday = beijing(2026, 8, 17, 10); // 2026-08-17 是周一
  assert.equal(isPeakHour(new Date(monday)), true);
  assert.equal(isPeakHour(new Date(beijing(2026, 8, 17, 9))), true, "09:00 边界含起点");
  assert.equal(isPeakHour(new Date(beijing(2026, 8, 17, 12))), false, "12:00 边界不含终点");
  assert.equal(isPeakHour(new Date(beijing(2026, 8, 17, 13))), false, "午间空闲");
  assert.equal(isPeakHour(new Date(beijing(2026, 8, 17, 17, 59))), true);
  assert.equal(isPeakHour(new Date(beijing(2026, 8, 18, 3))), false);
});

test("isPeakHour：周末全天空闲，且不溯及既往", () => {
  const satBefore = beijing(2026, 8, 22, 10); // 门槛（8-23 00:00 北京）前的周六
  const satAfter = beijing(2026, 8, 29, 10);
  const sunAfter = beijing(2026, 8, 30, 10);
  assert.equal(WEEKEND_OFFPEAK_SINCE_UTC > Date.UTC(2026, 6, 1), true);
  assert.equal(isPeakHour(new Date(satBefore)), true, "门槛前的周六仍按旧窗口=高峰");
  assert.equal(isPeakHour(new Date(satAfter)), false);
  assert.equal(isPeakHour(new Date(sunAfter)), false);
});

test("isPeakHour：无效日期返回 false（宁可显示空闲，不可误报高峰）", () => {
  assert.equal(isPeakHour(new Date("not-a-date")), false);
  assert.equal(isPeakHour(123), false);
});

test("pricingTier 与 isPeakHour/effectivePrice 共用同一套门槛", () => {
  assert.equal(pricingTier(new Date(PEAK_PRICING_SINCE_UTC - 1)), "legacy");
  assert.equal(pricingTier(new Date(beijing(2026, 8, 17, 10))), "peak");
  assert.equal(pricingTier(new Date(beijing(2026, 8, 17, 13))), "off");
  assert.equal(pricingTier(new Date(beijing(2026, 8, 29, 10))), "off", "周末全天空闲");
  assert.ok(PRICING_TIERS.includes(pricingTier(new Date(beijing(2026, 9, 1, 11)))));
});

test("effectivePrice：空闲档恒为高峰一半，旧版期走 LEGACY 表", () => {
  const peakAt = new Date(beijing(2026, 8, 17, 10));
  const offAt = new Date(beijing(2026, 8, 17, 13));
  const peak = effectivePrice("deepseek-v4-pro", peakAt);
  const off = effectivePrice("deepseek-v4-pro", offAt);
  assert.deepEqual(peak, { cacheMiss: 9, cacheHit: 0.3, output: 27 });
  assert.deepEqual(off, { cacheMiss: 4.5, cacheHit: 0.15, output: 13.5 });
  assert.deepEqual(effectivePrice("deepseek-v4-flash", offAt), { cacheMiss: 1.5, cacheHit: 0.05, output: 4.5 });
  assert.deepEqual(
    effectivePrice("deepseek-v4-pro", new Date(PEAK_PRICING_SINCE_UTC - 1000)),
    { cacheMiss: 3, cacheHit: 0.025, output: 6 },
    "旧版期用旧版固定价",
  );
  assert.deepEqual(
    effectivePrice("", peakAt),
    effectivePrice("deepseek-v4-pro", peakAt),
    "空模型按 v4-pro 兜底",
  );
});

test("priceTable / periodTables / pricingSince 形态", () => {
  const table = priceTable(new Date(beijing(2026, 8, 17, 10)));
  assert.deepEqual(Object.keys(table).sort(), [...PRICING_MODELS].sort());
  const tables = periodTables();
  assert.deepEqual(Object.keys(tables).sort(), [...PRICING_TIERS].sort());
  assert.notEqual(tables.peak, tables.off, "每次调用返回全新对象");
  assert.deepEqual(tables.peak, priceTable(new Date(beijing(2026, 8, 17, 10))));
  assert.deepEqual(tables.off, priceTable(new Date(beijing(2026, 8, 17, 13))));
  assert.deepEqual(tables.legacy, priceTable(new Date(PEAK_PRICING_SINCE_UTC - 1000)));
  const since = pricingSince();
  assert.equal(since.peakPricing, new Date(PEAK_PRICING_SINCE_UTC).toISOString());
  assert.equal(since.weekendOffpeak, new Date(WEEKEND_OFFPEAK_SINCE_UTC).toISOString());
});

// ---------------------------------------------------------------------------
// 代理选择
// ---------------------------------------------------------------------------

test("proxyFor：HTTPS/HTTP 分流、NO_PROXY 命中、非法值一律直连", (t) => {
  const saved = {
    HTTPS_PROXY: process.env.HTTPS_PROXY, https_proxy: process.env.https_proxy,
    HTTP_PROXY: process.env.HTTP_PROXY, http_proxy: process.env.http_proxy,
    NO_PROXY: process.env.NO_PROXY, no_proxy: process.env.no_proxy,
  };
  const restore = () => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  };
  t.after(restore);

  process.env.HTTPS_PROXY = "http://proxy.internal:8080";
  process.env.HTTP_PROXY = "http://proxy.internal:3128";
  delete process.env.NO_PROXY;
  delete process.env.no_proxy;

  let picked = proxyFor("https://api.deepseek.com/user/balance");
  assert.ok(picked, "https 目标应命中 HTTPS_PROXY");
  assert.equal(picked.hostname, "proxy.internal");
  assert.equal(String(picked.port), "8080");

  assert.equal(proxyFor("https://api.deepseek.com").protocol, "http:");
  assert.equal(proxyFor("http://127.0.0.1:3000/x").port, "3128", "http 目标走 HTTP_PROXY");

  process.env.NO_PROXY = "deepseek.com, .internal, *";
  assert.equal(proxyFor("https://api.deepseek.com/user/balance"), null, "域名后缀命中 → 直连");
  process.env.NO_PROXY = "other.example";
  assert.ok(proxyFor("https://api.deepseek.com/user/balance"), "未命中仍走代理");
  process.env.NO_PROXY = "localhost, 127.0.0.1";
  assert.equal(proxyFor("https://localhost/x"), null);
  assert.ok(proxyFor("https://api.deepseek.com/x"), "无关条目不影响其它主机");

  delete process.env.HTTPS_PROXY;
  delete process.env.https_proxy;
  assert.equal(proxyFor("https://api.deepseek.com/x"), null, "无 HTTPS_PROXY 时不用 HTTP_PROXY 兜 https");

  process.env.HTTPS_PROXY = "not-a-url";
  assert.equal(proxyFor("https://api.deepseek.com/x"), null, "非法代理 URL → 直连而非抛");
  process.env.HTTPS_PROXY = "socks5://x:1080";
  assert.equal(proxyFor("https://api.deepseek.com/x"), null, "仅支持 http(s) 代理");
  restore();
  assert.equal(proxyFor("https://api.deepseek.com/x"), null, "环境清空后回到直连");
});

// ---------------------------------------------------------------------------
// 重定向 Authorization（安全契约：密钥 = 计费凭证）
// ---------------------------------------------------------------------------

test("redirectAuthorization：仅同主机同端口且全程 https 才保留密钥", () => {
  const key = "sk-secret-value";
  assert.equal(
    redirectAuthorization("https://api.deepseek.com/user/balance", "https://api.deepseek.com/v2/balance", key),
    "Bearer " + key,
  );
  assert.equal(
    redirectAuthorization("https://api.deepseek.com:443/x", "https://api.deepseek.com/x", key),
    "Bearer " + key,
    "显式默认端口与省略端口视为同一主机，不得误剥",
  );
  assert.equal(
    redirectAuthorization("https://api.deepseek.com/x", "https://cdn.evil.test/x", key),
    null,
    "跨主机必须剥离",
  );
  assert.equal(
    redirectAuthorization("https://api.deepseek.com/x", "http://api.deepseek.com/x", key),
    null,
    "https→http 降级必须剥离",
  );
  assert.equal(
    redirectAuthorization("https://api.deepseek.com:8443/x", "https://api.deepseek.com/x", key),
    null,
    "端口不同即不同主机",
  );
  assert.equal(redirectAuthorization("https://api.deepseek.com/x", "https://api.deepseek.com/y", ""), null, "无密钥不编造头");
  assert.equal(redirectAuthorization("https://bad url", "https://api.deepseek.com/x", key), null, "URL 解析失败宁可不携带");
});

test("resolveCredentialValue：服务缺席/抛错/名字不合法都归空串（且不外泄密钥）", async () => {
  assert.equal(await resolveCredentialValue(null, "DEEPSEEK_API_KEY"), "");
  assert.equal(await resolveCredentialValue({ resolve: 1 }, "DEEPSEEK_API_KEY"), "");
  assert.equal(await resolveCredentialValue({ resolve: () => Promise.resolve(undefined) }, "DEEPSEEK_API_KEY"), "");
  assert.equal(
    await resolveCredentialValue({ resolve: () => Promise.resolve({ value: "  sk-x  " }) }, "DEEPSEEK_API_KEY"),
    "sk-x",
    "解析值需 trim",
  );
  assert.equal(
    await resolveCredentialValue({ resolve: () => Promise.resolve({ value: "" }) }, "DEEPSEEK_API_KEY"),
    "",
    "空值 = 未配置，绝不冒充已配置",
  );
  assert.equal(
    await resolveCredentialValue({ resolve: () => { throw new Error("boom"); } }, "DEEPSEEK_API_KEY"),
    "",
    "服务抛错必须被吞掉（错误对象可能含密钥）",
  );
  assert.equal(
    await resolveCredentialValue({ resolve: () => Promise.resolve({ value: "sk-x" }) }, "BAD-KEY NAME"),
    "",
    "不合 CredentialRef 文法的键名不发往服务",
  );
});

// ---------------------------------------------------------------------------
// 凭据文件与 mtime 缓存（只读临时目录，绝不触碰真实 ~/.dsh）
// ---------------------------------------------------------------------------

test("readCredentialLine：列 0 平铺、v1 两格缩进 refs、引号与注释形态", () => {
  const home = tempHome();
  writeFileSync(join(home, ".credentials.yaml"), [
    "DEEPSEEK_API_KEY: sk-flat-value",
    "QUOTED: \"sk-quoted\"",
    "SINGLE: 'sg-value'",
    "COMMENTED: sk-real # 注释 # 还有注释",
    "  INDENTED: sk-two-space",
    "records:",
    "  deepseek/x: sk-record-value",
    "deep:",
    "  deeper:",
    "    ANOTHER_KEY: sk-too-deep",
  ].join("\n"), "utf8");
  assert.equal(readCredentialLine(home, "DEEPSEEK_API_KEY"), "sk-flat-value");
  assert.equal(readCredentialLine(home, "QUOTED"), "sk-quoted");
  assert.equal(readCredentialLine(home, "SINGLE"), "sg-value");
  assert.equal(readCredentialLine(home, "COMMENTED"), "sk-real", "无引号标量的 ` #` 起视为注释");
  assert.equal(readCredentialLine(home, "INDENTED"), "sk-two-space", "v1 refs 的两格缩进形态要认");
  assert.equal(readCredentialLine(home, "ABSENT"), "");
  // 安全约束：records 段的值（provider/id 形态，含 /）与更深缩进的同名键一律读不到。
  assert.equal(readCredentialLine(home, "deepseek"), "", "records 键带 /，与引用键名文法不相交");
  assert.equal(readCredentialLine(home, "ANOTHER_KEY"), "", "四格缩进（非 refs 层）不读");
});

test("readCredentialLine：深层同名键一律不读（安全约束）", () => {
  const home = tempHome();
  writeFileSync(join(home, ".credentials.yaml"), [
    "top:",
    "  other:",
    "    DEEPSEEK_API_KEY: sk-too-deep",
  ].join("\n"), "utf8");
  assert.equal(readCredentialLine(home, "DEEPSEEK_API_KEY"), "", "四格缩进（非 refs 层）不读");
});

test("readCredentialLine：文件不存在返回空串而不是抛", () => {
  assert.equal(readCredentialLine(tempHome(), "DEEPSEEK_API_KEY"), "");
});

test("readFileCached：mtime+size 未变则不重读，改动后重读", () => {
  const home = tempHome();
  const f = join(home, "settings.yaml");
  writeFileSync(f, "agent-default-model:\n  model: deepseek-v4-flash\n", "utf8");
  assert.equal(readFileCached(f).includes("deepseek-v4-flash"), true);
  // 把 mtime 推后 2s 但内容不变 → 仍应重读（size 相同、mtime 变了）
  const st = statSync(f);
  utimesSync(f, new Date(st.atimeMs + 2000), new Date(st.mtimeMs + 2000));
  assert.equal(typeof readFileCached(f), "string");
  writeFileSync(f, "agent-default-model:\n  model: deepseek-v4-pro\n", "utf8");
  assert.equal(readFileCached(f).includes("deepseek-v4-pro"), true, "内容变更须生效");
  assert.equal(readFileCached(join(home, "nope.yaml")), null, "缺失文件返回 null");
});

// ---------------------------------------------------------------------------
// OpenCode Go 窗口 + 账号平台钱包
// ---------------------------------------------------------------------------

test("pickUsageWindow：percent 未知保持 null，绝不折算成 0%", () => {
  assert.equal(pickUsageWindow(null), null);
  assert.equal(pickUsageWindow("x"), null);
  assert.deepEqual(pickUsageWindow({ percent: null }), { status: null, percent: null, resetsAt: null });
  assert.deepEqual(
    pickUsageWindow({ status: "ok", percent: "42.5", resetsAt: "2026-09-01T00:00:00Z", extra: 1 }),
    { status: "ok", percent: 42.5, resetsAt: "2026-09-01T00:00:00Z" },
  );
  assert.equal(pickUsageWindow({ percent: "abc" }).percent, null);
  assert.equal(pickUsageWindow({ status: 7 }).status, null, "status 只接受字符串");
});

test("walletsToBalances：normal=充值、bonus=赠送，同币种合并，十进制字符串规整", () => {
  assert.deepEqual(walletsToBalances([{ currency: "CNY", balance: "12.50" }], []), [
    { currency: "CNY", total: 12.5, granted: 0, toppedUp: 12.5 },
  ]);
  const merged = walletsToBalances(
    [{ currency: "CNY", balance: "10" }, { currency: "USD", balance: "1.5" }],
    [{ currency: "CNY", balance: "2.25" }, { currency: "USD", balance: "0.5" }],
  );
  assert.deepEqual(merged, [
    { currency: "CNY", total: 12.25, granted: 2.25, toppedUp: 10 },
    { currency: "USD", total: 2, granted: 0.5, toppedUp: 1.5 },
  ], "CNY 必须排在首位（客户端按它取主条目）");
  assert.deepEqual(walletsToBalances([{ currency: "CNY", balance: "-5" }], []), [
    { currency: "CNY", total: 0, granted: 0, toppedUp: 0 },
  ], "负数钳 0（与 parseAmount 同口径）");
  assert.deepEqual(walletsToBalances([{ currency: "CNY", balance: "junk" }], []), [], "脏钱包整条丢弃而非显示 0");
  assert.deepEqual(walletsToBalances(undefined, null), []);
});
