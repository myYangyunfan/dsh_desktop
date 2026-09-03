'use strict';

// ===========================================================================
// balance-scheduler.js —— 余额刷新编排器（主进程）
//
// 纯 Node 模块：不依赖 Electron；main.js 注入查询函数/推送回调后接线。
// 本模块负责「何时刷新、并发如何仲裁、失败如何重试、数据如何出站」，
// balance.js 只负责「取数与规整」（分层契约见 docs/balance-architecture.md）。
//
// 并发模型：
//   · in-flight 去重：并发触发共享同一次请求，杜绝重复 HTTP 与大部分
//     last-writer-wins 竞态；
//   · latest-sequence 守卫：只接受最新一次请求的结果写入 cache / 推送，
//     旧请求（慢失败/旧数据）完成时一律丢弃——即使未来绕过去重也不回退。
//
// 重试模型：
//   · 失败后指数退避：30s → 1m → 2m → 5m（封顶），成功即清零；
//   · 每次新的失败按最新计数重排定时器（不会叠加多个重试定时器）；
//   · 禁用状态（showBalanceDock=false）不重试——恢复靠用户重新开启触发。
//
// 出站模型：
//   · 数据只有一条出口：push(result)。IPC 处理器只触发刷新、不返回数据，
//     客户端只消费 'dsh-balance-changed' 事件，双通道重复投递不复存在。
// ===========================================================================

const DEFAULT_THROTTLE_MS = 30 * 1000;           // 非强制刷新节流窗口
const DEFAULT_RETRY_DELAYS_MS = [30_000, 60_000, 120_000, 300_000]; // 指数退避，封顶 5 分钟
const DEFAULT_POLL_MS = 3 * 60 * 1000;           // 后台轮询周期
const DEFAULT_MODEL = 'deepseek-v4-pro';

/**
 * @param {object} options
 * @param {() => string} options.getHome DSH_HOME 目录
 * @param {() => object} options.getSettings 桌面壳 settings.json（每次刷新只读一次）
 * @param {(dshHome: string) => Promise<object>} options.queryBalance balance.js 的 queryBalance
 * @param {(dshHome: string) => Promise<object>} options.queryOpencodeUsage balance.js 的 queryOpencodeUsage
 * @param {(dshHome: string) => string} options.readActiveModel 默认模型读取
 * @param {(model: string, date: Date) => object} options.effectivePrice 有效单价
 * @param {(date: Date) => object} options.priceTable 全模型价目表
 * @param {(date: Date) => boolean} options.isPeakHour 高峰判定
 * @param {() => object} [options.periodTables] 三张价目表 {peak,off,legacy}（issue #168，可选注入）
 * @param {() => object} [options.pricingSince] 峰谷/周末规则生效节点（issue #168，可选注入）
 * @param {(date: Date) => string} [options.pricingTier] 计价档位判定（issue #168，可选注入）
 * @param {(result: object) => void} options.push 数据唯一出口（推送渲染进程）
 * @param {(tag: string, msg: string) => void} [options.log] 日志
 * @param {number} [options.throttleMs] 节流窗口（测试可缩短）
 * @param {number[]} [options.retryDelaysMs] 退避序列（测试可缩短）
 * @param {number} [options.pollMs] 轮询周期（测试可缩短/置 0 关闭）
 * @param {() => boolean} [options.shouldSkipRefresh] 非强制刷新暂停门
 *   （P1-2+A-7：壳层注入最小化/隐藏判定；命中时跳过且不推进节流时间戳，
 *   force——启动/重试/窗口恢复补刷——穿透本门）
 */
