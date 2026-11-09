// Aliyun Bailian search engine.
import { TINYFISH_URL, JINA_URL, DOUBAO_SEARCH_URL, snippetCap, stripTags, uniqueSources } from "./shared.js";
import { TIME_ENGINES } from "../engine_meta.js";

export async function searchAliyun(query, maxResults, apiKey, timeRange, signal) {
  if (!apiKey) throw new Error("Aliyun search requires DASHSCOPE_API_KEY");
  const trimmed = String(query).trim();
  const q = trimmed.length < 2 ? `${trimmed} ` : trimmed.slice(0, 500);

  const rpcBody = {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: {
      name: "search_pro",
      arguments: { query: q },
    },
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 35000);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort);
  let response;
  try {
    response = await fetch("https://dashscope.aliyuncs.com/api/v1/mcps/EnhancedSearch/mcp", {
      method: "POST",
      redirect: "error",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "user-agent": "deepseek-harness/free-search",
      },
      body: JSON.stringify(rpcBody),
      signal: controller.signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error(`Aliyun search request failed: ${error?.message ?? String(error)}`);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    if (response.status === 401 || response.status === 403) {
      throw new Error(`Aliyun API key is invalid (HTTP ${response.status}) - update it in Settings > Plugins > Free Search`);
    }
    throw new Error(`Aliyun API error (HTTP ${response.status}): ${detail.slice(0, 200)}`);
  }

  const rawText = await response.text();
  let envelope;
  try {
    envelope = JSON.parse(rawText);
  } catch {
    // 处理可能的 SSE 帧 (data: { ... })
    const dataLine = rawText.split("\n").find((l) => l.startsWith("data:"));
    if (dataLine) {
      try {
        envelope = JSON.parse(dataLine.slice(5).trim());
      } catch (e) {
        throw new Error(`Aliyun MCP response SSE parse failed: ${rawText.slice(0, 200)}`);
      }
    } else {
      throw new Error(`Aliyun MCP response is not valid JSON: ${rawText.slice(0, 200)}`);
    }
  }

  if (envelope.error) {
    throw new Error(`Aliyun MCP error ${envelope.error.code}: ${envelope.error.message}`);
  }

  const callResult = envelope.result;
  if (!callResult || typeof callResult !== "object") {
    throw new Error(`Aliyun MCP result missing: ${JSON.stringify(envelope).slice(0, 200)}`);
  }
  if (callResult.isError) {
    throw new Error(`Aliyun tool error: ${JSON.stringify(callResult).slice(0, 200)}`);
  }

  const contents = callResult.content;
  if (!Array.isArray(contents) || contents.length === 0) {
    return { sources: [], truncated: false };
  }
  const textItem = contents.find((c) => c && c.type === "text" && typeof c.text === "string");
  if (!textItem) {
    return { sources: [], truncated: false };
  }

  let inner;
  try {
    inner = JSON.parse(textItem.text);
  } catch (err) {
    throw new Error(`Aliyun inner content JSON parse error: ${textItem.text.slice(0, 200)}`);
  }

  const pages = inner.pages;
  if (!Array.isArray(pages)) {
    return { sources: [], truncated: false };
  }

  const sources = pages
    .filter((p) => p && p.url)
    .map((p) => ({
      url: p.url,
      ...(p.title ? { title: String(p.title) } : {}),
      ...(p.snippet ? { snippet: String(p.snippet).slice(0, 300) } : {}),
      ...(p.published_at ? { publishedAt: String(p.published_at) } : {}),
    }));

  return { sources: uniqueSources(sources, maxResults ?? 10), truncated: false };
}


// ── 知乎开放平台 MCP（developer.zhihu.com/api/mcp/v1）─────────────────────────
// 两个引擎共用一套 MCP 适配器（lib/mcp_adapter.js，方案 v4.3 §2.7）：
//   zhihu_global → tools/call global_search（全网，filter 支持 publish_time>=unix秒 → 入 TIME_ENGINES）
//   zhihu_site   → tools/call zhihu_search（站内，未验证时间过滤 → 不入 TIME_ENGINES）
// 服务端为无状态 streamable-http：实测直连 tools/call 即可（initialize 非必需，也无 session 头），
// 响应可能是纯 JSON 或 SSE 帧——两种格式由适配器统一解析。
// key = ZHIHU_API_KEY（凭据中心 → 本条目 config zhihuApiKey → 环境变量，三级解析；无 key 时引擎跳过不阻断回退链）
