// Kimi (Moonshot) search engine.
import { TINYFISH_URL, JINA_URL, DOUBAO_SEARCH_URL, snippetCap, stripTags, uniqueSources } from "./shared.js";
import { TIME_ENGINES } from "../engine_meta.js";

export async function searchKimi(query, maxResults, apiKey, timeRange, signal) {
  if (!apiKey) throw new Error("Kimi search requires MOONSHOT_API_KEY");
  const limit = Math.min(Math.max(maxResults ?? 5, 1), 20);
  const body = {
    text_query: query,
    limit,
    timeout_seconds: 30,
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 35000);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort);
  let response;
  try {
    response = await fetch("https://api.moonshot.cn/v1/tools/search", {
      method: "POST",
      redirect: "error",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
        "user-agent": "deepseek-harness/free-search",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error(`Kimi search request failed: ${error?.message ?? String(error)}`);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    if (response.status === 401 || response.status === 403) {
      throw new Error(`Kimi API key is invalid (HTTP ${response.status}) - update it in Settings > Plugins > Free Search`);
    }
    throw new Error(`Kimi API error (HTTP ${response.status}): ${detail.slice(0, 200)}`);
  }

  const data = await response.json();
  const sources = (data.search_results ?? [])
    .filter((r) => r.url)
    .map((r) => {
      let snippet = "";
      if (Array.isArray(r.chunks) && r.chunks.length > 0) {
        // chunks 是 [{ text }]（Basic 档位返回的正文片段），不是字符串数组
        snippet = r.chunks
          .map((c) => (typeof c === "string" ? c : c && typeof c.text === "string" ? c.text : ""))
          .filter(Boolean)
          .join(" ");
      } else if (r.snippet) {
        snippet = String(r.snippet);
      }
      return {
        url: r.url,
        ...(r.title ? { title: String(r.title) } : {}),
        ...(snippet ? { snippet: snippet.slice(0, 300) } : {}),
        ...(r.publish_date ? { publishedAt: String(r.publish_date) } : {}),
      };
    });
  return { sources: uniqueSources(sources, maxResults ?? 10), truncated: false };
}

// 阿里云百炼 EnhancedSearch MCP (search_pro)
// key = DASHSCOPE_API_KEY
