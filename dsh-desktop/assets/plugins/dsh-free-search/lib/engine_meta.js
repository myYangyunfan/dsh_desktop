/**
 * Engine catalog: the one place that defines which engines exist, their order,
 * and their static capabilities. Routing, prompts, the settings client and the
 * fallback chain all derive from these lists instead of keeping parallel copies
 * (add an engine here first; the client has its own copy in the web bundle).
 */
import { SERP_ENGINE_IDS, SERP_TIME_ENGINES } from "./serp_engines.js";

// Base order is the order the settings page and prompts have always used.
const BASE_ENGINES = [
  { id: "ddg", free: true, time: true },
  { id: "ddg-lite", free: true, time: true },
  { id: "bing", free: true, time: false },
  { id: "searxng", free: true, time: true },
  { id: "degoog", free: true, time: true },
  { id: "anysearch", free: true, time: false },
  { id: "exa", free: false, time: true },
  { id: "tavily", free: false, time: true },
  { id: "keenable", free: false, time: true },
  { id: "firecrawl", free: false, time: true },
  { id: "parallel", free: false, time: true },
  { id: "perplexity", free: false, time: false },
  { id: "serpbase", free: false, time: false },
  { id: "serply", free: false, time: false },
  { id: "outcrawl", free: false, time: false },
  { id: "google", free: false, time: true },
  { id: "deepseek-official", free: false, time: false },
  { id: "deepseek-tools", free: false, time: true },
  { id: "you", free: false, time: false },
  { id: "baidu", free: false, time: true },
  { id: "kimi", free: false, time: false },
  { id: "aliyun", free: false, time: false },
  { id: "doubao", free: false, time: true },
  { id: "tinyfish", free: false, time: true },
  { id: "jina", free: false, time: false },
  { id: "zhihu_global", free: false, time: true },
  { id: "zhihu_site", free: false, time: false },
  { id: "agy", free: false, time: false },
  { id: "openai", free: false, time: false, explicitOnly: true },
  { id: "gemini", free: false, time: false, explicitOnly: true },
  { id: "claude", free: false, time: false, explicitOnly: true },
];

/** Every engine id, base engines first and the HTML SERP family last. */
export const ALL_ENGINES = [...BASE_ENGINES.map((engine) => engine.id), ...SERP_ENGINE_IDS];

/** Engines that need no credential at all. */
export const FREE_ENGINES = BASE_ENGINES.filter((engine) => engine.free).map((engine) => engine.id);

/** Per-call billed model searches: never auto-routed, only explicit picks. */
export const EXPLICIT_ONLY_ENGINES = BASE_ENGINES.filter((engine) => engine.explicitOnly).map((engine) => engine.id);

// Time-filter support. The order is deliberate (tavily before exa) and differs
// from the base order, so it stays explicit instead of being filtered from BASE.
export const TIME_ENGINES = [
  "tavily",
  "exa",
  "keenable",
  "firecrawl",
  "google",
  "parallel",
  "searxng",
  "degoog",
  "ddg",
  "ddg-lite",
  "baidu",
  "doubao",
  "tinyfish",
  "deepseek-tools",
  "zhihu_global",
  ...SERP_TIME_ENGINES,
];

/** Default fallback chain order (the settings UI exposes it as a sort list). */
export const DEFAULT_FALLBACK_ORDER = [
  "exa",
  "tavily",
  "keenable",
  "firecrawl",
  "parallel",
  "perplexity",
  "serpbase",
  "serply",
  "outcrawl",
  "google",
  "agy",
  "deepseek-tools",
  "deepseek-official",
  "you",
  "baidu",
  "kimi",
  "aliyun",
  "doubao",
  "tinyfish",
  "jina",
  "bing",
  "anysearch",
  "ddg",
  "ddg-lite",
  "searxng",
  "degoog",
  "zhihu_global",
  "zhihu_site",
];
