/**
 * Shared helpers for the engine implementations (URLs, credentials, time
 * parsing, HTML/SERP fetchers, snippet cleaning). Nothing here depends on
 * lib/index.js; the plugin imports these back so existing call sites keep
 * working while engines move into lib/engines/<id>.js.
 */
import { getActiveBlockedDomains, isDomainBlocked } from "../domain_filter.js";
import { sanitizeSource, truncateText } from "../safe_text.js";
import { stripTrackingParams } from "../url_norm.js";

export const DDG_HTML_URL = "https://html.duckduckgo.com/html/";
export const DDG_LITE_URL = "https://lite.duckduckgo.com/lite/";
export const BING_URL = "https://www.bing.com/search";
export const TAVILY_URL = "https://api.tavily.com/search";
export const FIRECRAWL_URL = "https://api.firecrawl.dev/v2/search";
// Firecrawl 的 keyless 档按出口 IP 判定：VPN/代理出口会被 403 拒绝。
// 这个判定不随请求变化，遇到一次就冷却 6 小时，避免回退链每次都白等一次往返。
// 冷却按「代理指纹」记账：换一套代理配置就视为换了出口，旧冷却自动失效。
export const FIRECRAWL_KEYLESS_COOLDOWN_MS = 6 * 60 * 60 * 1000;
export let firecrawlKeylessBlock = null; // { proxy, until }

export function proxyFingerprint() {
  const names = ["HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy", "ALL_PROXY", "all_proxy", "NO_PROXY", "no_proxy"];
  return names.map((name) => String(process.env[name] ?? "")).join("|");
}

/** 该错误是不是 Firecrawl 对 keyless 档的出口 IP 拒绝（而非 key 失效/限流）。 */
export function isFirecrawlKeylessRefusal(status, body) {
  if (status !== 403) return false;
  return /vpn|proxy|without an api key|api key from here/i.test(String(body || ""));
}

/** 当前代理配置是否仍处于冷却中；代理配置变了就清掉旧记录。 */
export function isFirecrawlKeylessBlocked(now = Date.now(), proxy = proxyFingerprint()) {
  if (firecrawlKeylessBlock === null) return false;
  if (firecrawlKeylessBlock.proxy !== proxy) {
    firecrawlKeylessBlock = null;
    return false;
  }
  if (now >= firecrawlKeylessBlock.until) {
    firecrawlKeylessBlock = null;
    return false;
  }
  return true;
}

/** 一个字段/环境变量里可以放多把 key：逗号、分号或换行分隔。 */
export function splitApiKeys(raw) {
  return String(raw ?? "").split(/[\n,;]+/).map((key) => key.trim()).filter(Boolean);
}
export function markFirecrawlKeylessBlocked(proxy = proxyFingerprint()) {
  firecrawlKeylessBlock = { proxy, until: Date.now() + FIRECRAWL_KEYLESS_COOLDOWN_MS };
}

export const PARALLEL_URL = "https://api.parallel.ai/v1/search";
export const PARALLEL_MCP_URL = "https://search.parallel.ai/mcp";
export const PARALLEL_USER_AGENT = "dsh-free-search (+https://github.com/DDDMUC/dsh-free-search)";

