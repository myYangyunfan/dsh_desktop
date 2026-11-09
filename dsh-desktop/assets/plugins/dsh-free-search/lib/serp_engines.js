/**
 * HTML SERP engines for dsh-free-search (fork addition).
 *
 * Ported from dsh-multi-search-engine/lib/engines.js: the URL templates and the
 * HTML result parsers are kept verbatim so the two implementations stay
 * comparable, but the execution layer here is intentionally different:
 *
 *  - one single-shot fetch per engine (no 3x retry) — HTML engines are cheap and
 *    replaceable, and a retry loop would eat the multi_search time budget;
 *  - failures are raised with wording that `classifyFailure()` maps to
 *    `bot-wall` / `transient`, so the existing cooldown machinery applies;
 *  - only the metadata + parsers are shared; merging, de-duplication, blocking
 *    and snippet cleaning stay in index.js.
 *
 * These engines are opt-in: they are excluded from the automatic fallback chain
 * unless the user names them (see SERP_FAMILY usage in index.js).
 */

import { normalizeUrlForDedupe } from "./url_norm.js";
import { truncateText, stripLoneSurrogates, sliceByCodePoint } from "./safe_text.js";

export const SERP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const DEFAULT_TIMEOUT_MS = 8000;

const ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ensp: " ",
  emsp: " ",
  thinsp: " ",
  middot: "·",
  mdash: "—",
  ndash: "–",
  hellip: "…",
  ldquo: "“",
  rdquo: "”",
  lsquo: "‘",
  rsquo: "’",
  laquo: "«",
  raquo: "»",
  times: "×",
  divide: "÷",
  copy: "©",
  reg: "®",
  trade: "™",
  deg: "°",
  "#39": "'",
  "#x27": "'",
  "#x2F": "/",
  "#46": ".",
  "#58": ":",
};

export function decodeEntities(input) {
  return String(input).replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, name) => {
    const key = name.toLowerCase();
    if (Object.prototype.hasOwnProperty.call(ENTITIES, key)) return ENTITIES[key];
    if (key.startsWith("#x")) {
      const code = Number.parseInt(key.slice(2), 16);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : match;
    }
    if (key.startsWith("#")) {
      const code = Number.parseInt(key.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : match;
    }
    return match;
  });
}

export function stripTags(html) {
  return decodeEntities(
    String(html ?? "")
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]*>/g, " ")
  )
    .replace(/\s+/g, " ")
    .trim();
}

function cleanTitle(title) {
  return truncateText(stripTags(title).replace(/^[\s\-–—|·•]+|[\s\-–—|·•]+$/g, ""), 240);
}

function cleanSnippet(snippet) {
  const text = stripTags(snippet);
  const safe = stripLoneSurrogates(text);
  const cut = sliceByCodePoint(safe, 400);
  return cut.length < safe.length ? `${cut}…` : cut;
}

