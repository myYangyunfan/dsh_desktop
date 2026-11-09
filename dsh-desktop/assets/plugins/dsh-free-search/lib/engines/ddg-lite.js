// DuckDuckGo Lite engine.
import { uniqueSources, fetchHtmlWithRetry, stripTags, decodeEntities, approximateTimeRange, SEARXNG_INSTANCES, SEARXNG_TIME, ANYSEARCH_URL, EXA_MCP_URL, extractDdgUrl, MARKET_TO_LANG, LANG_PROFILES, BING_URL, DDG_HTML_URL, DDG_LITE_URL, activeAcceptLanguage, USER_AGENT, searchLanguage, configLanguage, activeOutputLanguage } from "./shared.js";

export async function searchDdgLite(query, maxResults, options, signal) {
  const params = new URLSearchParams({ q: query });
  const adlt = options?.safeSearch ?? "off";
  params.set("adlt", adlt === "strict" ? "1" : adlt === "moderate" ? "0" : "-1");
  // DDG Lite 同样支持 df 时间过滤
  if (options?.timeRange) {
    const df = { day: "d", week: "w", month: "m", year: "y" }[approximateTimeRange(options.timeRange.days ?? 7)];
    if (df) params.set("df", df);
  }
  const html = await fetchHtmlWithRetry(`${DDG_LITE_URL}?${params}`, signal);
  const linkMatches = html.match(/<a[^>]*class=['"]result-link['"][^>]*>[\s\S]*?<\/a>/g) ?? [];
  const snippetMatches = html.match(/class=['"]result-snippet['"][^>]*>([\s\S]*?)<\/td>/g) ?? [];
  const sources = [];
  for (let i = 0; i < linkMatches.length; i++) {
    const tag = linkMatches[i];
    const hrefMatch = tag.match(/href="([^"]*)"/);
    const titleMatch = tag.match(/class=['"]result-link['"][^>]*>(.*?)<\/a>/);
    if (!hrefMatch) continue;
    const url = extractDdgUrl(hrefMatch[1]);
    if (!url) continue;
    const snippet = snippetMatches[i]?.match(/class=['"]result-snippet['"][^>]*>([\s\S]*?)<\/td>/)?.[1];
    sources.push({
      url,
      ...(titleMatch ? { title: stripTags(titleMatch[1]) } : {}),
      ...(snippet ? { snippet: stripTags(snippet) } : {}),
    });
  }
  return { sources: uniqueSources(sources, maxResults ?? 10), truncated: false };
}

// Bing 在「查询无结果」时会返回一张完全无关的缓存 SERP（<li class="b_algo"> 照常存在，
// 但内容是别的查询/热门页的内容），直接返回等于把垃圾结果喂给模型（issue #38：YouTube、
// 法语微软文档、瑞士基金等都复现过）。这里用「查询 token 与结果文本是否重叠」识别这种页面。
// token 规则：CJK 取 1-2 字组合（二元组），拉丁/数字取长度 >=2 的词。
