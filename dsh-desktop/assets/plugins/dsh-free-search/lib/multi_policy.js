// #69 Phase 1（第一批）：multi 模式的执行策略——纯函数，便于离线断言。
//
// 为什么单独成文件：这几个判断（并发上限怎么取、目标成功数怎么补跑）跑在
// runMultiSearch 里，而那是 apply() 内的闭包、无法导出单测。抽成纯函数后
// 既可以直接断言，也符合 reporter「三个预设共用同一条执行管线」的方向
// （将来加 Fast/Balanced/Deep 时，这里就是预设唯一的作用点）。
//
// 两条约束来自 reporter #69，都有断言钉住：
//   §1 并发上限是「天花板」不是「必须跑满」——候选不够就少跑，不得凑数。
//   §3 目标成功数（minSources）是「尽量达到」而非硬下限——达不到时返回已有
//      结果并附提示，绝不丢弃有效证据、绝不因此让整次搜索失败。
// 另有兼容硬约束：默认值必须让现有行为完全不变，升级对用户透明。

/** 0 / 非数字 / 负数 一律视为「不限制」，保证未配置时行为与今天一致。 */
export function resolveMaxEngines(value, poolSize) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return poolSize;
  return Math.min(Math.floor(n), poolSize);
}

/**
 * 从候选池里挑出本次实际执行的引擎。
 * 只做「取前 N」，保持池内顺序——池内顺序就是用户在 zhPool/enPool 里配的优先级，
 * 未经用户许可不重排（轮换是后续批次的事）。
 */
export function selectEngines(engines, configuredMax) {
  const list = Array.isArray(engines) ? engines.filter((e) => typeof e === "string" && e) : [];
  if (list.length === 0) return [];
  return list.slice(0, resolveMaxEngines(configuredMax, list.length));
}

/** 目标成功源数：至少 1（0/负数/非数字都归 1，因为「0 个成功源」没有意义）。 */
export function resolveMinSources(value, poolSize) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.max(1, Math.floor(n));
}

/**
 * 主轮结束后，若成功引擎数未达目标，从链路里挑「还没试过」的候选补跑。
 * 已达标时返回空数组——调用方据此一次额外请求都不发（省钱、省限流）。
 */
export function planTopUp({ attempted = [], succeeded = 0, minSources = 1, chain = [] } = {}) {
  if (succeeded >= minSources) return [];
  const tried = new Set(Array.isArray(attempted) ? attempted : []);
  const candidates = Array.isArray(chain) ? chain : [];
  return candidates.filter((engine) => engine && !tried.has(engine));
}

/** 未达标时的说明文字；达标返回 null（不制造噪音）。 */
export function describeTarget({ minSources = 1, achieved = 0 } = {}) {
  if (achieved >= minSources) return null;
  return `sourcesTarget: ${minSources}, achieved: ${achieved}`;
}

/**
 * 执行档位（#69 §1）。**只复用现有两个旋钮**：并发上限 + 目标成功源数。
 * 不新增后端配置——UI 点档位就是把这两个数字写进去，手改数字即回到「自定义」。
 * 这样零迁移、零缓存键影响，且在 planner 统一之前不改变任何现有语义。
 */
export const MULTI_PRESETS = {
  fast: { maxEngines: 1, minSources: 1 },
  balanced: { maxEngines: 3, minSources: 1 },
  deep: { maxEngines: 6, minSources: 2 },
};

/** 由当前 (上限, 目标源数) 反推档位名；不匹配任何档位时返回 "custom"。 */
export function presetForSettings(maxEngines, minSources) {
  const max = Number(maxEngines);
  const min = Number(minSources);
  const normMax = Number.isFinite(max) && max > 0 ? Math.floor(max) : 0;
  const normMin = Number.isFinite(min) && min > 0 ? Math.floor(min) : 1;
  for (const [id, p] of Object.entries(MULTI_PRESETS)) {
    if (p.maxEngines === normMax && p.minSources === normMin) return id;
  }
  return "custom";
}

/**
 * 常见「两段式」公共后缀（co.uk / com.cn / co.jp …）。不追求完整 PSL——
 * 只覆盖公开搜索里真会撞到的那批；未命中时退化为「最后两段」。
 */
