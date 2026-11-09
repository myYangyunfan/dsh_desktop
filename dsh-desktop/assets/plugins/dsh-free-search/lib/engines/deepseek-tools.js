// DeepSeek native /v1/tools/search engine.
import { TAVILY_URL, FIRECRAWL_URL, isFirecrawlKeylessRefusal, markFirecrawlKeylessBlocked, PARALLEL_URL, PARALLEL_MCP_URL, PARALLEL_USER_AGENT, KEENABLE_URL, KEENABLE_MCP_URL, SERPBASE_URL, SERPLY_URL, OUTCRAWL_URL, YOUCOM_URL, YOUCOM_FREE_URL, YOUCOM_KEYS_LINK, isoDaysAgo, parseTimeRange, approximateTimeRange, uniqueSources } from "./shared.js";
import { parseMcpResponseText } from "../mcp_adapter.js";

const DEEPSEEK_TOOLS_SEARCH_URL = "https://api.deepseek.com/v1/tools/search";

// 原生搜索接口没有独立的时间字段，时间过滤写在 query 语法里（after:/before:）。
// 支持 `after:2025`、`after:2025-01-01`；这里把统一的 timeRange 映射成 after:。

function deepseekToolsQuery(query, timeRange) {
  const parsed = parseTimeRange(timeRange);
  if (!parsed) return query;
  if (parsed.after) return `${query} after:${parsed.after}`;
  if (parsed.days) {
    const since = new Date(Date.now() - parsed.days * 86400000).toISOString().slice(0, 10);
    return `${query} after:${since}`;
  }
  return query;
}

export async function searchDeepSeekTools(query, maxResults, apiKey, timeRange, signal) {
  if (!apiKey) throw new Error("DeepSeek search requires DEEPSEEK_API_KEY");
  const limit = Math.min(Math.max(maxResults ?? 5, 1), 50);
  // 超额取数：按请求计费，且缺 url 的行会被丢弃，多取一些补位成本为零
  const count = Math.min(50, Math.max(limit, Math.ceil(limit * 1.5)));

  const response = await fetch(DEEPSEEK_TOOLS_SEARCH_URL, {
    method: "POST",
    redirect: "error",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
      accept: "application/json",
      "user-agent": "deepseek-harness/free-search",
    },
    body: JSON.stringify({ query: deepseekToolsQuery(query, timeRange), count }),
    signal: AbortSignal.any([...(signal !== undefined ? [signal] : []), AbortSignal.timeout(20000)]),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    if (response.status === 401) {
      throw new Error("DeepSeek API key is invalid (HTTP 401) - update it in Settings > Plugins > Free Search");
    }
    // 402 余额不足是终态：不要当成可重试的暂时故障
    if (response.status === 402) {
      throw new Error("DeepSeek account balance is insufficient (HTTP 402) - top up at https://platform.deepseek.com");
    }
    throw new Error(`DeepSeek API error (HTTP ${response.status}): ${detail.slice(0, 200)}`);
  }

  const data = await response.json();
  const rows = Array.isArray(data?.results) ? data.results : [];
  const sources = rows
    .filter((r) => r && typeof r.url === "string" && r.url.length > 0)
    .map((r) => {
      // summary（600~800 字，面向模型）优先于 snippet（100~200 字，面向渲染）
      const raw = typeof r.summary === "string" && r.summary.trim() ? r.summary : r.snippet;
      const snippet = typeof raw === "string" ? raw.trim() : "";
      return {
        url: r.url,
        ...(r.title ? { title: String(r.title) } : {}),
        ...(snippet ? { snippet: snippet.slice(0, 600) } : {}),
        // date 是 UTC RFC3339，只保留日期部分与其它引擎的 publishedAt 对齐
        ...(r.date ? { publishedAt: String(r.date).slice(0, 10) } : {}),
      };
    });
  return { sources: uniqueSources(sources, maxResults ?? 10), truncated: false };
}

// SerpBase: 必须配置 SERPBASE_API_KEY（无 key 跳过，同 perplexity）
// Google SERP API：POST + X-API-Key 头，返回 organic[]（title/link/snippet/published_at）。
// 注意：SerpBase 始终返回 HTTP 200，业务状态放在 JSON 的 status 字段（0=成功，1001=key 无效/缺失，1000=请求非法）。
