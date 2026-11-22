// Baidu Qianfan AI Search engine.
// web_search has its own 50/day free quota; when it is exhausted, the
// chat/completions endpoint has a separate 100/day quota and accepts the same
// body plus stream:false, returning the same references shape.
import { uniqueSources } from "./shared.js";

const BAIDU_WEB_URL = "https://qianfan.baidubce.com/v2/ai_search/web_search";
const BAIDU_CHAT_URL = "https://qianfan.baidubce.com/v2/ai_search/chat/completions";

function baiduError(message, { status, code } = {}) {
  const error = new Error(message);
  if (status !== undefined) error.status = status;
  if (code !== undefined) error.baiduCode = code;
  return error;
}

function shouldFallback(error) {
  if (!(error instanceof Error)) return false;
  return error.status === 403 || error.status === 429 || error.baiduCode !== undefined;
}

async function postBaidu(url, body, apiKey, signal) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort);
  try {
    return await fetch(url, {
      method: "POST",
      redirect: "error",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
        "X-Appbuilder-From": "openclaw",
        "user-agent": "deepseek-harness/free-search",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error(`Baidu search request failed: ${error?.message ?? String(error)}`);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

async function parseBaiduResponse(response, maxResults) {
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    if (response.status === 401 || response.status === 403) {
      throw baiduError(`Baidu API key is invalid (HTTP ${response.status}) - update it in Settings > Plugins > Free Search`, {
        status: response.status,
      });
    }
    throw baiduError(`Baidu API error (HTTP ${response.status}): ${detail.slice(0, 200)}`, { status: response.status });
  }

  const results = await response.json();
  if (results.code) {
    throw baiduError(`Baidu API error: ${results.message ?? JSON.stringify(results)}`, { code: results.code });
  }

  const sources = (results.references ?? [])
    .filter((r) => r.url)
    .map((r) => ({
      url: r.url,
      ...(r.title ? { title: String(r.title) } : {}),
      ...(r.content ? { snippet: String(r.content).slice(0, 300) } : {}),
      ...(r.date ? { publishedAt: String(r.date) } : {}),
    }));
  return { sources: uniqueSources(sources, maxResults ?? 10), truncated: false };
}

export async function searchBaidu(query, maxResults, apiKey, timeRange, signal) {
  if (!apiKey) throw new Error("Baidu search requires BAIDU_API_KEY");
  const count = Math.min(Math.max(maxResults ?? 10, 1), 50);
  const searchFilter = {};
  if (timeRange) {
    const now = new Date();
    const end = new Date(now.getTime() + 86400000).toISOString().slice(0, 10);
    let start;
    if (timeRange.after) {
      start = timeRange.after;
    } else if (timeRange.days !== undefined) {
      start = new Date(now.getTime() - timeRange.days * 86400000).toISOString().slice(0, 10);
    }
    if (start) {
      searchFilter.range = { page_time: { gte: start, lt: end } };
    }
  }

  const body = {
    messages: [{ content: query, role: "user" }],
    search_source: "baidu_search_v2",
    resource_type_filter: [{ type: "web", top_k: count }],
    search_filter: searchFilter,
  };

  let primaryError;
  try {
    const response = await postBaidu(BAIDU_WEB_URL, body, apiKey, signal);
    return await parseBaiduResponse(response, maxResults);
  } catch (error) {
    if (!shouldFallback(error)) throw error;
    primaryError = error;
  }

  try {
    const response = await postBaidu(BAIDU_CHAT_URL, { ...body, stream: false }, apiKey, signal);
    return await parseBaiduResponse(response, maxResults);
  } catch (error) {
    throw new Error(`${primaryError.message}; chat fallback: ${error?.message ?? String(error)}`);
  }
}
