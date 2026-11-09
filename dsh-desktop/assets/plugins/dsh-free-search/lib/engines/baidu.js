// Baidu Qianfan AI Search engine.
import { TINYFISH_URL, JINA_URL, DOUBAO_SEARCH_URL, snippetCap, stripTags, uniqueSources } from "./shared.js";
import { TIME_ENGINES } from "../engine_meta.js";

export async function searchBaidu(query, maxResults, apiKey, timeRange, signal) {
  if (!apiKey) throw new Error("Baidu search requires BAIDU_API_KEY");
  const count = Math.min(Math.max(maxResults ?? 10, 1), 50);
  const searchFilter = {};
  if (timeRange) {
    const now = new Date();
    const end = new Date(now.getTime() + 86400000).toISOString().slice(0, 10);
    let start;
    if (timeRange.after) {
      start = timeRange.after;
    } else if (timeRange.days !== undefined) {
      start = new Date(now.getTime() - timeRange.days * 86400000).toISOString().slice(0, 10);
    }
    if (start) {
      searchFilter.range = { page_time: { gte: start, lt: end } };
    }
  }

  const body = {
    messages: [{ content: query, role: "user" }],
    search_source: "baidu_search_v2",
    resource_type_filter: [{ type: "web", top_k: count }],
    search_filter: searchFilter,
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort);
  let response;
  try {
    response = await fetch("https://qianfan.baidubce.com/v2/ai_search/web_search", {
      method: "POST",
      redirect: "error",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
        "X-Appbuilder-From": "openclaw",
        "user-agent": "deepseek-harness/free-search",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error(`Baidu search request failed: ${error?.message ?? String(error)}`);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    if (response.status === 401 || response.status === 403) {
      throw new Error(`Baidu API key is invalid (HTTP ${response.status}) - update it in Settings > Plugins > Free Search`);
    }
    throw new Error(`Baidu API error (HTTP ${response.status}): ${detail.slice(0, 200)}`);
  }

  const results = await response.json();
  if (results.code) {
    throw new Error(`Baidu API error: ${results.message ?? JSON.stringify(results)}`);
  }

  const sources = (results.references ?? [])
    .filter((r) => r.url)
    .map((r) => ({
      url: r.url,
      ...(r.title ? { title: String(r.title) } : {}),
      ...(r.content ? { snippet: String(r.content).slice(0, 300) } : {}),
      ...(r.date ? { publishedAt: String(r.date) } : {}),
    }));
  return { sources: uniqueSources(sources, maxResults ?? 10), truncated: false };
}

// Kimi (Moonshot) 开放平台联网搜索 basic (/v1/tools/search)
// key = MOONSHOT_API_KEY
