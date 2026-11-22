/**
 * Near-duplicate removal for merged search results. Syndicated copies usually
 * differ in URL and a few characters, so exact-URL dedupe misses them; a small
 * MinHash signature over title+snippet catches them without model calls.
 */

const SEEDS = Array.from({ length: 16 }, (_, i) => (i + 1) * 0x9e3779b1);

function hash32(text, seed) {
  let hash = (2166136261 ^ seed) >>> 0;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function normalize(text) {
  return String(text ?? "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[\s\p{P}\p{S}]+/gu, "");
}

function shingles(text) {
  const value = normalize(text);
  if (value.length === 0) return [];
  const size = value.length >= 6 ? 3 : Math.max(1, value.length);
  const out = [];
  for (let i = 0; i + size <= value.length; i += 1) out.push(value.slice(i, i + size));
  return [...new Set(out)];
}

export function minHash(text, size = SEEDS.length) {
  const parts = shingles(text);
  if (parts.length === 0) return Array.from({ length: size }, () => 0);
  return SEEDS.slice(0, size).map((seed) => {
    let min = 0xffffffff;
    for (const part of parts) {
      const value = hash32(part, seed);
      if (value < min) min = value;
    }
    return min;
  });
}

export function similarity(a, b) {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;
  let same = 0;
  for (let i = 0; i < a.length; i += 1) if (a[i] === b[i]) same += 1;
  return same / a.length;
}

/**
 * Keep the first source of a near-duplicate group. Order is preserved; exact
 * URL duplicates are also removed. Threshold 0.8 works for syndicated copies
 * while leaving different articles with the same topic separate.
 */
export function dedupeNearDuplicates(sources, { threshold = 0.8, textOf = (source) => `${source?.title ?? ""} ${source?.snippet ?? ""}` } = {}) {
  const list = Array.isArray(sources) ? sources : [];
  const kept = [];
  const signatures = [];
  const exactUrls = new Set();
  for (const source of list) {
    const url = String(source?.url ?? "");
    if (url && exactUrls.has(url)) continue;
    const signature = minHash(textOf(source));
    if (signatures.some((existing) => similarity(existing, signature) >= threshold)) continue;
    if (url) exactUrls.add(url);
    kept.push(source);
    signatures.push(signature);
  }
  return kept;
}
