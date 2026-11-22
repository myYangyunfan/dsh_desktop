// Headless engine dispatch for the MCP server. Free engines stay keyless;
// keyed engines read credentials from the MCP process environment and are only
// used when the caller names them (auto never spends paid quota).
import { searchBing } from "./engines/bing.js";
import { searchDdgHtml } from "./engines/ddg.js";
import { searchDdgLite } from "./engines/ddg-lite.js";
import { searchGoogle } from "./engines/google.js";
import { searchBaidu } from "./engines/baidu.js";
import { searchBrave } from "./engines/brave.js";
import { searchMetaso } from "./engines/metaso.js";
import { searchZhipu } from "./engines/zhipu.js";
import { searchYandex } from "./engines/yandex.js";
import { searchYuanbao } from "./engines/yuanbao.js";
import { searchDeepSeekTools } from "./engines/deepseek-tools.js";
import { searchExa, searchExaMCP } from "./engines/exa.js";
import { searchTavily } from "./engines/tavily.js";
import { searchKeenable } from "./engines/keenable.js";
import { searchFirecrawl } from "./engines/firecrawl.js";
import { searchParallel, searchParallelMCP } from "./engines/parallel.js";
import { searchYoucom } from "./engines/you.js";
import { searchAnysearch } from "./engines/anysearch.js";
import { searchSearxng } from "./engines/searxng.js";
import { searchPerplexity } from "./engines/perplexity.js";
import { searchSerpbase } from "./engines/serpbase.js";
import { searchSerper } from "./engines/serper.js";
import { searchSerply } from "./engines/serply.js";
import { searchOutcrawl } from "./engines/outcrawl.js";
import { searchTinyfish } from "./engines/tinyfish.js";
import { searchJina } from "./engines/jina.js";
import { searchKimi } from "./engines/kimi.js";
import { searchAliyun } from "./engines/aliyun.js";
import { searchDoubao } from "./engines/doubao.js";
import { searchZhihuGlobal } from "./engines/zhihu_global.js";
import { searchZhihuSite } from "./engines/zhihu_site.js";
import { searchSpecStream } from "./engines/specstream.js";
import { searchDeepSeekOfficial } from "./engines/deepseek-official.js";
import { searchDegoog } from "./engines/degoog.js";
import { searchOpenai } from "./engines/openai.js";
import { searchGemini } from "./engines/gemini.js";
import { searchClaude } from "./engines/claude.js";
import { searchSerpEngine, SERP_ENGINE_IDS } from "./serp_engines.js";
import { searchAgy, agyAvailable } from "./agy.js";
import { parseTimeRange } from "./engines/shared.js";

export const MCP_ENGINE_IDS = [
  "auto",
  "bing",
  "ddg",
  "ddg-lite",
  "anysearch",
  "searxng",
  "exa",
  "tavily",
  "keenable",
  "firecrawl",
  "parallel",
  "you",
  "google",
  "baidu",
  "brave",
  "metaso",
  "yandex",
  "yuanbao",
  "deepseek-tools",
  "zhipu",
  "perplexity",
  "serpbase",
  "serper",
  "serply",
  "outcrawl",
  "tinyfish",
  "jina",
  "kimi",
  "aliyun",
  "doubao",
  "zhihu_global",
  "zhihu_site",
  "specstream",
  "deepseek-official",
  "degoog",
  "openai",
  "gemini",
  "claude",
  "agy",
];

export const MCP_SERP_ENGINES = [...SERP_ENGINE_IDS];
MCP_ENGINE_IDS.push(...MCP_SERP_ENGINES);

