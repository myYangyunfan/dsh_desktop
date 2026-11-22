// Shared search-result post-processing. Used by both the DSH host and the MCP
// server, so uncertainty labels and multi-engine ranking cannot drift.
import { outputLanguage } from "./engines/shared.js";
import { promptLanguageOf } from "./prompt_i18n.js";

const UNCERTAINTY_AGGREGATORS = /(^|\.)(zhihu|sohu|sina|163|qq|toutiao|baijiahao|csdn|jianshu|medium|substack|reddit|quora|stackexchange)\./i;

const UNCERTAINTY_NOTES = {
  empty: { zh: "没有返回结果", en: "no results returned" },
  single: { zh: "只有 1 个来源", en: "only one source" },
  sameSite: { zh: "所有结果来自同一站点", en: "all results come from a single site" },
  two: { zh: "只有 2 个来源", en: "only two sources" },
  noDates: { zh: "带时间过滤但结果没有发布时间", en: "time filter applied but the results carry no publish dates" },
  partial: { zh: "部分引擎失败，结果可能不完整", en: "some engines failed; the result may be incomplete" },
  aggregator: { zh: "包含聚合站内容，建议二次核对", en: "includes aggregator content; worth a second look" },
};

export function assessUncertainty({ sources = [], timeRange = false, note: rawNote = "", lang, promptLanguage } = {}) {
  const noteLang = promptLanguageOf({ promptLanguage }) === "zh" || outputLanguage(lang) === "zh" ? "zh" : "en";
  const note = (key) => UNCERTAINTY_NOTES[key][noteLang];
  const list = Array.isArray(sources) ? sources : [];
  const notes = [];
  const domains = new Set();
  for (const source of list) {
    try {
      domains.add(new URL(String(source.url ?? "")).hostname.replace(/^www\./i, "").toLowerCase());
    } catch {}
  }
  let level = "high";
  if (list.length === 0) {
    level = "low";
    notes.push(note("empty"));
  } else if (list.length === 1) {
    level = "low";
    notes.push(note("single"));
  } else if (domains.size === 1) {
    level = "medium";
    notes.push(note("sameSite"));
  } else if (list.length === 2) {
    level = "medium";
    notes.push(note("two"));
  }
  if (timeRange && list.every((source) => !source.publishedAt)) {
    if (level === "high") level = "medium";
    notes.push(note("noDates"));
  }
  if (rawNote && /fail|error|fallback|skipped|failed/i.test(rawNote)) {
    level = "low";
    notes.push(note("partial"));
  }
  if ([...domains].some((domain) => UNCERTAINTY_AGGREGATORS.test(domain))) {
    notes.push(note("aggregator"));
    if (level === "high") level = "medium";
  }
  return { level, notes };
}

function publishedTs(value) {
  if (!value) return 0;
  const ts = Date.parse(String(value));
  return Number.isFinite(ts) ? ts : 0;
}

export function domainOf(rawUrl) {
  try {
    return new URL(String(rawUrl)).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

/** Interleave domains, preserve order within a domain, optionally prefer fresh items. */
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
    for (let i = 0; i < ka.length; i += 1) {
      if (ka[i] !== kb[i]) return ka[i] - kb[i];
    }
    return 0;
  };
  const byDomain = new Map();
  for (const item of list) {
    const key = String(item?.domain ?? domainOf(item?.url) ?? "");
    if (!byDomain.has(key)) byDomain.set(key, []);
    byDomain.get(key).push(item);
  }
  const groups = [...byDomain.values()];
  for (const group of groups) group.sort(cmp);
  groups.sort((a, b) => cmp(a[0], b[0]));
  const out = [];
  const longest = groups.reduce((max, group) => Math.max(max, group.length), 0);
  for (let round = 0; round < longest; round += 1) {
    for (const group of groups) {
      if (round < group.length) out.push(group[round]);
    }
  }
  return out;
}
