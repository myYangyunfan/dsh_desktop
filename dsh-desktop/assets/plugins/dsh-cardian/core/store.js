import { promises as fs } from 'node:fs'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { stringifyFrontmatter, parseFrontmatter } from './frontmatter.js'
import { PathError } from './errors.js'

// Section folders inside the vault. Keeping the three knowledge-center
// features in separate folders makes the Obsidian graph and file explorer
// clean, and lets each section own an index (Map of Content) note.
export const SECTIONS = { wiki: 'Repos', card: 'Cards', memory: 'Memory' }

// Low-level markdown store over a local directory (the "Obsidian vault").
//
// Engineering invariants:
//   * Every note is a `.md` file with YAML frontmatter + a markdown body.
//   * Writes are atomic (temp file + rename) so a crashed write never leaves a
//     half-written note, and concurrent readers see either the old or new file.
//   * Mutations are serialized through an internal queue; `transact()` lets
//     callers run a whole read-modify-write atomically with respect to other
//     mutations (so parallel upserts cannot interleave).
//   * All paths are validated so a tool argument can never escape the vault,
//     including through symlinked directories.
export class VaultStore {
  constructor(rootPath, opts = {}) {
    this.root = path.resolve(rootPath)
    this.realRoot = null
    this.logger = opts.logger ?? null
    this.version = 0
    this._queue = Promise.resolve()
  }

  abs(relPath) {
    const target = path.resolve(this.root, relPath)
    if (target !== this.root && !target.startsWith(this.root + path.sep)) {
      throw new PathError(`路径越界: ${relPath}`, { suggestion: '路径必须位于 vault 内' })
    }
    return target
  }

  rel(absPath) {
    return path.relative(this.root, absPath).split(path.sep).join('/')
  }

  async init() {
    await fs.mkdir(this.root, { recursive: true })
    this.realRoot = await fs.realpath(this.root)
    await Promise.all(
      Object.values(SECTIONS).map((dir) => fs.mkdir(this.abs(dir), { recursive: true }))
    )
  }

  // Serialize a mutation and isolate its rejection so one failed op never
  // poisons the queue for the next.
  _enqueue(fn) {
    const run = this._queue.then(() => fn())
    this._queue = run.catch(() => {})
    return run
  }

  // Run a read-modify-write atomically with respect to other mutations.
  transact(fn) {
    return this._enqueue(fn)
  }

  // Verify the resolved path does not escape the vault through a symlinked
  // directory. `parent` is the deepest existing ancestor to realpath.
  async _guard(absPath) {
    if (!this.realRoot) {
      try {
        this.realRoot = await fs.realpath(this.root)
      } catch {
        return // root does not exist yet; nothing to guard
      }
    }
    let dir = path.dirname(absPath)
    let real
    while (true) {
      try {
        real = await fs.realpath(dir)
        break
      } catch {
        const parent = path.dirname(dir)
        if (parent === dir) return // reached root without resolution
        dir = parent
      }
    }
    if (real !== this.realRoot && !real.startsWith(this.realRoot + path.sep)) {
      throw new PathError(`路径经符号链接逃逸 vault: ${absPath}`, {
        suggestion: '移除指向 vault 外部的符号链接',
      })
    }
  }

  // Raw write (no queue). Used inside transactions.
  async _write(relPath, note) {
    const absPath = this.abs(relPath)
    await fs.mkdir(path.dirname(absPath), { recursive: true })
    await this._guard(absPath)
    const text = stringifyFrontmatter(note.frontmatter) + (note.body ?? '')
    const tmp = `${absPath}.${randomBytes(6).toString('hex')}.tmp`
    await fs.writeFile(tmp, text, 'utf8')
    await fs.rename(tmp, absPath)
    this.version++
    return absPath
  }

  write(relPath, note) {
    return this._enqueue(() => this._write(relPath, note))
  }

  async _remove(relPath) {
    await fs.rm(this.abs(relPath), { force: true })
    this.version++
  }

  remove(relPath) {
    return this._enqueue(() => this._remove(relPath))
  }

  async read(relPath) {
    const absPath = this.abs(relPath)
    try {
      const text = await fs.readFile(absPath, 'utf8')
      return parseFrontmatter(text)
    } catch (err) {
      if (err.code === 'ENOENT') return null
      throw err
    }
  }

  async exists(relPath) {
    try {
      await fs.access(this.abs(relPath))
      return true
    } catch {
      return false
    }
  }

  // List `.md` files under a directory (recursive), returned as vault-relative
  // paths with forward slashes. Skips index/README notes.
  async list(dirRel) {
    const dirAbs = this.abs(dirRel)
    const out = []
    let entries
    try {
      entries = await fs.readdir(dirAbs, { withFileTypes: true })
    } catch (err) {
      if (err.code === 'ENOENT') return out
      throw err
    }
    for (const entry of entries) {
      const rel = this.rel(path.join(dirAbs, entry.name))
      if (entry.isDirectory()) {
        out.push(...(await this.list(rel)))
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        // Only section-root index notes (e.g. `Repos/README.md`) are MOC files;
        // a nested note named `index.md` or `moc.md` is a real note.
        const isSectionMoc = isIndexName(entry.name) && rel.split('/').length === 2
        if (!isSectionMoc) out.push(rel)
      }
    }
    return out
  }

  // Latest mtime across the three section directories. Used by the indexer to
  // detect external/hand edits cheaply (without re-reading every note).
  async freshness() {
    let mtime = 0
    for (const dir of Object.values(SECTIONS)) {
      try {
        const st = await fs.stat(this.abs(dir))
        mtime = Math.max(mtime, st.mtimeMs)
      } catch {
        /* section not created yet */
      }
    }
    return mtime
  }

  // Per-file mtimes for every non-index note, WITHOUT reading or parsing file
  // contents. `freshness()` only reports section-DIRECTORY mtimes, which do not
  // change when a note is edited in place, so the indexer diffs these per-note
  // mtimes to catch external/hand edits cheaply (stat sweep, not re-tokenize).
  async fileStats() {
    const out = []
    for (const dir of Object.values(SECTIONS)) {
      for (const rel of await this.list(dir)) {
        try {
          const st = await fs.stat(this.abs(rel))
          out.push({ rel, mtimeMs: st.mtimeMs })
        } catch {
          /* removed between listing and statting */
        }
      }
    }
    return out
  }

  // Read every non-index note in every section in one pass.
  async snapshot() {
    const notes = []
    for (const dir of Object.values(SECTIONS)) {
      for (const rel of await this.list(dir)) {
        const note = await this.read(rel)
        if (note) notes.push({ rel, frontmatter: note.frontmatter, body: note.body })
      }
    }
    return notes
  }

  // Orphan temp files left behind by a crash mid-atomic-write.
  async tmpFiles() {
    const out = []
    const walk = async (dirAbs) => {
      let entries
      try {
        entries = await fs.readdir(dirAbs, { withFileTypes: true })
      } catch {
        return
      }
      for (const e of entries) {
        const p = path.join(dirAbs, e.name)
        if (e.isDirectory()) await walk(p)
        else if (e.isFile() && e.name.endsWith('.tmp')) out.push(this.rel(p))
      }
    }
    for (const dir of Object.values(SECTIONS)) await walk(this.abs(dir))
    return out
  }
}

function isIndexName(name) {
  const stem = name.replace(/\.md$/i, '')
  return /^(README|_index|index|MOC|moc)$/i.test(stem)
}
