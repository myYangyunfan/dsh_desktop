// Tencent Yuanbao Search (WSA) via its API-key gateway.
// The WorkBuddy skill uses https://api.wsa.cloud.tencent.com/SearchPro with a
// Bearer key; results are JSON strings in Response.Pages.
import { uniqueSources } from "./shared.js";

const YUANBAO_URL = "https://api.wsa.cloud.tencent.com/SearchPro";
const MAX_RESULTS = 50;

export function normalizeYuanbaoMode(value) {
  const mode = Number(value);
  return mode === 1 || mode === 2 ? mode : 0;
}

export function yuanbaoTimeRange(timeRange) {
  if (!timeRange) return {};
  const now = Date.now();
  let start = null;
  if (timeRange.after) {
    const parsed = Date.parse(`${timeRange.after}T00:00:00Z`);
    if (Number.isFinite(parsed)) start = parsed;
  } else if (Number.isFinite(Number(timeRange.days)) && Number(timeRange.days) > 0) {
    start = now - Number(timeRange.days) * 86_400_000;
  }
  if (start === null) return {};
  return { FromTime: Math.floor(start / 1000), ToTime: Math.floor(now / 1000) };
}

function publishedDate(raw) {
  const text = String(raw ?? "").trim();
  if (text === "") return "";
  const normalized = text.replace(/\//g, "-");
  const match = normalized.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];
  const numeric = Number(text);
  if (Number.isFinite(numeric) && numeric > 0) {
    return new Date(numeric > 1e12 ? numeric : numeric * 1000).toISOString().slice(0, 10);
  }
  return "";
}

function parsePage(raw) {
  let page;
  try {
    page = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return null;
  }
  if (page === null || typeof page !== "object") return null;

  const vr = page.vr === true ? page.display ?? {} : null;
  const url = String((vr?.url ?? page.url ?? "")).trim();
  if (!url) return null;
  const title = String(vr?.title ?? page.title ?? "").trim();
  const snippet = String(
    vr?.passage ?? vr?.content ?? page.passage ?? page.content ?? ""
  ).trim();
  const date = publishedDate(vr?.date ?? page.date);
  return {
    url,
    ...(title ? { title } : {}),
    ...(snippet ? { snippet } : {}),
    ...(date ? { publishedAt: date } : {}),
  };
}

export function parseYuanbaoPages(pages) {
  if (!Array.isArray(pages)) return [];
  return pages.map(parsePage).filter(Boolean);
}

function yuanbaoErrorMessage(status, detail) {
  let upstream = "";
  try {
    const parsed = JSON.parse(detail);
    upstream = parsed?.Response?.Error?.Message ?? parsed?.message ?? "";
  } catch {}
  const suffix = upstream ? `: ${String(upstream).slice(0, 200)}` : "";
  if (status === 401 || status === 403) {
    return `Yuanbao API key is invalid or unauthorized (HTTP ${status})${suffix} - create one at console.cloud.tencent.com/wsapi`;
  }
  if (status === 429) return `Yuanbao quota/rate limit exceeded (HTTP 429)${suffix}`;
  return `Yuanbao API error (HTTP ${status})${suffix}`;
}

export async function searchYuanbao(query, maxResults, apiKey, options = {}, timeRange, signal) {
  if (!apiKey) throw new Error("Yuanbao search requires TENCENTCLOUD_WSA_APIKEY");
  const limit = Math.min(Math.max(Number(maxResults) || 10, 1), MAX_RESULTS);
  const mode = normalizeYuanbaoMode(options.mode);
  const site = String(options.site ?? "").trim();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort);

  const body = {
    Query: String(query),
    Mode: mode,
    ...(site ? { Site: site } : {}),
    ...yuanbaoTimeRange(timeRange),
  };

  let response;
  try {
    response = await fetch(YUANBAO_URL, {
      method: "POST",
      redirect: "error",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json; charset=utf-8",
        accept: "application/json",
        "user-agent": "deepseek-harness/free-search",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    if (error?.name === "AbortError") throw new Error("Yuanbao request timed out");
    throw new Error(`Yuanbao request failed: ${error?.message ?? String(error)}`);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(yuanbaoErrorMessage(response.status, detail));
  }

  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error("Yuanbao returned an invalid JSON response");
  }
  const result = data?.Response;
  if (result === undefined || result === null) throw new Error("Yuanbao response has no Response object");
  if (result.Error) {
    throw new Error(`Yuanbao API error: ${result.Error.Message ?? JSON.stringify(result.Error)}`);
  }

  const sources = parseYuanbaoPages(result.Pages);
  return { sources: uniqueSources(sources, limit), truncated: false };
}