function createBalanceScheduler(options) {
  const {
    getHome,
    getSettings,
    queryBalance,
    queryOpencodeUsage,
    readActiveModel,
    effectivePrice,
    priceTable,
    isPeakHour,
    // issue #168 新增依赖：均为「可选注入」——旧宿主（如 Tauri sidecar cli.js）
    // 不传时自动降级为旧 payload 形态，不影响既有推送。
    periodTables = null,
    pricingSince = null,
    pricingTier = null,
    push,
    log = () => {},
    throttleMs = DEFAULT_THROTTLE_MS,
    retryDelaysMs = DEFAULT_RETRY_DELAYS_MS,
    pollMs = DEFAULT_POLL_MS,
    // P1-2+A-7（pr-107 移植）：最小化/隐藏判定（壳层注入）。非 force 刷新
    // （含后台轮询）命中时直接跳过且不推进 lastAttemptAt——恢复可见后
    // 下一次刷新立即可达。
    shouldSkipRefresh = null,
  } = options;

  let latestSeq = 0;        // 最近一次实际发出的请求序号（latest-sequence 守卫）
  let inFlight = null;      // in-flight 请求 Promise（并发去重）
  let cache = null;         // 最近一次生效（已推送）的结果
  let lastAttemptAt = 0;    // 上次实际发起请求的时间戳（节流基准）
  let consecutiveFailures = 0; // 连续失败计数（退避指数）
  let retryTimer = null;
  let pollTimer = null;
  let stopped = false;

  /**
   * 组装 issue #168 的增量计价字段（均为新增字段，不改既有字段语义）。
   * 任何异常一律降级为「字段缺席」，由客户端退回旧行为，不阻断余额推送。
   * @param {Date} now 与 prices/priceTable/peak 同一时刻
   * @param {object} table 已叠加用户覆盖的全模型价目表（保持对象身份）
   * @param {boolean} peak 当前是否高峰
   * @param {object} overrides settings.balancePrices（由调用方一次读出传入，不重复读盘）
   */
  function pricingFields(now, table, peak, overrides) {
    const out = {};
    try {
      out.pricingTier = typeof pricingTier === 'function' ? pricingTier(now) : (peak ? 'peak' : 'off');
      if (typeof pricingSince === 'function') out.pricingSince = pricingSince();
      if (typeof periodTables === 'function') {
        const tables = periodTables();
        if (tables && typeof tables === 'object') {
          // 用户覆盖同样并入三张表，与 priceTable 口径一致（定价单一真源）。
          for (const tier of Object.keys(tables)) {
            const t = tables[tier];
            if (t && typeof t === 'object') applyPriceOverrides(t, now, overrides);
            // 不变量：当前档位表就是本次推送的 priceTable（对象身份相等），
            // 保证「新 client 首次入账」与「旧 client 整段计价」金额一致。
            if (tier === out.pricingTier) tables[tier] = table;
          }
          out.periodTables = tables;
        }
      }
    } catch (err) {
      log('balance', '峰谷计价字段组装失败（降级为旧载荷）: ' + String((err && err.message) || err));
    }
    return out;
  }

  /**
   * 将用户 settings.balancePrices.<model> 覆盖并入给定价目表（就地）。
   * 未命中价目表的新模型名按当前时刻兜底档展开。
   * @param {object} table 待并入的价目表
   * @param {Date} now 兜底档求值时刻
   * @param {object} overrides settings.balancePrices（可为空）
   */
  function applyPriceOverrides(table, now, overrides) {
    if (!overrides || typeof overrides !== 'object') return table;
    for (const m of Object.keys(overrides)) {
      const ov = overrides[m];
      if (ov && typeof ov === 'object') {
        table[m] = { ...(table[m] || effectivePrice(m, now)), ...ov };
      }
    }
    return table;
  }

  /** 组装一次完整的刷新结果（单一 now，保证 prices 与 peak 同刻一致）。 */
  async function doRefresh() {
    const settings = getSettings() || {}; // 每次刷新只读一次 settings（余额与 OpenCode Go 开关同源）
    if (settings.showBalanceDock === false) {
      // 退化形态：消费者须最先判 disabled（客户端已如此）。补齐其余字段，
      // 保持与正常路径契约同构，避免「跨路径字段集合不一致」。
      const disabledAt = new Date();
      return {
        ok: false,
        disabled: true,
        balances: [],
        prices: {},
        priceTable: {},
        model: '',
        peak: false,
        at: disabledAt.toISOString(),
        opencodeGo: { ok: false, disabled: true },
        error: 'balance dock disabled',
        // issue #168：disabled 路径同构携带计价字段（档位无意义，置 null）。
        pricingTier: null,
        ...(() => {
          try {
            return {
              ...(typeof pricingSince === 'function' ? { pricingSince: pricingSince() } : {}),
              ...(typeof periodTables === 'function' ? { periodTables: periodTables() } : {}),
            };
          } catch {
            return {};
          }
        })(),
      };
    }
    const home = getHome();
    const opencodePromise = settings.showOpenCodeGoUsage === false
      ? Promise.resolve({ ok: false, disabled: true })
      : queryOpencodeUsage(home).catch((err) => ({ ok: false, error: String((err && err.message) || err) }));

    let result;
    try {
      result = await queryBalance(home);
    } catch (err) {
      result = { ok: false, error: String((err && err.message) || err), balances: [] };
    }
    result.opencodeGo = await opencodePromise;

    const now = new Date(); // 单一时刻：prices / priceTable / peak / at 全部同刻
    const model = String(readActiveModel(home) || '').trim() || DEFAULT_MODEL;
    // 定价单一真源：全模型价目表 + 用户 balancePrices.<model> 覆盖一并落入价目表，
    // prices 恒等于 priceTable[默认模型]——杜绝「覆盖只作用于默认档、真实模型会话绕过覆盖」。
    const table = priceTable(now);
    applyPriceOverrides(table, now, settings.balancePrices);
    result.priceTable = table;
    result.prices = table[model] || effectivePrice(model, now);
    result.model = model;
    result.peak = isPeakHour(now);
    result.at = now.toISOString();
    // issue #168：推送「峰谷生效节点 + 三张价目表 + 当前档位」，客户端据此
    // 把用量增量按消耗时刻价目入账（已结算不追溯）。只增字段，不改语义。
    Object.assign(result, pricingFields(now, result.priceTable, result.peak, settings.balancePrices));
    return result;
  }

  /** 结果生效：写 cache + 唯一出口推送 + 重试状态机。 */
  function apply(result) {
    cache = result;
    push(result);
    if (result.warning) log('balance', '余额警告: ' + result.warning);
    if (result.opencodeGo && result.opencodeGo.warning) log('balance', 'OpenCode Go 警告: ' + result.opencodeGo.warning);
    if (result.ok) {
      consecutiveFailures = 0;
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
    } else if (!result.disabled) {
      consecutiveFailures += 1;
      scheduleRetry();
    }
  }

  /** 指数退避重试：30s → 1m → 2m → 5m 封顶；新失败按最新计数重排。 */
  function scheduleRetry() {
    if (stopped) return;
    if (retryTimer) clearTimeout(retryTimer);
    const idx = Math.min(Math.max(consecutiveFailures - 1, 0), retryDelaysMs.length - 1);
    const delay = retryDelaysMs[idx];
    retryTimer = setTimeout(() => {
      retryTimer = null;
      if (!stopped) maybeRefresh(true);
    }, delay);
    if (retryTimer.unref) retryTimer.unref();
  }

  /**
   * 发起一次刷新。并发触发共享 in-flight 请求；只有最新一次请求的结果
   * 才会写入 cache / 推送（latest-sequence 守卫）。
   * @returns {Promise<object>} 本次刷新结果（无论是否被守卫丢弃）
   */
  async function refresh() {
    if (inFlight) return inFlight;
    const seq = ++latestSeq;
    const run = (async () => {
      try {
        const result = await doRefresh();
        if (seq === latestSeq && !stopped) apply(result);
        return result;
      } finally {
        inFlight = null;
      }
    })();
    inFlight = run;
    return run;
  }

  /**
   * 节流刷新入口（所有低频触发点共用）。
   * @param {boolean} [force=false] true 绕过节流（重试/用户显式触发）
   */
  function maybeRefresh(force = false) {
    if (stopped) return Promise.resolve(cache);
    // P1-2+A-7（pr-107 移植）：最小化/隐藏暂停。不推进 lastAttemptAt，
    // 恢复后立即可刷新；force（启动/重试/窗口恢复补刷）穿透本门。
    if (!force && typeof shouldSkipRefresh === 'function' && shouldSkipRefresh()) {
      return Promise.resolve(cache);
    }
    const nowMs = Date.now();
    if (!force && nowMs - lastAttemptAt < throttleMs) return Promise.resolve(cache);
    lastAttemptAt = nowMs;
    return refresh().catch((err) => {
      log('balance', '余额刷新失败: ' + String((err && err.message) || err));
      return cache;
    });
  }

  /** 启动：立即刷新一次 + 后台轮询。幂等（重复调用先 stop 旧的轮询）。 */
  function start() {
    stopped = false;
    maybeRefresh(true);
    if (pollTimer) clearInterval(pollTimer);
    if (pollMs > 0) {
      pollTimer = setInterval(() => maybeRefresh(), pollMs);
      if (pollTimer.unref) pollTimer.unref();
    }
  }

  /** 停止：清空轮询与重试定时器（应用退出前调用）。幂等。 */
  function stop() {
    stopped = true;
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
  }

  return {
    refresh,       // () => Promise<result> —— 直接刷新（IPC/菜单触发）
    maybeRefresh,  // (force?) => Promise<result> —— 节流入口（会话完成/窗口显示/轮询）
    start,
    stop,
    getCache: () => cache,
    /** 测试观测口：{ inFlight, consecutiveFailures, lastAttemptAt } */
    state: () => ({ inFlight: !!inFlight, consecutiveFailures, lastAttemptAt }),
  };
}

module.exports = {
  createBalanceScheduler,
  DEFAULT_THROTTLE_MS,
  DEFAULT_RETRY_DELAYS_MS,
  DEFAULT_POLL_MS,
  DEFAULT_MODEL,
};
