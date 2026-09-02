import { promises as fs } from 'node:fs'
import path from 'node:path'
import { parseFrontmatter } from './frontmatter.js'
import { slugify } from './slug.js'
import { ValidationError } from './errors.js'
import { SECTIONS } from './store.js'

// Import/export so the vault is a portable, plain-text artifact (not a locked
// database). JSON export is a complete snapshot; JSON import restores it. A
// folder of loose Markdown notes can also be pulled in as knowledge cards.

export class Sync {
  constructor({ store, cards, memory, wiki }) {
    this.store = store
    this.cards = cards
    this.memory = memory
    this.wiki = wiki
  }

  async exportJson() {
    const notes = await this.store.snapshot()
    return {
      format: 'cardian-vault',
      version: 1,
      exportedAt: new Date().toISOString(),
      count: notes.length,
      notes: notes.map(({ rel, frontmatter, body }) => ({ rel, frontmatter, body })),
    }
  }

  async importJson(data) {
    const notes = Array.isArray(data?.notes) ? data.notes : null
    if (!notes) throw new ValidationError('无效的导出：缺少 notes 数组')
    // Validate everything up front so a single bad entry cannot leave a
    // half-restored vault.
    const sectionPrefixes = Object.values(SECTIONS).map((d) => `${d}/`)
    for (const item of notes) {
      if (!item?.rel || typeof item.rel !== 'string') {
        throw new ValidationError('导入条目缺少 rel')
      }
      if (item.rel.includes('..') || item.rel.includes('\\') || item.rel.startsWith('/')) {
        throw new ValidationError(`非法的 rel 路径: ${item.rel}`)
      }
      if (!sectionPrefixes.some((p) => item.rel.startsWith(p))) {
        throw new ValidationError(`rel 不在已知分区内: ${item.rel}`)
      }
      if (!item.frontmatter || typeof item.frontmatter !== 'object') {
        throw new ValidationError(`导入条目缺少 frontmatter: ${item.rel}`)
      }
    }
    let imported = 0
    for (const item of notes) {
      await this.store.write(item.rel, { frontmatter: item.frontmatter, body: item.body ?? '' })
      imported++
    }
    await this.refresh()
    return { imported }
  }

  // Import loose `.md` notes from a folder as knowledge cards. A note that
  // already carries `type: memory` / `type: wiki` in its frontmatter is routed
  // to the matching section; everything else becomes a card.
  //
  // Least privilege: mirror the ingest/sync root whitelist so a tool argument
  // cannot be used to slurp arbitrary markdown from anywhere on disk. When no
  // allowedRoots are configured the check is a no-op (unrestricted by design).
  async importMarkdownFolder(dir, opts = {}) {
    const category = String(opts.category ?? 'imported')
    const absDir = path.resolve(String(dir ?? ''))
    this._assertImportRoot(absDir)
    const files = await collectMarkdown(absDir)
    const imported = []
    for (const file of files) {
      const text = await fs.readFile(file, 'utf8')
      const { frontmatter, body } = parseFrontmatter(text)
      if (!body.trim()) continue // skip empty/whitespace-only notes
      const title = frontmatter.title || path.basename(file, path.extname(file))
      if (frontmatter.type === 'memory') {
        imported.push(
          await this.memory.upsert({
            title,
            content: body.trim() || frontmatter.content || '',
            tags: frontmatter.tags,
            scope: frontmatter.scope,
            facts: frontmatter.facts,
            importance: frontmatter.importance,
          })
        )
      } else if (frontmatter.type === 'wiki') {
        imported.push(
          await this.wiki.upsert({
            repo: frontmatter.repo ?? opts.repo ?? 'imported',
            path: frontmatter.path ?? path.basename(file, path.extname(file)),
            content: body.trim() || '',
            tags: frontmatter.tags,
            summary: frontmatter.summary,
            language: frontmatter.language,
          })
        )
      } else {
        imported.push(
          await this.cards.upsert({
            title,
            content: body.trim() || '',
            tags: frontmatter.tags,
            category: frontmatter.category ?? category,
            source: frontmatter.source,
          })
        )
      }
    }
    return { count: imported.length, imported }
  }

  // Resolve the import target against the wiki service's allowedRoots (the one
  // source of truth for which on-disk folders cardian may read). Throws
  // ValidationError when the resolved path falls outside every declared root.
  _assertImportRoot(absDir) {
    const roots = this.wiki?.allowedRoots ?? []
    if (roots.length === 0) return
    const ok = roots.some((root) => absDir === root || absDir.startsWith(root + path.sep))
    if (!ok) {
      throw new ValidationError(`导入目录不在 allowedRoots 白名单内：${absDir}`, {
        suggestion: '在 cardian 配置的 allowedRoots 中加入该目录，或移除限制',
      })
    }
  }

  async refresh() {
    await Promise.all([this.cards.refreshMoc(), this.memory.refreshMoc(), this.wiki.refreshMoc()])
  }
}

async function collectMarkdown(dir, out = []) {
  let entries
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch (err) {
    if (err.code === 'ENOENT') return out
    throw err
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) await collectMarkdown(p, out)
    else if (entry.name.endsWith('.md')) out.push(p)
  }
  return out
}
