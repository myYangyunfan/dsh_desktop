// Serper.dev: Google SERP proxy. Distinct from SerpBase/Serply — the endpoint,
// the auth header (X-API-KEY, not Bearer) and the time filter (Google tbs
// syntax) all differ, so it keeps its own small module.
import { SERPER_URL, SERPER_LOCALE, approximateTimeRange, parseTimeRange, uniqueSources } from "./shared.js";

// Google's own tbs bucket for fixed ranges (same syntax Serper forwards).
const SERPER_TBS = { day: "qdr:d", week: "qdr:w", month: "qdr:m", year: "qdr:y" };

// Serper accepts Google's absolute window as cdr:1,cd_min:M/D/YYYY.
function serperDate(date) {
  const [y, m, d] = String(date).split("-").map((n) => parseInt(n, 10));
  return `${m}/${d}/${y}`;
}

function serperTbs(timeRange) {
  if (!timeRange) return "";
  const parsed = parseTimeRange(timeRange) ?? timeRange;
  if (parsed?.after) return `cdr:1,cd_min:${serperDate(parsed.after)}`;
  if (typeof parsed?.days === "number" && parsed.days > 0) {
    const bucket = SERPER_TBS[approximateTimeRange(parsed.days)];
    return bucket ?? "";
  }
  return "";
}

export async function searchSerper(query, maxResults, apiKey, options = {}, signal) {
  if (!apiKey) throw new Error("Serper search requires SERPER_API_KEY");
  const locale = SERPER_LOCALE[options?.lang] ?? SERPER_LOCALE.en;
  const body = {
    q: query,
    num: Math.min(Math.max(maxResults ?? 10, 1), 100),
    hl: locale.hl,
    gl: locale.gl,
  };
  const tbs = serperTbs(options?.timeRange);
  if (tbs) body.tbs = tbs;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort);
  let response;
  try {
    response = await fetch(SERPER_URL, {
      method: "POST",
      redirect: "error",
      headers: {
        "X-API-KEY": apiKey,
        "content-type": "application/json",
        accept: "application/json",
        "user-agent": "deepseek-harness/free-search",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error(`Serper request failed: ${error?.message ?? String(error)}`);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    if (response.status === 401 || response.status === 403) {
      throw new Error(
        `Serper API key is invalid or unauthorized (HTTP ${response.status}) - update SERPER_API_KEY in Settings > Plugins > Free Search`
      );
    }
    if (response.status === 429) {
      throw new Error("Serper quota or rate limit exceeded (HTTP 429) - check your plan at serper.dev");
    }
    throw new Error(`Serper API error (HTTP ${response.status}): ${detail.slice(0, 200)}`);
  }
  const data = await response.json();
  const rows = Array.isArray(data?.organic) ? data.organic : [];
  const sources = rows
    .filter((row) => row && typeof row.link === "string" && row.link.length > 0)
    .map((row) => ({
      url: row.link,
      ...(row.title ? { title: String(row.title) } : {}),
      ...(typeof row.snippet === "string" && row.snippet.trim() ? { snippet: row.snippet.trim() } : {}),
      ...(row.date ? { publishedAt: String(row.date) } : {}),
    }));
  return { sources: uniqueSources(sources, maxResults ?? 10), truncated: false };
}
