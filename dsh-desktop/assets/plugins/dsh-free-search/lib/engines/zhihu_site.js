// Zhihu site search engine.
import { ZHIHU_MCP_URL, uniqueSources, stripZhihuTracking } from "./shared.js";
import { mcpCall, mcpContentText } from "../mcp_adapter.js";
import { EXPLICIT_ONLY_ENGINES } from "../engine_meta.js";

import { zhihuMcpHeaders, zhihuToSources } from "./zhihu_shared.js";
export async function searchZhihuSite(query, maxResults, apiKey, signal) {
  if (!apiKey) throw new Error("Zhihu search requires ZHIHU_API_KEY");
  const count = Math.min(Math.max(maxResults ?? 10, 1), 20);
  const result = await mcpCall(ZHIHU_MCP_URL, zhihuMcpHeaders(apiKey), "tools/call", {
    name: "zhihu_search",
    arguments: { query: String(query).slice(0, 100), count },
  }, { timeoutMs: 20000, signal, label: "Zhihu" });
  return zhihuToSources(result, maxResults);
}