function unescapeAttr(value) {
  return decodeEntities(String(value ?? "")).replace(/^\/\//, "https://");
}

function pushResult(target, seen, title, url, snippet) {
  const clean = cleanTitle(title);
  const href = unescapeAttr(url);
  if (!clean || clean.length < 2 || !/^https?:\/\//i.test(href)) return;
  if (seen.has(href)) return;
  seen.add(href);
  target.push({ title: clean, url: href, snippet: cleanSnippet(snippet ?? "") });
}

function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

/** Browser-chrome / ad links that show up on nearly every SERP. */
const CHROME_HOSTS = [
  "microsoft.com",
  "msn.com",
  "msn.cn",
  "google.com",
  "gstatic.com",
  "googleusercontent.com",
  "mozilla.org",
  "apple.com",
  "adobe.com",
];

/** Pure navigation labels: "下载 Edge" 之类不能当结果。 */
const NAV_TITLES = /^(登录|注册|首页|主页|更多|下载|试试|帮助|反馈|设置|关于我们|Edge|Chrome|Firefox|Safari|MSN)$/i;

/** Generic fallback: harvest plausible result anchors and drop the engine's own chrome. */
function parseGeneric(html, ignoreHosts) {
  const results = [];
  const seen = new Set();
  const ignored = [...(ignoreHosts ?? []), ...CHROME_HOSTS];
  const anchor = /<a\b[^>]*href\s*=\s*"([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = anchor.exec(html)) !== null) {
    const href = unescapeAttr(match[1]);
    if (!/^https?:\/\//i.test(href)) continue;
    const host = hostOf(href);
    if (!host) continue;
    if (ignored.some((entry) => host === entry || host.endsWith(`.${entry}`))) continue;
    if (/\.(png|jpe?g|gif|svg|ico|css|js|woff2?)(\?|$)/i.test(href)) continue;
    if (NAV_TITLES.test(cleanTitle(match[2]))) continue;
    pushResult(results, seen, match[2], href, "");
    if (results.length >= 25) break;
  }
  return results;
}

/** Bing: one `<li class="b_algo">` block per result. Kept for bing-cn-style pages. */
function parseBing(html) {
  const results = [];
  const seen = new Set();
  const blocks = html.split(/<li\s+class="b_algo"/i).slice(1);
  for (const block of blocks) {
    const link = /<h2[^>]*>[\s\S]*?<a\b[^>]*href\s*=\s*"([^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(block);
    if (link === null) continue;
    const snippet = /<p\b[^>]*>([\s\S]*?)<\/p>/i.exec(block);
    pushResult(results, seen, link[2], link[1], snippet?.[1] ?? "");
  }
  return results.length > 0 ? results : parseGeneric(html, ["bing.com", "microsoft.com", "msn.com", "live.com"]);
}

/** Baidu: `<div class="result ...">` blocks; real target often lives in `mu="..."`. */
function parseBaidu(html) {
  const results = [];
  const seen = new Set();
  const blocks = html.split(/<div[^>]+class="result[\s"]/i).slice(1);
  for (const block of blocks) {
    const mu = /\bmu="([^"]+)"/i.exec(block);
    const link = /<h3[^>]*>[\s\S]*?<a\b[^>]*href\s*=\s*"([^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(block);
    if (link === null && mu === null) continue;
    const snippet = /class="[^"]*content-right[^"]*"[^>]*>([\s\S]*?)<\/div>/i.exec(block);
    pushResult(results, seen, link?.[2] ?? mu?.[1] ?? "", mu?.[1] ?? link?.[1] ?? "", snippet?.[1] ?? "");
  }
  return results.length > 0 ? results : parseGeneric(html, ["baidu.com", "bdstatic.com"]);
}