const MULTI_PART_SUFFIXES = new Set([
  // 中国 / 港台
  "com.cn", "net.cn", "org.cn", "gov.cn", "edu.cn", "ac.cn",
  "com.hk", "org.hk", "net.hk", "edu.hk", "gov.hk",
  "com.tw", "org.tw", "net.tw", "edu.tw", "gov.tw",
  // 日韩
  "co.jp", "or.jp", "ne.jp", "ac.jp", "go.jp",
  "co.kr", "or.kr", "ne.kr", "go.kr", "re.kr",
  // 英国 / 英联邦 / 大洋洲
  "co.uk", "org.uk", "ac.uk", "gov.uk", "me.uk", "net.uk", "sch.uk",
  "com.au", "net.au", "org.au", "edu.au", "gov.au",
  "co.nz", "net.nz", "org.nz", "govt.nz", "ac.nz",
  "co.za", "org.za", "net.za", "gov.za",
  "co.in", "net.in", "org.in", "gov.in", "ac.in",
  "com.sg", "com.my", "com.ph", "com.pk", "com.vn", "co.th", "co.id",
  // 欧洲 / 拉美 / 中东 / 非洲
  "com.br", "com.mx", "com.ar", "com.tr", "com.ua", "com.pl", "com.ru",
  "co.il", "com.sa", "com.eg", "com.ng", "co.ke",
]);

/**
 * 取 URL 的**可注册域**（eTLD+1）用于「同域」判定。
 *
 * 为什么不用主机名：blog.example.com 与 download.example.com 是同一站点的两个子域，
 * 拿主机名分组会把它们当成两个「独立来源」，与 #69 §4 的域名多样性意图正好相反。
 * （这正是 0.8.10 里自认的 known limitation。）
 *
 * IP / 含端口的 IPv6 / localhost / 单标签主机 / 非法 URL 一律原样小写返回，不误判。
 */
