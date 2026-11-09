// research 工具：一次调用 = 多引擎搜索(multi) + Stage A 候选重排 + 抓取 top-N 正文 + Stage B 段落选窗 + 契约化证据输出。
// 契约：D:\维护\多引擎并发方案-v4-3-施工契约版.md 第 2.2-2.6 节（T2 主链路）。
// 零新增依赖：T1 走平台 ctx.web.fetch（第二参数支持 signal），T2 exa contents / T3 firecrawl / T4 crawl4ai 用 node:https 直连 REST。
// 注意：本文件不用全局 fetch(undici) 访问 api.crawl4ai.com——其 Pingora 网关会空 401 拦截 undici 特征。

import { defineTool } from "@deepseek-ai/dsh-tools";
import { getFresh, put as cachePut, search as cacheSearch } from "./cache.js";
import { rerank, embed, cosineMatrix, decide, judgeQueryIntent } from "./rerank.js";
import { promptLanguageOf, toolDescription, toolParam, localizedEffect } from "./prompt_i18n.js";
import { httpsJson, htmlToText, callExa, callFirecrawl, callCrawl4ai } from "./fetch_upstream.js";
import { isDomainBlocked } from "./domain_filter.js";

// 模型组件的受控替身（测试/评审用；抓取层的替身在 fetch_upstream.js 的 CONTROLLED_STUBS）
export const CONTROLLED_STUBS = { rerank: null, embed: null, decide: null, judgeQueryIntent: null };

// ---------- 模型层调用包装（#75）----------
// 这四个 call* 包装层自 PR #59（v0.8.0）起被 9 处调用却从未定义：
// 平时被 state.rerankKey / state.decisionKey 守卫短路，所以看不出来；一旦配了
// SILICONFLOW_RERANK_API_KEY 走 embed 分支就 ReferenceError，整个 research 工具不可用。
// DECISION_MODEL_* 同理：现在没人配所以不炸，配了会以相同方式炸（callDecide is not defined）。
// 统一在这里透传：替身优先，否则走底层实现——与上面 CONTROLLED_STUBS 的既有设计一致。
async function callRerank(query, documents, apiKey) {
  return CONTROLLED_STUBS.rerank ? CONTROLLED_STUBS.rerank(query, documents, apiKey) : rerank(query, documents, apiKey);
}
async function callEmbed(texts, apiKey) {
  return CONTROLLED_STUBS.embed ? CONTROLLED_STUBS.embed(texts, apiKey) : embed(texts, apiKey);
}
async function callDecide(state, questions, apiKey) {
  return CONTROLLED_STUBS.decide ? CONTROLLED_STUBS.decide(state, questions, apiKey) : decide(state, questions, apiKey);
}
async function callJudgeQueryIntent(question, apiKey) {
  return CONTROLLED_STUBS.judgeQueryIntent ? CONTROLLED_STUBS.judgeQueryIntent(question, apiKey) : judgeQueryIntent(question, apiKey);
}

// ---------- 阶段开关（补搜/embedding 去重已实现，默认开启；key 缺失或调用失败一律静默降级为阶段一行为；宽模式已被升级池取代并移除） ----------

export const ENABLE_REWRITE = true; // 阶段二：闸门双信号（规则缺口 + decision noul P(yes)<0.6）一致指向不足才补搜一轮
export const ENABLE_EMBED_DEDUP = true; // 阶段三：抓取前语义相似(>0.92)仅作簇标记补充（不删源）；抓取后 cos>0.95 且无 publishedAt 差异才折叠正文

// ---------- 引擎池（用户定案 2026-10-05：主并发池 + 质量升级池，取代 zh/en 分池与宽模式） ----------

/** 主并发池默认六引擎：multi 模式并发全集（语言不再分池）；index.js 的 routeEngines/runMultiSearch 引用，config.primaryPool 可覆盖。 */
export const DEFAULT_PRIMARY_POOL = ["anysearch", "exa", "keenable", "bing", "zhihu_global", "parallel"];

/** 质量升级池默认引擎：证据闸门判 insufficient 的补搜轮专用（第二轮不重复主池）；config.escalationEngines 可覆盖。 */
export const DEFAULT_ESCALATION_ENGINES = ["doubao", "baidu", "aliyun", "firecrawl", "kimi"];

/** 升级池解析：未配置/全空 → 默认池；配置项去重保序、剔空串（非法引擎 id 由 index.js runMultiSearch 的 ALL_ENGINES 过滤兜底）。 */
export function resolveEscalationEngines(configured) {
  const pool = Array.isArray(configured)
    ? [...new Set(configured.filter((engine) => typeof engine === "string" && engine.trim()))]
    : [];
  return pool.length > 0 ? pool : [...DEFAULT_ESCALATION_ENGINES];
}

// ---------- 输出打磨（formatting.py 等价物） ----------

const CJK_RE = /[\u4e00-\u9fff\u3040-\u30ff]/g;

/** 粗估 token：CJK ≈ 1.5 字/token，其余 ≈ 4 字符/token。 */
export function estimateTokens(text) {
  if (!text) return 0;
  const cjk = (text.match(CJK_RE) || []).length;
  return Math.ceil(cjk / 1.5 + (text.length - cjk) / 4);
}

const BOUNDARIES = ["\n\n", "\n", "。", "！", "？", ". ", "! ", "? ", " "];

/** 边界感知截断：优先在句子边界断开（≥60% 预算处），返回 [文本, 是否截断]。 */
export function smartTruncate(text, maxChars) {
  if (!text || text.length <= maxChars) return [text ?? "", false];
  const head = text.slice(0, maxChars);
  for (const b of BOUNDARIES) {
    const i = head.lastIndexOf(b);
    if (i >= maxChars * 0.6) return [head.slice(0, i + b.length), true];
  }
  return [head, true];
}

/** ISO 时间 → "3d ago" 式年龄短语；无效返回 ""。 */
export function agePhrase(iso) {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}min ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  if (s < 7 * 86400) return `${Math.round(s / 86400)}d ago`;
  if (s < 30 * 86400) return `${Math.round(s / (7 * 86400))}w ago`;
  if (s < 365 * 86400) return `${Math.round(s / (30 * 86400))}mo ago`;
  return `${Math.round(s / (365 * 86400))}y ago`;
}

// ---------- 契约 2.5 预算（可执行不等式） ----------

export const DEADLINE_MS = 90_000; // 覆盖排队/请求/回退/整理；到点取消在途、排队与回退任务不再启动
export const SEARCH_REQUESTS_MAX = 12; // 全部搜索调用（含回退/重试）
export const RERANK_CANDIDATE_MAX = 12; // Stage A 候选
export const RERANK_WINDOW_MAX = 48; // Stage B 窗口
export const RERANK_INPUT_MAX = RERANK_CANDIDATE_MAX + RERANK_WINDOW_MAX;

/** 预算对象：每次外呼前 budgetAllows() 检查、budgetUse() 计数；deadline 到点由 execute 的定时器置位并 abort。 */
export function makeBudget(depth, nowMs = Date.now()) {
  const fetchMax = ENABLE_REWRITE ? depth * 2 : depth; // firstRound + rewrite ≤ depth(+≤depth)；阶段一关闭补搜故 = depth
  return {
    deadlineAt: nowMs + DEADLINE_MS,
    fetchMax,
    searchRequestsMax: SEARCH_REQUESTS_MAX,
    fetchAttemptsMax: fetchMax + 4, // 含四层回退（direct/exa/firecrawl/crawl4ai）与重试的全部抓取尝试（契约 2.5 公式不变）
    rerankCandidateMax: RERANK_CANDIDATE_MAX,
    rerankWindowMax: RERANK_WINDOW_MAX,
    searchRequestsUsed: 0,
    fetchesUsed: 0, // 成功入账的文档数（≤ fetchMax）
    fetchAttemptsUsed: 0,
    rerankCandidateUsed: 0,
    rerankWindowUsed: 0,
    controller: new AbortController(),
    deadlineHit: false,
    exhausted: null, // 'searchRequests' | 'fetches' | 'fetchAttempts' | 'rerankCandidates' | 'rerankWindows'
    get rerankMax() {
      return RERANK_INPUT_MAX;
    },
    get rerankUsed() {
      return this.rerankCandidateUsed + this.rerankWindowUsed;
    },
    get expired() {
      return this.deadlineHit || Date.now() >= this.deadlineAt;
    },
  };
}

/** 外呼前检查；超限置 exhausted 并返回 false（调用方记 budget_exhausted 注记）。 */
export function budgetAllows(budget, kind) {
  if (budget.expired) return false;
  const cap = {
    search: ["searchRequestsUsed", "searchRequestsMax", "searchRequests"],
    fetchAttempt: ["fetchAttemptsUsed", "fetchAttemptsMax", "fetchAttempts"],
    rerankCandidate: ["rerankCandidateUsed", "rerankCandidateMax", "rerankCandidates"],
    rerankWindow: ["rerankWindowUsed", "rerankWindowMax", "rerankWindows"],
  }[kind];
  if (!cap) return false;
  if (kind === "fetchAttempt" && budget.fetchesUsed >= budget.fetchMax) {
    budget.exhausted ??= "fetches";
    return false;
  }
  if (budget[cap[0]] >= budget[cap[1]]) {
    budget.exhausted ??= cap[2]; // 契约 kind 名，与 makeBudget 注释枚举一一对应
    return false;
  }
  return true;
}

export function budgetUse(budget, kind, n = 1) {
  if (kind === "search") budget.searchRequestsUsed += n;
  else if (kind === "fetchAttempt") budget.fetchAttemptsUsed += n;
  else if (kind === "fetch") budget.fetchesUsed += n;
  else if (kind === "rerankCandidate") budget.rerankCandidateUsed += n;
  else if (kind === "rerankWindow") budget.rerankWindowUsed += n;
}

