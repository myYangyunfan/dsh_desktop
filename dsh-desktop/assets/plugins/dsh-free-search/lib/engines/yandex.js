// Yandex Search API (official, paid). REST returns Base64-encoded XML in
// rawData; the engine decodes it and maps <doc> entries to the common shape.
import { stripTags, uniqueSources } from "./shared.js";

const YANDEX_URL = "https://searchapi.api.cloud.yandex.net/v2/web/search";
const MAX_RESULTS = 50;

export const YANDEX_SEARCH_TYPES = ["auto", "ru", "tr", "com", "kk", "be", "uz"];

const SEARCH_TYPE_BY_LANG = {
  ru: "SEARCH_TYPE_RU",
  tr: "SEARCH_TYPE_TR",
  kk: "SEARCH_TYPE_KK",
  be: "SEARCH_TYPE_BE",
  uz: "SEARCH_TYPE_UZ",
};

const PERIODS = [
  { maxDays: 1, period: "PERIOD_DAY" },
  { maxDays: 14, period: "PERIOD_2_WEEKS" },
  { maxDays: 31, period: "PERIOD_MONTH" },
];

export function normalizeYandexSearchType(value, lang = "en") {
  const choice = String(value ?? "").trim().toLowerCase();
  if (choice !== "" && choice !== "auto" && YANDEX_SEARCH_TYPES.includes(choice)) {
    return `SEARCH_TYPE_${choice.toUpperCase()}`;
  }
  return SEARCH_TYPE_BY_LANG[String(lang ?? "").toLowerCase()] ?? "SEARCH_TYPE_COM";
}

export function yandexPeriod(timeRange) {
  if (!timeRange) return undefined;
  const days = timeRange.after
    ? Math.max(1, Math.ceil((Date.now() - Date.parse(`${timeRange.after}T00:00:00Z`)) / 86_400_000))
    : Number(timeRange.days);
  if (!Number.isFinite(days) || days <= 0) return undefined;
  return PERIODS.find((entry) => days <= entry.maxDays)?.period;
}

function familyMode(safeSearch) {
  if (safeSearch === "strict") return "FAMILY_MODE_STRICT";
  if (safeSearch === "moderate") return "FAMILY_MODE_MODERATE";
  if (safeSearch === "off") return "FAMILY_MODE_NONE";
  return undefined;
}

function yandexErrorMessage(status, detail) {
  let upstream = "";
  try {
    const parsed = JSON.parse(detail);
    upstream = parsed?.message ?? parsed?.error?.message ?? "";
  } catch {}
  const suffix = upstream ? `: ${String(upstream).slice(0, 200)}` : "";
  if (status === 401 || status === 403) {
    return `Yandex API key or folder is invalid, or the key lacks the search-api.webSearch.user role (HTTP ${status})${suffix}`;
  }
  if (status === 429) return `Yandex quota/rate limit exceeded (HTTP 429)${suffix}`;
  if (status === 400) return `Yandex search request failed (HTTP 400)${suffix} - check yandexFolderId and the query`;
  return `Yandex API error (HTTP ${status})${suffix}`;
}

function xmlText(raw) {
  return stripTags(String(raw ?? "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")).trim();
}

function publishedDate(raw) {
  const text = String(raw ?? "").trim();
  const match = text.match(/^(\d{4})(\d{2})(\d{2})(?:T|$)/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : "";
}

export function parseYandexXml(xml) {
  const sources = [];
  const docs = String(xml ?? "").matchAll(/<doc(?:\s[^>]*)?>([\s\S]*?)<\/doc>/g);
  for (const match of docs) {
    const block = match[1];
    const url = xmlText(block.match(/<url>([\s\S]*?)<\/url>/)?.[1]);
    if (!url) continue;
    const title = xmlText(block.match(/<title>([\s\S]*?)<\/title>/)?.[1]);
    const passages = [...block.matchAll(/<passage>([\s\S]*?)<\/passage>/g)]
      .map((entry) => xmlText(entry[1]))
      .filter(Boolean);
    const snippet = passages.slice(0, 3).join(" ").slice(0, 1000);
    const date = publishedDate(xmlText(block.match(/<modtime>([\s\S]*?)<\/modtime>/)?.[1]));
    sources.push({
      url,
      ...(title ? { title } : {}),
      ...(snippet ? { snippet } : {}),
      ...(date ? { publishedAt: date } : {}),
    });
  }
  return sources;
}

export async function searchYandex(query, maxResults, apiKey, folderId, options = {}, timeRange, signal) {
  if (!apiKey) throw new Error("Yandex search requires YANDEX_API_KEY");
  if (!folderId) throw new Error("Yandex search requires a folder ID (yandexFolderId)");
  const limit = Math.min(Math.max(Number(maxResults) || 10, 1), MAX_RESULTS);
  const searchType = normalizeYandexSearchType(options.searchType, options.lang);
  const family = familyMode(options.safeSearch);
  const period = yandexPeriod(timeRange);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort);

  let response;
  try {
    response = await fetch(YANDEX_URL, {
      method: "POST",
      redirect: "error",
      headers: {
        authorization: `Api-Key ${apiKey}`,
        "content-type": "application/json",
        accept: "application/json",
        "user-agent": "deepseek-harness/free-search",
      },
      body: JSON.stringify({
        query: {
          searchType,
          queryText: String(query),
          ...(family === undefined ? {} : { familyMode: family }),
        },
        groupSpec: {
          groupMode: "GROUP_MODE_FLAT",
          groupsOnPage: String(limit),
          docsInGroup: "1",
        },
        maxPassages: "3",
        ...(options.region ? { region: String(options.region) } : {}),
        folderId,
        responseFormat: "FORMAT_XML",
        ...(period === undefined ? {} : { period }),
      }),
      signal: controller.signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    if (error?.name === "AbortError") throw new Error("Yandex request timed out");
    throw new Error(`Yandex request failed: ${error?.message ?? String(error)}`);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(yandexErrorMessage(response.status, detail));
  }

  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error("Yandex returned an invalid JSON response");
  }
  if (typeof data?.rawData !== "string" || data.rawData === "") {
    throw new Error("Yandex response has no rawData");
  }

  let xml;
  try {
    xml = Buffer.from(data.rawData, "base64").toString("utf8");
  } catch {
    throw new Error("Yandex rawData is not valid Base64");
  }
  return { sources: uniqueSources(parseYandexXml(xml), limit), truncated: false };
}
