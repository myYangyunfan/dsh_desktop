// In-memory inverted index over the vault with true BM25 ranking (k1/b),
// title/tag boosts, freshness/importance sort modes, and a tag cloud. Tokens
// are latin words plus CJK bigrams/unigrams, so Chinese and English both match
// meaningfully without any external dependency.

const CJK = /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/

// Classic Okapi BM25 parameters (shared defaults across IR literature).
const K1 = 1.2
const B = 0.75

// Newline joiner built without a string escape so incremental re-indexing can
// rebuild a haystack identically to `rebuild()` without a backslash literal.
const NL = String.fromCharCode(10)

// Return every token occurrence (NOT a deduped set): term frequency is what
// makes BM25 rank meaningfully above a boolean match, so callers rely on the
// repeated latin words and repeated CJK bigrams/unigrams being preserved.
function tokenize(text) {
  const tokens = []
  const s = String(text ?? '').toLowerCase()
  const re = /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]+|[a-z0-9]+/g
  let m
  while ((m = re.exec(s))) {
    const seg = m[0]
    if (CJK.test(seg)) {
      if (seg.length === 1) tokens.push(seg)
      for (let i = 0; i < seg.length - 1; i++) tokens.push(seg.slice(i, i + 2))
      for (const ch of seg) tokens.push(ch)
    } else {
      tokens.push(seg)
    }
  }
  return tokens
}

function groupOf(rel) {
  const parts = rel.split('/')
  return parts.length > 2 ? parts[1] : null
}

function parseTime(v) {
  if (v == null) return null
  const t = Date.parse(String(v))
  return Number.isNaN(t) ? null : t
}

export class Indexer {
  constructor(store) {
    this.store = store
    this.inverted = new Map() // token -> Map(rel -> tf)
    this.docs = new Map() // rel -> { frontmatter, haystack, len, tf }
    this.mtimes = new Map() // rel -> mtimeMs, for cheap external-edit detection
    this.avgLen = 1
    this.totalLen = 0
    this.version = -1
    this._built = false
  }

  // Keep the index fresh without a full O(vault) rebuild on every query:
  //   * our own writes bump `store.version` -> full rebuild (correct, cheap);
  //   * external/hand edits leave `version` untouched, and a section directory's
  //     mtime does NOT change when a file is edited in place, so we diff each
  //     note's own mtime (via `store.fileStats()`) and re-index only the files
  //     that changed, appeared, or vanished on disk.
  // Capturing the version BEFORE the async rebuild means a mutation landing
  // mid-rebuild triggers the next rebuild rather than being masked.
  async ensureFresh() {
    const version = this.store.version
    if (!this._built || this.version !== version) {
      await this.rebuild()
      this.version = this.store.version
      await this._syncMtimes()
      return
    }
    await this._catchExternalEdits()
  }

  async rebuild() {
    this.inverted.clear()
    this.docs.clear()
    let totalLen = 0
    for (const { rel, frontmatter, body } of await this.store.snapshot()) {
      const haystack = [frontmatter.title, frontmatter.tags?.join(' '), body]
        .filter(Boolean)
        .join('\n')
      const tf = new Map()
      for (const token of tokenize(haystack)) {
        tf.set(token, (tf.get(token) ?? 0) + 1)
        if (!this.inverted.has(token)) this.inverted.set(token, new Map())
        this.inverted.get(token).set(rel, (this.inverted.get(token).get(rel) ?? 0) + 1)
      }
      const len = [...tf.values()].reduce((n, c) => n + c, 0)
      totalLen += len
      this.docs.set(rel, { frontmatter, haystack, len, tf })
    }
    this.totalLen = totalLen
    this.avgLen = Math.max(1, totalLen / Math.max(this.docs.size, 1))
    this._built = true
    return this.docs.size
  }

  // Re-read only the notes whose on-disk mtime differs from what we indexed,
  // plus newly appeared files; drop notes that vanished. Everything else keeps
  // its cached postings, so a hand edit costs one tokenize instead of a rebuild.
  async _catchExternalEdits() {
    const stats = await this.store.fileStats()
    const seen = new Set()
    let changed = false
    for (const { rel, mtimeMs } of stats) {
      seen.add(rel)
      if (this.mtimes.get(rel) === mtimeMs) continue
      const note = await this.store.read(rel)
      if (!note) continue
      await this._addDoc(rel, note.frontmatter, note.body, mtimeMs)
      changed = true
    }
    for (const rel of [...this.docs.keys()]) {
      if (seen.has(rel)) continue
      this._purge(rel)
      changed = true
    }
    if (changed) this._recomputeAvgLen()
  }

  async _syncMtimes() {
    this.mtimes.clear()
    for (const { rel, mtimeMs } of await this.store.fileStats()) this.mtimes.set(rel, mtimeMs)
  }

