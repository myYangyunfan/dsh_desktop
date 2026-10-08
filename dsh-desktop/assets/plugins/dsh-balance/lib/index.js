// ===========================================================================
// dsh-balance —— 宿主半边（cordis 插件）
//
// 自制壳时代的「主进程余额链」整体搬进这里：插件的宿主半边就跑在内核自己的
// Node 进程里，有完整 Node 权限，因此取数（HTTPS_PROXY / .credentials.yaml /
// 账号平台钱包）与路由注册都不需要任何原生辅助进程。
//
// 出站形态从「壳 push 到渲染进程」换成「宿主 HTTP 路由」：
//   GET  /api/dsh-balance/state    → 缓存的 BalancePush（无缓存即返回同构空载荷）
//   POST /api/dsh-balance/refresh  → 强制一轮查询后返回新载荷
// 载荷字段契约逐字沿用 docs/balance-architecture.md §2（含
// periodTables[pricingTier] === priceTable 的对象身份不变量）。
//
// 为什么用轮询而不是 SSE：SSE 意味着每个标签页一条长连接，而官方客户端的
// 更新准入锁在安装期间对 connection/request 一律 503——长连接会成片断掉并触发
// 重连风暴；换来的收益在 60s 这个节奏上为零。故刻意选择无状态 HTTP 轮询。
// ===========================================================================

import { homedir } from "node:os";
import { join } from "node:path";
import {
  PEAK_PRICING_SINCE_UTC,
  PRICING_TIERS,
  WEEKEND_OFFPEAK_SINCE_UTC,
  effectivePrice,
  isPeakHour,
  periodTables,
  priceTable,
  pricingSince,
  pricingTier,
  queryBalance,
  queryOpencodeUsage,
  readActiveModel,
  readApiKey,
  resolveApiKey,
} from "./balance-core.js";
import { createBalanceScheduler } from "./balance-scheduler.js";

const name = "dsh-balance";

// 只有 webServer 是硬依赖：credentials / settings / agentDefaultModel /
// deepseekAccount 全部经 readService 惰性软读。把它们写进 inject 会让
// 「某个官方包没挂载」直接判定本插件装配失败、整个余额 dock 消失，
// 而它们每一个都有可用的兜底路径。
const inject = ["webServer"];

const STATE_ROUTE = "/api/dsh-balance/state";
const REFRESH_ROUTE = "/api/dsh-balance/refresh";

// 客户端每 60s 轮询 state，服务端 180s 才真发一次 HTTP（DEFAULT_POLL_MS），
// 故路由侧节流沿用壳层口径的 30s：手动刷新穿透，轮询刷新吃缓存。
const ROUTE_THROTTLE_MS = 30 * 1000;

/**
 * 未声明注入的服务读取（ctx 上未经 inject 的属性访问会直接抛
 * "cannot get property ... without inject"，故必须走 ctx.get 并整体吞异常）。
 * 服务未挂载 / 尚未就绪 / 老内核无 get() 一律归 undefined。
 */
function readService(ctx, serviceName) {
  // ctx.get 与属性访问是两条独立退路，必须各自兜错：
  // 内核对未声明依赖的服务调用 ctx.get 会直接抛
  // （"cannot get property without inject"，loader-isolation 的行为），
  // 若把两者包在同一个 try 里，get 一抛就永远走不到属性兜底。
  try {
    if (ctx && typeof ctx.get === "function") {
      const viaGet = ctx.get(serviceName);
      if (viaGet) return viaGet;
    }
  } catch {
    /* get 不可用（未 inject / 服务缺席），继续试属性 */
  }
  try {
    return ctx?.[serviceName] ?? undefined;
  } catch {
    return undefined;
  }
}

/** 与 dsh-file-changes 宿主路由同一口径：只接受回环来源请求。 */
function isLoopback(req) {
  const ra = req && req.socket ? req.socket.remoteAddress : null;
  return ra === "127.0.0.1" || ra === "::1" || ra === "::ffff:127.0.0.1";
}

