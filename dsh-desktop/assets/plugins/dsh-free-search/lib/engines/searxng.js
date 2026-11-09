// SearXNG meta-search engine.
import { uniqueSources, fetchHtmlWithRetry, stripTags, decodeEntities, approximateTimeRange, SEARXNG_INSTANCES, SEARXNG_TIME, ANYSEARCH_URL, EXA_MCP_URL, extractDdgUrl, MARKET_TO_LANG, LANG_PROFILES, BING_URL, DDG_HTML_URL, DDG_LITE_URL, activeAcceptLanguage, USER_AGENT, searchLanguage, configLanguage, activeOutputLanguage } from "./shared.js";

export async function searchSearxng(query, maxResults, options, signal) {
  const instances = options?.searxngInstances?.length
    ? options.searxngInstances
    : SEARXNG_INSTANCES;
  // 聚合所有实例的失败原因，避免只显示最后一个实例的错误
  const errors = [];
  for (const base of instances) {
    try {
      const params = new URLSearchParams({ q: query, format: "json" });
      // SearXNG 原生支持 time_range 过滤（只支持固定档，自定义取近似档）
      if (options?.timeRange) {
        const tr = SEARXNG_TIME[approximateTimeRange(options.timeRange.days ?? 7)];
        if (tr) params.set("time_range", tr);
      }
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      const onAbort = () => ctrl.abort();
      signal?.addEventListener("abort", onAbort);
      const response = await fetch(`${base}/search?${params}`, {
        headers: {
          "user-agent": USER_AGENT,
          accept: "application/json",
          ...(options?.searxngBearerToken ? { authorization: `Bearer ${options.searxngBearerToken}` } : {}),
        },
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      if (!response.ok) {
        errors.push(`${base}: HTTP ${response.status}`);
        continue;
      }
      const data = await response.json().catch(() => null);
      if (!data || !Array.isArray(data.results)) {
        errors.push(`${base}: invalid JSON`);
        continue;
      }
      const sources = data.results
        .filter((r) => r.url)
        .map((r) => ({
          url: r.url,
          ...(r.title ? { title: String(r.title) } : {}),
          ...(r.content ? { snippet: String(r.content) } : {}),
        }));
      if (sources.length > 0) {
        return { sources: uniqueSources(sources, maxResults ?? 10), truncated: false };
      }
      errors.push(`${base}: 0 results`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${base}: ${message}`);
    }
  }
  // 空实例列表兜底：避免 "all SearXNG instances failed: " 尾巴悬空
  const detail = errors.length > 0 ? errors.join(", ") : "no instances configured";
  // Note 会引用这个错误消息，截断避免 6 实例全挂时刷屏
  throw new Error(`all SearXNG instances failed: ${detail.slice(0, 300)}`);
}
//#endregion

//#region degoog (self-hosted search aggregator, opt-in)
// degoog 的 JSON API：GET /api/search?q=…&type=web（可选 time / lang），结果在 results[] 里
// （url / title / snippet）。实例若开了 apiKeySearchEnabled，需要 Authorization: Bearer <serverKey>。