  // Index one note from scratch, replacing any prior postings for the same rel.
  async _addDoc(rel, frontmatter, body, mtimeMs) {
    this._purge(rel)
    const haystack = this._haystack(frontmatter, body)
    const tf = new Map()
    for (const token of tokenize(haystack)) {
      tf.set(token, (tf.get(token) ?? 0) + 1)
      if (!this.inverted.has(token)) this.inverted.set(token, new Map())
      this.inverted.get(token).set(rel, (this.inverted.get(token).get(rel) ?? 0) + 1)
    }
    const len = [...tf.values()].reduce((n, c) => n + c, 0)
    this.totalLen += len
    this.docs.set(rel, { frontmatter, haystack, len, tf })
    if (mtimeMs != null) this.mtimes.set(rel, mtimeMs)
  }

  // Remove a doc's postings from the inverted index and subtract its length, so
  // the running total stays exact across incremental updates.
  _purge(rel) {
    this.mtimes.delete(rel)
    const doc = this.docs.get(rel)
    if (!doc) return
    if (doc.tf) {
      for (const token of doc.tf.keys()) {
        const postings = this.inverted.get(token)
        if (!postings) continue
        postings.delete(rel)
        if (postings.size === 0) this.inverted.delete(token)
      }
      this.totalLen -= doc.len ?? 0
    }
    this.docs.delete(rel)
  }

  _haystack(frontmatter, body) {
    return [frontmatter.title, frontmatter.tags?.join(' '), body].filter(Boolean).join(NL)
  }

  _recomputeAvgLen() {
    this.avgLen = Math.max(1, this.totalLen / Math.max(this.docs.size, 1))
  }

  async search(query, opts = {}) {
    await this.ensureFresh()
    const {
      type = null,
      group = null,
      tag = null,
      topK = 20,
      newerThan = null,
      olderThan = null,
      sortBy = 'relevance',
    } = opts
    const qTokens = tokenize(query)
    if (qTokens.length === 0) return []

    const N = Math.max(this.docs.size, 1)
    const scores = new Map()
    for (const token of new Set(qTokens)) {
      const postings = this.inverted.get(token)
      if (!postings) continue
      const idf = Math.log(1 + (N - postings.size + 0.5) / (postings.size + 0.5))
      for (const [rel, tf] of postings) {
        const doc = this.docs.get(rel)
        if (!doc) continue
        if (type && doc.frontmatter.type !== type) continue
        if (group && groupOf(rel) !== group) continue
        if (tag && !(doc.frontmatter.tags ?? []).includes(tag)) continue

        let boost = 1
        const titleLower = String(doc.frontmatter.title ?? '').toLowerCase()
        const tagsLower = (doc.frontmatter.tags ?? []).map((t) => String(t).toLowerCase())
        if (titleLower.includes(token)) boost = 3
        else if (tagsLower.some((t) => t === token)) boost = 2

        const norm = tf * (K1 + 1) / (tf + K1 * (1 - B + B * (doc.len / this.avgLen)))
        scores.set(rel, (scores.get(rel) ?? 0) + idf * norm * boost)
      }
    }

    // Substring fallback for short latin queries that token matching may miss
    // (e.g. "store" inside "storeroom").
    if (scores.size === 0 && !CJK.test(query)) {
      const q = String(query).toLowerCase()
      for (const [rel, doc] of this.docs) {
        if (type && doc.frontmatter.type !== type) continue
        if (group && groupOf(rel) !== group) continue
        if (tag && !(doc.frontmatter.tags ?? []).includes(tag)) continue
        if (doc.haystack.toLowerCase().includes(q)) scores.set(rel, 1)
      }
    }

    const newerT = parseTime(newerThan)
    const olderT = parseTime(olderThan)

    let results = []
    for (const [rel, score] of scores.entries()) {
      const doc = this.docs.get(rel)
      if (!doc) continue
      const updated = parseTime(doc.frontmatter.updated)
      if (newerT != null && (updated == null || updated < newerT)) continue
      if (olderT != null && (updated == null || updated > olderT)) continue
      results.push(summary(doc, rel, score))
    }

    if (sortBy === 'freshness') {
      results.sort((a, b) =>
        (parseTime(b.updated) ?? 0) - (parseTime(a.updated) ?? 0) || b.score - a.score
      )
    } else {
      results.sort((a, b) => b.score - a.score)
    }
    return results.slice(0, topK)
  }

  async tagCloud(opts = {}) {
    await this.ensureFresh()
    const counts = new Map()
    for (const [rel, doc] of this.docs) {
      if (opts.type && doc.frontmatter.type !== opts.type) continue
      if (opts.group && groupOf(rel) !== opts.group) continue
      for (const tag of doc.frontmatter.tags ?? []) {
        counts.set(tag, (counts.get(tag) ?? 0) + 1)
      }
    }
    return [...counts.entries()]
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
  }
}

function summary(doc, rel, score) {
  const fm = doc.frontmatter
  return {
    path: rel,
    id: fm.id,
    title: fm.title,
    type: fm.type,
    group: groupOf(rel),
    tags: fm.tags ?? [],
    updated: fm.updated,
    score: Math.round(score * 1000) / 1000,
  }
}
