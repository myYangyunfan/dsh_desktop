/**
 * Evidence quality gate for the research tool. The goal is not to score
 * relevance again; it is to tell the model how much the returned package can
 * support a conclusion, and to cap the wording when the evidence is thin.
 *
 * high:   at least 8 sources across 3 domains, 3 fetched documents, 2 dated sources
 * medium: at least 3 sources, 2 domains, 1 fetched document
 * low:    anything less, or a failed/partial run recorded in notes
 */
function hostOf(url) {
  try {
    return new URL(String(url)).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

export function assessEvidenceQuality({ sources = [], documents = [], notes = [] } = {}) {
  const list = Array.isArray(sources) ? sources : [];
  const docs = Array.isArray(documents) ? documents : [];
  const noteList = Array.isArray(notes) ? notes : [];
  const domains = new Set(list.map((source) => hostOf(source?.url)).filter(Boolean)).size;
  const dated = list.filter((source) => typeof source?.publishedAt === "string" && source.publishedAt.length > 0).length;
  const fetched = docs.length;

  const degraded = noteList.some((note) =>
    /search failed|budget_exhausted|budget exhausted|all fetches failed|notEvaluated|deadline_hit/i.test(String(note))
  );

  let level = "low";
  if (list.length >= 8 && domains >= 3 && fetched >= 3 && dated >= 2) level = "high";
  else if (list.length >= 3 && domains >= 2 && fetched >= 1) level = "medium";
  if (degraded) level = "low";

  const note =
    level === "high"
      ? "enough independent sources and fetched bodies for a confident answer"
      : level === "medium"
        ? "thin evidence: verify the key claims against the listed sources before concluding"
        : "insufficient evidence: do not state conclusions as fact; fetch more sources or report the gap";

  return { level, cap: level, sources: list.length, domains, dated, fetched, note };
}
