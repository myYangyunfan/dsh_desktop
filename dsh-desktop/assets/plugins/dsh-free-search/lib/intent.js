/**
 * Lightweight, deterministic query intent routing. It does not replace the
 * language pools or Auto; it only reorders the engines already selected for
 * the query so the head matches the domain (finance, academic, code, news,
 * shopping). Unknown/general queries keep the existing order.
 */

const RULES = [
  {
    domain: "finance",
    pattern:
      /股票|基金|财报|利率|汇率|贷款|债券|通胀|通胀率|市值|IPO|加密货币|比特币|stock|equity|fund|earnings|inflation|interest rate|forex|lpr|crypto|bitcoin|nasdaq|nyse/i,
  },
  {
    domain: "academic",
    pattern:
      /论文|文献|学术|引用|期刊|会议|研究综述|arxiv|doi|citation|paper|study|pubmed|scholar|journal|conference|preprint/i,
  },
  {
    domain: "code",
    pattern:
      /代码|报错|编译|函数|接口|依赖|仓库|github|gitlab|npm|pypi|python|javascript|typescript|rust|golang|java|docker|kubernetes|stack trace|exception|regex|api error/i,
  },
  {
    domain: "news",
    pattern:
      /新闻|最新|今天|昨天|本周|本月|今年|发布|突发|breaking|today|latest|this week|this month|announced|launch/i,
  },
  {
    domain: "shopping",
    pattern:
      /价格|购买|优惠|折扣|测评|推荐|哪款|性价比|price|buy|discount|deal|review|best|cheap/i,
  },
];

export const INTENT_PREFERENCES = {
  finance: ["baidu", "bing", "anysearch", "exa", "tavily", "ddg"],
  academic: ["exa", "tavily", "parallel", "bing", "anysearch", "ddg"],
  code: ["bing", "ddg", "exa", "tavily", "degoog", "anysearch"],
  news: ["bing", "baidu", "anysearch", "exa", "ddg"],
  shopping: ["baidu", "bing", "anysearch", "ddg", "exa"],
};

export function classifyIntent(query) {
  const text = String(query ?? "");
  for (const rule of RULES) {
    if (rule.pattern.test(text)) return { domain: rule.domain, matched: true };
  }
  return { domain: "general", matched: false };
}

/** Stable reorder of an existing engine list by the domain preference. */
export function preferForIntent(engines, intent) {
  const preference = INTENT_PREFERENCES[intent?.domain] ?? [];
  if (preference.length === 0 || engines.length === 0) return [...engines];
  const rank = new Map(preference.map((id, index) => [id, index]));
  return engines
    .map((id, index) => ({ id, index }))
    .sort((a, b) => (rank.get(a.id) ?? 999) - (rank.get(b.id) ?? 999) || a.index - b.index)
    .map((entry) => entry.id);
}
