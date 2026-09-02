import { slugify } from './slug.js'

// Obsidian wikilinks (`[[target]]`, `[[target|alias]]`, `[[target#heading]]`)
// are the edges of the knowledge graph. Cardian exposes them as a query-time
// view: backlinks are computed on demand from the vault, so there is no
// denormalized field to keep in sync.

// Strip fenced and inline code so `[[...]]` inside code samples never becomes a
// phantom link (RepoWiki ingests code excerpts into bodies).
function stripCode(text) {
  return String(text ?? '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`\n]*`/g, ' ')
}

export function extractWikilinks(body) {
  const out = []
  const re = /\[\[([^\]\n]+)\]\]/g
  let m
  while ((m = re.exec(stripCode(body)))) {
    const target = m[1].split('|')[0].split('#')[0].trim()
    if (target) out.push(target)
  }
  return [...new Set(out)]
}

export class LinkIndex {
  constructor(store) {
    this.store = store
  }

  // rel -> set of link targets the note points at (unresolved text form).
  async outgoing(rel) {
    const note = await this.store.read(rel)
    return note ? extractWikilinks(note.body) : []
  }

  async _resolveTarget(target) {
    const want = slugify(target)
    const notes = await this.store.snapshot()
    return (
      notes.find((n) => {
        const stem = n.rel.split('/').pop().replace(/\.md$/, '')
        return (
          slugify(stem) === want ||
          slugify(n.frontmatter.title) === want ||
          (n.frontmatter.aliases ?? []).some((a) => slugify(String(a)) === want)
        )
      }) ?? null
    )
  }

  // All notes that link to the note at `rel`. Matching is slug-based so
  // `[[my-note]]`, `[[My Note]]` and a CJK stem all resolve.
  async backlinks(rel) {
    const notes = await this.store.snapshot()
    const parts = rel.split('/')
    const stem = parts[parts.length - 1].replace(/\.md$/, '')
    const target = notes.find((n) => n.rel === rel)
    const want = new Set([slugify(stem)])
    if (target?.frontmatter.title) want.add(slugify(target.frontmatter.title))
    for (const alias of target?.frontmatter.aliases ?? []) want.add(slugify(String(alias)))

    const hits = []
    for (const note of notes) {
      if (note.rel === rel) continue
      const linked = extractWikilinks(note.body).some((t) => want.has(slugify(t)))
      if (linked) {
        hits.push({
          path: note.rel,
          title: note.frontmatter.title ?? note.rel,
          type: note.frontmatter.type,
        })
      }
    }
    return hits
  }

  // Related notes: typed `relations` frontmatter first (e.g.
  // `relates_to [[X]]`), then shared-tag overlap as a fallback.
  async related(rel, { max = 10 } = {}) {
    const note = await this.store.read(rel)
    if (!note) return []
    const out = []

    for (const raw of note.frontmatter.relations ?? []) {
      const text = String(raw)
      const verb = text.replace(/\[\[[^\]]*\]\]/g, '').trim() || 'related'
      for (const target of extractWikilinks(text)) {
        const resolved = await this._resolveTarget(target)
        if (resolved && resolved.rel !== rel && !out.some((o) => o.path === resolved.rel)) {
          out.push({
            path: resolved.rel,
            title: resolved.frontmatter.title ?? resolved.rel,
            type: resolved.frontmatter.type,
            relation: verb,
          })
        }
      }
    }

    if (out.length < max) {
      const tags = new Set(note.frontmatter.tags ?? [])
      if (tags.size > 0) {
        const notes = await this.store.snapshot()
        const scored = []
        for (const other of notes) {
          if (other.rel === rel) continue
          const overlap = (other.frontmatter.tags ?? []).filter((t) => tags.has(t)).length
          if (overlap > 0) {
            scored.push({
              path: other.rel,
              title: other.frontmatter.title ?? other.rel,
              type: other.frontmatter.type,
              sharedTags: overlap,
            })
          }
        }
        scored.sort((a, b) => b.sharedTags - a.sharedTags)
        for (const s of scored) {
          if (out.length >= max) break
          if (!out.some((o) => o.path === s.path)) out.push({ ...s, relation: 'shared-tag' })
        }
      }
    }
    return out.slice(0, max)
  }
}
