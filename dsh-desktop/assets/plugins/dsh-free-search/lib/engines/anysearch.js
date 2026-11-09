// AnySearch AI engine (anonymous tier, optional key).
import { uniqueSources, fetchHtmlWithRetry, stripTags, decodeEntities, approximateTimeRange, SEARXNG_INSTANCES, SEARXNG_TIME, ANYSEARCH_URL, EXA_MCP_URL, extractDdgUrl, MARKET_TO_LANG, LANG_PROFILES, BING_URL, DDG_HTML_URL, DDG_LITE_URL, activeAcceptLanguage, USER_AGENT, searchLanguage, configLanguage, activeOutputLanguage } from "./shared.js";

let ignoredAnysearchKey = "";

const ANYSEARCH_KEY_INVALID_NOTE_ZH = "AnySearch key 无效，本次已忽略该 key，改回免费匿名档";

const ANYSEARCH_KEY_INVALID_NOTE_EN = "AnySearch key was rejected; ignored it and used the anonymous tier";

function anysearchKeyNote() {
  return activeOutputLanguage === "zh" ? ANYSEARCH_KEY_INVALID_NOTE_ZH : ANYSEARCH_KEY_INVALID_NOTE_EN;
}

export async function searchAnysearch(query, maxResults, signal, apiKey) {
  const trimmedKey = typeof apiKey === "string" ? apiKey.trim() : "";
  // 本进程已判定无效的 key 不再发送；若配置里仍有该值，结果仍带忽略提示
  const keyIgnoredSticky = Boolean(trimmedKey) && trimmedKey === ignoredAnysearchKey;
  const sendKey = trimmedKey && !keyIgnoredSticky ? trimmedKey : "";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort);
  const doFetch = async (key) => {
    const headers = { "content-type": "application/json" };
    if (key) headers.authorization = `Bearer ${key}`;
    return await fetch(ANYSEARCH_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({ query, max_results: maxResults ?? 5 }),
      signal: controller.signal,
    });
  };
  let response;
  let keyRejected = false;
  try {
    response = await doFetch(sendKey);
    if ((response.status === 401 || response.status === 403) && sendKey) {
      ignoredAnysearchKey = sendKey;
      keyRejected = true;
      response = await doFetch("");
    }
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error(`AnySearch request failed: ${error?.message ?? String(error)}`);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
  if (response.status === 401 || response.status === 403) {
    throw new Error(keyRejected ? `${anysearchKeyNote()} (HTTP ${response.status})` : `AnySearch API error (HTTP ${response.status})`);
  }
  if (!response.ok) throw new Error(`AnySearch API error (HTTP ${response.status})`);
  const data = await response.json();
  if (data.code !== 0) throw new Error(`AnySearch API error: ${data.message ?? data.code}`);
  const results = data.data?.results ?? [];
  return {
    sources: results
      .filter((r) => r.url)
      .map((r) => ({
        url: r.url,
        ...(r.title ? { title: String(r.title) } : {}),
        ...(r.snippet ? { snippet: String(r.snippet).slice(0, 300) } : {}),
      })),
    truncated: false,
    ...(keyRejected || keyIgnoredSticky ? { content: anysearchKeyNote() } : {}),
  };
}

// Exa MCP: 匿名公开 MCP（无 key），web_search_exa 工具