/** 360 / so.com: `<li class="res-list">`. */
function parseSo360(html) {
  const results = [];
  const seen = new Set();
  const blocks = html.split(/<li\s+class="res-list/i).slice(1);
  for (const block of blocks) {
    const link = /<h3[^>]*>[\s\S]*?<a\b[^>]*href\s*=\s*"([^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(block);
    if (link === null) continue;
    const snippet = /<p\b[^>]*class="[^"]*res-desc[^"]*"[^>]*>([\s\S]*?)<\/p>/i.exec(block)
      ?? /<p\b[^>]*>([\s\S]*?)<\/p>/i.exec(block);
    pushResult(results, seen, link[2], link[1], snippet?.[1] ?? "");
  }
  return results.length > 0 ? results : parseGeneric(html, ["so.com", "360.cn", "qhimg.com"]);
}

/** Sogou: `<div class="vrwrap">`; links are relative `/link?url=...`. */
function parseSogou(html) {
  const results = [];
  const seen = new Set();
  const blocks = html.split(/<div[^>]+class="vrwrap"/i).slice(1);
  for (const block of blocks) {
    const link = /<h3[^>]*>[\s\S]*?<a\b[^>]*href\s*=\s*"([^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(block);
    if (link === null) continue;
    const href = link[1].startsWith("/") ? `https://www.sogou.com${link[1]}` : link[1];
    pushResult(results, seen, link[2], href, "");
  }
  return results.length > 0 ? results : parseGeneric(html, ["sogou.com", "sogoucdn.com"]);
}

/**
 * Sogou WeChat vertical. Each hit sits in `<li id="sogou_vr_11002601_box_N">`
 * and is wrapped in a *signed relative* `/link?url=...` redirect — the public
 * mp.weixin.qq.com target is never in the HTML, so keep the wrapper and let the
 * caller follow it. (The upstream multi-search-engine parser only looked for
 * absolute mp.weixin.qq.com anchors and therefore always returned 0 here.)
 */
function parseWechat(html) {
  const results = [];
  const seen = new Set();
  const blocks = html.split(/<li[^>]+id="sogou_vr_11002601_box/i).slice(1);
  for (const block of blocks) {
    const link = /<h3[^>]*>[\s\S]*?<a\b[^>]*href\s*=\s*"([^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(block);
    if (link === null) continue;
    const href = link[1].startsWith("/") ? `https://weixin.sogou.com${link[1]}` : link[1];
    pushResult(results, seen, link[2], href, "");
  }
  if (results.length > 0) return results;
  // Older layouts use absolute mp.weixin.qq.com anchors.
  const anchor = /<a\b[^>]*href\s*=\s*"(https?:\/\/mp\.weixin\.qq\.com\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = anchor.exec(html)) !== null) {
    pushResult(results, seen, match[2], match[1], "");
    if (results.length >= 25) break;
  }
  return results;
}

/**
 * Toutiao's SERP is JS-rendered: the anchors in the HTML are author-profile
 * redirects (`profile.zjurl.cn`), not articles. The real hits live in the
 * embedded JSON island as `"title":"…"` + `"article_url":"https://toutiao.com/group/<id>/…"`.
 * Fall back to generic anchors (minus profile redirects) when it is absent.
 */
function parseToutiao(html) {
  const results = [];
  const seen = new Set();
  const decode = (value) =>
    cleanTitle(value.replace(/\\u003c\/?em\\u003e/gi, "").replace(/\\u002f/gi, "/").replace(/\\"/g, '"'));
  let match;
  const forward = /"title":"((?:[^"\\]|\\.)*)"[\s\S]{0,4000}?"article_url":"https?:\/\/toutiao\.com\/group\/(\d+)/g;
  while ((match = forward.exec(html)) !== null) {
    pushResult(results, seen, decode(match[1]), `https://www.toutiao.com/group/${match[2]}/`, "");
    if (results.length >= 25) break;
  }
  const backward = /"article_url":"https?:\/\/toutiao\.com\/group\/(\d+)[^"]*"[\s\S]{0,2000}?"title":"((?:[^"\\]|\\.)*)"/g;
  while ((match = backward.exec(html)) !== null) {
    pushResult(results, seen, decode(match[2]), `https://www.toutiao.com/group/${match[1]}/`, "");
    if (results.length >= 25) break;
  }
  if (results.length > 0) return results;
  return parseGeneric(html, ["toutiao.com", "zjurl.cn", "bytedance.com", "snssdk.com", "ixigua.com"]);
}



// index.js 的 parseTimeRange 给出 { days } / { after }；SERP 站点只认固定档位。
function timeBucket(timeRange) {
  const days = Number(timeRange?.days);
  if (!Number.isFinite(days) || days <= 0) {
    if (timeRange?.after) return "y";
    return null;
  }
  if (days <= 1) return "h";
  if (days <= 7) return "w";
  if (days <= 30) return "m";
  return "y";
}

const DAYS_BY_BUCKET = { h: 1, d: 1, w: 7, m: 30, y: 365 };

function withTime(url, kind, timeRange) {
  if (!kind || !timeRange) return url;
  const bucket = timeBucket(timeRange);
  if (bucket === null) return url;
  const sep = url.includes("?") ? "&" : "?";
  switch (kind) {

    case "bing":
      return `${url}${sep}qft=+filterui:age-lt${(DAYS_BY_BUCKET[bucket] ?? 7) * 1440}`;
    default:
      return url;
  }
}

/** Anti-bot / captcha pages. Mirrors the list in multi-search-engine, plus the
 *  Chinese interstitial wording 360 and Sogou actually serve. */
export const BLOCK_MARKERS = [
  /\bcaptcha\b/i,
  /unusual traffic/i,
  /are you a robot/i,
  /verify you are human/i,
  /访问异常/,
  /安全验证/,
  /验证码/,
  /人机校/,
  /请开启\s*javascript/i,
  /enable javascript/i,
];

/**
 * Engine registry. `region` is used by the settings UI; `timeFilter` picks the
 * time-range URL convention for engines that support one.
 */
export const SERP_ENGINES = [
  {
    id: "baidu-html",
    label: "百度 (HTML)",
    region: "cn",
    acceptLanguage: "zh-CN,zh;q=0.9",
    url: (q) => `https://www.baidu.com/s?wd=${encodeURIComponent(q)}&rn=20`,
    parse: parseBaidu,
  },
  {
    id: "so360",
    label: "360 搜索",
    region: "cn",
    acceptLanguage: "zh-CN,zh;q=0.9",
    timeFilter: "bing",
    url: (q) => `https://www.so.com/s?q=${encodeURIComponent(q)}`,
    parse: parseSo360,
  },
  {
    id: "sogou",
    label: "搜狗",
    region: "cn",
    acceptLanguage: "zh-CN,zh;q=0.9",
    timeFilter: "bing",
    url: (q) => `https://www.sogou.com/web?query=${encodeURIComponent(q)}`,
    parse: parseSogou,
  },
  {
    id: "wechat",
    label: "微信文章 (搜狗)",
    region: "cn",
    acceptLanguage: "zh-CN,zh;q=0.9",
    url: (q) => `https://wx.sogou.com/weixin?type=2&query=${encodeURIComponent(q)}`,
    parse: parseWechat,
    // 结果链是单次签名跳转，预先解开会烧掉 token 并触发反爬页，见 resolveSignedLinks 注释
    resolveRedirect: false,
  },
  {
    id: "toutiao",
    label: "今日头条",
    region: "cn",
    acceptLanguage: "zh-CN,zh;q=0.9",
    url: (q) => `https://so.toutiao.com/search?keyword=${encodeURIComponent(q)}`,
    parse: parseToutiao,
  },
];

export const SERP_ENGINE_IDS = SERP_ENGINES.map((engine) => engine.id);

/** Set form — index.js uses it to keep this family out of the automatic chain. */
export const SERP_FAMILY = new Set(SERP_ENGINE_IDS);

/** Engines that honour a time range, for TIME_ENGINES bookkeeping in index.js. */
export const SERP_TIME_ENGINES = SERP_ENGINES.filter((engine) => Boolean(engine.timeFilter)).map(
  (engine) => engine.id
);

export function isSerpEngine(engineId) {
  return SERP_FAMILY.has(engineId);
}

export function findSerpEngine(engineId) {
  return SERP_ENGINES.find((engine) => engine.id === engineId);
}

async function fetchSerpPage(engine, url, { timeoutMs, signal }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort, { once: true });
  let response;
  try {
    response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": SERP_UA,
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": engine.acceptLanguage ?? "en-US,en;q=0.9",
        "cache-control": "no-cache",
      },
    });
  } catch (error) {
    if (signal?.aborted) throw new Error("search aborted");
    const aborted = error?.name === "AbortError";
    throw new Error(
      aborted
        ? `${engine.label} timed out after ${timeoutMs}ms (timeout)`
        : `${engine.label} connection error: ${error?.message ?? error}`
    );
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
  const html = await response.text();
  if (!response.ok) {
    if (response.status === 403 || response.status === 429) {
      throw new Error(`${engine.label} is rate-limited (HTTP ${response.status}) (bot-wall)`);
    }
    throw new Error(`${engine.label} HTTP ${response.status} from ${url.split("?")[0]}`);
  }
  return html;
}