export const KEENABLE_URL = "https://api.keenable.ai/v1/search";
export const KEENABLE_MCP_URL = "https://api.keenable.ai/mcp";
export const SERPBASE_URL = "https://api.serpbase.dev/google/search";
export const SERPLY_URL = "https://api.serply.io/v1/search";
export const OUTCRAWL_URL = "https://api.outcrawl.ai/v1/search";
export const YOUCOM_URL = "https://ydc-index.io/v1/search";
// You.com 免 key 档：同样的 query / count 参数与 results.web[] 响应，每天 100 次免费搜索
export const YOUCOM_FREE_URL = "https://api.you.com/v1/agents/search";
export const YOUCOM_KEYS_LINK = "https://you.com/platform/api-keys";
export const TINYFISH_URL = "https://api.search.tinyfish.ai";
export const JINA_URL = "https://s.jina.ai/";
export const DOUBAO_SEARCH_URL = "https://open.feedcoopapi.com/search_api/web_search";
export const ZHIHU_MCP_URL = "https://developer.zhihu.com/api/mcp/v1";
export const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
export const ACCEPT_LANG = "zh-CN,zh;q=0.9,en;q=0.8";
// 当前请求生效的 Accept-Language：由 lang（或显式 bingMarket）决定，搜索前设置（#92）。
export let activeAcceptLanguage = ACCEPT_LANG;
/** 由配置推导 Accept-Language：显式 bingMarket 优先，否则跟随 lang（未知回退 en）。 */
export function acceptLanguageFor(cfg) {
  const market = cfg?.bingMarket;
  if (market && MARKET_TO_LANG[market]) return MARKET_TO_LANG[market];
  return LANG_PROFILES[searchLanguage(configLanguage(cfg))].acceptLang;
}

export function setActiveAcceptLanguage(value) {
  if (typeof value === "string" && value.trim() !== "") activeAcceptLanguage = value.trim();
}

// 语言 → Bing 本地化档案：{ market, acceptLang }。
// lang 字段（设置页可切换）驱动 Bing 的 mkt + Accept-Language，让非中文用户
// 也能拿到本地化结果（俄语搜俄文等）。bingMarket 显式设置时优先于映射。
// #92：区分「搜索语言」与「输出语言」。
// - searchLanguage：交给 provider 的参数（Wikipedia 主机、geocoding、Accept-Language）——支持的语言原样透传，未知回退 en；
// - outputLanguage：我们自己渲染的文案（天气、置信度说明）——只有 zh/en 两套文案，其它语言回退 en，
//   否则日语/俄语用户会在回答前拿到一整段中文。
export function searchLanguage(lang) {
  const tag = String(lang ?? "").trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(LANG_PROFILES, tag) ? tag : "en";
}

/**
 * 配置里生效的语言标签：未设置时按 schema 默认 zh（#92）。
 * searchLanguage() 只负责「未知值回退 en」，两者不要混用。
 */
export function configLanguage(cfg) {
  const value = cfg?.lang;
  if (value === undefined || value === null) return "zh";
  const tag = String(value).trim().toLowerCase();
  return tag === "" ? "zh" : tag;
}


export function outputLanguage(lang) {
  return searchLanguage(lang) === "zh" ? "zh" : "en";
}
export const LANG_PROFILES = {
  zh: { market: "zh-CN", acceptLang: "zh-CN,zh;q=0.9,en;q=0.8" },
  en: { market: "en-US", acceptLang: "en-US,en;q=0.9" },
  ru: { market: "ru-RU", acceptLang: "ru-RU,ru;q=0.9,en;q=0.8" },
  ja: { market: "ja-JP", acceptLang: "ja-JP,ja;q=0.9,en;q=0.8" },
  de: { market: "de-DE", acceptLang: "de-DE,de;q=0.9,en;q=0.8" },
  fr: { market: "fr-FR", acceptLang: "fr-FR,fr;q=0.9,en;q=0.8" },
  es: { market: "es-ES", acceptLang: "es-ES,es;q=0.9,en;q=0.8" },
  ko: { market: "ko-KR", acceptLang: "ko-KR,ko;q=0.9,en;q=0.8" },
};
// market → 语言（bingMarket 显式设置时反推 accept-language，避免中文优先 header 污染）
export const MARKET_TO_LANG = {
  "zh-CN": "zh-CN,zh;q=0.9,en;q=0.8",
  "zh-TW": "zh-TW,zh;q=0.9,en;q=0.8",
  "en-US": "en-US,en;q=0.9",
  "en-GB": "en-GB,en;q=0.9",
  "ru-RU": "ru-RU,ru;q=0.9,en;q=0.8",
  "ja-JP": "ja-JP,ja;q=0.9,en;q=0.8",
  "de-DE": "de-DE,de;q=0.9,en;q=0.8",
  "fr-FR": "fr-FR,fr;q=0.9,en;q=0.8",
  "es-ES": "es-ES,es;q=0.9,en;q=0.8",
  "ko-KR": "ko-KR,ko;q=0.9,en;q=0.8",
};

