// fetch_upstream：web_fetch 质量链的云端抓取层（自 research.js 摘取，原生通道版专用）。
// 依赖面：仅 node:https。fetch_provider.js 从这里拿 callExa / callFirecrawl / callCrawl4ai。
// 注意：不用全局 fetch(undici) 访问 api.crawl4ai.com——其 Pingora 网关会空 401 拦截 undici 特征。

import http from "node:http";
import https from "node:https";
import { agentForUrl } from "./proxy.js";

// ---------- 受控替身注入点（测试基建；默认全 null = 生产直连真实服务，行为不变） ----------
export const CONTROLLED_STUBS = { exa: null, firecrawl: null, crawl4ai: null, deepseekFetch: null };

export function htmlToText(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();
}

// ---------- 云端抓取（node:https，保留头大小写；undici 会被 crawl4ai 网关拦） ----------

export function httpsJson(method, url, { headers = {}, body, timeoutMs = 30000, signal } = {}) {
  return jsonRequest(method, url, { headers, body, timeoutMs, signal });
}

// 自定义 DeepSeek 兼容网关常在本机（http://127.0.0.1:3000），所以这里按目标协议
// 选 http/https；代理只在目标不是环回时生效（proxy.js 的规则）。
export function jsonRequest(method, url, { headers = {}, body, timeoutMs = 30000, signal } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    // 云端服务同样可能只能经代理到达（企业出网/受限网络）：沿用环境里的代理配置。
    const agent = agentForUrl(url);
    const transport = u.protocol === "http:" ? http : https;
    const port = u.port || (u.protocol === "http:" ? 80 : 443);
    const req = transport.request(
      { hostname: u.hostname, port, path: u.pathname + u.search, method, headers, timeout: timeoutMs, ...(agent ? { agent } : {}) },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve({ status: res.statusCode, text: Buffer.concat(chunks).toString("utf8"), location: res.headers.location || "" }));
      }
    );
    req.on("timeout", () => req.destroy(new Error(`timeout after ${timeoutMs}ms`)));
    req.on("error", reject);
    if (signal) {
      const onAbort = () => req.destroy(new Error("aborted"));
      if (signal.aborted) onAbort();
      else signal.addEventListener("abort", onAbort, { once: true });
    }
    if (body) req.write(body);
    req.end();
  });
}

/** firecrawl /v2/scrape：返回 markdown。undici 特征对其无碍，但统一走 httpsJson。 */
export async function fetchViaFirecrawl(url, apiKey, signal) {
  const r = await httpsJson("POST", "https://api.firecrawl.dev/v2/scrape", {
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ url, formats: ["markdown"] }),
    signal,
  });
  if (r.status !== 200) throw new Error(`firecrawl HTTP ${r.status}`);
  const data = JSON.parse(r.text);
  const md = data?.data?.markdown;
  if (!md) throw new Error("firecrawl: no markdown");
  return md;
}

/** crawl4ai POST /scrape（注意：此部署无 /v1 前缀；认证头 X-API-Key）。 */
export async function fetchViaCrawl4ai(url, apiKey, signal) {
  const r = await httpsJson("POST", "https://api.crawl4ai.com/scrape", {
    headers: { "X-API-Key": apiKey, "Content-Type": "application/json", "User-Agent": "dsh-free-search/0.8" },
    body: JSON.stringify({ url }),
    signal,
  });
  if (r.status === 429) throw new Error("crawl4ai rate-limited (community plan)");
  if (r.status !== 200) throw new Error(`crawl4ai HTTP ${r.status}`);
  const data = JSON.parse(r.text);
  const content = data?.markdown || (data?.html ? htmlToText(data.html) : "");
  if (!content) throw new Error("crawl4ai: empty content");
  return content;
}

/** DeepSeek 兼容抓取端点（POST <base>/fetch，body {url}，返回 {content}）。
 * 用于 #124：自建网关往往同时提供 /search 与 /fetch，用户不想再单独配官方插件。
 * base（如 http://127.0.0.1:3000/v1）或完整地址都行；留空返回 ""（不启用该层）。 */
export function deepseekFetchEndpoint(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("DeepSeek fetch URL is invalid");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("DeepSeek fetch URL must be http(s)");
  }
  const path = url.pathname.replace(/\/+$/, "");
  url.pathname = path === "" ? "/fetch" : path.endsWith("/fetch") ? path : `${path}/fetch`;
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

export async function fetchViaDeepSeek(url, apiKey, signal, baseUrl) {
  const endpoint = deepseekFetchEndpoint(baseUrl);
  if (!endpoint) throw new Error("deepseek fetch: no endpoint");
  const r = await jsonRequest("POST", endpoint, {
    headers: {
      ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": "deepseek-harness/free-search",
    },
    body: JSON.stringify({ url }),
    signal,
  });
  if (r.status === 401 || r.status === 403) throw new Error(`deepseek fetch: auth rejected (HTTP ${r.status})`);
  if (r.status === 429) throw new Error("deepseek fetch: rate-limited (HTTP 429)");
  if (r.status !== 200) throw new Error(`deepseek fetch HTTP ${r.status}`);
  let data;
  try {
    data = JSON.parse(r.text);
  } catch {
    throw new Error("deepseek fetch: invalid JSON");
  }
  const content = typeof data?.content === "string" ? data.content : "";
  if (!content.trim()) throw new Error("deepseek fetch: empty content");
  return content;
}

/** exa POST /contents（$1/1000 页）：{ids:[url], text:true} → results[].text（清洗正文 markdown）。
 * 端点形状（https://exa.ai/docs/reference/get-contents，2026-10-05 核实）：
 *  - 认证 Authorization: Bearer（x-api-key 亦可）；ids 与 urls 二选一等价（ids 向后兼容）。
 *  - text 布尔/对象均可（对象形如 {maxCharacters}；此处取全文不加限）。
 *  - 响应 results[]（含 text）+ statuses[]（每 URL 成败，失败带 error.tag/httpStatusCode）。
 * 与 fetch_provider 质量链共用：T2 层。 */
export async function fetchViaExa(url, apiKey, signal) {
  const r = await httpsJson("POST", "https://api.exa.ai/contents", {
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ ids: [url], text: true }),
    signal,
  });
  if (r.status !== 200) throw new Error(`exa HTTP ${r.status}`);
  const data = JSON.parse(r.text);
  const st = (data?.statuses ?? []).find((s) => s.id === url) ?? data?.statuses?.[0];
  if (st && st.status !== "success") throw new Error(`exa: status ${st.status}${st.error?.httpStatusCode ? ` (HTTP ${st.error.httpStatusCode})` : ""}`);
  const hit = (data?.results ?? []).find((x) => x.id === url || x.url === url) ?? data?.results?.[0];
  const text = hit?.text;
  if (!text) throw new Error("exa: no text");
  return text;
}

export const callFirecrawl = (u, k, s) => (CONTROLLED_STUBS.firecrawl ?? fetchViaFirecrawl)(u, k, s);
export const callCrawl4ai = (u, k, s) => (CONTROLLED_STUBS.crawl4ai ?? fetchViaCrawl4ai)(u, k, s);
export const callExa = (u, k, s) => (CONTROLLED_STUBS.exa ?? fetchViaExa)(u, k, s);
export const callDeepSeekFetch = (u, k, s, base) => (CONTROLLED_STUBS.deepseekFetch ?? fetchViaDeepSeek)(u, k, s, base);