// ---------- 契约 2.4 意图（规则版：task × freshness × language；决策模型 judgeQueryIntent 阶段二再接） ----------

/** 当前性→缓存重验证窗（ms）。契约修订 8：与"内容时间范围"分开取值，不共用时长；
 * 内容时段不做发布时间硬过滤（"最新版本"可能发布于上月），故 freshness 只用于缓存重验证。 */
export const FRESHNESS_CACHE_MS = { day: 24 * 3600 * 1000, week: 7 * 24 * 3600 * 1000, month: 30 * 24 * 3600 * 1000 };

const RE_COMPARISON = /(对比|比较|区别|差异|哪个好|哪个更好|哪个更|优劣势|优缺点|还是好|vs\.?\s|\bversus\b)/i;
const RE_FACT = /(是什么|什么是|含义|定义|是指|意思|指的是)/;
const RE_NAV = /(官网|官方网站|下载地址|下载页|镜像站|仓库地址|项目主页)/;
const RE_FRESH_DAY = /(今天|今日|刚刚|几个小时|24小时|24 小时|today)/i;
const RE_FRESH_WEEK = /(本周|这周|最近一周|近一周|过去7天|过去 7 天|近7天|7天内|last week|this week)/i;
const RE_FRESH_MONTH = /(最新|最近|近期|本月|这个月|近一个月|近30天|过去一个月|latest|recent|last month|this month)/i;

export function judgeIntentRules(question) {
  const q = String(question || "");
  const cjk = (q.match(/[\u4e00-\u9fff]/g) || []).length;
  const language = q.length && cjk / q.length > 0.3 ? "zh" : "en";
  const comparison = RE_COMPARISON.test(q);
  const task = RE_NAV.test(q) && !comparison ? "nav" : RE_FACT.test(q) && !comparison ? "fact" : "research";
  let freshness = "none";
  if (RE_FRESH_DAY.test(q)) freshness = "day";
  else if (RE_FRESH_WEEK.test(q)) freshness = "week";
  else if (RE_FRESH_MONTH.test(q)) freshness = "month";
  return { task, comparison, freshness, language, source: "rules" };
}

/** 比较型分方提取：X 和/与/还是/vs Y。失败返回 null（缺口检查降级为 unknown）。
 * 2026-10-05 收口修复（送审报告观察项 2 的句式）：① 句首裸"对比/比较"先剥离，避免吞掉整个甲方
 * （"对比 Qwen3.8 和 GLM 5.1 …" 原先 side-A 被"对比.*"关键词清空 → null）；② 拉丁产品名后跟中文限定语时
 * 分方以实体名为准（"GLM 5.1 本地部署的显存需求" → "GLM 5.1"），缺口检查用完整长短语几乎永不命中。 */