export const TIME_RANGES = ["day", "week", "month", "year"];
export const DAYS_BY_RANGE = { day: 1, week: 7, month: 30, year: 365 };
export const KEENABLE_REL = { day: "1d", week: "7d", month: "1mo", year: "1y" };
export const SEARXNG_TIME = { day: "day", week: "week", month: "month", year: "year" };

export function isoDaysAgo(days) {
  return new Date(Date.now() - days * 86_400_000).toISOString().replace(/\.\d{3}Z$/, ".000Z");
}

// 把用户/agent 给的 timeRange 解析成统一对象：{ days } 相对天数，或 { after } 绝对日期。
// 输入支持：day/week/month/year、12h/3d/2mo/1y、2026-07-01，或已解析的 {days}/{after} 对象。
// 无效返回 undefined。
export function parseTimeRange(input) {
  if (input === undefined || input === null) return undefined;
  // 已解析对象：直接透传
  if (typeof input === "object") {
    if (typeof input.after === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input.after)) return { after: input.after };
    if (typeof input.days === "number" && Number.isFinite(input.days) && input.days > 0) return { days: input.days };
    return undefined;
  }
  const s = String(input).trim().toLowerCase();
  if (s.length === 0) return undefined;
  if (TIME_RANGES.includes(s)) return { days: DAYS_BY_RANGE[s] };
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return { after: s };
  const m = s.match(/^(\d+(?:\.\d+)?)\s*(h|hour|hours|d|day|days|w|week|weeks|mo|month|months|y|year|years)$/);
  if (m) {
    const n = parseFloat(m[1]);
    const unit = m[2][0];
    const days =
      unit === "h" ? n / 24 : unit === "d" ? n : unit === "w" ? n * 7 : unit === "m" ? n * 30 : n * 365;
    return { days };
  }
  return undefined;
}

// 把自定义天数映射到只支持固定档的引擎（Tavily / SearXNG / DDG）的最近似档位
export function approximateTimeRange(days) {
  if (days <= 2) return "day";
  if (days <= 14) return "week";
  if (days <= 90) return "month";
  return "year";
}

