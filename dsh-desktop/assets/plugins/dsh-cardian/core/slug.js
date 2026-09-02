import { createHash } from 'node:crypto'

// Normalize a human title into an Obsidian-safe filename stem. The stem is used
// both as the note basename (so Obsidian [[wikilinks]] stay readable) and as
// part of the card id.
export function slugify(input) {
  const s = String(input ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // strip combining diacritics
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-') // keep CJK, otherwise dash
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
  return s || 'note'
}

export function createId(prefix, seed, extra = '') {
  const base = seed ? slugify(seed) : 'note'
  const hash = createHash('sha1')
    .update(`${prefix}:${seed}:${extra}:${Date.now()}:${Math.random()}`)
    .digest('hex')
    .slice(0, 12)
  return `${prefix}-${base}-${hash}`
}

// Deterministic short hash, used to disambiguate slug collisions so re-runs
// produce stable filenames.
export function shortHash(str) {
  return createHash('sha1').update(String(str)).digest('hex').slice(0, 6)
}

export function nowIso() {
  return new Date().toISOString()
}

// Resolve a user-supplied reference (id, exact title, or slug) against a list
// of candidate stems. Returns the matching stem or null.
export function resolveStem(ref, stems) {
  const needle = slugify(ref)
  if (!needle) return null
  return stems.find((s) => s === needle || slugify(s) === needle) ?? null
}