/**
 * 搜狗系（sogou / wechat）的结果链接是签名中间页 `/link?url=…&token=…`，用户点开虽然能跳，
 * 但放进 citations、跨引擎去重、日志里都看不出真实站点。这里用 redirect:manual 只取 302 的
 * Location 换回真实 URL；解不出来就保留原链（不阻塞、不报错）。
 */
const REDIRECT_LINK_HOSTS = new Set(["weixin.sogou.com", "www.sogou.com", "sogou.com", "www.so.com", "so.com"]);

function isSignedRedirectLink(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    return REDIRECT_LINK_HOSTS.has(u.hostname) && u.pathname === "/link";
  } catch {
    return false;
  }
}

async function resolveSignedLink(url, timeoutMs, signal) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    const response = await fetch(url, {
      redirect: "manual",
      signal: controller.signal,
      headers: { "user-agent": SERP_UA, accept: "text/html,*/*" },
    });
    // 中间页的响应体没有用，立刻丢弃，避免占用连接
    try {
      await response.body?.cancel();
    } catch {
      /* ignore */
    }
    const location = response.headers.get("location");
    if (!location) return null;
    const next = new URL(location, url);
    if (next.protocol !== "http:" && next.protocol !== "https:") return null;
    // 搜狗会把你跳到反爬页（antispider）而不是文章页；这不是真实地址，保留原链更好
    if (/antispider/i.test(next.pathname) || /antispider/i.test(next.hostname)) return null;
    if (isSignedRedirectLink(next.toString())) return null; // 又回到中间页，放弃
    return next.toString();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