export function extractComparisonSides(question) {
  const parts = String(question || "")
    .split(/\s*(?:和|与|跟|同|还是|versus|vs\.?)\s*/i)
    .map((p) =>
      p
        .replace(/^(请问|帮我|我想知道|比较一下|对比一下|分析一下|说说|讲讲|对比|比较)/, "")
        .replace(/(的)?(优缺点|优劣势|区别|差异|对比|比较|性能|价格|速度|哪个好|哪个更好|哪个更适合|怎么样|如何|特点|利弊).*/g, "")
        .replace(/^\s*([\w.\-+#]+(?:\s+[\w.\-+#]+)*)\s*[\u4e00-\u9fff].*$/, "$1")
        .replace(/[，。？！,.?!\s]+$/, "")
        .trim()
    )
    .filter(Boolean);
  if (parts.length < 2) return null;
  const [a, b] = parts;
  if (!a || !b || a.length > 40 || b.length > 40) return null; // 提取异常长串视为失败 → unknown
  return [a, b];
}

/** 阶段二 #1：意图判定升级——规则版打底，decision key 可用时 judgeQueryIntent 覆盖 task/breadth（失败静默保规则版）。
 * 决策模型的 timely 无契约 2.4 对应维度，并入 research；comparison 标记与 freshness 始终用规则版（决策模型不问这两维）。 */
export async function judgeIntentWithDecision(question, rulesIntent, decisionKey) {
  if (!decisionKey) return { ...rulesIntent, breadth: 1, source: "rules" };
  const dm = await callJudgeQueryIntent(question, decisionKey);
  if (!dm || !dm.type) return { ...rulesIntent, breadth: 1, source: "rules" };
  const task = ["fact", "research", "timely", "nav"].includes(dm.type) ? (dm.type === "timely" ? "research" : dm.type) : rulesIntent.task;
  const breadth = Number.isFinite(Number(dm.breadth)) ? Math.min(3, Math.max(0, Number(dm.breadth))) : 1;
  return { ...rulesIntent, task, breadth, source: "decision" };
}

// （阶段三 #6 宽模式已删除：升级池取代宽模式——补搜轮引擎来自 escalationEngines，见上方引擎池区）

// ---------- 契约 2.3 聚类（规范 URL 去重键候选 + 精确标题软簇） ----------

export const CLUSTER_PENALTY = 0.15; // 同簇非代表在抓取排序中的降权（实验参数，复审二.1）

/** 规范 URL：www/m/mobile 前缀合并仅作去重键候选（原始 URL 一律保留在 source.url；仅重定向确认等价才合并身份——阶段一不追重定向）。 */
export function normDedupeKey(u) {
  try {
    const x = new URL(u);
    const h = x.hostname.toLowerCase().replace(/^(www|m|mobile)\./, "");
    return h + x.pathname.replace(/\/+$/, "") + x.search;
  } catch {
    return u;
  }
}

export function normTitleKey(t) {
  return String(t || "").trim().replace(/\s+/g, "");
}

/** 候选构建：URL 键去重 → 精确标题同簇（簇内首个成员为代表，其余降权待命）。
 * 返回 items（原顺序）+ 簇表。契约 2.3：代表失败/版本日期来源差异/明显缺项 → 成员在剩余预算内可再入队。 */
export function buildClusters(sources) {
  const seenKeys = new Set();
  const titleMap = new Map(); // normTitle → clusterId
  const items = [];
  const clusters = new Map(); // clusterId → { members: [itemIndex], publishedAtSet: Set }
  let clusterSeq = 0;
  for (const s of sources) {
    if (!s || typeof s.url !== "string") continue;
    // #72：黑名单域在候选构建阶段就剔除——items / 簇 / 正文三层都不会再出现它
    if (isDomainBlocked(s.url)) continue;
    const key = normDedupeKey(s.url);
    if (seenKeys.has(key)) continue; // 同键（www/m/mobile 归一）只留首个原始 URL
    seenKeys.add(key);
    const t = normTitleKey(s.title);
    let clusterId = null;
    if (t) {
      const existing = titleMap.get(t);
      if (existing) clusterId = existing;
      else {
        clusterId = `c${++clusterSeq}`;
        titleMap.set(t, clusterId);
        clusters.set(clusterId, { members: [], publishedAtSet: new Set() });
      }
      clusters.get(clusterId).members.push(items.length);
      if (s.publishedAt) clusters.get(clusterId).publishedAtSet.add(String(s.publishedAt));
    }
    items.push({ source: s, key, clusterId, isRep: true });
  }
  // 代表 = 簇内第一个出现的成员；其余标记非代表（抓取排序降权，可再入队）
  for (const c of clusters.values()) {
    for (let i = 1; i < c.members.length; i++) items[c.members[i]].isRep = false;
  }
  return { items, clusters };
}

/** 簇是否有版本/日期/来源差异（成员 publishedAt 不一致 → 值得再入队核对）。 */
export function clusterHasVariant(cluster) {
  return cluster.publishedAtSet.size > 1;
}

// ---------- 契约 2.2 闸门（阶段二：noul 二信号 + 规则改写候选） ----------

export const NOUL_SUFFICIENT_P = 0.6; // 实验参数（契约 2.2：P(yes) ≥ 0.6 判 yes）

/** noul 答案 → P(yes) 数值；不可解析返回 null（null ≠ 0：不能判断时保守不补搜）。
 * 兼容形状（端点要求 noul criteria 键为 true/false，故答案可能用 true/false 而非 yes/no）：
 * {p_yes} | {p_yes:{yes,true}} | {probability:{yes,true}} | {probability:number} | {yes,true:number} | {choice/value:"yes|true|no|false", confidence}。 */
export function parseNoulProbability(ans) {
  if (!ans || typeof ans !== "object") return null;
  const num = (v) => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1 ? v : null);
  // 端点实测形状：{"type":"noul","noul":0.41}——noul 字段即 P(true)
  const p = ans.noul ?? ans.p_yes ?? ans.pYes ?? ans.probability ?? ans.yes ?? ans.true;
  if (typeof p === "number") return num(p);
  if (p && typeof p === "object") {
    if (p.yes !== undefined) return num(p.yes);
    if (p.true !== undefined) return num(p.true);
  }
  const choice = String(ans.choice ?? ans.value ?? "");
  const conf = num(ans.confidence);
  if (choice && conf !== null) return ["yes", "true"].includes(choice) ? conf : 1 - conf;
  return null;
}

/** P(yes) ≥ 0.6 视为证据充分（不补搜）；null（不能判断）返回 false 且调用方须单独区分。 */
export function isSufficientP(pYes) {
  return pYes !== null && pYes >= NOUL_SUFFICIENT_P;
}

/** decision 模型 noul 询问："当前证据是否足以回答该问题"。失败返回 null（decide 内部已捕获异常）。
 * 注意：端点强制 noul criteria 键 ⊆ {true,false}（yes/no 会 400）。 */
export async function askNoulSufficiency(question, evidenceBrief, decisionKey) {
  if (!decisionKey) return null;
  const answers = await callDecide(
    `问题：${question}\n证据概要：${evidenceBrief}`,
    {
      sufficient: {
        type: "noul",
        instructions: "当前证据是否足以回答该问题",
        criteria: { true: "选中正文可直接支撑该问题的答案", false: "证据缺失、只覆盖单方或不可靠" },
      },
    },
    decisionKey
  );
  return parseNoulProbability(answers?.sufficient);
}

/** 查询规范化：去空白与标点、统一小写（修订 11：规范化后相同 → 不重发）。 */
export function normQuery(q) {
  return String(q || "")
    .toLowerCase()
    .replace(/[\s，。？！、,.?!'"`（）()【】\[\]{}:：;；\-—_=+*#@&|/\\~^$%]+/gu, "");
}

/** 改写必须保留的受保护词元：实体依托的版本号/日期/否定词/错误码（丢失即改变问题本义）。 */
export function extractProtectedTokens(question) {
  const s = String(question || "");
  return {
    versions: s.match(/\bv?\d+\.\d+(\.\d+)?\w*\b/gi) || [],
    dates: s.match(/\d{4}[-/]\d{1,2}([-/]\d{1,2})?|\d{4}年\d{1,2}月|\b(19|20)\d{2}\b/g) || [],
    negations: s.match(/不|没|无法|不能|禁止|无需|cannot|can'?t|not\b|don'?t|won'?t|fail(s|ed)? to/gi) || [],
    errorCodes: [
      ...(s.match(/\b[A-Z][A-Z0-9]*(?:[-_][A-Z0-9]+)+\b/g) || []).filter((t) => /\d/.test(t)), // ERR_CONN_1001 / ERR-404 / HTTP_500（须含数字段）
      ...(s.match(/\bE[A-Z]{2,}\b/g) || []), // ECONNREFUSED
      ...(s.match(/\bHTTP \d{3}\b/g) || []),
      ...(s.match(/\b0x[0-9A-Fa-f]+\b/g) || []),
    ],
  };
}

/** 规则版改写候选（修订 11：候选须声明变更的约束或所补缺项；规范化后相同不发；≤3 个）。
 * 每个候选保留全部受保护词元。declares 写入 notes。 */
export function generateRewrites(question, missingSides, intent) {
  const prot = extractProtectedTokens(question);
  const must = [...prot.versions, ...prot.dates, ...prot.negations, ...prot.errorCodes];
  const keepsProtected = (q) => must.every((m) => q.toLowerCase().includes(m.toLowerCase()));
  const baseNorm = normQuery(question);
  const out = [];
  const seen = new Set([baseNorm]);
  const push = (query, declares) => {
    const q = String(query || "").trim();
    const n = normQuery(q);
    if (!q || !n || seen.has(n) || !keepsProtected(q) || out.length >= 3) return;
    seen.add(n);
    out.push({ query: q, declares });
  };
  // ① 比较缺方：为缺方实体定向补证（变更约束=补缺项）
  for (const side of missingSides || []) push(`${side} 特性 官方文档 ${question}`, `补缺方证据：${side}`);
  // ② 来源限定：官方文档/changelog 渠道收窄（变更约束=来源）
  push(`${question} 官方文档 changelog release notes`, "来源限定：官方文档/changelog");
  // ③ 查询精化：去疑问套话 + 比较型补"对比 评测"（变更约束=查询精化）
  const refined = String(question).replace(/请问|帮我|我想知道|分析一下|说说|讲讲|一下/g, "").trim() + (intent?.comparison ? " 对比 评测" : "");
  push(refined, "查询精化：去疑问套话/补比较词");
  return out;
}

/** decision choice 从 ≤3 候选挑 1（c1..c3）；失败/无法解析取首个合格候选。 */
export async function pickRewrite(candidates, question, gapBrief, decisionKey) {
  if (!candidates.length) return null;
  if (!decisionKey || candidates.length === 1) return candidates[0];
  const criteria = {};
  candidates.forEach((c, i) => (criteria[`c${i + 1}`] = c.declares));
  const answers = await callDecide(
    `问题：${question}\n证据缺口：${gapBrief}`,
    { pick: { type: "choice", instructions: "选出最可能补齐证据缺点的查询改写", criteria } },
    decisionKey
  );
  const pick = String(answers?.pick?.choice ?? "");
  const idx = /^c([1-3])$/.test(pick) ? Number(pick.slice(1)) - 1 : -1;
  return idx >= 0 && idx < candidates.length ? candidates[idx] : candidates[0];
}

/** 证据缺口检查（契约 2.2/修订 10：比较型分方检查；fact 型实体出现仅为记录量，不当充分性）。
 * 返回 { missingSides, notes }；sides=null（提取失败）时 notes 标 unknown。 */
export function checkEvidenceGaps(documents, sides, question) {
  const notes = [];
  if (!sides) return { missingSides: [], notes };
  const corpus = documents.map((d) => `${d.title || ""} ${d.content || ""}`).join(" ").toLowerCase();
  const missingSides = sides.filter((s) => !corpus.includes(String(s).toLowerCase()));
  for (const side of missingSides) notes.push(`evidence gap: side "${side}" not covered by fetched evidence (heuristic check)`);
  return { missingSides, notes };
}

/** 二轮合并（首轮文档永不丢弃）+ 第二轮三布尔（契约修订 12：记录事实，不用新簇数证明增益）。 */
export function mergeDocuments(firstDocs, secondDocs) {
  return [...firstDocs, ...secondDocs]; // 首轮在前，永不丢弃
}

export function computeRound2Flags({ firstRoundUrls, secondRoundItems, secondRoundFetchedUrls, missingSidesBefore, mergedDocuments }) {
  const newContent = secondRoundItems.some((it) => !firstRoundUrls.has(it.key));
  const newBody = secondRoundFetchedUrls.some((u) => !firstRoundUrls.has(normDedupeKey(u)));
  const corpus = mergedDocuments.map((d) => `${d.title || ""} ${d.content || ""}`).join(" ").toLowerCase();
  const gapFilled = missingSidesBefore.length > 0 && missingSidesBefore.every((s) => corpus.includes(String(s).toLowerCase()));
  return { new_body: newBody, new_content: newContent, gap_filled: gapFilled };
}

// ---------- 契约 2.3 阶段三：embedding 语义簇（仅标记）与正文折叠 ----------

export const SEMANTIC_TAG_THRESHOLD = 0.92; // 抓取前：标题+摘要相似 → 仅簇标记补充（不删不排除）
export const BODY_FOLD_THRESHOLD = 0.95; // 抓取后：正文相似折叠阈值

/** 语义簇标记：对 candidates（cos 矩阵 >threshold）做并查集，产出每项的 sN 标签。
 * 仅作补充：已有精确标题簇（clusterId）的项不改；源数组不删不排除任何成员；单元素不成簇不标记。
 * 返回 [tags, nClusters]。 */
export function semanticClusterTags(haveExactCluster, matrix, threshold = SEMANTIC_TAG_THRESHOLD) {
  const n = haveExactCluster.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x) => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (haveExactCluster[i] || haveExactCluster[j]) continue; // 精确簇优先，不覆盖
      if (matrix?.[i]?.[j] > threshold) parent[find(i)] = find(j);
    }
  }
  const rootSize = new Map();
  for (let i = 0; i < n; i++) {
    if (haveExactCluster[i]) continue;
    const r = find(i);
    rootSize.set(r, (rootSize.get(r) || 0) + 1);
  }
  const rootSeq = new Map();
  const tags = Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    if (haveExactCluster[i]) continue;
    const r = find(i);
    if (rootSize.get(r) < 2) continue; // 相似对不存在 → 不标记（标记本身表示"簇成员"）
    if (!rootSeq.has(r)) rootSeq.set(r, `s${rootSeq.size + 1}`);
    tags[i] = rootSeq.get(r);
  }
  return [tags, new Set(tags.filter(Boolean)).size];
}

/** 正文折叠计划：cos>threshold 且 publishedAt 相同（双方均在场才可判"同"；unknown/unknown 不折叠）且
 * 数值一致（双方都含数字且集合不同 → 关键数字相反，不折叠；任一方无数字不构成矛盾）→ 折叠组
 * [repIdx, [memberIdx...], cosMax]。entries 可带 .content 供数字一致性检查（缺省视为无矛盾，纯函数兼容旧调用）。
 * 代表=数组靠前（ranked 序）；已折叠成员不再折给第三者。纯函数不动原文档。 */
const NUM_TOKENS = (s) => new Set(String(s ?? "").match(/\d+(?:\.\d+)?/g) || []);
const NUMERICALLY_CONSISTENT = (a, b) => {
  if (a === undefined || b === undefined) return true; // 调用方未提供正文：无证据表明矛盾，交由 cos/日期判定
  const na = NUM_TOKENS(a);
  const nb = NUM_TOKENS(b);
  if (!na.size || !nb.size) return true; // 任一方无数字：数字维度无矛盾
  if (na.size !== nb.size) return false;
  for (const x of na) if (!nb.has(x)) return false;
  return true;
};
export function planFolding(entries, matrix, threshold = BODY_FOLD_THRESHOLD) {
  const folded = new Set();
  const plans = [];
  for (let i = 0; i < entries.length; i++) {
    if (folded.has(i)) continue;
    const members = [];
    let cosMax = 0;
    for (let j = i + 1; j < entries.length; j++) {
      if (folded.has(j)) continue;
      const cos = matrix?.[i]?.[j] ?? 0;
      const da = entries[i].source?.publishedAt;
      const db = entries[j].source?.publishedAt;
      const sameDate = Boolean(da && db) && String(da) === String(db); // 双方在场且相同；unknown ≠ 确认同版
      if (cos > threshold && sameDate && NUMERICALLY_CONSISTENT(entries[i].content, entries[j].content)) {
        members.push(j);
        folded.add(j);
        cosMax = Math.max(cosMax, cos);
      }
    }
    if (members.length) plans.push({ repIdx: i, memberIdx: members, cos: cosMax });
  }
  return plans;
}

// ---------- 契约 2.6 / 修订 7：Stage B 结构分窗（有界窗口、保位置、不截头） ----------

export const WIN_MAX_CHARS = 512; // 每窗字符上界（有界窗口；按句界切，保留原位置索引）

/** 全文→窗口序列。结构规则：``` 代码块整窗不拆；连续 ≥2 行 | 开头=表格整窗不拆；段落按 \n\n 切；
 * 长段按句界（。！？.!?）累积成 ≤maxChars 的有界窗口（不截头：从头累积，溢出成新窗），无句界的超长句按 maxChars 硬切。
 * 返回 [{ text, pos, kind: "para"|"table"|"code" }]，pos 为原文顺序索引。 */
export function splitWindows(text, maxChars = WIN_MAX_CHARS) {
  const out = [];
  if (!text) return out;
  let pos = 0;
  const push = (t, kind) => {
    const v = String(t).trim();
    if (v) out.push({ text: v, pos: pos++, kind });
  };
  // 1) 代码围栏整块提取（未闭合的尾部 ``` 也作整块）
  const segs = [];
  const fenceRe = /```[\s\S]*?(?:```|$)/g;
  let last = 0;
  let m;
  while ((m = fenceRe.exec(text))) {
    if (m.index > last) segs.push({ type: "text", value: text.slice(last, m.index) });
    segs.push({ type: "code", value: m[0] });
    last = m.index + m[0].length;
    if (m[0].length === 0) fenceRe.lastIndex++; // 防零宽死循环
  }
  if (last < text.length) segs.push({ type: "text", value: text.slice(last) });

  const windowsForParagraph = (p) => {
    if (p.length <= maxChars) return [p];
    const sentences = p.match(/[^。！？!?.]*[。！？!?.]+|[^。！？!?.]+$/g) || [p];
    const wins = [];
    let cur = "";
    const flush = () => {
      if (cur.trim()) wins.push(cur.trim());
      cur = "";
    };
    for (let s of sentences) {
      while (s.length > maxChars) {
        // 无句界超长串：硬切成有界窗（不截头——每段都保留）
        flush();
        wins.push(s.slice(0, maxChars));
        s = s.slice(maxChars);
      }
      if (cur && cur.length + s.length > maxChars) flush();
      cur += s;
    }
    flush();
    return wins;
  };

  for (const seg of segs) {
    if (seg.type === "code") {
      push(seg.value, "code");
      continue;
    }
    // 2) 文本段：行扫描——表格行组原子化，其余按空行分段
    const lines = seg.value.split("\n");
    let i = 0;
    let paraBuf = [];
    const flushPara = () => {
      if (paraBuf.length) {
        for (const w of windowsForParagraph(paraBuf.join(" ").replace(/\s+/g, " ").trim())) push(w, "para");
        paraBuf = [];
      }
    };
    while (i < lines.length) {
      if (/^\s*\|/.test(lines[i])) {
        const start = i;
        while (i < lines.length && /^\s*\|/.test(lines[i])) i++;
        const rows = lines.slice(start, i);
        if (rows.length >= 2) {
          flushPara();
          push(rows.join("\n"), "table");
          continue;
        }
      }
      if (/^\s*$/.test(lines[i])) flushPara();
      else paraBuf.push(lines[i].trim());
      i++;
    }
    flushPara();
  }
  return out;
}