function sendJson(res, status, body) {
  const data = Buffer.from(JSON.stringify(body), "utf8");
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "content-length": String(data.length),
  });
  res.end(data);
}

/**
 * 从未刷新成功过时的载荷：字段集合与正常路径同构。客户端据此在首轮查询回来
 * 前按「无余额」渲染，而不是让 dock 因 {loading:true} 永挂。
 */
function pendingPayload() {
  const now = new Date();
  // 三张价目表只取一次：§2 的载荷契约要求 periodTables[pricingTier] === priceTable
  // 是**对象同一性**而不只是相等，所以 priceTable 必须从同一份 tables 里取，
  // 不能另给一个 {} —— 早先实现给的就是字面量 {}，等于首次渲染那一帧违反不变量。
  const tables = periodTables();
  const tier = pricingTier(now);
  return {
    ok: false,
    error: "pending",
    balances: [],
    prices: {},
    priceTable: tables[tier],
    model: "",
    peak: isPeakHour(now),
    at: now.toISOString(),
    pricingTier: tier,
    periodTables: tables,
    pricingSince: pricingSince(),
  };
}

/** DSH_HOME 解析（与 dsh-home-paths 口径一致：显式覆盖 > $DSH_HOME > ~/.dsh）。 */
function resolveHome() {
  const env = process.env.DSH_HOME;
  if (typeof env === "string" && env.trim() !== "") return env.trim();
  return join(homedir(), ".dsh");
}

/**
 * 读某个 profile 条目的生效配置。
 *
 * ⚠ `settings.get(ns)` 这个 API 在内核里**不存在**（SettingsForms 只有
 * describe/update/configure/schema/prepareDocument/mutate/replace）。原先两处都调它，
 * 外面还套了 `typeof settings.get === "function"` 守卫 —— 守卫恒假 ⇒ 整段静默跳过，
 * dock 开关与「从设置里读默认模型」从来没生效过，也不报错。
 * 真实读法是 `describe()` 返回的按条目 id 索引的行；注意 ns 是 **profile 条目 id**
 * （cordis.patch.yml 的 `- id:`），不是包名。
 */
function settingsSection(settings, ns) {
  if (!settings || typeof settings.describe !== "function") return undefined;
  let rows;
  try {
    rows = settings.describe({ redactSecrets: true });
  } catch {
    return undefined;
  }
  if (!Array.isArray(rows)) return undefined;
  const row = rows.find((candidate) => candidate && candidate.ns === ns);
  return row === undefined ? undefined : row.value;
}

/**
 * 宿主设置读取。自制壳的 settings.json（showBalanceDock / showOpenCodeGoUsage /
 * balancePrices）在插件包形态下迁到本条目的 `config:` 块；该块未必被配置
 * （未配置时按默认走），故只认「读得到就用、读不到按默认」，绝不因设置缺失而隐藏 dock。
 */
function readSettings(ctx) {
  let settings;
  try {
    settings = readService(ctx, "settings");
  } catch {
    settings = undefined;
  }
  const out = {};
  for (const ns of ["balance", "dsh-balance"]) {
    const section = settingsSection(settings, ns);
    if (!section || typeof section !== "object") continue;
    if (typeof section.showBalanceDock === "boolean") out.showBalanceDock = section.showBalanceDock;
    if (typeof section.showOpenCodeGoUsage === "boolean") out.showOpenCodeGoUsage = section.showOpenCodeGoUsage;
    const prices = section.balancePrices || section.prices;
    if (prices && typeof prices === "object") out.balancePrices = prices;
    if (Object.keys(out).length > 0) return out;
  }
  return out;
}

/**
 * 当前默认模型读取器。优先级：ctx.agentDefaultModel（官方默认模型服务，本身即
 * settings 的 agent-default-model 命名空间读取面）→ ctx.settings 同名空间 →
 * settings.yaml 抓取器兜底。返回裸模型名，供价目表选档。
 */