async function resolveSignedLinks(sources, { timeoutMs, signal, resolveRedirect = true }) {
  if (!resolveRedirect) return;
  const pending = sources.filter((source) => isSignedRedirectLink(source.url));
  if (pending.length === 0) return;
  const budget = Math.max(500, Math.min(2500, Math.floor(timeoutMs / 2)));
  // 最多解 6 条：再多也只是多花时间，超出部分保留原链
  await Promise.all(
    pending.slice(0, 6).map(async (source) => {
      const resolved = await resolveSignedLink(source.url, budget, signal);
      if (resolved) source.url = resolved;
    })
  );
}

/**
 * Fetch one HTML SERP and return structured sources.
 *
 * Returns `{ sources, truncated }` (the shape `runEngineTest` expects) or
 * throws an Error whose message classifies into bot-wall / transient /
 * invalid-response by `classifyFailure()` in index.js.
 */
export async function searchSerpEngine(engineId, query, options = {}) {
  const engine = findSerpEngine(engineId);
  if (!engine) throw new Error(`unknown serp engine: ${engineId}`);
  const q = String(query ?? "").trim();
  if (q.length === 0) throw new Error("query is required");

  const limit = Math.min(Math.max(Number(options.maxResults) || 10, 1), 25);
  const timeoutMs = Math.min(Math.max(Number(options.timeoutMs) || DEFAULT_TIMEOUT_MS, 1000), 20000);
  const url = withTime(engine.url(q), engine.timeFilter, options.timeRange);
  const html = await fetchSerpPage(engine, url, { timeoutMs, signal: options.signal });

  const scanned = html.slice(0, 20000);
  if (BLOCK_MARKERS.some((marker) => marker.test(scanned))) {
    throw new Error(`${engine.label} is showing an anti-bot challenge (captcha, bot-wall) — try another engine`);
  }

  let parsed;
  try {
    parsed = engine.parse(html) ?? [];
  } catch (error) {
    throw new Error(`${engine.label} returned an invalid response (parse failed: ${error?.message ?? error})`);
  }

  const sources = [];
  const seen = new Set();
  for (const result of parsed) {
    const key = normalizeUrlForDedupe(result.url);
    if (seen.has(key)) continue;
    seen.add(key);
    if (!result.title || result.title.length < 2) continue;
    sources.push({ title: result.title, url: result.url, snippet: result.snippet ?? "" });
    if (sources.length >= limit) break;
  }
  if (sources.length > 0) {
    await resolveSignedLinks(sources, {
      timeoutMs,
      signal: options.signal,
      // wechat 的 /link?url=…&token=… 是单次签名：预先访问会立刻跳反爬页并把 token 烧掉，
      // 用户点开时反而打不开了，所以对 it 只保留原链。
      resolveRedirect: engine.resolveRedirect !== false,
    });
  }
  if (sources.length === 0) {
    // Not an exception: an empty page might just be a weird layout. index.js
    // retries once and then reports "returned 0 results".
    return { sources: [], truncated: false };
  }
  return { sources, truncated: parsed.length > limit };
}
