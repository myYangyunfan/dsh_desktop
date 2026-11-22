// SpecStream Search API.
// GET https://api.specstream.ai/v1/web-search?q=...&num=... with a Bearer key;
// billed per search, so this engine is keyed and stays explicit-only (never in the default fallback chain).
import { uniqueSources } from "./shared.js";

const SPECSTREAM_URL = "https://api.specstream.ai/v1/web-search";
// Up to 10 results is one search at the base price; more results cost more.
const MAX_RESULTS = 10;

function specstreamErrorMessage(status, detail) {
  let upstream = "";
  try {
    upstream = JSON.parse(detail)?.error?.message ?? "";
  } catch {}
  const suffix = upstream ? `: ${String(upstream).slice(0, 200)}` : "";
  if (status === 401) {
    return "SpecStream API key is invalid (HTTP 401); update it on the Free Search page";
  }
  if (status === 402) return `SpecStream account has insufficient balance (HTTP 402)${suffix}`;
  if (status === 403) return `SpecStream API key may not run this search (HTTP 403)${suffix}`;
  return `SpecStream API error (HTTP ${status})${suffix}`;
}

function publishedDate(value) {
  const text = String(value ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : "";
}

export async function searchSpecStream(query, maxResults, apiKey, signal) {
  if (!apiKey) throw new Error("SpecStream search requires SPECSTREAM_API_KEY");
  const limit = Math.min(Math.max(Number(maxResults) || 10, 1), MAX_RESULTS);
  const url = `${SPECSTREAM_URL}?${new URLSearchParams({ q: query, num: String(limit) })}`;

  let response;
  try {
    response = await fetch(url, {
      method: "GET",
      redirect: "error",
      headers: {
        authorization: `Bearer ${apiKey}`,
        accept: "application/json",
        "user-agent": "deepseek-harness/free-search",
      },
      signal: AbortSignal.any([...(signal !== undefined ? [signal] : []), AbortSignal.timeout(30000)]),
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    if (error?.name === "TimeoutError") throw new Error("SpecStream request timed out");
    throw new Error(`SpecStream request failed: ${error?.message ?? String(error)}`);
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(specstreamErrorMessage(response.status, detail));
  }

  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error("SpecStream returned an invalid JSON response");
  }

  const items = Array.isArray(data?.data?.sources) ? data.data.sources : [];
  const sources = items
    .map((item) => {
      const link = String(item?.url ?? "").trim();
      if (!link) return null;
      const snippet = String(item?.snippet ?? "").trim();
      const date = publishedDate(item?.published);
      return {
        url: link,
        ...(item?.title ? { title: String(item.title) } : {}),
        ...(snippet ? { snippet } : {}),
        ...(date ? { publishedAt: date } : {}),
      };
    })
    .filter(Boolean);

  return { sources: uniqueSources(sources, limit), truncated: false };
}
