// Metaso (秘塔搜索) official search API.
// POST https://metaso.cn/api/v1/search with a Bearer key; billed per call,
// so this engine is keyed and deliberately absent from the default fallback.
import { uniqueSources } from "./shared.js";

const METASO_URL = "https://metaso.cn/api/v1/search";
const MAX_RESULTS = 50;

export const METASO_SCOPES = ["webpage", "document", "scholar"];

const RESULT_ARRAYS = {
  webpage: "webpages",
  document: "documents",
  scholar: "scholars",
};

export function normalizeMetasoScope(value) {
  const scope = String(value ?? "").trim().toLowerCase();
  return METASO_SCOPES.includes(scope) ? scope : "webpage";
}

function metasoErrorMessage(status, detail) {
  let upstream = "";
  try {
    const parsed = JSON.parse(detail);
    upstream = parsed?.message ?? parsed?.error ?? "";
  } catch {}
  const suffix = upstream ? `: ${String(upstream).slice(0, 200)}` : "";
  if (status === 401) {
    return "Metaso API key is invalid (HTTP 401) - update it in Settings > Plugins > Free Search";
  }
  if (status === 402) return `Metaso account has no usable credits (HTTP 402)${suffix}`;
  if (status === 429) return `Metaso quota/rate limit exceeded (HTTP 429)${suffix}`;
  if (status === 400) return `Metaso search request failed (HTTP 400)${suffix} - check the API key and scope`;
  return `Metaso API error (HTTP ${status})${suffix}`;
}

function publishedDate(value) {
  const text = String(value ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : "";
}

export async function searchMetaso(query, maxResults, apiKey, scope, _timeRange, signal) {
  if (!apiKey) throw new Error("Metaso search requires METASO_API_KEY");
  const limit = Math.min(Math.max(Number(maxResults) || 10, 1), MAX_RESULTS);
  const normalizedScope = normalizeMetasoScope(scope);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort);

  let response;
  try {
    response = await fetch(METASO_URL, {
      method: "POST",
      redirect: "error",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
        accept: "application/json",
        "user-agent": "deepseek-harness/free-search",
      },
      body: JSON.stringify({
        q: query,
        scope: normalizedScope,
        size: limit,
        includeSummary: true,
        includeRawContent: false,
        conciseSnippet: true,
      }),
      signal: controller.signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    if (error?.name === "AbortError") throw new Error("Metaso request timed out");
    throw new Error(`Metaso request failed: ${error?.message ?? String(error)}`);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(metasoErrorMessage(response.status, detail));
  }

  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error("Metaso returned an invalid JSON response");
  }

  const items = Array.isArray(data?.[RESULT_ARRAYS[normalizedScope]]) ? data[RESULT_ARRAYS[normalizedScope]] : [];
  const sources = items
    .map((item) => {
      const url = String(item?.link ?? "").trim();
      if (!url) return null;
      const snippet = String(item?.summary ?? item?.snippet ?? "").trim();
      const date = publishedDate(item?.date);
      return {
        url,
        ...(item?.title ? { title: String(item.title) } : {}),
        ...(snippet ? { snippet } : {}),
        ...(date ? { publishedAt: date } : {}),
      };
    })
    .filter(Boolean);

  return { sources: uniqueSources(sources, limit), truncated: false };
}
