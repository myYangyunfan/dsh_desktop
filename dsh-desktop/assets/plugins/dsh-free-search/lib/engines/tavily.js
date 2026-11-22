// Tavily engine.
import { TAVILY_URL, FIRECRAWL_URL, isFirecrawlKeylessRefusal, markFirecrawlKeylessBlocked, PARALLEL_URL, PARALLEL_MCP_URL, PARALLEL_USER_AGENT, KEENABLE_URL, KEENABLE_MCP_URL, SERPBASE_URL, SERPLY_URL, OUTCRAWL_URL, YOUCOM_URL, YOUCOM_FREE_URL, YOUCOM_KEYS_LINK, isoDaysAgo, parseTimeRange, approximateTimeRange, uniqueSources } from "./shared.js";
import { parseMcpResponseText } from "../mcp_adapter.js";

export function tavilyEndpoint(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return TAVILY_URL;
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Tavily endpoint is invalid");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Tavily endpoint must be http(s)");
  }
  url.search = "";
  url.hash = "";
  const path = url.pathname.replace(/\/+$/, "");
  url.pathname = path === "" || path === "/" ? "/search" : path.endsWith("/search") ? path : `${path}/search`;
  return url.toString().replace(/\/$/, "");
}

export async function searchTavily(query, maxResults, apiKey, timeRange, signal, baseUrl = "") {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort);
  let response;
  try {
    const body = {
      query,
      max_results: Math.min(maxResults ?? 5, 20),
      search_depth: "basic",
    };
    // Tavily 时间过滤：time_range 只支持固定档，自定义天数取最近似档位
    if (timeRange) {
      const tr = approximateTimeRange(timeRange.days ?? 7);
      if (tr) body.time_range = tr;
    }
    response = await fetch(tavilyEndpoint(baseUrl), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        ...(apiKey ? { authorization: `Bearer ${apiKey}` } : { "x-tavily-access-mode": "keyless" }),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
      redirect: "error",
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error(`Tavily request failed: ${error?.message ?? String(error)}`);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    if (response.status === 401) {
      throw new Error(
        `Tavily API key is invalid (HTTP 401) at ${tavilyEndpoint(baseUrl)} - check the key and the optional custom endpoint in Settings > Plugins > Free Search`
      );
    }
    throw new Error(`Tavily API error (HTTP ${response.status}): ${detail.slice(0, 200)}`);
  }
  const data = await response.json();
  const sources = (data.results ?? [])
    .filter((r) => r.url)
    .map((r) => ({
      url: r.url,
      ...(r.title ? { title: String(r.title) } : {}),
      ...(r.content ? { snippet: String(r.content).slice(0, 300) } : {}),
    }));
  return { sources: uniqueSources(sources, maxResults ?? 10), truncated: false };
}

// Firecrawl: 无 key 走 keyless（官方免 key 匿名额度），有 key 走账号档（Bearer）
