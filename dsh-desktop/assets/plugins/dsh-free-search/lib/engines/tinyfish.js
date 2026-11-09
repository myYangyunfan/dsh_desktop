// TinyFish Search engine.
import { TINYFISH_URL, JINA_URL, DOUBAO_SEARCH_URL, snippetCap, stripTags, uniqueSources } from "./shared.js";
import { TIME_ENGINES } from "../engine_meta.js";

export async function searchTinyfish(query, maxResults, apiKey, timeRange, signal) {
  if (!apiKey) throw new Error("TinyFish search requires TINYFISH_API_KEY");
  const params = new URLSearchParams({ query });
  if (timeRange) {
    if (timeRange.after) {
      params.set("after_date", timeRange.after);
    } else if (timeRange.days !== undefined) {
      params.set("after_date", new Date(Date.now() - timeRange.days * 86400000).toISOString().slice(0, 10));
    }
  }
  const response = await fetch(`${TINYFISH_URL}?${params}`, {
    method: "GET",
    redirect: "error",
    headers: {
      "X-API-Key": apiKey,
      accept: "application/json",
      "user-agent": "deepseek-harness/free-search",
    },
    signal: AbortSignal.any([...(signal !== undefined ? [signal] : []), AbortSignal.timeout(15000)]),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    if (response.status === 401 || response.status === 403) {
      throw new Error(`TinyFish API key is invalid (HTTP ${response.status}) - update it in Settings > Plugins > Free Search`);
    }
    if (response.status === 429) {
      throw new Error("TinyFish rate limit exceeded (HTTP 429) - free tier is 30 req/min, 500 req/hour");
    }
    throw new Error(`TinyFish API error (HTTP ${response.status}): ${detail.slice(0, 200)}`);
  }
  const data = await response.json();
  // 响应：{ query, results: [ { position, site_name, title, snippet, url } ], total_results, page }
  const sources = (data.results ?? [])
    .filter((r) => r.url)
    .map((r) => ({
      url: r.url,
      ...(r.title ? { title: String(r.title) } : {}),
      ...(r.snippet ? { snippet: String(r.snippet).slice(0, 300) } : {}),
    }));
  return { sources: uniqueSources(sources, maxResults ?? 10), truncated: false };
}

// Jina Search（s.jina.ai）：GET + Bearer；需 JINA_API_KEY。
