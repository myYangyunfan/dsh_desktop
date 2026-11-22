// Zhipu (BigModel) Web Search API.
// POST https://open.bigmodel.cn/api/paas/v4/web_search
// Authorization: Bearer ZHIPU_API_KEY
import { uniqueSources } from "./shared.js";

export const ZHIPU_URL = "https://open.bigmodel.cn/api/paas/v4/web_search";
export const ZHIPU_ENGINES = ["search_std", "search_pro", "search_pro_sogou", "search_pro_quark"];
export const ZHIPU_TIMEOUT_MS = 20000;

/** Map the plugin's relative time range to Zhipu's recency enum. */
export function zhipuRecency(timeRange) {
  const days = Number(timeRange?.days);
  if (!Number.isFinite(days) || days <= 0) return "noLimit";
  if (days <= 1) return "oneDay";
  if (days <= 7) return "oneWeek";
  if (days <= 31) return "oneMonth";
  return "oneYear";
}

const ISO_DATE = /^(\d{4}-\d{2}-\d{2})/;

/** Zhipu returns { search_result: [{ title, link, content, media, publish_date }] }. */
export function parseZhipuResponse(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Zhipu returned malformed JSON");
  }
  if (data?.error) {
    const code = data.error.code ?? "unknown";
    const message = data.error.message ?? "unknown error";
    throw new Error(`Zhipu search error ${code}: ${message}`);
  }
  const rows = Array.isArray(data?.search_result) ? data.search_result : [];
  return rows
    .filter((row) => row && typeof row.link === "string" && row.link.trim())
    .map((row) => {
      const date = ISO_DATE.exec(String(row.publish_date ?? "").trim());
      return {
        url: row.link.trim(),
        ...(row.title ? { title: String(row.title) } : {}),
        ...(row.content ? { snippet: String(row.content) } : {}),
        ...(date ? { publishedAt: date[1] } : {}),
      };
    });
}

export async function searchZhipu(query, maxResults, apiKey, timeRange, signal, searchEngine = "search_std") {
  if (!apiKey) throw new Error("Zhipu search requires ZHIPU_API_KEY");
  const engine = ZHIPU_ENGINES.includes(searchEngine) ? searchEngine : "search_std";
  const limit = Math.min(Math.max(Number(maxResults) || 10, 1), 50);
  // Sogou mode accepts 10/20/30/40/50 when no filter is supplied.
  const count = engine === "search_pro_sogou"
    ? Math.min(50, Math.max(10, Math.ceil(limit / 10) * 10))
    : limit;
  const body = {
    search_query: String(query).slice(0, 70),
    search_engine: engine,
    search_intent: false,
    count,
    content_size: "high",
  };
  const recency = zhipuRecency(timeRange);
  if (recency !== "noLimit") body.search_recency_filter = recency;

  const response = await fetch(ZHIPU_URL, {
    method: "POST",
    redirect: "error",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
      accept: "application/json",
      "user-agent": "deepseek-harness/free-search",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.any([...(signal !== undefined ? [signal] : []), AbortSignal.timeout(ZHIPU_TIMEOUT_MS)]),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    if (response.status === 401 || response.status === 403) {
      throw new Error(`Zhipu auth failed (HTTP ${response.status}) - check ZHIPU_API_KEY`);
    }
    if (response.status === 429) {
      throw new Error("Zhipu rate limit or concurrency limit (HTTP 429) - retry later or lower concurrency");
    }
    throw new Error(`Zhipu API error (HTTP ${response.status}): ${detail.slice(0, 200)}`);
  }
  const sources = parseZhipuResponse(await response.text());
  return { sources: uniqueSources(sources, limit), truncated: false };
}
