// Brave Search API engine (BRAVE_API_KEY): GET /res/v1/web/search, authenticated with
// the X-Subscription-Token header. Queries are billed ($5 per 1,000) against a monthly
// free allowance and there is no keyless tier, so a missing key skips the engine
// (EngineSkip at the call site) instead of failing the whole search.
import { stripTags, uniqueSources } from "./shared.js";

export const BRAVE_URL = "https://api.search.brave.com/res/v1/web/search";
// Per-request budget: the fallback chain must not stall on an unreachable egress.
export const BRAVE_TIMEOUT_MS = 15000;

/** Time filter: Brave takes pd/pw/pm/py, or an explicit `YYYY-MM-DDtoYYYY-MM-DD` range. */
export function braveFreshness(timeRange) {
  if (!timeRange) return undefined;
  if (typeof timeRange.after === "string" && timeRange.after) {
    const end = new Date().toISOString().slice(0, 10);
    return `${timeRange.after}to${end}`;
  }
  const days = Number(timeRange.days);
  if (!Number.isFinite(days) || days <= 0) return undefined;
  if (days <= 1) return "pd";
  if (days <= 7) return "pw";
  if (days <= 31) return "pm";
  return "py";
}

const RELATIVE_AGE = /^(?:about\s+|over\s+)?(\d+)\s*(second|minute|hour|day|week|month|year)s?\s+ago$/i;
const ISO_DATE = /^(\d{4}-\d{2}-\d{2})/;

/** Local calendar date, so an absolute text date never slips a day across time zones. */
const isoDate = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

function relativeDate(amount, unit, now) {
  const date = new Date(now);
  if (unit === "second") date.setUTCSeconds(date.getUTCSeconds() - amount);
  else if (unit === "minute") date.setUTCMinutes(date.getUTCMinutes() - amount);
  else if (unit === "hour") date.setUTCHours(date.getUTCHours() - amount);
  else if (unit === "day") date.setUTCDate(date.getUTCDate() - amount);
  else if (unit === "week") date.setUTCDate(date.getUTCDate() - 7 * amount);
  else if (unit === "month") date.setUTCMonth(date.getUTCMonth() - amount);
  else date.setUTCFullYear(date.getUTCFullYear() - amount);
  return date.toISOString().slice(0, 10);
}

/**
 * Published date in ISO form. Brave exposes two fields: `page_age` (ISO-8601) and `age`
 * (human text such as "3 days ago" or "Aug 5, 2024"). Both normalise to YYYY-MM-DD so
 * `publishedAt` matches the other engines; unparseable text stays empty rather than
 * leaking raw prose downstream.
 */
export function bravePublishedAt(item, now = Date.now()) {
  const pageAge = typeof item?.page_age === "string" ? item.page_age.trim() : "";
  const fromPageAge = ISO_DATE.exec(pageAge);
  if (fromPageAge) return fromPageAge[1];
  const age = typeof item?.age === "string" ? item.age.trim() : "";
  if (!age) return "";
  const relative = RELATIVE_AGE.exec(age);
  if (relative) return relativeDate(Number(relative[1]), relative[2].toLowerCase(), now);
  const parsed = Date.parse(age);
  return Number.isFinite(parsed) ? isoDate(new Date(parsed)) : "";
}

/** Response parser (pure, so it can be asserted offline). Brave puts hits in web.results[]. */
export function parseBraveResponse(text, now = Date.now()) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Brave returned malformed JSON");
  }
  const rows = data?.web?.results;
  if (!Array.isArray(rows)) return [];
  return rows.map((item) => ({
    title: stripTags(String(item?.title ?? "")),
    url: String(item?.url ?? ""),
    snippet: stripTags(String(item?.description ?? "")),
    publishedAt: bravePublishedAt(item, now),
  }));
}

export async function searchBrave(query, maxResults, apiKey, timeRange, signal) {
  if (!apiKey) throw new Error("Brave search requires BRAVE_API_KEY");
  const count = Math.min(Math.max(maxResults ?? 10, 1), 20); // Brave caps `count` at 20
  const params = new URLSearchParams({ q: String(query).slice(0, 400), count: String(count) });
  const freshness = braveFreshness(timeRange);
  if (freshness !== undefined) params.set("freshness", freshness);

  const response = await fetch(`${BRAVE_URL}?${params.toString()}`, {
    method: "GET",
    redirect: "error",
    headers: {
      accept: "application/json",
      "x-subscription-token": apiKey,
      "user-agent": "deepseek-harness/free-search",
    },
    signal: AbortSignal.any([...(signal !== undefined ? [signal] : []), AbortSignal.timeout(BRAVE_TIMEOUT_MS)]),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    if (response.status === 401 || response.status === 403) {
      throw new Error(`Brave auth failed (HTTP ${response.status}) - check BRAVE_API_KEY (brave.com/search/api)`);
    }
    if (response.status === 429) {
      throw new Error("Brave rate limited (HTTP 429) - free plan is $5 credit/month (~1000 queries)");
    }
    throw new Error(`Brave API error (HTTP ${response.status}): ${detail.slice(0, 200)}`);
  }
  const sources = uniqueSources(parseBraveResponse(await response.text())).slice(0, count);
  return { sources };
}