const QUERY_STOPWORDS = new Set([
  "what", "which", "how", "why", "when", "where", "who", "is", "are", "was", "the", "and", "for", "with", "vs",
  "compare", "difference", "between", "better", "best", "还是", "什么", "怎么", "哪个", "哪些", "如何", "区别", "差异", "对比", "比较", "优劣",
]);

/** 问题词元：英文词（≥3 字符，去停用词）+ CJK bigram。用于全篇轻筛。 */
export function queryTokens(question) {
  const q = String(question || "").toLowerCase();
  const tokens = new Set();
  for (const w of q.match(/[a-z][a-z0-9+#.-]{2,}/g) || []) if (!QUERY_STOPWORDS.has(w)) tokens.add(w);
  for (const run of q.match(/[\u4e00-\u9fff]+/g) || []) {
    if (run.length <= 2) tokens.add(run);
    else for (let i = 0; i + 2 <= run.length; i++) tokens.add(run.slice(i, i + 2));
  }
  return [...tokens];
}

/** 轻筛：含问题词元的窗口优先（命中数降序，同分按原位置），全篇皆可入池——后文有机会进入选窗（验收 #2）。 */
export function lightFilter(windows, tokens) {
  const score = (w) => {
    const t = w.text.toLowerCase();
    let n = 0;
    for (const tok of tokens) if (t.includes(tok)) n++;
    return n;
  };
  return [...windows].map((w, i) => ({ w, i, hits: score(w) })).sort((a, b) => b.hits - a.hits || a.w.pos - b.w.pos).map((x) => x.w);
}

/** rerank 输入的压缩表示（表格/代码块"判相关输入表示"≠输出原始结构块，修订 7）。
 * 第二参数做下限防御：Array.map 直传函数时 index 会落进 maxChars，一律回退默认值。 */
export function compactWindowRep(w, maxChars = 400) {
  const cap = Number.isFinite(maxChars) && maxChars >= 64 ? maxChars : 400;
  const t = w.text.replace(/\s+/g, " ").trim();
  return t.length <= cap ? t : t.slice(0, cap);
}

/** 窗口拼装：按原位置顺序输出，每窗 ¶位置 前缀；非相邻窗口各自成段（绝不拼接）；
 * 超出 token 份额的窗丢弃并计数（表格/代码块单独记 kinds），末尾标注省略。 */
export function assembleWindowText(keptWindows, tokenShare) {
  const ordered = [...keptWindows].sort((a, b) => a.pos - b.pos);
  const lines = [];
  let used = 0;
  let omitted = 0;
  const omittedKinds = new Set();
  for (const w of ordered) {
    const piece = `¶${w.pos + 1} ${w.text}`;
    const est = estimateTokens(piece);
    if (used + est > tokenShare) {
      omitted++;
      if (w.kind !== "para") omittedKinds.add(w.kind);
      continue;
    }
    lines.push(piece);
    used += est;
  }
  let textOut = lines.join("\n\n");
  if (omitted) {
    const kinds = omittedKinds.size ? ` (${[...omittedKinds].join("/")})` : "";
    textOut += `\n\n[${omitted} window(s) omitted: token budget${kinds}]`;
  }
  return { text: textOut, used, omitted };
}

// ---------- 分层抓取编排：T1 平台 fetch → T2 exa contents → T3 firecrawl → T4 crawl4ai（+ 契约 2.4 缓存时效两分 + 2.5 预算） ----------

const DOC_CACHE_MAX_AGE_MS = 7 * 24 * 3600 * 1000; // 存储 7 天（契约 2.4）
const T1_MIN_CHARS = 300; // T1 结果低于此视为失败，升级 T2
const FIRECRAWL_MAX_PER_CALL = 3; // 共享额度保护（1000 credits/月，三方共池）
const CRAWL4AI_MAX_PER_CALL = 2; // community 5 req/10s

// ---------- 服务级调度（契约 2.5：模块级，覆盖本插件 research 链；同进程并发调用共享受限） ----------
// 复审一.3 澄清：firecrawl/crawl4ai 是共享付费额度，原 per-call 计数会让并发 research 各自满额、
// 突破共享上限——改为模块级计数。声明边界：仅本插件入口；跨进程与宿主原生 MCP 调用不在覆盖内。
const SERVICE_LIMITS = { firecrawl: FIRECRAWL_MAX_PER_CALL, crawl4ai: CRAWL4AI_MAX_PER_CALL };
const SERVICE_USED = { firecrawl: 0, crawl4ai: 0 };

/** 占用一个服务调用槽位（同步原子：检查+递增；JS 单线程无 await 间隙）；满则 false。导出供并发验证。 */
export function borrowServiceSlot(name) {
  if (!(name in SERVICE_LIMITS) || SERVICE_USED[name] >= SERVICE_LIMITS[name]) return false;
  SERVICE_USED[name] += 1;
  return true;
}

export function serviceUsage() {
  return { used: { ...SERVICE_USED }, limits: { ...SERVICE_LIMITS } };
}

/** 缓存可用性两分（契约 2.4/修订 8）：存储新鲜度与"当前性"分开判定。
 * freshness!=="none" 时额外要求 fetched_at 距今 ≤ 对应窗（day/week/month），否则重抓；
 * month=30d > 7d 存储上限 → 等效必重抓，保留判断以自文档化。返回 [可用, 原因]。 */
export function canUseCache(fetchedAtMs, freshness, nowMs = Date.now()) {
  if (nowMs - fetchedAtMs > DOC_CACHE_MAX_AGE_MS) return [false, "stale-store"];
  const win = FRESHNESS_CACHE_MS[freshness];
  if (win !== undefined && nowMs - fetchedAtMs > win) return [false, `freshness-${freshness}`];
  return [true, ""];
}

/** T1 平台 fetch（宿主签名 fetch(request, signal?)，第二参必须是 AbortSignal 本体——
 *  传 { signal } 包装对象会一路传到 https.request 抛 TypeError，浏览器层也会缺 addEventListener）。 */
async function platformFetch(ctx, url, signal) {
  return await ctx.web.fetch({ url }, signal);
}

// 从 HTML 提取页面更新时间：article:modified_time / og:updated_time / JSON-LD dateModified / <time datetime>，
// 取不到返回空串。
function parseUpdatedFromHtml(html) {
  const s = String(html ?? "");
  const patterns = [
    /<meta[^>]+property=["']article:modified_time["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']article:modified_time["']/i,
    /<meta[^>]+property=["']og:updated_time["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:updated_time["']/i,
    /"dateModified"\s*:\s*"([^"]+)"/i,
    /<time[^>]+datetime=["']([^"']+)["']/i,
  ];
  for (const re of patterns) {
    const m = s.match(re);
    if (m && m[1]) return m[1];
  }
  return "";
}

/** 单 URL 抓取（含缓存两分与四层回退；每次网络尝试都过预算 gate）。成功返回：
 *  { content, tier, truncated, fetchedAt(ISO，缓存命中=真实原抓时间), updatedAt(可取得时), cache } */
async function fetchTiered(ctx, url, title, state, budget, intent) {
  // #72：黑名单站点直接不抓（缓存也不读）；不算失败，不写 note——这是用户主动配置的过滤
  if (isDomainBlocked(url)) return null;
  const now = Date.now();
  const cached = getFresh(url, DOC_CACHE_MAX_AGE_MS);
  if (cached && (intent.freshness === "none" || canUseCache(cached.fetched_at, intent.freshness, now)[0])) {
    // 契约：缓存命中另标 cache:true，fetched_at 保留真实抓取时间不替换
    return { content: cached.content, tier: "cache", truncated: false, fetchedAt: new Date(cached.fetched_at).toISOString(), updatedAt: "", cache: true };
  }
  if (cached) state.notes.push(`cache rejected for ${url}: ${canUseCache(cached.fetched_at, intent.freshness, now)[1]} (freshness=${intent.freshness}) — refetching`);

  // T1：平台官方 fetch provider（重定向/解码/大小限制白送）
  if (budgetAllows(budget, "fetchAttempt")) {
    budgetUse(budget, "fetchAttempt");
    try {
      const r = await platformFetch(ctx, url, budget.controller.signal);
      const raw = r?.body?.kind === "html" ? r.body.content : r?.body?.content || "";
      const content = r?.body?.kind === "html" ? htmlToText(raw) : String(raw || "");
      if (r.statusCode < 400 && content.length >= T1_MIN_CHARS) {
        cachePut(url, title, content);
        budgetUse(budget, "fetch");
        return { content, tier: "direct", truncated: Boolean(r.truncated), fetchedAt: new Date().toISOString(), updatedAt: parseUpdatedFromHtml(raw), cache: false };
      }
      if (r.statusCode >= 400) state.notes.push(`fetch direct failed for ${url}: HTTP ${r.statusCode}`);
      else state.notes.push(`fetch direct short for ${url}: ${content.length} chars (< ${T1_MIN_CHARS})`);
    } catch (e) {
      if (budget.controller.signal.aborted) return null; // deadline：不再启动回退
      state.notes.push(`fetch direct failed for ${url}: ${e.message}`);
    }
  }

  // T2：exa contents（$1/1000 页，文本质量好且便宜）——T1 失败（反爬/JS/过短）时承接；
  // 仅预算门控，不占 firecrawl 共享槽（firecrawl 额度保护：仅在本层失败后才走 T3）
  if (state.exaKey && budgetAllows(budget, "fetchAttempt")) {
    budgetUse(budget, "fetchAttempt");
    try {
      const text = await callExa(url, state.exaKey, budget.controller.signal);
      if (text.trim().length >= T1_MIN_CHARS) {
        cachePut(url, title, text);
        budgetUse(budget, "fetch");
        return { content: text, tier: "exa", truncated: false, fetchedAt: new Date().toISOString(), updatedAt: "", cache: false };
      }
    } catch (e) {
      state.notes.push(`exa fetch failed for ${url}: ${e.message}`);
    }
  }

  // T3：firecrawl（反爬/JS 页面）——模块级共享额度（同进程并发调用共同受限；先过预算门再占槽，避免无调用耗槽）
  if (state.firecrawlKey && budgetAllows(budget, "fetchAttempt") && borrowServiceSlot("firecrawl")) {
    budgetUse(budget, "fetchAttempt");
    try {
      const md = await callFirecrawl(url, state.firecrawlKey, budget.controller.signal);
      if (md.trim().length >= T1_MIN_CHARS) {
        cachePut(url, title, md);
        budgetUse(budget, "fetch");
        return { content: md, tier: "firecrawl", truncated: false, fetchedAt: new Date().toISOString(), updatedAt: "", cache: false };
      }
    } catch (e) {
      state.notes.push(`firecrawl fetch failed for ${url}: ${e.message}`);
    }
  }

  // T4：crawl4ai（备份）——模块级共享额度（先过预算门再占槽）
  if (state.crawl4aiKey && budgetAllows(budget, "fetchAttempt") && borrowServiceSlot("crawl4ai")) {
    budgetUse(budget, "fetchAttempt");
    try {
      const text = await callCrawl4ai(url, state.crawl4aiKey, budget.controller.signal);
      if (text.trim().length >= T1_MIN_CHARS) {
        cachePut(url, title, text);
        budgetUse(budget, "fetch");
        return { content: text, tier: "crawl4ai", truncated: false, fetchedAt: new Date().toISOString(), updatedAt: "", cache: false };
      }
    } catch (e) {
      state.notes.push(`crawl4ai fetch failed for ${url}: ${e.message}`);
    }
  }

  return null;
}

// ---------- 工具注册 ----------

const RESEARCH_SOURCE_FIELDS = {
  url: { type: "string" },
  title: { type: "string" },
  snippet: { type: "string" },
  publishedAt: { type: "string" },
};

const DOC_FIELDS = {
  url: { type: "string" },
  title: { type: "string" },
  kind: { type: "string", description: "body | snippet-only" }, // 摘要永远不可标 body（契约 2.6）
  text_origin: { type: "string", description: "original | provider-summary" },
  engine_hits: { type: "array", items: { type: "string" } },
  published: { type: "string", description: "带来源标注；缺失 = unknown" },
  updated_at: { type: "string", description: "页面级更新时间，可取得时" },
  fetched_at: { type: "string", description: "ISO；缓存命中保留真实抓取时间" },
  round: { type: "number" },
  cluster: { type: "string", description: "同标题簇 id；空串 = 无簇（schema 不收 null）" },
  independence: { type: "string", description: "unknown（阶段一）" },
  tier: { type: "string" },
  cache: { type: "boolean", description: "true = 命中本地缓存" },
  truncated: { type: "boolean" },
  content: { type: "string" },
};

/** 从 multi provider 的 content Note 解析引擎清单（provider.search 会剥除 per-source seenIn）。 */
function enginesFromNote(content) {
  const m = typeof content === "string" ? content.match(/enginesUsed: \[([^\]]*)\]/) : null;
  return m && m[1].trim() ? m[1].split(/,\s*/).filter(Boolean) : [];
}

export function registerResearchTool(ctx, { provider, resolveApiKey, wrapUntrustedBlock, escalationEngines, getConfig = () => ({}), ns, isToolDisabled = () => false } = {}) {  ctx.inject(["tools"], (sctx) => {
    localizedEffect(sctx, {
      label: "free-search: research tool",
      ns,
      getLang: () => promptLanguageOf(getConfig()),
      getEnabled: () => !(isToolDisabled("research") && isToolDisabled("cache_search")),
      register: (lang) => {
      const dispose = isToolDisabled("research") ? undefined : sctx.tools.register(
        defineTool({
          name: "research",
          description: toolDescription(lang, "research"),
          parameters: {
            question: { type: "string", description: toolParam(lang, "research", "question") },
            depth: { type: "number", description: toolParam(lang, "research", "depth") },
          },
          output: {
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                question: { type: "string" },
                engines: { type: "string" },
                estimatedTokens: { type: "number" },
                sources: { type: "array", items: { type: "object", additionalProperties: false, properties: RESEARCH_SOURCE_FIELDS } },
                documents: { type: "array", items: { type: "object", additionalProperties: false, properties: DOC_FIELDS } },
                notes: { type: "array", items: { type: "string" } },
              },
            },
            render(_args, value) {
              const src = value.sources.map((s, i) => {
                const age = s.publishedAt ? ` _(${agePhrase(s.publishedAt)})_` : "";
                return `- [${i + 1}] ${s.title || s.url} — ${s.url}${age}${s.snippet ? `\n      ${s.snippet}` : ""}`;
              });
              const docs = value.documents.map((d) => {
                const meta = [
                  `kind: ${d.kind}`,
                  `origin: ${d.text_origin}`,
                  `tier: ${d.tier}${d.cache ? " (cache)" : ""}`,
                  `cluster: ${d.cluster || "—"}`,
                  `round: ${d.round}`,
                  `independence: ${d.independence}`,
                  `engines: ${d.engine_hits.join(", ") || "—"}`,
                  `published: ${d.published}`,
                  `updated: ${d.updated_at || "—"}`,
                  `fetched: ${d.fetched_at}`,
                ].join(" · ");
                const mark = d.truncated ? " _(partial)_" : "";
                return `### ${d.title || d.url}${mark}\n[${d.url}]\n_${meta}_\n\n${d.content}`;
              });
              const notes = value.notes.length ? `\n## Notes\n${value.notes.map((n) => `- ${n}`).join("\n")}` : "";
              const brief =
                `# Research: ${value.question}\n` +
                `_engines: ${value.engines} · sources: ${value.sources.length} · documents: ${value.documents.length} · ~${value.estimatedTokens} tokens_\n\n` +
                `## Sources\n${src.join("\n") || "No results found."}\n\n` +
                `## Documents\n${docs.join("\n\n") || "(no documents fetched — snippets above are all we have)"}` +
                notes;
              return [{ type: "text", text: `Research brief:\n${wrapUntrustedBlock(brief)}` }];
            },
          },
          async execute(args) {
            const depth = Math.min(5, Math.max(1, Math.round(args.depth ?? 3)));
            const rulesIntent = judgeIntentRules(args.question);
            const budget = makeBudget(depth);
            const state = {
              notes: [],
              firecrawlUsed: 0,
              crawl4aiUsed: 0,
              exaKey: undefined,
              firecrawlKey: undefined,
              crawl4aiKey: undefined,
              rerankKey: undefined,
              decisionKey: undefined,
            };
            // deadline（契约 2.5）：到点 abort 在途请求、置位后排队与回退任务不再启动
            const deadlineTimer = setTimeout(() => {
              budget.deadlineHit = true;
              budget.controller.abort();
            }, Math.max(0, budget.deadlineAt - Date.now()));

            try {
              [state.exaKey, state.firecrawlKey, state.crawl4aiKey, state.rerankKey, state.decisionKey] = await Promise.all([
                resolveApiKey("EXA_API_KEY", "exaApiKey").catch(() => undefined),
                resolveApiKey("FIRECRAWL_API_KEY", "firecrawlApiKey").catch(() => undefined),
                resolveApiKey("CRAWL4AI_API_KEY", undefined).catch(() => undefined),
                resolveApiKey("SILICONFLOW_RERANK_API_KEY", undefined).catch(() => undefined),
                resolveApiKey("DECISION_MODEL_API_KEY", undefined).catch(() => undefined),
              ]);

              // 阶段二 #1：意图判定升级（decision key 可用时覆盖 task/breadth；失败静默保规则版）
              const intent = await judgeIntentWithDecision(args.question, rulesIntent, state.decisionKey);
              state.notes.push(
                `intent(${intent.source}): task=${intent.task}${intent.comparison ? "+comparison" : ""} freshness=${intent.freshness} language=${intent.language} breadth=${intent.breadth ?? 1}`
              );

              // 1) 搜索：multi 模式并发 top-3 引擎融合（预算内；signal 取消在途）
              if (!budgetAllows(budget, "search")) {
                return { question: args.question, engines: "(budget exhausted)", estimatedTokens: 0, sources: [], documents: [], notes: [...state.notes, "budget_exhausted: search cap"] };
              }
              budgetUse(budget, "search");
              let search;
              try {
                search = await provider.search({ query: args.question, maxResults: 12, engine: "multi" }, budget.controller.signal);
              } catch (e) {
                return {
                  question: args.question, engines: "(search failed)", estimatedTokens: 0,
                  sources: [], documents: [],
                  notes: [`search failed: ${e.message}`, "Hint: call free_search_test to check engine health, or retry with web_search."],
                };
              }
              let mergedSources = [...(search.sources ?? [])];
              // 引擎归属（契约 engine_hits）：per-source seenIn 优先（升级池补搜注入的也在此）；multi 剥除时降级用 Note 解析的全集
              const noteEngines = enginesFromNote(search.content);

              // （阶段三 #6 宽模式已删除：升级池取代宽模式——补搜轮见下方"补搜一轮"的 escalation pool 路径）
              const engineHitsOf = (s) => (Array.isArray(s.seenIn) && s.seenIn.length ? s.seenIn : noteEngines);
              if (!mergedSources.some((s) => Array.isArray(s.seenIn) && s.seenIn.length) && noteEngines.length) {
                state.notes.push(`engine_hits: per-source seenIn unavailable — derived from enginesUsed note [${noteEngines.join(", ")}]`);
              }

              // 2) Stage A 候选重排（契约 2.3：URL 键去重 + 精确标题软簇 + 同簇降权）
              const { items, clusters } = buildClusters(mergedSources);
              const candidates = items.slice(0, RERANK_CANDIDATE_MAX);
              // 阶段三 #5a：抓取前 embedding 语义簇——cos>0.92 仅作簇标记补充（不删不排除任何源）
              if (ENABLE_EMBED_DEDUP && state.rerankKey && candidates.length >= 2 && !budget.expired) {
                const vecs = await callEmbed(
                  candidates.map((c) => `${c.source.title || ""}\n${c.source.snippet || ""}`.trim() || "(no title/snippet)"),
                  state.rerankKey
                );
                const matrix = cosineMatrix(vecs || []);
                if (matrix) {
                  const [tags, nClusters] = semanticClusterTags(candidates.map((c) => Boolean(c.clusterId)), matrix);
                  candidates.forEach((c, i) => (c.semanticCluster = tags[i]));
                  if (nClusters) state.notes.push(`embed-dedup: ${nClusters} semantic cluster tag(s) added pre-fetch (cos>${SEMANTIC_TAG_THRESHOLD}, mark-only — no source dropped)`);
                }
              }
              let ranked = [...candidates];
              let rerankOkA = false;
              if (state.rerankKey && candidates.length && budgetAllows(budget, "rerankCandidate")) {
                budgetUse(budget, "rerankCandidate", Math.min(candidates.length, budget.rerankCandidateMax - budget.rerankCandidateUsed));
                const scores = await callRerank(
                  args.question,
                  candidates.map((c) => `${c.source.title || ""}\n${c.source.snippet || ""}`.trim() || "(no title/snippet)"),
                  state.rerankKey
                );
                if (scores) {
                  rerankOkA = true;
                  ranked = candidates
                    .map((c, i) => ({ c, s: (scores[i] ?? 0) - (c.isRep ? 0 : CLUSTER_PENALTY) }))
                    .sort((a, b) => b.s - a.s || candidates.indexOf(a.c) - candidates.indexOf(b.c))
                    .map((x) => x.c);
                }
              }
              if (!rerankOkA) {
                // 规则回退：原始序（multi 已按 seenIn 数排序）+ 簇代表优先
                state.notes.push("notEvaluated: stage-A rerank unavailable — rule fallback ordering used (no rewrite)");
                ranked = [...candidates].sort((a, b) => Number(b.isRep) - Number(a.isRep) || candidates.indexOf(a) - candidates.indexOf(b));
              }

              // 3) 抓取队列：排序后代表优先入队（≤fetchMax）；worker 池有界并发，预算/deadline 门控
              const fetchQueue = [];
              const enqueued = new Set();
              const enqueue = (item, why) => {
                if (!item || enqueued.has(item.key) || fetchQueue.length + fetchedResults.size >= budget.fetchMax) return;
                enqueued.add(item.key);
                fetchQueue.push({ item, why });
              };
              const fetchedResults = new Map(); // key → { item, fetch }
              // 代表优先入队；非代表默认待命（已在 ranked 中降权），仅在队列未满时补位
              for (const item of ranked) {
                if (fetchedResults.size + fetchQueue.length >= budget.fetchMax) break;
                if (item.isRep) enqueue(item, "rank");
              }
              for (const item of ranked) {
                if (fetchedResults.size + fetchQueue.length >= budget.fetchMax) break;
                enqueue(item, "rank");
              }

              const drain = async () => {
                const worker = async () => {
                  while (fetchQueue.length) {
                    if (budget.expired || budget.fetchesUsed >= budget.fetchMax) break; // 排队任务不再启动
                    const job = fetchQueue.shift();
                    const r = await fetchTiered(ctx, job.item.source.url, job.item.source.title, state, budget, intent);
                    if (r) {
                      fetchedResults.set(job.item.key, { item: job.item, fetch: r });
                    } else if (job.item.clusterId) {
                      // 契约 2.3：代表失败 → 簇成员在剩余预算内再入队（一层，不连锁）
                      for (const mi of clusters.get(job.item.clusterId).members) {
                        const member = items[mi];
                        if (member.key !== job.item.key) enqueue(member, `cluster-retry(${job.item.clusterId})`);
                      }
                    }
                  }
                };
                await Promise.all(Array.from({ length: Math.min(3, fetchQueue.length) }, worker));
              };
              await drain();

              // 二次入队（契约 2.3）：簇内存版本/日期差异 → 差异成员可再核对；明显缺项 → 高分候选补抓
              const sides = intent.comparison ? extractComparisonSides(args.question) : null;
              const snippetCorpus = candidates.map((c) => `${c.source.title || ""} ${c.source.snippet || ""}`).join(" ");
              const sideMissing = sides ? sides.filter((x) => !snippetCorpus.toLowerCase().includes(x.toLowerCase())) : [];
              for (const [key, { item }] of fetchedResults) {
                if (!item.clusterId || !clusterHasVariant(clusters.get(item.clusterId))) continue;
                for (const mi of clusters.get(item.clusterId).members) {
                  const member = items[mi];
                  if (member.key !== key && String(member.source.publishedAt ?? "") !== String(item.source.publishedAt ?? "")) {
                    enqueue(member, `cluster-variant(${item.clusterId})`);
                  }
                }
              }
              if (sideMissing.length) {
                for (const item of ranked) {
                  if (fetchedResults.size + fetchQueue.length >= budget.fetchMax) break;
                  enqueue(item, "gap-fill");
                }
              }
              if (fetchQueue.length) await drain();

              // 4) 阶段三 #5b：抓取后正文折叠判定（cos>0.95 且 publishedAt 相同；成员保留 url/engine_hits，仅正文折叠）
              const byRanked = (a, b) => ranked.indexOf(a.item) - ranked.indexOf(b.item);
              const bodyEntries = [...fetchedResults.values()].sort(byRanked);
              let foldPlans = [];
              const foldedMemberIdx = new Set();
              if (ENABLE_EMBED_DEDUP && state.rerankKey && bodyEntries.length >= 2 && !budget.expired) {
                const vecs = await callEmbed(bodyEntries.map((e) => e.fetch.content.slice(0, 2000)), state.rerankKey);
                const matrix = cosineMatrix(vecs || []);
                if (matrix) {
                  foldPlans = planFolding(bodyEntries.map((e) => ({ source: e.item.source, content: e.fetch.content })), matrix);
                  for (const p of foldPlans) p.memberIdx.forEach((i) => foldedMemberIdx.add(i));
                  if (foldPlans.length) {
                    state.notes.push(`embed-dedup: folded ${foldedMemberIdx.size} body doc(s) into representative(s) (cos>${BODY_FOLD_THRESHOLD}, same publishedAt, numerically consistent; member url/engine_hits preserved)`);
                  }
                }
              }

              // 5) Stage B：正文分窗→轻筛→重排→按原位置拼装（总预算 depth×1500 token；折叠成员不参与）
              const WIN_KEEP_PER_DOC = 6; // 每篇入选窗上限（实验参数）
              const liveEntries = bodyEntries.map((e, i) => ({ ...e, bi: i })).filter((e) => !foldedMemberIdx.has(e.bi));
              const perDocRerankCap = Math.max(4, Math.ceil(RERANK_WINDOW_MAX / Math.max(1, liveEntries.length)));
              const bodyDocs = [];
              for (const { item, fetch, bi } of liveEntries) {
                const windows = splitWindows(fetch.content);
                let kept = [];
                let rerankOkB = false;
                let topScore = null;
                if (windows.length) {
                  const tokens = queryTokens(`${args.question} ${item.source.title || ""}`);
                  const ordered = lightFilter(windows, tokens);
                  const rerankSlots = Math.max(0, budget.rerankWindowMax - budget.rerankWindowUsed); // 窗口侧独立账目
                  const chosen = ordered.slice(0, Math.min(perDocRerankCap, rerankSlots));
                  if (state.rerankKey && chosen.length && budgetAllows(budget, "rerankWindow")) {
                    budgetUse(budget, "rerankWindow", chosen.length);
                    const scores = await callRerank(args.question, chosen.map((w) => compactWindowRep(w)), state.rerankKey);
                    if (scores) {
                      rerankOkB = true;
                      topScore = Math.max(...scores);
                      kept = chosen.map((w, i) => ({ w, s: scores[i] ?? 0 })).sort((a, b) => b.s - a.s || a.w.pos - b.w.pos).slice(0, WIN_KEEP_PER_DOC).map((x) => x.w);
                    }
                  }
                  if (!rerankOkB) kept = ordered.slice(0, WIN_KEEP_PER_DOC); // 轻筛顺序兜底（含无 key/失败）
                }
                bodyDocs.push({ item, fetch, kept, windows: windows.length, rerankOkB, topScore, bi });
              }

              // token 预算逐篇分配（按重排后的文档顺序消费，剩余均分；超限窗由 assembleWindowText 标注省略）
              const totalTokenBudget = depth * 1500;
              let tokenRemaining = totalTokenBudget;
              const documents = [];
              for (const bd of bodyDocs) {
                const share = tokenRemaining / Math.max(1, bodyDocs.length - documents.length);
                const { text, used, omitted } = assembleWindowText(bd.kept, share);
                tokenRemaining = Math.max(0, tokenRemaining - used);
                const plan = foldPlans.find((p) => p.repIdx === bd.bi); // 折叠组代表：正文尾注成员清单
                let content = text || "(no window selected from body)";
                if (plan) {
                  content += `\n\n[+${plan.memberIdx.length} folded member(s) into this cluster (cos>${BODY_FOLD_THRESHOLD}): ${plan.memberIdx.map((i) => bodyEntries[i].item.source.url).join(", ")}]`;
                }
                documents.push({
                  url: bd.item.source.url,
                  title: bd.item.source.title || "",
                  kind: "body",
                  text_origin: "original",
                  engine_hits: engineHitsOf(bd.item.source),
                  published: bd.item.source.publishedAt ? `${bd.item.source.publishedAt} (source: engine result)` : "unknown",
                  updated_at: bd.fetch.updatedAt || "",
                  fetched_at: bd.fetch.fetchedAt,
                  round: 1,
                  cluster: bd.item.clusterId || bd.item.semanticCluster || "",
                  independence: "unknown",
                  tier: bd.fetch.tier,
                  cache: Boolean(bd.fetch.cache),
                  truncated: bd.fetch.truncated || omitted > 0,
                  content,
                });
              }

              // 折叠成员文档：kind 仍 body（正文已抓到并核验过相似），正文替换为折叠标注；url/engine_hits/published 全保留
              for (const bi of foldedMemberIdx) {
                const { item, fetch } = bodyEntries[bi];
                const plan = foldPlans.find((p) => p.memberIdx.includes(bi));
                documents.push({
                  url: item.source.url,
                  title: item.source.title || "",
                  kind: "body",
                  text_origin: "original",
                  engine_hits: engineHitsOf(item.source),
                  published: item.source.publishedAt ? `${item.source.publishedAt} (source: engine result)` : "unknown",
                  updated_at: fetch.updatedAt || "",
                  fetched_at: fetch.fetchedAt,
                  round: 1,
                  cluster: plan ? bodyEntries[plan.repIdx].item.clusterId || bodyEntries[plan.repIdx].item.semanticCluster || "" : item.clusterId || item.semanticCluster || "",
                  independence: "unknown",
                  tier: "folded",
                  cache: Boolean(fetch.cache),
                  truncated: false,
                  content: `[folded into representative ${plan ? bodyEntries[plan.repIdx].item.source.url : "(unknown)"} — body cos=${plan ? plan.cos.toFixed(3) : ""} > ${BODY_FOLD_THRESHOLD}, same publishedAt; url/engine_hits preserved]`,
                });
              }

              // 6) snippet-only 文档：未抓取的候选以引擎摘要入契约（绝不标 body）
              for (const c of candidates) {
                if (fetchedResults.has(c.key)) continue;
                documents.push({
                  url: c.source.url,
                  title: c.source.title || "",
                  kind: "snippet-only",
                  text_origin: "original", // 搜索引擎摘录的原文片段；provider-summary 留给 AIHOT 类内容源适配器
                  engine_hits: engineHitsOf(c.source),
                  published: c.source.publishedAt ? `${c.source.publishedAt} (source: engine result)` : "unknown",
                  updated_at: "",
                  fetched_at: new Date().toISOString(), // 摘要随本次搜索获得
                  round: 1,
                  cluster: c.clusterId || c.semanticCluster || "",
                  independence: "unknown",
                  tier: "snippet",
                  cache: false,
                  truncated: false,
                  content: c.source.snippet || "(no snippet)",
                });
              }

              // 7) 首轮证据缺口检查（契约 2.2/修订 10：比较型分方；fact 型实体出现仅记录）
              const firstRoundUrls = new Set(candidates.map((c) => c.key));
              const firstGap = checkEvidenceGaps(documents, sides);
              state.notes.push(...firstGap.notes);
              if (intent.comparison && !sides) {
                state.notes.push("coverage: comparison sides undetermined (rule extraction failed) — unknown");
              }

              // 8) 阶段二 #2-#4：补搜一轮（ENABLE_REWRITE；规则缺口 + noul 双信号一致指向不足才进；首轮证据永不丢弃）
              if (ENABLE_REWRITE && sides && firstGap.missingSides.length) {
                const evaluated = (rerankOkA || bodyDocs.some((b) => b.rerankOkB)) && bodyDocs.length >= 1; // 契约 2.2：已评估 = rerank 成功 && ≥1 正文
                if (!evaluated) {
                  state.notes.push("gate: notEvaluated — rewrite gate closed (rerank failed or no body)");
                } else if (!state.decisionKey) {
                  state.notes.push("gate: decision model unavailable — second signal impossible, rewrite skipped");
                } else if (!budgetAllows(budget, "search")) {
                  state.notes.push("gate: search budget exhausted — rewrite skipped");
                } else {
                  const brief = documents
                    .filter((d) => d.kind === "body")
                    .slice(0, 3)
                    .map((d) => `[${d.title}] ${String(d.content).slice(0, 200)}`)
                    .join("\n");
                  const pYes = await askNoulSufficiency(args.question, brief, state.decisionKey);
                  if (pYes === null) {
                    state.notes.push("gate: noul undecidable (P(yes)=null) — rewrite skipped (conservative)");
                  } else if (isSufficientP(pYes)) {
                    state.notes.push(`gate: noul P(yes)=${pYes.toFixed(2)} ≥ ${NOUL_SUFFICIENT_P} — evidence deemed sufficient, rewrite skipped`);
                  } else {
                    state.notes.push(`gate: rule gap + noul P(yes)=${pYes.toFixed(2)} < ${NOUL_SUFFICIENT_P} — both signals insufficient, one rewrite allowed`);
                    const rewrites = generateRewrites(args.question, firstGap.missingSides, intent);
                    if (!rewrites.length) {
                      state.notes.push("gate: no qualified rewrite candidate (normalized-duplicate or protected-token loss) — rewrite skipped");
                    } else {
                      const picked = await pickRewrite(rewrites, args.question, firstGap.missingSides.join("; "), state.decisionKey);
                      state.notes.push(`rewrite picked: "${picked.query}" — ${picked.declares}`);
                      // 升级池补搜（用户定案 2026-10-05）：第二轮不重复主池，engine=multi + engines 清单并发升级池引擎；
                      // 禁用/无 key/冷却的引擎由 index.js runMultiSearch 自动跳过；搜索调用仍受 searchRequestsMax 约束，firecrawl 不绕过其模块限流。
                      const escalation = resolveEscalationEngines(typeof escalationEngines === "function" ? escalationEngines() : undefined);
                      state.notes.push(
                        `rewrite escalation pool: [${escalation.join(", ")}] — second-round engines from the escalation pool (primary pool not re-queried; search calls still capped at searchRequestsMax=${budget.searchRequestsMax})`
                      );
                      budgetUse(budget, "search");
                      try {
                        const r2 = await provider.search({ query: picked.query, maxResults: 8, engine: "multi", engines: escalation }, budget.controller.signal);
                        const r2Used = enginesFromNote(r2.content);
                        if (r2Used.length) state.notes.push(`rewrite engines used: [${r2Used.join(", ")}] (escalation pool after skipping disabled/keyless/failed engines)`);
                        // 二轮候选合并：键去重（与首轮 items 之外的新 URL）；升级池引擎名注入 seenIn（engine_hits 不依赖首轮 Note）
                        const seenKeys = new Set(items.map((it) => it.key));
                        const newItems = [];
                        for (const s of r2.sources ?? []) {
                          if (!s || typeof s.url !== "string") continue;
                          const key = normDedupeKey(s.url);
                          if (seenKeys.has(key)) continue;
                          seenKeys.add(key);
                          newItems.push({ source: r2Used.length ? { ...s, seenIn: [...r2Used] } : { ...s }, key, clusterId: null, isRep: true, semanticCluster: null });
                        }
                        // 二轮 Stage A：候选池剩余额度内 rerank；不足则原序
                        let r2Ranked = [...newItems];
                        if (state.rerankKey && newItems.length && budgetAllows(budget, "rerankCandidate")) {
                          const n2 = Math.min(newItems.length, budget.rerankCandidateMax - budget.rerankCandidateUsed);
                          budgetUse(budget, "rerankCandidate", n2);
                          const scores2 = await callRerank(
                            args.question,
                            newItems.slice(0, n2).map((c) => `${c.source.title || ""}\n${c.source.snippet || ""}`.trim() || "(no title/snippet)"),
                            state.rerankKey
                          );
                          if (scores2) {
                            r2Ranked = newItems
                              .map((c, i) => ({ c, s: scores2[i] ?? 0 }))
                              .sort((a, b) => b.s - a.s)
                              .map((x) => x.c);
                          }
                        }
                        for (const it of r2Ranked) {
                          if (fetchedResults.size + fetchQueue.length >= budget.fetchMax) break;
                          enqueue(it, "round-2");
                        }
                        const preDrainCount = fetchedResults.size;
                        if (fetchQueue.length) await drain();
                        const r2Entries = [...fetchedResults.values()].filter((e) => !firstRoundUrls.has(e.item.key)).sort((a, b) => r2Ranked.findIndex((i) => i.key === a.item.key) - r2Ranked.findIndex((i) => i.key === b.item.key));
                        // 二轮 Stage B + 文档（round:2；窗口池与 token 余量共享首轮账本）
                        for (const { item: r2Item, fetch: r2Fetch } of r2Entries) {
                          const r2Windows = splitWindows(r2Fetch.content);
                          let r2Kept = [];
                          if (r2Windows.length) {
                            const r2Ordered = lightFilter(r2Windows, queryTokens(`${args.question} ${r2Item.source.title || ""}`));
                            const r2Slots = Math.max(0, budget.rerankWindowMax - budget.rerankWindowUsed);
                            const r2Chosen = r2Ordered.slice(0, Math.min(perDocRerankCap, r2Slots));
                            if (state.rerankKey && r2Chosen.length && budgetAllows(budget, "rerankWindow")) {
                              budgetUse(budget, "rerankWindow", r2Chosen.length);
                              const r2Scores = await callRerank(args.question, r2Chosen.map((w) => compactWindowRep(w)), state.rerankKey);
                              if (r2Scores) {
                                r2Kept = r2Chosen.map((w, i) => ({ w, s: r2Scores[i] ?? 0 })).sort((a, b) => b.s - a.s || a.w.pos - b.w.pos).slice(0, WIN_KEEP_PER_DOC).map((x) => x.w);
                              }
                            }
                            if (!r2Kept.length) r2Kept = r2Ordered.slice(0, WIN_KEEP_PER_DOC);
                          }
                          const r2Share = tokenRemaining / Math.max(1, r2Entries.length);
                          const { text: r2Text, used: r2Used } = assembleWindowText(r2Kept, r2Share);
                          tokenRemaining = Math.max(0, tokenRemaining - r2Used);
                          documents.push({
                            url: r2Item.source.url,
                            title: r2Item.source.title || "",
                            kind: "body",
                            text_origin: "original",
                            engine_hits: engineHitsOf(r2Item.source),
                            published: r2Item.source.publishedAt ? `${r2Item.source.publishedAt} (source: engine result)` : "unknown",
                            updated_at: r2Fetch.updatedAt || "",
                            fetched_at: r2Fetch.fetchedAt,
                            round: 2,
                            cluster: r2Item.clusterId || r2Item.semanticCluster || "",
                            independence: "unknown",
                            tier: r2Fetch.tier,
                            cache: Boolean(r2Fetch.cache),
                            truncated: r2Fetch.truncated,
                            content: r2Text || "(no window selected from body)",
                          });
                        }
                        // 二轮 snippet-only（新候选未抓取部分）
                        for (const it of newItems) {
                          if (fetchedResults.has(it.key)) continue;
                          documents.push({
                            url: it.source.url,
                            title: it.source.title || "",
                            kind: "snippet-only",
                            text_origin: "original",
                            engine_hits: engineHitsOf(it.source),
                            published: it.source.publishedAt ? `${it.source.publishedAt} (source: engine result)` : "unknown",
                            updated_at: "",
                            fetched_at: new Date().toISOString(),
                            round: 2,
                            cluster: it.clusterId || it.semanticCluster || "",
                            independence: "unknown",
                            tier: "snippet",
                            cache: false,
                            truncated: false,
                            content: it.source.snippet || "(no snippet)",
                          });
                        }
                        // 修订 12：三布尔记录（不用新簇数证明增益）；剩余缺口如实记录（只允许一轮）
                        const flags = computeRound2Flags({
                          firstRoundUrls,
                          secondRoundItems: newItems,
                          secondRoundFetchedUrls: r2Entries.map((e) => e.item.source.url),
                          missingSidesBefore: firstGap.missingSides,
                          mergedDocuments: documents, // 已含首轮+二轮（首轮在前，永不丢弃）
                        });
                        state.notes.push(`round-2: new_body=${flags.new_body} new_content=${flags.new_content} gap_filled=${flags.gap_filled} (fetched+${fetchedResults.size - preDrainCount})`);
                        for (const side of checkEvidenceGaps(documents, sides).missingSides) {
                          state.notes.push(`evidence gap remains after rewrite: side "${side}" (one rewrite max — no further rounds)`);
                        }
                      } catch (e) {
                        state.notes.push(`rewrite search failed: ${e.message}`);
                      }
                    }
                  }
                }
              }
              if (bodyDocs.length === 0) {
                const noFetchKeys = !state.exaKey && !state.firecrawlKey && !state.crawl4aiKey;
                state.notes.push(
                  "notEvaluated: all fetches failed — snippets only, question not fully evaluated" +
                    (noFetchKeys
                      ? " (no Exa/Firecrawl/Crawl4AI key configured: direct fetch was the only tier available, and it failed for the URLs above — configuring a key greatly improves fetching)"
                      : "")
                );
              } else if (!bodyDocs.some((b) => b.rerankOkB)) {
                state.notes.push("stage-B rerank unavailable — light-filter fallback used");
              } else {
                // 契约 2.2/修订 10：top 段分数低只促使检查、不独立触发；阶段一仅记录
                const scores = bodyDocs.filter((b) => b.topScore !== null).map((b) => b.topScore);
                if (scores.length) state.notes.push(`stage-B top window scores: ${scores.map((s) => s.toFixed(3)).join(", ")} (recorded only; gate is phase-2)`);
              }

              // 7) 预算/超时注记（契约 2.5）
              if (budget.deadlineHit) state.notes.push("deadline_hit: 90s budget elapsed; queued work not started");
              if (budget.exhausted) state.notes.push(`budget_exhausted: ${budget.exhausted} cap reached; partial results returned`);

              const enginesNote = typeof search.content === "string" ? search.content.match(/enginesUsed: \[([^\]]*)\]/) : null;
              const out = {
                question: args.question,
                engines: enginesNote && enginesNote[1].trim() ? enginesNote[1].trim() : (search.engineUsed || search.provider || "auto"),
                sources: candidates.map((c) => ({ url: c.source.url, title: c.source.title || "", snippet: c.source.snippet || "", publishedAt: c.source.publishedAt || "" })),
                documents,
                notes: state.notes,
              };
              out.estimatedTokens = estimateTokens(
                out.sources.map((s) => s.title + s.snippet).join("") + out.documents.map((d) => d.content).join("")
              );
              return out;
            } finally {
              clearTimeout(deadlineTimer);
            }
          },
        })
      );
      const disposeCache = isToolDisabled("cache_search") ? undefined : sctx.tools.register(
        defineTool({
          name: "cache_search",
          description: toolDescription(lang, "cache_search"),
          parameters: {
            query: { type: "string", description: toolParam(lang, "cache_search", "query") },
            limit: { type: "number", description: toolParam(lang, "cache_search", "limit") },
          },
          output: {
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                query: { type: "string" },
                hits: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: { url: { type: "string" }, title: { type: "string" }, excerpt: { type: "string" }, fetched_at: { type: "string" } },
                  },
                },
              },
            },
            render(_args, value) {
              if (!value.hits.length) return [{ type: "text", text: `No cached pages match "${value.query}".` }];
              const lines = value.hits.map((h) => `- ${h.title || h.url} — ${h.url}\n      ${h.excerpt} _(cached ${h.fetched_at})_`);
              return [{ type: "text", text: wrapUntrustedBlock(`Cached pages matching "${value.query}":\n${lines.join("\n")}`) }];
            },
          },
          async execute(args) {
            return { query: args.query, hits: cacheSearch(args.query, Math.min(20, Math.max(1, Math.round(args.limit ?? 8)))) };
          },
        })
      );
      return () => { if (typeof dispose === "function") dispose(); if (typeof disposeCache === "function") disposeCache(); };
    } });
  });
}
