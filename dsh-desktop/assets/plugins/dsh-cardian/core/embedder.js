// Pluggable text embeddings + a deterministic local fallback.
//
// The `Embedder` contract is a single method: `embed(text) -> Float32Array`.
// Cardian ships a dependency-free `HashEmbedder` (bag of character n-grams,
// hashed into a fixed-dim vector) so semantic-ish search works offline for
// both CJK and latin text. A host can inject a real model (e.g. an embedding
// API) for higher-quality vectors without touching any other code.

function fnv1a(str) {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

function charNgrams(text, n) {
  const s = String(text ?? '').toLowerCase().replace(/\s+/g, ' ')
  const out = []
  for (let i = 0; i + n <= s.length; i++) out.push(s.slice(i, i + n))
  return out
}

export function l2normalize(vec) {
  let sum = 0
  for (const x of vec) sum += x * x
  const len = Math.sqrt(sum) || 1
  const out = new Float32Array(vec.length)
  for (let i = 0; i < vec.length; i++) out[i] = vec[i] / len
  return out
}

export function cosine(a, b) {
  const n = Math.min(a.length, b.length)
  let dot = 0
  for (let i = 0; i < n; i++) dot += a[i] * b[i]
  return dot
}

export class HashEmbedder {
  constructor(opts = {}) {
    this.dim = opts.dim ?? 256
    this.ngrams = opts.ngrams ?? [1, 2, 3]
  }

  embed(text) {
    const vec = new Float32Array(this.dim)
    for (const n of this.ngrams) {
      for (const gram of charNgrams(text, n)) {
        vec[fnv1a(gram) % this.dim] += 1
      }
    }
    return l2normalize(vec)
  }

  similarity(a, b) {
    return cosine(a, b)
  }
}
