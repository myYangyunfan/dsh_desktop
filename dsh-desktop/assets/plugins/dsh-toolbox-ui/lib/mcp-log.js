// mcp-client 的日志采集：连接状态只存在于日志，所以这一段是"状态"的唯一来源。
//
// 从 lib/index.js 整块搬出来的（R6 第 2 步），一个字符都没改。为什么它非存在不可：
// mcp-client 至今不导出任何可订阅的状态面（只有 name/inject/Config/apply，无事件、无服务），
// 于是 apply 失败的原因只能从日志里读。采集成两件事——按 scope 归集、只保留最近 N 条——
// 而"日志怎么变成人话"由 lib/mcp-observability.js 负责（那是投影，不是采集）。
import { formatMcpLog, sanitizeMcpLog } from "./mcp-observability.js";

// mcp-client 至今不暴露任何可订阅的状态面（只导出 name/inject/Config/apply，无事件、无服务），
// 连接状态只存在于日志。
// 我们通过 ctx.logger.exporter 订阅全部日志，按 scope 过滤出 mcp-client(<serverName>) 的记录。
const recentMcpLogs = new WeakMap();
const recentFiberLogs = new WeakMap();
const MAX_LOG_RECORDS = 12;
const logScope = (ctx) => ctx?.root || ctx;
function appendRecent(store, key, record) {
  const list = store.get(key) || [];
  list.push(record);
  if (list.length > MAX_LOG_RECORDS) list.splice(0, list.length - MAX_LOG_RECORDS);
  store.set(key, list);
}
const MCP_LOG_LABEL = /mcp-client\(([^)]+)\)/;
function mcpLogLabelSource(message) {
  // 便宜匹配先行：进程里绝大多数日志与 mcp-client 无关，不能为了判断这件事先去格式化+脱敏
  // （实测前者 0.3µs/行、后者 9.1µs/行，且 info/debug 占了绝大多数日志）。
  const named = String(message.name || "");
  if (named.includes("mcp-client(")) return named;
  const args = Array.isArray(message.args) ? message.args : [];
  return args.find((value) => typeof value === "string" && value.includes("mcp-client(")) || "";
}
function recordMcpLog(ctx, message) {
  const diagnostic = message.type === "error" || message.type === "warn";
  const fiber = diagnostic ? message.fiber?.deref?.() : undefined;
  const labelSource = mcpLogLabelSource(message);
  // 只有「确实是 mcp-client 的日志」或「error/warn 级纤维诊断」才需要真实内容。
  if (!labelSource && !fiber) return;
  const text = sanitizeMcpLog(formatMcpLog(message));
  const record = { type: message.type, text, ts: message.ts };
  if (fiber) appendRecent(recentFiberLogs, fiber, record);
  if (!labelSource) return;
  const match = MCP_LOG_LABEL.exec(labelSource);
  if (!match) return;
  const scope = logScope(ctx);
  const entry = recentMcpLogs.get(scope) || new Map();
  const serverName = match[1];
  appendRecent(entry, serverName, record);
  recentMcpLogs.set(scope, entry);
}
/**
 * 某台服务器的**全部**已采集日志（已脱敏、按时间升序）。
 *
 * 两个消费者共用这一份：`lastLogFor`（挑一条诊断）与 `recentLogsFor`（详情抽屉）。
 * 各写一份合并 + 排序就是两套真相：一边按 ts 升序、一边忘了排序时，最新一条在两处会不一样。
 */
function allLogsFor(ctx, serverName, fiber) {
  const named = recentMcpLogs.get(logScope(ctx))?.get(serverName) || [];
  const scoped = fiber ? recentFiberLogs.get(fiber) || [] : [];
  return [...named, ...scoped].sort((a, b) => (a.ts || 0) - (b.ts || 0));
}
function lastLogFor(ctx, serverName, fiber) {
  const logs = allLogsFor(ctx, serverName, fiber);
  const diagnostic = logs.filter((record) => /attempt failed|tool .*failed|McpError|ECONNREFUSED|giving up|did not close/i.test(record.text)).at(-1);
  return diagnostic || logs.at(-1) || null;
}
/**
 * 最近 N 条日志（升序，最新在最后）。给单台详情用。
 *
 * 为什么**不是**放进列表行投影：单条已经被 `sanitizeMcpLog` 截断到 2000 字符，
 * 12 条 × 2000 = 24KB/服务器，列 20 台就是 480KB/轮询（5s 一次）。
 * 详情是点击才取的，24KB 一次可以接受；列表不是。
 */
function recentLogsFor(ctx, serverName, fiber, limit = MAX_LOG_RECORDS) {
  const logs = allLogsFor(ctx, serverName, fiber);
  return logs.slice(-limit).map((record) => ({ type: record.type, text: record.text, ts: record.ts }));
}
// 每个 ctx 只挂一次 exporter；构造与首次 list/status 都会触发，保证幂等。
const logCaptureState = new WeakMap();
function ensureLogCapture(ctx) {
  const scope = logScope(ctx);
  if (logCaptureState.has(scope)) return logCaptureState.get(scope).dispose;
  const logger = scope?.logger || ctx?.logger;
  const exporter = { colors: 0, levels: { default: 3 }, export: (message) => recordMcpLog(ctx, message) };
  let dispose = () => {};
  // Cordis 4.0.1 LoggerService.exporter() 的 disposer 删除的是“当前最大 ID”而非
  // 注册时 ID。固定 peer 版本下直接捕获 ID，避免热重载泄漏或误删其他 exporter。
  if (logger?.exporters instanceof Map && Number.isInteger(logger._snExporter)) {
    const exporterId = ++logger._snExporter;
    logger.exporters.set(exporterId, exporter);
    dispose = () => logger.exporters.delete(exporterId);
  } else if (logger?.exporter) {
    // 降级通道：cordis 4.0.1 的 exporter() disposer 删的是“当时最大 ID”而不是注册时 ID，
    // 热重载时可能误删其他插件的 exporter。私有字段不在就说明 peer 已偏离验证过的形状：
    // 明确告警，不静默降级。
    logger.warn?.("mcp-manager: cordis LoggerService 的 exporters/_snExporter 形状已变化，MCP 日志诊断退回 exporter() 通道；热重载时可能误删其他插件的 exporter，请核对 cordis peer 版本");
    dispose = logger.exporter(exporter);
  }
  // 回放 exporter 注册前 buffer 中已有的 mcp-client 日志。
  for (const message of logger?.buffer || []) recordMcpLog(ctx, message);
  logCaptureState.set(scope, { dispose });
  // 诊断通路也要有生命周期归属：没有 effect() 就没人卸 exporter，HMR 一次泄一个。
  // 不静默跳过：诊断本身不能以“你看不见的泄漏”为代价。
  if (typeof ctx?.effect !== "function") {
    logger?.warn?.("mcp-manager: 当前 context 没有 effect()，MCP 日志 exporter 没有生命周期归属，插件热重载后会残留一个订阅者");
    return dispose;
  }
  ctx.effect(() => () => {
    dispose();
    logCaptureState.delete(scope);
    recentMcpLogs.delete(scope);
  }, "mcpManager.logCapture");
  return dispose;
}

export { ensureLogCapture, lastLogFor, recentLogsFor };
