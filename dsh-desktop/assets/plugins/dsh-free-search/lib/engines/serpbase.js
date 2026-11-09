// SerpBase engine.
import { TAVILY_URL, FIRECRAWL_URL, isFirecrawlKeylessRefusal, markFirecrawlKeylessBlocked, PARALLEL_URL, PARALLEL_MCP_URL, PARALLEL_USER_AGENT, KEENABLE_URL, KEENABLE_MCP_URL, SERPBASE_URL, SERPLY_URL, OUTCRAWL_URL, YOUCOM_URL, YOUCOM_FREE_URL, YOUCOM_KEYS_LINK, isoDaysAgo, parseTimeRange, approximateTimeRange, uniqueSources } from "./shared.js";
import { parseMcpResponseText } from "../mcp_adapter.js";

import { SERPBASE_LOCALE } from "./shared.js";

export async function searchSerpbase(query, maxResults, apiKey, options, signal) {
  if (!apiKey) throw new Error("SerpBase search requires SERPBASE_API_KEY");
  // hl/gl 跟随设置页的 lang（SerpBase 支持 Google 的 hl/gl 本地化），默认 en/us
  const locale = SERPBASE_LOCALE[options?.lang] ?? SERPBASE_LOCALE.en;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort);
  let response;
  try {
    response = await fetch(SERPBASE_URL, {
      method: "POST",
      redirect: "error",
      headers: {
        "X-API-Key": apiKey,
        "content-type": "application/json",
        accept: "application/json",
        "user-agent": "deepseek-harness/free-search",
      },
      body: JSON.stringify({ q: query, hl: locale.hl, gl: locale.gl, page: 1 }),
      signal: controller.signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error(`SerpBase request failed: ${error?.message ?? String(error)}`);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`SerpBase API error (HTTP ${response.status}): ${detail.slice(0, 200)}`);
  }
  // HTTP 200 + status 字段：0 成功 / 1001 key 无效或缺 / 1000 请求非法
  const data = await response.json();
  if (data.status !== 0) {
    if (data.status === 1001) {
      throw new Error("SerpBase API key is invalid or missing (status 1001) - update it in Settings > Plugins > Free Search");
    }
    throw new Error(`SerpBase API error (status ${data.status}): ${String(data.error ?? "").slice(0, 200)}`);
  }
  const sources = (data.organic ?? [])
    .filter((r) => r.link)
    .map((r) => ({
      url: r.link,
      ...(r.title ? { title: String(r.title) } : {}),
      ...(r.snippet ? { snippet: String(r.snippet) } : {}),
      ...((r.published_at ?? r.date) ? { publishedAt: String(r.published_at ?? r.date) } : {}),
    }));
  return { sources: uniqueSources(sources, maxResults ?? 10), truncated: false };
}

// Serply: 必须配置 SERPLY_API_KEY（无 key 跳过，同 serpbase）
// Google SERP API：GET + X-Api-Key 头，返回 results[]（title/link/description）；num 上限 10。
// 错误走 HTTP 状态码，401 时 JSON 为 {"detail": "Invalid API key"}。
