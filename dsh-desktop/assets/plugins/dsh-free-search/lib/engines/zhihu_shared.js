// Shared helpers for the two Zhihu MCP engines.
import { ZHIHU_MCP_URL, uniqueSources, stripZhihuTracking } from "./shared.js";
import { mcpCall, mcpContentText } from "../mcp_adapter.js";
import { EXPLICIT_ONLY_ENGINES } from "../engine_meta.js";

export function zhihuMcpHeaders(apiKey) {
  return {
    authorization: `Bearer ${apiKey}`,
    "user-agent": "deepseek-harness/free-search",
  };
}

// CallToolResult.content[0].text 内层 JSON → sources；{code:!=0} 与解析失败都算失败（不当搜索结果）

export function zhihuToSources(result, maxResults) {
  const text = mcpContentText(result);
  if (!text) return { sources: [], truncated: false };
  let inner;
  try {
    inner = JSON.parse(text);
  } catch {
    throw new Error(`Zhihu inner content JSON parse error: ${text.slice(0, 200)}`);
  }
  if (inner && typeof inner.code === "number" && inner.code !== 0) {
    throw new Error(`Zhihu API error ${inner.code}: ${inner.message ?? JSON.stringify(inner).slice(0, 200)}`);
  }
  const items = inner?.data?.items;
  if (!Array.isArray(items)) return { sources: [], truncated: false };
  const sources = items
    .filter((it) => it && it.url)
    .map((it) => ({
      url: stripZhihuTracking(String(it.url)),
      ...(it.title ? { title: String(it.title) } : {}),
      ...(it.summary ? { snippet: String(it.summary) } : {}),
      ...(Number.isFinite(it.edit_time) && it.edit_time > 0
        ? { publishedAt: new Date(it.edit_time * 1000).toISOString().replace(/\.\d{3}Z$/, "Z") }
        : {}),
      ...(it.author_name ? { author: String(it.author_name) } : {}),
    }));
  return { sources: uniqueSources(sources, maxResults ?? 10), truncated: false };
}
