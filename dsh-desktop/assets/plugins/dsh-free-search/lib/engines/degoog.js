// Degoog self-hosted engine.
import { uniqueSources, fetchHtmlWithRetry, stripTags, decodeEntities, approximateTimeRange, SEARXNG_INSTANCES, SEARXNG_TIME, ANYSEARCH_URL, EXA_MCP_URL, extractDdgUrl, MARKET_TO_LANG, LANG_PROFILES, BING_URL, DDG_HTML_URL, DDG_LITE_URL, activeAcceptLanguage, USER_AGENT, searchLanguage, configLanguage, activeOutputLanguage } from "./shared.js";

const DEGOOG_TIME = { day: "day", week: "week", month: "month", year: "year" };

/** 把实例地址规范化成 /api/search URL；允许用户写 `https://host` 或 `https://host/api`。 */

export function degoogSearchUrl(base, query, { timeRange, lang } = {}) {
  const root = String(base ?? "").trim().replace(/\/+$/, "");
  const endpoint = /\/api$/i.test(root) ? `${root}/search` : `${root}/api/search`;
  const params = new URLSearchParams({ q: String(query ?? ""), type: "web" });
  if (timeRange) {
    const tr = DEGOOG_TIME[approximateTimeRange(timeRange.days ?? 7)];
    if (tr) params.set("time", tr);
  }
  if (lang) params.set("lang", String(lang));
  return `${endpoint}?${params}`;
}

export async function searchDegoog(query, maxResults, options, signal) {
  const instances = (Array.isArray(options?.degoogInstances) ? options.degoogInstances : [])
    .map((entry) => String(entry ?? "").trim())
    .filter(Boolean);
  const errors = [];
  for (const base of instances) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 10000);
      const onAbort = () => ctrl.abort();
      signal?.addEventListener("abort", onAbort);
      const response = await fetch(degoogSearchUrl(base, query, { timeRange: options?.timeRange, lang: options?.lang }), {
        headers: {
          "user-agent": USER_AGENT,
          accept: "application/json",
          ...(options?.degoogApiKey ? { authorization: `Bearer ${options.degoogApiKey}` } : {}),
        },
        redirect: "error",
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      if (response.status === 401 || response.status === 403) {
        errors.push(`${base}: HTTP ${response.status} (check degoogApiKey)`);
        continue;
      }
      if (!response.ok) {
        errors.push(`${base}: HTTP ${response.status}`);
        continue;
      }
      const data = await response.json().catch(() => null);
      const rows = Array.isArray(data?.results) ? data.results : [];
      const sources = rows
        .filter((row) => row && row.url)
        .map((row) => ({
          url: String(row.url),
          ...(row.title ? { title: String(row.title) } : {}),
          ...(row.snippet ?? row.content ? { snippet: String(row.snippet ?? row.content) } : {}),
        }));
      if (sources.length > 0) return { sources: uniqueSources(sources, maxResults ?? 10), truncated: false };
      errors.push(`${base}: 0 results`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${base}: ${message}`);
    }
  }
  const detail = errors.length > 0 ? errors.join(", ") : "no instances configured (set degoogInstances in the plugin config)";
  throw new Error(`all degoog instances failed: ${detail.slice(0, 300)}`);
}
//#endregion
//#region keyless engines (AnySearch / Exa MCP - free, no API key)

// AnySearch: 免费匿名额度（无 key），可选 Bearer key 提额；结构化 JSON 结果
// 401/403：本进程忽略该 key 值（不删除存储），改回匿名免费；不自动清空用户配置
