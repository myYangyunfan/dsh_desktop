// OpenAI Responses web_search engine.
import { stripTags, uniqueSources } from "./shared.js";
import { stripTrackingParams } from "../url_norm.js";

const OPENAI_DEFAULT_MODEL = "gpt-6-luna";

const OPENAI_DEFAULT_BASE_URL = "https://api.openai.com/v1";

function openaiResponsesUrl(baseUrl) {
  const base = (typeof baseUrl === "string" && baseUrl.trim() ? baseUrl.trim() : OPENAI_DEFAULT_BASE_URL).replace(/\/+$/, "");
  return base.endsWith("/responses") ? base : base + "/responses";
}

// OpenAI 给引用链接追加 utm_source=openai、知乎开放平台挂 utm_medium/openapi_platform：
// 统一走 lib/url_norm.js 的 stripTrackingParams（#69 §4 的唯一权威实现），
// 不再各写一份——两处旧实现只在自己引擎适配器里生效，管不到 multi 合并阶段。

function stripOpenaiTracking(url) {
  return stripTrackingParams(url);
}

export async function searchOpenai(query, maxResults, apiKey, options, signal) {
  if (!apiKey) throw new Error("OpenAI search requires OPENAI_API_KEY");
  const model = (typeof options?.openaiModel === "string" && options.openaiModel.trim()) || OPENAI_DEFAULT_MODEL;
  const response = await fetch(openaiResponsesUrl(options?.openaiBaseUrl), {
    method: "POST",
    redirect: "error",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer " + apiKey,
      "user-agent": "deepseek-harness/free-search",
    },
    body: JSON.stringify({ model, input: String(query), tools: [{ type: "web_search" }] }),
    signal: AbortSignal.any([...(signal !== undefined ? [signal] : []), AbortSignal.timeout(45000)]),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    if (response.status === 401 || response.status === 403) {
      throw new Error("OpenAI API key is invalid (HTTP " + response.status + ") - update it in Settings > Plugins > Free Search");
    }
    if (response.status === 429) {
      throw new Error("OpenAI rate limit or quota exceeded (HTTP 429) - check your OpenAI usage/limits");
    }
    throw new Error("OpenAI search API error (HTTP " + response.status + "): " + detail.slice(0, 200));
  }
  const data = await response.json();
  if (data?.error) {
    throw new Error("OpenAI response failed: " + (data.error.message ?? JSON.stringify(data.error).slice(0, 200)));
  }
  // citations 以 url_citation annotation 的形式挂在 message 的 output_text 上
  const sources = [];
  for (const item of data.output ?? []) {
    if (!item || item.type !== "message" || !Array.isArray(item.content)) continue;
    for (const part of item.content) {
      const text = typeof part?.text === "string" ? part.text : "";
      for (const annotation of part?.annotations ?? []) {
        if (annotation?.type !== "url_citation" || typeof annotation.url !== "string" || !annotation.url) continue;
        sources.push({
          url: stripOpenaiTracking(annotation.url),
          ...(annotation.title ? { title: String(annotation.title) } : {}),
          ...(text.trim() ? { snippet: stripTags(text).slice(0, 300) } : {}),
        });
      }
    }
  }
  return { sources: uniqueSources(sources, maxResults ?? 10), truncated: false };
}