export function decodeEntities(text) {
  return String(text)
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

// 统一的 snippet 清洗：剔除登录/付费墙/订阅等噪音短语，折叠空白，限制长度。
// 只在回退链出口统一应用，各引擎内部不做，避免重复处理。
export const SNIPPET_NOISE =
  /\b(sign up|sign in|log in|login|subscribe( to| for)?|member[- ]?only|become a member|create (a )?free account|read more|continue reading|story continues|get started|install (the )?app|view on|medium membership|join \w+ for free|get updates from this writer|stories in your inbox|remember me for|unlock this|free to read|become a patron)\b/gi;

export function cleanSnippet(text, max = 300) {
  if (!text) return text;
  const cleaned = String(text)
    .replace(SNIPPET_NOISE, " ")
    .replace(/^\s*(#{1,6}\s*|\[\s*x?\s*\]\s*|-\s*\[\s*x?\s*\]\s*|>\s*)/gm, " ")
    .replace(/\s+/g, " ")
    .trim();
  // #108: cut by code point, never through a surrogate pair
  return truncateText(cleaned, max);
}

// 各引擎的摘要展示上限：豆包搜索返回的是千字级 Summary（实测 1300-1800 字），放宽到 2000；
// deepseek-tools 的 summary 官方文档写 600~800 字（实测 530），按 300 截断会把摘要拦腰砍断，
// 放宽到 2000 与豆包同理；其余引擎维持 300。
// 该上限同时用于 provider 成功后的清洗与 runEngineTest（喂 multi_search）。
export const SNIPPET_MAX_BY_ENGINE = { doubao: 2000, "deepseek-tools": 2000 };
export function snippetCap(engine) {
  return SNIPPET_MAX_BY_ENGINE[engine] ?? 300;
}

export function stripTags(html) {
  return decodeEntities(String(html).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

export function extractDdgUrl(rel) {
  if (!rel) return null;
  const m = rel.match(/uddg=([^&]+)/);
  if (m) {
    try {
      return decodeURIComponent(m[1]);
    } catch {
      return m[1];
    }
  }
  if (rel.startsWith("//")) return `https:${rel}`;
  return rel;
}

// #72：收敛前过滤域名黑名单——先剔除被屏蔽条目，再去重 + 截断，
// 因此后面的候选会自动补位（用户得到的是"满员的好结果"，而不是变短的结果）。
export function uniqueSources(sources, limit) {
  const blocked = getActiveBlockedDomains();
  const kept = blocked.length ? sources.filter((s) => !isDomainBlocked(s.url, blocked)) : sources;
  const seen = new Set();
  const out = [];
  for (const s of kept) {
    if (s.url && !seen.has(s.url)) {
      seen.add(s.url);
      out.push(s);
    }
    if (out.length >= limit) break;
  }
  return out.map(sanitizeSource);
}

export async function fetchHtml(url, signal, acceptLang) {
  // 单次请求超时 12s，避免挂起被当成 Connection error
  let response;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    const onAbort = () => controller.abort();
    signal?.addEventListener("abort", onAbort);
    response = await fetch(url, {
      headers: { "user-agent": USER_AGENT, "accept-language": acceptLang ?? activeAcceptLanguage },
      signal: controller.signal,
      redirect: "follow",
    });
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error(`connection error: ${error?.message ?? String(error)}`);
  }
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from ${url.split("?")[0]}`);
  }
  const html = await response.text();
  // DuckDuckGo 反爬验证页检测（HTTP 202 或验证关键字）
  if (response.status === 202 || /anomaly|captcha|unusual traffic|robot check/i.test(html.slice(0, 4000))) {
    throw new Error("DuckDuckGo is rate-limited right now (anti-bot challenge, usually temporary) - Bing works");
  }
  return html;
}

// 带重试的抓取：网络错误/空结果时重试，间隔 1.5s，最多 3 次
export async function fetchHtmlWithRetry(url, signal, acceptLang) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const html = await fetchHtml(url, signal, acceptLang);
      if (html.length > 500) return html;
      lastError = new Error(`empty response (${html.length} bytes)`);
    } catch (error) {
      lastError = error;
    }
    if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  throw lastError ?? new Error("fetch failed");
}

export const SEARXNG_INSTANCES = [
  "https://opnxng.com",
  "https://priv.au",
  "https://searx.be",
  "https://searx.tiekoetter.com",
  "https://search.inetol.net",
  "https://paulgo.io",
];

export const ANYSEARCH_URL = "https://api.anysearch.com/v1/search";
export const EXA_MCP_URL = "https://mcp.exa.ai/mcp";

// 当前请求生效的输出语言（zh / en），由 lang 推导；只有我们自己渲染的文案用它（#92）。
export let activeOutputLanguage = "zh";
export function setActiveOutputLanguage(value) {
  activeOutputLanguage = String(value ?? "").trim().toLowerCase() === "zh" ? "zh" : "en";
}
export function getActiveOutputLanguage() {
  return activeOutputLanguage;
}

export function stripZhihuTracking(url) {
  return stripTrackingParams(url);
}

export const SERPBASE_LOCALE = {
  zh: { hl: "zh-CN", gl: "cn" },
  en: { hl: "en", gl: "us" },
  ru: { hl: "ru", gl: "ru" },
  ja: { hl: "ja", gl: "jp" },
  de: { hl: "de", gl: "de" },
  fr: { hl: "fr", gl: "fr" },
  es: { hl: "es", gl: "es" },
  ko: { hl: "ko", gl: "kr" },
};
