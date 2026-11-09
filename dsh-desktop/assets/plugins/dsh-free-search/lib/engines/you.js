// You.com engine (keyless tier plus optional YDC_API_KEY).
import { TAVILY_URL, FIRECRAWL_URL, isFirecrawlKeylessRefusal, markFirecrawlKeylessBlocked, PARALLEL_URL, PARALLEL_MCP_URL, PARALLEL_USER_AGENT, KEENABLE_URL, KEENABLE_MCP_URL, SERPBASE_URL, SERPLY_URL, OUTCRAWL_URL, YOUCOM_URL, YOUCOM_FREE_URL, YOUCOM_KEYS_LINK, isoDaysAgo, parseTimeRange, approximateTimeRange, uniqueSources } from "./shared.js";
import { parseMcpResponseText } from "../mcp_adapter.js";

export async function searchYoucom(query, maxResults, apiKey, signal) {
  // 两档参数相同：GET + query 参数；count 为每段条数上限
  const params = new URLSearchParams({ query, count: String(Math.min(maxResults ?? 10, 20)) });
  const keyed = Boolean(apiKey);
  const response = await fetch(`${keyed ? YOUCOM_URL : YOUCOM_FREE_URL}?${params}`, {
    method: "GET",
    redirect: "error",
    headers: {
      ...(keyed ? { "X-API-Key": apiKey } : {}),
      accept: "application/json",
      "user-agent": "deepseek-harness/free-search",
    },
    signal: AbortSignal.any([...(signal !== undefined ? [signal] : []), AbortSignal.timeout(15000)]),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    if (keyed && (response.status === 401 || response.status === 403)) {
      throw new Error(`You.com API key is invalid (HTTP ${response.status}) - update it in Settings > Plugins > Free Search`);
    }
    if (response.status === 402) {
      throw new Error(`You.com quota/billing error (HTTP 402) - check usage at you.com/platform/api-keys. ${detail.slice(0, 200)}`);
    }
    if (response.status === 429) {
      if (!keyed) {
        throw new Error(`You.com free tier rate limit exceeded (HTTP 429) - set YDC_API_KEY for higher limits: ${YOUCOM_KEYS_LINK}`);
      }
      throw new Error("You.com rate limit exceeded (HTTP 429) - check your plan at you.com/platform/api-keys");
    }
    throw new Error(`You.com API error (HTTP ${response.status}): ${detail.slice(0, 200)}`);
  }
  const data = await response.json();
  // 响应：{ results: { web: [ { url, title, snippets: [...], description } ] } }
  const hits = data.results?.web ?? [];
  const sources = hits
    .filter((r) => r.url)
    .map((r) => {
      const snippet = Array.isArray(r.snippets)
        ? r.snippets.filter((s) => typeof s === "string" && s).join(" ")
        : (r.description ?? "");
      return {
        url: r.url,
        ...(r.title ? { title: String(r.title) } : {}),
        ...(snippet ? { snippet: String(snippet).slice(0, 300) } : {}),
      };
    });
  return { sources: uniqueSources(sources, maxResults ?? 10), truncated: false };
}

// You.com key 解析（纯函数，便于断言）：凭据中心 YDC_API_KEY → 凭据中心 YOUCOM_API_KEY → 设置页 youcomApiKey
// → 环境变量 YDC_API_KEY → 环境变量 YOUCOM_API_KEY。与其它引擎一样凭据中心优先；旧名只是别名，已有配置不受影响。

const YOUCOM_KEY_REFS = ["YDC_API_KEY", "YOUCOM_API_KEY"];

export async function resolveYoucomApiKey({ resolveCredential, settingsValue, env } = {}) {
  if (resolveCredential) {
    for (const ref of YOUCOM_KEY_REFS) {
      const value = await resolveCredential(ref);
      if (value) return value;
    }
  }
  if (settingsValue) return settingsValue;
  for (const ref of YOUCOM_KEY_REFS) {
    if (env?.[ref]) return env[ref];
  }
  return "";
}

// TinyFish Search（api.search.tinyfish.ai）：GET + X-API-Key；免费 12000 请求/天。
// 支持 after_date / before_date（YYYY-MM-DD）时间过滤。
