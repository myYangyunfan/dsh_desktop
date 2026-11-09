// Zhihu web-wide search engine.
import { ZHIHU_MCP_URL, uniqueSources, stripZhihuTracking } from "./shared.js";
import { mcpCall, mcpContentText } from "../mcp_adapter.js";
import { EXPLICIT_ONLY_ENGINES } from "../engine_meta.js";

import { zhihuMcpHeaders, zhihuToSources } from "./zhihu_shared.js";
export async function searchZhihuGlobal(query, maxResults, apiKey, timeRange, signal) {
  if (!apiKey) throw new Error("Zhihu search requires ZHIHU_API_KEY");
  const count = Math.min(Math.max(maxResults ?? 10, 1), 20);
  const arguments_ = { query: String(query).slice(0, 100), count, search_db: "all" };
  if (timeRange) {
    // 已验证原生时间过滤：filter 表达式 publish_time>=<unix秒>；{days} 相对 / {after} 绝对日期都折算成秒
    const afterMs = timeRange.after
      ? Date.parse(`${timeRange.after}T00:00:00Z`)
      : Date.now() - (timeRange.days ?? 1) * 86_400_000;
    if (Number.isFinite(afterMs)) arguments_.filter = `publish_time>=${Math.floor(afterMs / 1000)}`;
  }
  const result = await mcpCall(ZHIHU_MCP_URL, zhihuMcpHeaders(apiKey), "tools/call", {
    name: "global_search",
    arguments: arguments_,
  }, { timeoutMs: 20000, signal, label: "Zhihu" });
  return zhihuToSources(result, maxResults);
}
