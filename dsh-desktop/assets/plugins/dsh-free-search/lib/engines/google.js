// Google Programmable Search (Custom Search JSON API).
// Needs both an API key (GOOGLE_CSE_API_KEY / settings googleCseApiKey) and the
// search engine ID (cx / config googleCseId). Free tier: 100 queries/day.
import { uniqueSources } from "./shared.js";

const GOOGLE_CSE_URL = "https://www.googleapis.com/customsearch/v1";
const MAX_RESULTS = 30;
const PAGE_SIZE = 10;

const HL_BY_LANG = {
  zh: "zh-CN",
  en: "en",
  ru: "ru",
  ja: "ja",
  de: "de",
  fr: "fr",
  es: "es",
  ko: "ko",
};

/** Map our normalized timeRange to the CSE dateRestrict grammar. */
export function googleDateRestrict(timeRange) {
  if (!timeRange) return "";
  if (timeRange.after) return "";
  const days = Number(timeRange.days);
  if (!Number.isFinite(days) || days <= 0) return "";
  if (days <= 31) return `d${Math.max(1, Math.ceil(days))}`;
  if (days <= 365) return `m${Math.max(1, Math.ceil(days / 30))}`;
  return `y${Math.max(1, Math.ceil(days / 365))}`;
}

function googleErrorMessage(status, detail) {
  let upstream = "";
  try {
    upstream = JSON.parse(detail)?.error?.message ?? "";
  } catch {}
  const suffix = upstream ? `: ${upstream.slice(0, 200)}` : "";
  if (status === 400) {
    return `Google Custom Search request failed (HTTP 400)${suffix} - check GOOGLE_CSE_API_KEY and googleCseId`;
  }
  if (status === 401 || status === 403) {
    return `Google API key is invalid, or the Custom Search API is not enabled for it (HTTP ${status})${suffix}`;
  }
  if (status === 429) return `Google Custom Search quota exceeded (HTTP 429)${suffix}`;
  return `Google API error (HTTP ${status})${suffix}`;
}

export async function searchGoogle(query, maxResults, apiKey, cseId, timeRange, options, signal) {
  if (!apiKey) throw new Error("Google search requires GOOGLE_CSE_API_KEY");
  if (!cseId) throw new Error("Google Custom Search requires a Programmable Search Engine ID (googleCseId)");
  const limit = Math.min(Math.max(Number(maxResults) || 10, 1), MAX_RESULTS);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort);

  try {
    const sources = [];
    for (let start = 1; start <= limit; start += PAGE_SIZE) {
      const num = Math.min(PAGE_SIZE, limit - sources.length);
      const params = new URLSearchParams({
        key: apiKey,
        cx: cseId,
        q: query,
        num: String(num),
        start: String(start),
        fields: "items(title,link,snippet,pagemap/metatags)",
      });
      const hl = HL_BY_LANG[String(options?.lang ?? "").toLowerCase()];
      if (hl) params.set("hl", hl);
      if (options?.safeSearch && options.safeSearch !== "off") params.set("safe", "active");
      const dateRestrict = googleDateRestrict(timeRange);
      if (dateRestrict) params.set("dateRestrict", dateRestrict);

      let response;
      try {
        response = await fetch(`${GOOGLE_CSE_URL}?${params}`, {
          signal: controller.signal,
          redirect: "error",
        });
      } catch (error) {
        if (signal?.aborted) throw error;
        throw new Error(`Google request failed: ${error?.message ?? String(error)}`);
      }
      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(googleErrorMessage(response.status, detail));
      }
      const data = await response.json();
      const items = Array.isArray(data.items) ? data.items : [];
      for (const item of items) {
        if (!item || typeof item.link !== "string" || !item.link) continue;
        const metatags = item.pagemap?.metatags?.[0] ?? {};
        const published = metatags["article:published_time"] ?? metatags["og:updated_time"] ?? "";
        sources.push({
          url: item.link,
          ...(item.title ? { title: String(item.title) } : {}),
          ...(item.snippet ? { snippet: String(item.snippet) } : {}),
          ...(typeof published === "string" && /^\d{4}-\d{2}-\d{2}/.test(published)
            ? { publishedAt: published.slice(0, 10) }
            : {}),
        });
      }
      if (items.length < num) break;
    }
    return { sources: uniqueSources(sources, limit), truncated: false };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}
