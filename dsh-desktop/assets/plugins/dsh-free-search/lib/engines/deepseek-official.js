// DeepSeek official provider (Anthropic-compatible web_search tool).
import { TAVILY_URL, FIRECRAWL_URL, isFirecrawlKeylessRefusal, markFirecrawlKeylessBlocked, PARALLEL_URL, PARALLEL_MCP_URL, PARALLEL_USER_AGENT, KEENABLE_URL, KEENABLE_MCP_URL, SERPBASE_URL, SERPLY_URL, OUTCRAWL_URL, YOUCOM_URL, YOUCOM_FREE_URL, YOUCOM_KEYS_LINK, isoDaysAgo, parseTimeRange, approximateTimeRange, uniqueSources } from "./shared.js";
import { parseMcpResponseText } from "../mcp_adapter.js";

export async function searchDeepSeekOfficial(query, maxResults, apiKey, signal) {
  if (!apiKey) throw new Error("DeepSeek search requires DEEPSEEK_API_KEY");
  // 内置 20s 超时（与外部 signal 组合）：调用方不传 signal 时也不会永久卡住
  const response = await fetch("https://api.deepseek.com/anthropic/v1/messages", {
    method: "POST",
    redirect: "error",
    headers: {
      "x-api-key": apiKey,
      authorization: `Bearer ${apiKey}`,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
      accept: "application/json",
      "user-agent": "deepseek-harness/free-search",
    },
    body: JSON.stringify({
      model: "deepseek-v4-flash",
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: `Perform a web search for the query: ${query}` }],
        },
      ],
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 1 }],
    }),
    signal: AbortSignal.any([...(signal !== undefined ? [signal] : []), AbortSignal.timeout(20000)]),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    if (response.status === 401) {
      throw new Error("DeepSeek API key is invalid (HTTP 401) - update it in Settings > Plugins > Free Search");
    }
    throw new Error(`DeepSeek API error (HTTP ${response.status}): ${detail.slice(0, 200)}`);
  }
  const data = await response.json();
  const blocks = data.content ?? [];
  const resultBlocks = blocks.filter((block) => block.type === "web_search_tool_result");
  const snippets = new Map();
  for (const block of blocks) {
    if (block.type !== "text") continue;
    for (const cite of block.citations ?? []) {
      if (cite.url && cite.cited_text && !snippets.has(cite.url)) snippets.set(cite.url, cite.cited_text);
    }
  }
  const sources = [];
  for (const block of resultBlocks) {
    for (const item of block.content ?? []) {
      if (item.type !== "web_search_result" || !item.url) continue;
      if (sources.some((s) => s.url === item.url)) continue;
      sources.push({
        url: item.url,
        ...(item.title ? { title: item.title } : {}),
        ...(snippets.get(item.url) ? { snippet: snippets.get(item.url) } : {}),
        ...(item.page_age ? { publishedAt: item.page_age } : {}),
      });
    }
  }
  return { sources: uniqueSources(sources, maxResults ?? 10), truncated: false };
}

// DeepSeek 官方原生搜索 API（POST /v1/tools/search）
// key = DEEPSEEK_API_KEY（与 deepseek-official 共用，接口不同）
//
// 与 deepseek-official 的区别：那一档走 Anthropic Messages +
// `web_search_20250305` 服务端工具，每次搜索是一个完整模型轮次（慢、耗 token、
// 结果要从 web_search_tool_result 块里再解析）；这一档直接调原生搜索端点，
// 无模型参与，返回结构化 results[]。实测同 query 下 ~0.3s vs ~5-6s。
//
// 计费按「请求次数」而非条数（count 不影响单价），所以这里超额取数不增加成本。
