// Jina engine.
import { TINYFISH_URL, JINA_URL, DOUBAO_SEARCH_URL, snippetCap, stripTags, uniqueSources } from "./shared.js";
import { TIME_ENGINES } from "../engine_meta.js";

export async function searchJina(query, maxResults, apiKey, signal) {
  if (!apiKey) throw new Error("Jina search requires JINA_API_KEY");
  const params = new URLSearchParams({ q: query });
  const response = await fetch(`${JINA_URL}?${params}`, {
    method: "GET",
    redirect: "error",
    headers: {
      authorization: `Bearer ${apiKey}`,
      accept: "application/json",
      "user-agent": "deepseek-harness/free-search",
    },
    signal: AbortSignal.any([...(signal !== undefined ? [signal] : []), AbortSignal.timeout(20000)]),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    if (response.status === 401 || response.status === 403) {
      throw new Error(`Jina API key is invalid (HTTP ${response.status}) - update it in Settings > Plugins > Free Search`);
    }
    if (response.status === 429) {
      throw new Error("Jina rate limit exceeded (HTTP 429) - check your plan at jina.ai");
    }
    throw new Error(`Jina API error (HTTP ${response.status}): ${detail.slice(0, 200)}`);
  }
  const data = await response.json();
  // 响应：{ code, status, data: [ { title, url, description, content } ] }
  const sources = (data.data ?? [])
    .filter((r) => r.url)
    .map((r) => ({
      url: r.url,
      ...(r.title ? { title: String(r.title) } : {}),
      ...(r.description ? { snippet: String(r.description).slice(0, 300) } : {}),
    }));
  return { sources: uniqueSources(sources, maxResults ?? 10), truncated: false };
}

// 百度千帆 AI 搜索（v2/ai_search/web_search）
// key = 环境变量 BAIDU_API_KEY
