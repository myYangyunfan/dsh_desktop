/**
 * UTF-16 safety for tool results (#108).
 *
 * `String.prototype.slice` cuts on code units. A cut inside a surrogate pair
 * leaves a lone surrogate, which is valid JavaScript but not valid Unicode:
 * serialized as an unpaired \ud83d it makes the upstream Messages endpoint
 * reject the whole request, and because the poisoned text is stored in the
 * session history every later turn fails too.
 */

const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

export function stripLoneSurrogates(text) {
  if (typeof text !== "string" || text.length === 0) return text;
  return text.replace(LONE_SURROGATE, "\uFFFD");
}

/** Cut by code point so a surrogate pair is never split. */
export function sliceByCodePoint(text, max) {
  if (typeof text !== "string") return text;
  const limit = Math.floor(Number(max));
  if (!Number.isFinite(limit) || limit < 0) return text;
  const chars = Array.from(text);
  if (chars.length <= limit) return text;
  return chars.slice(0, limit).join("");
}

/** Strip stray surrogates first, then cut by code point. */
export function truncateText(text, max) {
  const safe = stripLoneSurrogates(typeof text === "string" ? text : String(text));
  return sliceByCodePoint(safe, max);
}

export function sanitizeSource(source) {
  if (source === null || typeof source !== "object") return source;
  const out = { ...source };
  for (const key of ["title", "url", "snippet", "content"]) {
    if (typeof out[key] === "string") out[key] = stripLoneSurrogates(out[key]);
  }
  return out;
}

export function sanitizeSources(sources) {
  return Array.isArray(sources) ? sources.map(sanitizeSource) : sources;
}

/** Sanitize a search result (sources + the note that accompanies them). */
export function sanitizeSearchResult(result) {
  if (result === null || typeof result !== "object") return result;
  const out = { ...result };
  if (Array.isArray(out.sources)) out.sources = sanitizeSources(out.sources);
  for (const key of ["content", "note", "provider", "engine"]) {
    if (typeof out[key] === "string") out[key] = stripLoneSurrogates(out[key]);
  }
  return out;
}

/** Keep an error's message and stack free of lone surrogates. */
export function sanitizeError(error) {
  if (!(error instanceof Error)) return error;
  const message = stripLoneSurrogates(error.message);
  if (message === error.message) return error;
  const wrapped = new Error(message);
  wrapped.name = error.name;
  if (typeof error.stack === "string") wrapped.stack = stripLoneSurrogates(error.stack);
  return wrapped;
}