function makeActiveModelReader(ctx) {
  return () => {
    try {
      const svc = readService(ctx, "agentDefaultModel");
      if (svc && typeof svc.currentSelection === "function") {
        const sel = svc.currentSelection();
        const model = sel && typeof sel.model === "string" ? sel.model.trim() : "";
        if (model) return model;
      }
    } catch { /* 取模型失败绝不能中断一轮刷新，逐级降级 */ }
    try {
      const settings = readService(ctx, "settings");
      for (const ns of ["agent-default-model", "agentDefaultModel"]) {
        const section = settingsSection(settings, ns);
        const model = section && typeof section.model === "string" ? section.model.trim() : "";
        if (model) return model;
      }
    } catch { /* 同上 */ }
    return readActiveModel(resolveHome());
  };
}

function apply(ctx) {
  const log = (tag, msg) => {
    try {
      ctx.logger?.(tag)?.info?.(msg);
    } catch { /* 日志通道异常不影响余额链 */ }
  };

  // 余额载荷的唯一出口：数据只在这里落地，路由只读不产。
  let latest = null;

  const scheduler = createBalanceScheduler({
    getHome: resolveHome,
    getSettings: () => readSettings(ctx),
    queryBalance: (home) => queryBalance(home, {
      credentials: readService(ctx, "credentials") ?? null,
      account: readService(ctx, "deepseekAccount") ?? null,
    }),
    queryOpencodeUsage: (home) => queryOpencodeUsage(home, {
      credentials: readService(ctx, "credentials") ?? null,
    }),
    readActiveModel: makeActiveModelReader(ctx),
    effectivePrice,
    priceTable,
    isPeakHour,
    periodTables,
    pricingSince,
    pricingTier,
    push: (result) => { latest = result; },
    log,
    throttleMs: ROUTE_THROTTLE_MS,
  });

  const statePayload = () => latest || pendingPayload();

  const handleState = (req, res) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405, { allow: "GET, HEAD" });
      res.end();
      return;
    }
    if (!isLoopback(req)) {
      res.writeHead(403);
      res.end("forbidden");
      return;
    }
    sendJson(res, 200, statePayload());
  };

  const handleRefresh = async (req, res) => {
    if (req.method !== "POST") {
      res.writeHead(405, { allow: "POST" });
      res.end();
      return;
    }
    if (!isLoopback(req)) {
      res.writeHead(403);
      res.end("forbidden");
      return;
    }
    // 本路由无请求体语义，但仍要把流读干，否则复用连接上的下一请求会错位。
    req.on("data", () => {});
    req.on("end", async () => {
      try {
        await scheduler.maybeRefresh(true);
        sendJson(res, 200, statePayload());
      } catch (err) {
        sendJson(res, 500, { ok: false, error: String((err && err.message) || err), balances: [] });
      }
    });
    req.on("error", () => {
      sendJson(res, 400, { ok: false, error: "bad request body", balances: [] });
    });
  };

  ctx.effect(() => ctx.webServer.register({ kind: "exact", path: STATE_ROUTE, handler: handleState }), "dsh-balance: /state route");
  ctx.effect(() => ctx.webServer.register({ kind: "exact", path: REFRESH_ROUTE, handler: handleRefresh }), "dsh-balance: /refresh route");
  // dispose 必须先停编排器：残留定时器会在插件卸载后继续发 HTTP。
  ctx.effect(() => {
    scheduler.start();
    return () => scheduler.stop();
  }, "dsh-balance: refresh scheduler");
}

export { apply, inject, name };

// 官方模块加载器下的宿主半边没有 require 面，单测经此命中内部纯函数
// （口径对齐 dsh-balance/lib/client.js 与 dsh-client-file-changes 的同名惯例）。
export const __internals = {
  STATE_ROUTE,
  REFRESH_ROUTE,
  ROUTE_THROTTLE_MS,
  PRICING_TIERS,
  PEAK_PRICING_SINCE_UTC,
  WEEKEND_OFFPEAK_SINCE_UTC,
  readService,
  isLoopback,
  sendJson,
  pendingPayload,
  resolveHome,
  readSettings,
  makeActiveModelReader,
  createBalanceScheduler,
  readApiKey,
  resolveApiKey,
};