export const MCP_FREE_ENGINES = ["bing", "ddg", "ddg-lite"];
export const MCP_KEYLESS_ENGINES = ["anysearch", "searxng", "exa", "tavily", "keenable", "firecrawl", "parallel", "you"];
export const MCP_KEYED_ENGINES = [
  "google", "baidu", "brave", "metaso", "yandex", "yuanbao", "deepseek-tools", "zhipu",
  "perplexity", "serpbase", "serper", "serply", "outcrawl", "tinyfish", "jina", "kimi", "aliyun", "doubao",
  "zhihu_global", "zhihu_site", "specstream", "deepseek-official",
  "openai", "gemini", "claude",
];
export const MCP_HOSTED_ENGINES = ["degoog"];

function env(name, fallback = "") {
  return String(process.env[name] ?? fallback).trim();
}

function requireEnv(name, label) {
  const value = env(name);
  if (!value) throw new Error(`${label} requires ${name}`);
  return value;
}

function timeRangeOf(args) {
  return parseTimeRange(args?.time_range);
}

export async function runMcpEngine(id, query, options = {}) {
  const engine = String(id ?? "").trim().toLowerCase() || "auto";
  if (!MCP_ENGINE_IDS.includes(engine)) throw new Error(`unknown engine "${engine}"`);
  const maxResults = Math.min(Math.max(Number(options.maxResults) || 8, 1), 20);
  const safeSearch = String(options.safeSearch ?? env("MCP_SAFE_SEARCH", "off")).trim().toLowerCase();
  const lang = env("MCP_LANG", "zh");
  const timeRange = timeRangeOf(options);
  const signal = options.signal;

  if (engine === "auto") {
    const errors = [];
    for (const candidate of MCP_FREE_ENGINES) {
      try {
        const result = await runMcpEngine(candidate, query, options);
        if (result.sources.length > 0) return result;
        errors.push(`${candidate}: no results`);
      } catch (error) {
        errors.push(`${candidate}: ${error?.message ?? String(error)}`);
      }
    }
    throw new Error(`all free engines failed (${errors.join("; ")})`);
  }

  switch (engine) {
    case "bing":
      return {
        engine,
        ...(await searchBing(query, maxResults, {
          lang,
          safeSearch,
          ...(env("MCP_BING_MARKET") ? { bingMarket: env("MCP_BING_MARKET") } : {}),
        }, signal)),
      };
    case "ddg":
      return { engine, ...(await searchDdgHtml(query, maxResults, { safeSearch, timeRange }, signal)) };
    case "ddg-lite":
      return { engine, ...(await searchDdgLite(query, maxResults, { safeSearch, timeRange }, signal)) };
    case "anysearch":
      return {
        engine,
        ...(await searchAnysearch(query, maxResults, signal, env("ANYSEARCH_API_KEY"))),
      };
    case "searxng": {
      const instances = env("MCP_SEARXNG_INSTANCES")
        .split(/[\s,]+/)
        .map((entry) => entry.trim())
        .filter(Boolean);
      return {
        engine,
        ...(await searchSearxng(query, maxResults, {
          timeRange,
          ...(instances.length ? { searxngInstances: instances } : {}),
          ...(env("MCP_SEARXNG_BEARER_TOKEN") ? { searxngBearerToken: env("MCP_SEARXNG_BEARER_TOKEN") } : {}),
        }, signal)),
      };
    }
    case "exa": {
      const key = env("EXA_API_KEY");
      return {
        engine,
        ...(key
          ? await searchExa(query, maxResults, key, timeRange, signal)
          : await searchExaMCP(query, maxResults, signal)),
      };
    }
    case "tavily":
      return {
        engine,
        ...(await searchTavily(query, maxResults, env("TAVILY_API_KEY"), timeRange, signal, env("MCP_TAVILY_URL"))),
      };
    case "keenable":
      return { engine, ...(await searchKeenable(query, maxResults, env("KEENABLE_API_KEY"), timeRange, signal)) };
    case "firecrawl":
      return { engine, ...(await searchFirecrawl(query, maxResults, env("FIRECRAWL_API_KEY"), timeRange, signal)) };
    case "parallel": {
      const key = env("PARALLEL_API_KEY");
      return {
        engine,
        ...(key
          ? await searchParallel(query, maxResults, key, timeRange, signal)
          : await searchParallelMCP(query, maxResults, timeRange, signal)),
      };
    }
    case "you":
      return {
        engine,
        ...(await searchYoucom(query, maxResults, env("YDC_API_KEY") || env("YOUCOM_API_KEY"), signal)),
      };
    case "google": {
      const key = requireEnv("GOOGLE_CSE_API_KEY", "Google");
      const cx = requireEnv("GOOGLE_CSE_ID", "Google");
      return {
        engine,
        ...(await searchGoogle(query, maxResults, key, cx, timeRange, { lang, safeSearch }, signal)),
      };
    }
    case "baidu":
      return { engine, ...(await searchBaidu(query, maxResults, requireEnv("BAIDU_API_KEY", "Baidu"), timeRange, signal)) };
    case "brave":
      return { engine, ...(await searchBrave(query, maxResults, requireEnv("BRAVE_API_KEY", "Brave"), timeRange, signal)) };
    case "metaso": {
      const key = requireEnv("METASO_API_KEY", "Metaso");
      return {
        engine,
        ...(await searchMetaso(query, maxResults, key, env("MCP_METASO_SCOPE", "webpage"), timeRange, signal)),
      };
    }
    case "yandex": {
      const key = requireEnv("YANDEX_API_KEY", "Yandex");
      const folderId = requireEnv("YANDEX_FOLDER_ID", "Yandex");
      return {
        engine,
        ...(await searchYandex(query, maxResults, key, folderId, {
          searchType: env("MCP_YANDEX_SEARCH_TYPE", "auto"),
          lang,
          safeSearch,
        }, timeRange, signal)),
      };
    }
    case "yuanbao": {
      const key = requireEnv("TENCENTCLOUD_WSA_APIKEY", "Yuanbao");
      return {
        engine,
        ...(await searchYuanbao(query, maxResults, key, {
          mode: env("MCP_YUANBAO_MODE", "0"),
          site: env("MCP_YUANBAO_SITE"),
        }, timeRange, signal)),
      };
    }
    case "deepseek-tools": {
      const key = env("DEEPSEEK_TOOLS_API_KEY") || requireEnv("DEEPSEEK_API_KEY", "DeepSeek");
      return {
        engine,
        ...(await searchDeepSeekTools(query, maxResults, key, timeRange, signal, env("MCP_DEEPSEEK_TOOLS_URL"), env("MCP_DEEPSEEK_SNIPPET_MAX_CHARS", "600"), env("MCP_DEEPSEEK_SNIPPET_BUDGET_CHARS", "0"))),
      };
    }
    case "zhipu": {
      const key = requireEnv("ZHIPU_API_KEY", "Zhipu");
      return {
        engine,
        ...(await searchZhipu(query, maxResults, key, timeRange, signal, env("MCP_ZHIPU_SEARCH_ENGINE", "search_std"))),
      };
    }
    case "perplexity":
      return { engine, ...(await searchPerplexity(query, maxResults, requireEnv("PERPLEXITY_API_KEY", "Perplexity"), signal)) };
    case "serpbase":
      return {
        engine,
        ...(await searchSerpbase(query, maxResults, requireEnv("SERPBASE_API_KEY", "SerpBase"), { lang }, signal)),
      };
    case "serper":
      return {
        engine,
        ...(await searchSerper(
          query,
          maxResults,
          requireEnv("SERPER_API_KEY", "Serper"),
          { lang, timeRange },
          signal
        )),
      };
    case "serply":
      return {
        engine,
        ...(await searchSerply(query, maxResults, requireEnv("SERPLY_API_KEY", "Serply"), { lang }, signal)),
      };
    case "outcrawl":
      return { engine, ...(await searchOutcrawl(query, maxResults, requireEnv("OUTCRAWL_API_KEY", "Outcrawl"), signal)) };
    case "tinyfish":
      return { engine, ...(await searchTinyfish(query, maxResults, requireEnv("TINYFISH_API_KEY", "TinyFish"), timeRange, signal)) };
    case "jina":
      return { engine, ...(await searchJina(query, maxResults, requireEnv("JINA_API_KEY", "Jina"), signal)) };
    case "kimi":
      return { engine, ...(await searchKimi(query, maxResults, requireEnv("MOONSHOT_API_KEY", "Kimi"), timeRange, signal)) };
    case "aliyun":
      return { engine, ...(await searchAliyun(query, maxResults, requireEnv("DASHSCOPE_API_KEY", "Aliyun"), timeRange, signal)) };
    case "doubao":
      return { engine, ...(await searchDoubao(query, maxResults, requireEnv("DOUBAO_SEARCH_API_KEY", "Doubao"), timeRange, signal)) };
    case "zhihu_global":
      return { engine, ...(await searchZhihuGlobal(query, maxResults, requireEnv("ZHIHU_API_KEY", "Zhihu"), timeRange, signal)) };
    case "zhihu_site":
      return { engine, ...(await searchZhihuSite(query, maxResults, requireEnv("ZHIHU_API_KEY", "Zhihu"), signal)) };
    case "specstream":
      return { engine, ...(await searchSpecStream(query, maxResults, requireEnv("SPECSTREAM_API_KEY", "SpecStream"), signal)) };
    case "deepseek-official":
      return { engine, ...(await searchDeepSeekOfficial(query, maxResults, requireEnv("DEEPSEEK_API_KEY", "DeepSeek"), signal)) };
    case "degoog": {
      const instances = env("MCP_DEGOOG_INSTANCES")
        .split(/[\s,]+/)
        .map((entry) => entry.trim())
        .filter(Boolean);
      if (instances.length === 0) throw new Error("Degoog requires MCP_DEGOOG_INSTANCES (comma-separated base URLs)");
      return {
        engine,
        ...(await searchDegoog(query, maxResults, {
          timeRange,
          lang,
          degoogInstances: instances,
          ...(env("MCP_DEGOOG_API_KEY") ? { degoogApiKey: env("MCP_DEGOOG_API_KEY") } : {}),
        }, signal)),
      };
    }
    case "openai":
      return {
        engine,
        ...(await searchOpenai(query, maxResults, requireEnv("OPENAI_API_KEY", "OpenAI"), {
          openaiModel: env("MCP_OPENAI_MODEL"),
          openaiBaseUrl: env("MCP_OPENAI_BASE_URL"),
        }, signal)),
      };
    case "gemini":
      return {
        engine,
        ...(await searchGemini(query, maxResults, env("GEMINI_API_KEY") || requireEnv("GOOGLE_API_KEY", "Gemini"), {
          geminiModel: env("MCP_GEMINI_MODEL"),
          geminiBaseUrl: env("MCP_GEMINI_BASE_URL"),
        }, signal)),
      };
    case "claude":
      return {
        engine,
        ...(await searchClaude(query, maxResults, requireEnv("ANTHROPIC_API_KEY", "Claude"), {
          claudeModel: env("MCP_CLAUDE_MODEL"),
          claudeBaseUrl: env("MCP_CLAUDE_BASE_URL"),
        }, signal)),
      };
    case "agy": {
      if (!agyAvailable()) throw new Error("Antigravity CLI is not installed (install Antigravity or set AGY_BIN)");
      return {
        engine,
        ...(await searchAgy(query, maxResults, {
          signal,
          ...(env("MCP_AGY_MODEL") ? { model: env("MCP_AGY_MODEL") } : {}),
        })),
      };
    }
    default:
      if (SERP_ENGINE_IDS.includes(engine)) {
        return { engine, ...(await searchSerpEngine(engine, query, {
          maxResults,
          timeRange,
          lang,
        })) };
      }
      throw new Error(`unknown engine "${engine}"`);
  }
}
