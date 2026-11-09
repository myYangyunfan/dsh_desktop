// Bing HTML engine; one fetch, no retry loop (see assert-engines).
import { uniqueSources, fetchHtmlWithRetry, stripTags, decodeEntities, approximateTimeRange, SEARXNG_INSTANCES, SEARXNG_TIME, ANYSEARCH_URL, EXA_MCP_URL, extractDdgUrl, MARKET_TO_LANG, LANG_PROFILES, BING_URL, DDG_HTML_URL, DDG_LITE_URL, activeAcceptLanguage, USER_AGENT, searchLanguage, configLanguage, activeOutputLanguage } from "./shared.js";

function queryOverlapTokens(query) {
  const tokens = new Set();
  for (const run of String(query).match(/[\u4e00-\u9fff]+/g) ?? []) {
    if (run.length <= 2) tokens.add(run);
    for (let i = 0; i + 1 < run.length; i++) tokens.add(run.slice(i, i + 2));
  }
  for (const word of String(query).toLowerCase().split(/[^a-z0-9]+/)) {
    if (word.length >= 2) tokens.add(word);
  }
  return [...tokens];
}

function looksRelevant(query, sources) {
  const tokens = queryOverlapTokens(query);
  if (tokens.length === 0) return true; // 纯符号查询无法判定，不拦截
  return sources.some((s) => {
    const hay = `${s.title ?? ""} ${s.snippet ?? ""} ${s.url ?? ""}`.toLowerCase();
    return tokens.some((t) => hay.includes(t.toLowerCase()));
  });
}

// Bing 会把结果 URL 包成 bing.com/ck/a 跳转链接：真实地址在 u 参数（base64url，a1 前缀）

function extractBingUrl(href) {
  if (!href) return href;
  const url = decodeEntities(href); // &amp; -> &
  if (!/^https?:\/\/(www\.)?bing\.com\/ck\/a/i.test(url)) return href;
  try {
    const u = new URL(url).searchParams.get("u");
    if (!u) return href;
    const b64 = u.startsWith("a1") ? u.slice(2) : u;
    const decoded = Buffer.from(b64.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    return /^https?:\/\//i.test(decoded) ? decoded : href;
  } catch {
    return href;
  }
}

export async function searchBing(query, maxResults, options, signal) {
  // mkt：仅显式 bingMarket 才发。默认不发——mkt=zh-CN 在部分地区/线路会返回空 SERP 容器
  // （#71：海外 IP + mkt=zh-CN → b_algo=0），Bing 会按 Accept-Language 自行本地化。
  const profile = LANG_PROFILES[searchLanguage(configLanguage(options))];
  const params = new URLSearchParams({ q: query });
  if (options?.bingMarket) params.set("mkt", options.bingMarket);
  // Accept-Language：显式 bingMarket 时按 market 反推（避免中文 header 污染），否则用 lang 档案
  const acceptLang = options?.bingMarket
    ? (MARKET_TO_LANG[options.bingMarket] ?? activeAcceptLanguage)
    : (profile.acceptLang ?? activeAcceptLanguage);
  const adlt = options?.safeSearch ?? "off";
  if (adlt === "off") params.set("adlt", "off");
  else if (adlt === "moderate") params.set("adlt", "moderate");
  else if (adlt === "strict") params.set("adlt", "strict");
  // 注意（2026-10-13 实测）：Bing 会对可疑出口 IP 间歇性返回约 91KB 的「空 SERP」（b_algo 块数 0），
  // 表现为按请求频率收紧、减少请求后又自行恢复。曾加过「空 SERP 时多试一次」的兜底，但实测
  // 请求数翻倍反而更容易被压死，且根因在出口 IP 而非解析，故撤掉——修法应让 bing 不走可疑代理
  // （启动脚本的 NO_PROXY 排除 .bing.com 即可恢复）。
  const html = await fetchHtmlWithRetry(`${BING_URL}?${params}`, signal, acceptLang);
  const blocks = html.match(/<li class="b_algo"[\s\S]*?<\/li>/g) ?? [];
  const sources = [];
  for (const block of blocks) {
    const hrefMatch = block.match(/<a[^>]*href="(https?:\/\/[^"]+)"/);
    const titleMatch = block.match(/<h2[^>]*>[\s\S]*?<a[^>]*>(.*?)<\/a>[\s\S]*?<\/h2>/);
    const snippetMatch = block.match(/<p[^>]*>([\s\S]*?)<\/p>/);
    if (!hrefMatch) continue;
    sources.push({
      url: extractBingUrl(hrefMatch[1]),
      ...(titleMatch ? { title: stripTags(titleMatch[1]) } : {}),
      ...(snippetMatch ? { snippet: stripTags(snippetMatch[1]) } : {}),
    });
  }
  // Bing 无结果时会返回无关的缓存页：判为 0 结果，交给统一回退链换下一个引擎
  if (sources.length > 0 && !looksRelevant(query, sources)) {
    return { sources: [], truncated: false };
  }
  return { sources: uniqueSources(sources, maxResults ?? 10), truncated: false };
}

//#region searxng (meta-search, free instances, auto-failover)
