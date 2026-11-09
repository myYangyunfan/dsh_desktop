// Parallel engine: REST with a key, keyless MCP otherwise.
import { TAVILY_URL, FIRECRAWL_URL, isFirecrawlKeylessRefusal, markFirecrawlKeylessBlocked, PARALLEL_URL, PARALLEL_MCP_URL, PARALLEL_USER_AGENT, KEENABLE_URL, KEENABLE_MCP_URL, SERPBASE_URL, SERPLY_URL, OUTCRAWL_URL, YOUCOM_URL, YOUCOM_FREE_URL, YOUCOM_KEYS_LINK, isoDaysAgo, parseTimeRange, approximateTimeRange, uniqueSources } from "./shared.js";
import { parseMcpResponseText } from "../mcp_adapter.js";

export async function searchParallel(query, maxResults, apiKey, timeRange, signal) {
  if (!apiKey) throw new Error("Parallel search requires PARALLEL_API_KEY");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort);
  let response;
  try {
    const body = {
      objective: query,
      search_queries: [query],
      mode: "fast",
      advanced_settings: { max_results: Math.min(Math.max(maxResults ?? 5, 1), 20) },
    };
    // Parallel 时间过滤：source_policy.after_date（YYYY-MM-DD，精确）
    if (timeRange) {
      const after =
        timeRange.after ??
        (timeRange.days !== undefined ? isoDaysAgo(timeRange.days).slice(0, 10) : undefined);
      if (after) body.advanced_settings.source_policy = { after_date: after };
    }
    response = await fetch(PARALLEL_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "content-type": "application/json",
        accept: "application/json",
        "user-agent": PARALLEL_USER_AGENT,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
      redirect: "error",
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error(`Parallel request failed: ${error?.message ?? String(error)}`);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    if (response.status === 401 || response.status === 403) {
      throw new Error(`Parallel API key is invalid (HTTP ${response.status}) - update it in Settings > Plugins > Free Search`);
    }
    if (response.status === 402) {
      throw new Error(`Parallel quota/billing error (HTTP 402) - check usage/credits at platform.parallel.ai. ${detail.slice(0, 200)}`);
    }
    throw new Error(`Parallel API error (HTTP ${response.status}): ${detail.slice(0, 200)}`);
  }
  const data = await response.json();
  const sources = (data.results ?? [])
    .filter((r) => r.url)
    .map((r) => {
      const excerpt = (r.excerpts ?? []).find((e) => String(e).trim().length > 0);
      return {
        url: r.url,
        ...(r.title ? { title: String(r.title) } : {}),
        ...(excerpt ? { snippet: String(excerpt).slice(0, 300) } : {}),
        ...(r.publish_date ? { publishedAt: String(r.publish_date) } : {}),
      };
    });
  return { sources: uniqueSources(sources, maxResults ?? 10), truncated: false };
}

// Parallel keyless：官方 MCP（search.parallel.ai/mcp）匿名额度，无需 API key。
// 与 REST 的差异：MCP 的 web_search 工具没有 max_results / after_date 参数
// （条数由服务端决定），时间过滤退化为 objective 里的新鲜度提示（软过滤）。

const PARALLEL_MCP_SESSION = (() => {
  let id = "";
  for (let i = 0; i < 32; i++) id += Math.floor(Math.random() * 16).toString(16);
  return id;
})();

export async function searchParallelMCP(query, maxResults, timeRange, signal) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort);
  if (signal?.aborted) controller.abort();
  let text;
  try {
    const after = timeRange
      ? timeRange.after ?? (timeRange.days !== undefined ? isoDaysAgo(timeRange.days).slice(0, 10) : undefined)
      : undefined;
    const objective = after ? `${query} (prefer results published after ${after})` : query;
    const response = await fetch(PARALLEL_MCP_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "user-agent": PARALLEL_USER_AGENT,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Date.now(),
        method: "tools/call",
        params: {
          name: "web_search",
          arguments: {
            objective,
            search_queries: [query],
            session_id: PARALLEL_MCP_SESSION,
          },
        },
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Parallel MCP error (HTTP ${response.status})`);
    // Keep the timeout and caller cancellation active while the body is streaming.
    text = await response.text();
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error(`Parallel MCP request failed: ${error?.message ?? String(error)}`);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
  // The shared parser skips SSE notifications and joins multiline data frames.
  const json = parseMcpResponseText(text);
  if (!json) throw new Error("Parallel MCP parse failed: invalid JSON or SSE");
  if (json.error) throw new Error(`Parallel MCP error: ${json.error.message ?? "unknown error"}`);
  if (!Array.isArray(json.result?.content)) throw new Error("Parallel MCP malformed content");
  const blocks = json.result.content.filter((b) => b?.type === "text" && typeof b.text === "string").map((b) => b.text);
  if (json.result?.isError) throw new Error(`Parallel MCP error: ${blocks.join(" ").slice(0, 200) || "tool call failed"}`);
  let payload = null;
  for (const block of blocks) {
    try {
      const parsed = JSON.parse(block);
      if (Array.isArray(parsed?.results)) {
        payload = parsed;
        break;
      }
    } catch {}
  }
  if (!payload) throw new Error("Parallel MCP malformed search results");
  const sources = payload.results
    .filter((r) => r.url)
    .map((r) => {
      const excerpt = (r.excerpts ?? []).find((e) => String(e).trim().length > 0);
      return {
        url: r.url,
        ...(r.title ? { title: String(r.title) } : {}),
        ...(excerpt ? { snippet: String(excerpt).slice(0, 300) } : {}),
        ...(r.publish_date ? { publishedAt: String(r.publish_date) } : {}),
      };
    });
  return { sources: uniqueSources(sources, maxResults ?? 10), truncated: false };
}

// 把任意天数转成 Keenable 的相对时间格式（12h / Nd / Nmo / Ny）