export function domainOf(url) {
  const raw = String(url ?? "").trim();
  if (!raw) return "";
  let host;
  try {
    host = new URL(raw).hostname.toLowerCase();
  } catch {
    return raw.toLowerCase();
  }
  host = host.replace(/\.+$/, "").replace(/^www\./, "");
  if (!host) return "";
  if (!host.includes(".") || host.includes(":") || /^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return host;
  const parts = host.split(".");
  if (parts.length <= 2) return host;
  const last2 = parts.slice(-2).join(".");
  return MULTI_PART_SUFFIXES.has(last2) ? parts.slice(-3).join(".") : last2;
}

function publishedTs(value) {
  const ts = Date.parse(String(value ?? ""));
  return Number.isFinite(ts) ? ts : 0;
}

/**
 * 合并后的排序（#69 §4）。
 *
 * reporter 的要求：排序信号用「真实可得且有意义」的那些——原始结果顺序、域名多样性、
 * 需要时的时效性；而 `seenIn` **只能当溯源/佐证元数据，不能当主排序键**，理由是
 * "Six matching search results do not necessarily constitute six independent sources"
 * （多个引擎可能共享索引与排序偏见，所以同域堆叠并不等于可信）。
 *
 * 做法（确定性、可离线断言）：
 *   1. 按域名分组；
 *   2. 组内次序：时效性生效时新的优先 → 原始顺序 → 佐证数（仅末位 tiebreak）；
 *   3. 组的次序：按各域「最佳条目」的上述次序；
 *   4. 轮转交错输出：第一轮每域各出一条，再第二轮…… → 前 N 条尽量来自不同域。
 *
 * 刻意只重排、不剔除：多样性是排序信号，不是过滤条件（过滤由 blockedDomains 负责）。
 *
 * 同域判定走 domainOf() 的 eTLD+1：blog.example.com 与 download.example.com 归为同一域。
 * 局限：后缀表是精简版（非完整 PSL），冷门多段后缀仍退化为「最后两段」。
 *
 * @param {{domain?: string, order?: number, corroboration?: number, publishedAt?: string}[]} items
 * @param {{appliesFreshness?: boolean}} [options] appliesFreshness 仅在本次搜索带时间过滤时为 true
 */
export function rankMergedResults(items, { appliesFreshness = false } = {}) {
  const list = Array.isArray(items) ? items.slice() : [];
  if (list.length <= 1) return list;

  const withinKey = (x) => [
    appliesFreshness ? -publishedTs(x?.publishedAt) : 0,
    Number(x?.order) || 0,
    -(Number(x?.corroboration) || 0),
  ];
  const cmp = (a, b) => {
    const ka = withinKey(a);
    const kb = withinKey(b);
    for (let i = 0; i < ka.length; i++) {
      if (ka[i] !== kb[i]) return ka[i] - kb[i];
    }
    return 0;
  };

  const byDomain = new Map();
  for (const item of list) {
    const d = String(item?.domain ?? "");
    if (!byDomain.has(d)) byDomain.set(d, []);
    byDomain.get(d).push(item);
  }

  const groups = [...byDomain.values()];
  for (const group of groups) group.sort(cmp);
  groups.sort((a, b) => cmp(a[0], b[0]));

  const out = [];
  const longest = groups.reduce((max, g) => Math.max(max, g.length), 0);
  for (let round = 0; round < longest; round++) {
    for (const group of groups) {
      if (round < group.length) out.push(group[round]);
    }
  }
  return out;
}

/**
 * 引擎 → 必需凭据描述符（`{ env, settings }`，即 resolveApiKey 的两个参数）。
 * 数组表示「任一命中即算配了」，与 index.js 里 resolveDoubaoKey / resolveGeminiKey
 * 的回退逻辑逐条对应。
 *
 * 为什么需要它：#69 §2 要求引擎资格必须考虑 "Missing credentials"。原状的资格过滤
 * 只看了 disabled / 冷却 / zhihu 预探测，缺 key 的引擎要到 runEngineTest 才发现 ——
 * 而那时它已经占掉了并发上限的名额。本机默认池 [bing, baidu, aliyun, anysearch] 里
 * baidu/aliyun 都没 key，上限设 3 时取走的正是这三个不可用的，唯一能跑的 anysearch
 * 被切掉，整次 multi 直接失败。
 *
 * 收录纪律（有交叉校验断言钉住）：**只收 index.js 里 runEngineTest 显式
 * `if (!key) return { error: "<ENV> not configured" }` 的引擎**，与代码自身对
 * 「缺 key」的声明严格一致。
 *   - 免 key 引擎 ddg/ddg-lite/bing/searxng 不收；
 *   - 有免 key 兜底的 anysearch（key 可空）/ exa、parallel（回落 MCP）/ you（无 key 走免 key 档）不收；
 *   - tavily/keenable/firecrawl 分支没有 not configured 检查（缺 key 时会带着空串去请求，
 *     以鉴权失败收场），暂不收——那属于另一个行为变更，需单独决定。
 * settings 字段必须带上：只在环境变量里找 key 会漏掉「仅填在设置页」的用户。
 */
export const REQUIRED_CREDENTIALS = {
  perplexity: [{ env: "PERPLEXITY_API_KEY", settings: "perplexityApiKey" }],
  "deepseek-official": [{ env: "DEEPSEEK_API_KEY", settings: "deepseekApiKey" }],
  "deepseek-tools": [{ env: "DEEPSEEK_API_KEY", settings: "deepseekApiKey" }],
  serpbase: [{ env: "SERPBASE_API_KEY", settings: "serpbaseApiKey" }],
  serply: [{ env: "SERPLY_API_KEY", settings: "serplyApiKey" }],
  outcrawl: [{ env: "OUTCRAWL_API_KEY", settings: "outcrawlApiKey" }],
  google: [{ env: "GOOGLE_CSE_API_KEY", settings: "googleCseApiKey" }],
  tinyfish: [{ env: "TINYFISH_API_KEY", settings: "tinyfishApiKey" }],
  jina: [{ env: "JINA_API_KEY", settings: "jinaApiKey" }],
  baidu: [{ env: "BAIDU_API_KEY", settings: "baiduApiKey" }],
  kimi: [{ env: "MOONSHOT_API_KEY", settings: "kimiApiKey" }],
  aliyun: [{ env: "DASHSCOPE_API_KEY", settings: "aliyunApiKey" }],
  doubao: [
    { env: "DOUBAO_SEARCH_API_KEY", settings: "doubaoApiKey" },
    { env: "WEB_SEARCH_API_KEY", settings: null },
  ],
  zhihu_global: [{ env: "ZHIHU_API_KEY", settings: "zhihuApiKey" }],
  zhihu_site: [{ env: "ZHIHU_API_KEY", settings: "zhihuApiKey" }],
  openai: [{ env: "OPENAI_API_KEY", settings: "openaiApiKey" }],
  gemini: [
    { env: "GEMINI_API_KEY", settings: "geminiApiKey" },
    { env: "GOOGLE_API_KEY", settings: null },
  ],
  claude: [{ env: "ANTHROPIC_API_KEY", settings: "claudeApiKey" }],
};

/** 该引擎需要哪些凭据描述符；不需要凭据（免 key / 有兜底）时返回 null。 */
export function credentialRequirement(engine) {
  const req = REQUIRED_CREDENTIALS[engine];
  if (!req) return null;
  return req.map((d) => ({ ...d }));
}

/**
 * 引擎凭据是否齐备。`isAvailable(engine)` 由调用方提供（服务端负责真正解析凭据），
 * 这里只做判定与分流，保持纯函数、可离线断言。
 * 未知引擎一律算合格——宁放过，不误杀未来的新引擎。
 */
export function isCredentialEligible(engine, isAvailable) {
  if (!credentialRequirement(engine)) return true;
  return Boolean(isAvailable && isAvailable(engine));
}

/**
 * 按凭据把候选池分成「合格」与「缺凭据」两份，顺序均保持原样。
 * 调用方应把 missing 记进 skipped 备注，让用户仍然看得见某引擎为什么没跑。
 */
export function partitionByCredentials(engines, isAvailable) {
  const eligible = [];
  const missing = [];
  for (const engine of Array.isArray(engines) ? engines : []) {
    if (isCredentialEligible(engine, isAvailable)) eligible.push(engine);
    else missing.push(engine);
  }
  return { eligible, missing };
}
