// Outcrawl engine.
import { TAVILY_URL, FIRECRAWL_URL, isFirecrawlKeylessRefusal, markFirecrawlKeylessBlocked, PARALLEL_URL, PARALLEL_MCP_URL, PARALLEL_USER_AGENT, KEENABLE_URL, KEENABLE_MCP_URL, SERPBASE_URL, SERPLY_URL, OUTCRAWL_URL, YOUCOM_URL, YOUCOM_FREE_URL, YOUCOM_KEYS_LINK, isoDaysAgo, parseTimeRange, approximateTimeRange, uniqueSources } from "./shared.js";
import { parseMcpResponseText } from "../mcp_adapter.js";

export async function searchOutcrawl(query, maxResults, apiKey, signal) {
  if (!apiKey) throw new Error("Outcrawl search requires OUTCRAWL_API_KEY");
  const response = await fetch(OUTCRAWL_URL, {
    method: "POST",
    redirect: "error",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
      accept: "application/json",
      "user-agent": "deepseek-harness/free-search",
    },
    body: JSON.stringify({ query, limit: Math.min(Math.max(maxResults ?? 10, 1), 20) }),
    signal: AbortSignal.any([...(signal !== undefined ? [signal] : []), AbortSignal.timeout(15000)]),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    if (response.status === 401 || response.status === 403) {
      throw new Error(`Outcrawl API key is invalid (HTTP ${response.status}) - update it in Settings > Plugins > Free Search`);
    }
    throw new Error(`Outcrawl API error (HTTP ${response.status}): ${detail.slice(0, 200)}`);
  }
  const data = await response.json();
  const sources = (data.hits ?? [])
    .filter((r) => r.url)
    .map((r) => ({
      url: r.url,
      ...(r.title ? { title: String(r.title) } : {}),
      ...(r.snippet ? { snippet: String(r.snippet) } : {}),
    }));
  return { sources: uniqueSources(sources, maxResults ?? 10), truncated: false };
}

// You.com：无 key 走免 key 档（api.you.com/v1/agents/search，每天 100 次），有 key 走官方 Search API（X-API-Key）。
// key 读取 YDC_API_KEY（标准名），旧名 YOUCOM_API_KEY 继续兼容，见 resolveYoucomApiKey。
