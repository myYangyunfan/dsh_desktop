import { createId, nowIso, slugify, shortHash } from './slug.js'
import { rebuildMoc } from './moc.js'
import { ValidationError, NotFoundError } from './errors.js'

export function normalizeTags(tags) {
  if (!Array.isArray(tags)) return []
  return [...new Set(tags.map((t) => String(t).trim()).filter(Boolean))]
}

function compact(obj) {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined && v !== null && v !== '')
  )
}

// Allocate a free filename stem under `dir`, disambiguating collisions with a
// deterministic suffix. When `ignoreId` matches the occupying note, the stem is
// considered free (it is the note being relocated).
async function allocateRel(store, dir, baseStem, seed, ignoreId = null) {
  const occupiedIsSelf = (note) => ignoreId && note?.frontmatter.id === ignoreId
  let stem = baseStem
  let rel = `${dir}/${stem}.md`
  let occupied = await store.read(rel)
  let i = 0
  while (occupied && !occupiedIsSelf(occupied)) {
    i++
    stem = `${baseStem}-${shortHash(`${seed}#${i}`)}`
    rel = `${dir}/${stem}.md`
    occupied = await store.read(rel)
  }
  return { stem, rel }
}

// Shared CRUD behavior for the three knowledge-center sections. Each section
// writes notes into its own folder (`section`), tags every note with a `type`
// and a grouping field (`category` / `scope` / `repo`), and keeps an index note.
//
// Upserts are:
//   * idempotent — same title updates in place (stable id + created time),
//   * collision-safe — two titles that slugify alike get disambiguated,
//   * merge-semantic — fields the caller omitted are preserved, and
//   * atomic — the whole read-modify-write runs inside the store transaction
//     queue, so parallel upserts of the same title cannot interleave.
export class NoteService {
  constructor(store, opts) {
    this.store = store
    this.opts = opts // { section, type, groupField, defaultGroup, idPrefix, mocTitle, mocDescription, indexer }
    this.indexer = opts.indexer ?? null
    this.opts.limits = opts.limits ?? null
  }

  plan(args) {
    throw new Error('plan() must be implemented by the subclass')
  }

  // Subclasses override to resolve an existing note for in-place updates.
  // 优先按 plan.id 命中（面板编辑可安全改标题/改分类而不产生重复卡），
  // 回退到精确标题匹配（Agent 工具的同标题幂等 upsert 语义不变）。
  async resolveExisting(plan) {
    const entries = await this.entries()
    if (plan.id) {
      const byId = entries.find((e) => e.frontmatter.id === plan.id)
      if (byId) return byId
    }
    return entries.find((e) => e.frontmatter.title === plan.title) ?? null
  }

  // Write one note without refreshing the index (used by bulk operations).
  async writeNote(plan) {
    const lim = this.opts.limits || {}
    return this.store.transact(async () => {
      if (lim.maxNoteChars && String(plan.body ?? '').length > lim.maxNoteChars) {
        throw new ValidationError(`笔记超出字节上限 ${lim.maxNoteChars}（当前 ${String(plan.body).length}）`)
      }
      if (lim.maxNotesPerSection) {
        const sectionFiles = await this.store.list(this.opts.section)
        const hasExisting = await this.resolveExisting(plan)
        if (!hasExisting && sectionFiles.length >= lim.maxNotesPerSection) {
          throw new ValidationError(`分区已达条目配额 ${lim.maxNotesPerSection}`)
        }
      }
      const existing = await this.resolveExisting(plan)
      const group = slugify(plan.group ?? existing?.group ?? this.opts.defaultGroup)
      const dir = `${this.opts.section}/${group}`

      let stem = plan.stem
      let rel = existing ? existing.rel : `${dir}/${stem}.md`
      if (!existing) {
        ;({ stem, rel } = await allocateRel(this.store, dir, plan.stem, plan.title))
      } else if (existing.group !== group) {
        // Group changed → relocate into the new folder, keeping id/created.
        ;({ stem, rel } = await allocateRel(this.store, dir, existing.stem, plan.title, existing.frontmatter.id))
      }

      const prev = existing ?? (await this.store.read(rel))
      const prevFm = prev?.frontmatter ?? {}
      const now = nowIso()
      const id = prevFm.id ?? createId(this.opts.idPrefix, stem)
      const created = prevFm.created ?? now

      const baseKeys = new Set(['id', 'type', 'title', 'tags', this.opts.groupField, 'created', 'updated'])
      const preserved = {}
      for (const [key, value] of Object.entries(prevFm)) {
        if (!baseKeys.has(key)) preserved[key] = value
      }
      const tags = plan.tags === undefined ? prevFm.tags ?? [] : normalizeTags(plan.tags)
      const extra = compact(plan.extra ?? {})

      const frontmatter = {
        id,
        type: this.opts.type,
        title: plan.title,
        tags,
        [this.opts.groupField]: group,
        status: extra.status ?? prevFm.status ?? 'published',
        created,
        updated: now,
        ...preserved,
        ...extra,
      }
      const finalFrontmatter = this.decorate ? this.decorate(frontmatter, prevFm, plan) : frontmatter
      const body = this.finalizeBody ? this.finalizeBody(plan.body, finalFrontmatter) : plan.body
      await this.store._write(rel, { frontmatter: finalFrontmatter, body })
      if (existing && existing.rel !== rel) {
        await this.store._remove(existing.rel)
      }
      return { rel, id, title: plan.title, group, updated: now, created }
    })
  }

  // Optional hook: derive the final frontmatter from the merged one (used by
  // memory to append a revision-history entry).
  decorate(frontmatter) {
    return frontmatter
  }

  async upsert(args) {
    const result = await this.writeNote(this.plan(args))
    await this.refreshMoc()
    return result
  }

  // All non-index notes in this section, each annotated with its filename stem
  // and its group (the first folder under the section).
  async entries() {
    const files = await this.store.list(this.opts.section)
    const out = []
    for (const rel of files) {
      const note = await this.store.read(rel)
      if (!note) continue
      const parts = rel.split('/')
      out.push({
        rel,
        stem: parts[parts.length - 1].replace(/\.md$/, ''),
        group: parts.length > 2 ? parts[1] : null,
        frontmatter: note.frontmatter,
        body: note.body,
      })
    }
    return out
  }

  // Loose reference resolution: id, exact title, slug, or alias.
  async find(ref, group = null) {
    const entries = await this.entries()
    const needle = String(ref ?? '').trim()
    const needleSlug = slugify(needle)
    const groupSlug = group ? slugify(group) : null
    for (const entry of entries) {
      if (groupSlug && entry.group !== groupSlug) continue
      const { frontmatter, stem } = entry
      const aliases = frontmatter.aliases ?? []
      if (
        frontmatter.id === needle ||
        frontmatter.title === needle ||
        stem === needleSlug ||
        slugify(frontmatter.title) === needleSlug ||
        aliases.some((a) => String(a) === needle || slugify(String(a)) === needleSlug)
      ) {
        return entry
      }
    }
    return null
  }

  async get(ref, group = null) {
    const entry = await this.find(ref, group)
    if (!entry) return null
    return { ...entry.frontmatter, body: entry.body, rel: entry.rel }
  }

  async list({ group = null, tag = null, status = null } = {}) {
    const entries = await this.entries()
    const wantedTag = tag ? String(tag) : null
    const groupSlug = group ? slugify(group) : null
    const wantedStatus = status ? String(status) : null
    return entries
      .filter(
        (e) =>
          (!groupSlug || e.group === groupSlug) &&
          (!wantedTag || (e.frontmatter.tags ?? []).includes(wantedTag)) &&
          (!wantedStatus || (e.frontmatter.status ?? 'published') === wantedStatus)
      )
      .map((e) => summary(e))
  }

  async search(query, opts = {}) {
    if (!this.indexer) {
      const q = String(query ?? '').toLowerCase()
      if (!q) return []
      return (await this.entries())
        .filter((e) =>
          [e.rel, e.body, e.frontmatter.title, (e.frontmatter.tags ?? []).join(' ')]
            .filter(Boolean)
            .join('\n')
            .toLowerCase()
            .includes(q)
        )
        .map((e) => summary(e))
    }
    return this.indexer.search(query, { ...opts, type: this.opts.type })
  }

  async remove(ref, group = null) {
    const removed = await this.store.transact(async () => {
      const entry = await this.find(ref, group)
      if (!entry) return false
      await this.store._remove(entry.rel)
      return true
    })
    if (removed) await this.refreshMoc()
    return removed
  }

  // 人类反馈闭环：把「AI 生成的内容被用户修正/确认」记回知识本身。
  // correction（被纠正）→ 置信度下调；confirm（确认正确）→ 上调。
  async annotate(ref, kind = 'correction', text = '') {
    return this.store.transact(async () => {
      const entry = await this.find(ref)
      if (!entry) throw new NotFoundError(`条目不存在: ${ref}`)
      const fm = entry.frontmatter
      const corrections = Array.isArray(fm.corrections) ? fm.corrections.slice(-19) : []
      corrections.push(`${new Date().toISOString()} [${kind}] ${String(text).trim()}`.trim())
      let confidence = fm.confidence == null ? 1 : Number(fm.confidence)
      if (!Number.isFinite(confidence)) confidence = 1
      if (kind === 'correction') confidence = Math.max(0, confidence - 0.2)
      else if (kind === 'confirm') confidence = Math.min(1, confidence + 0.1)
      const nextFm = { ...fm, corrections, confidence: Math.round(confidence * 100) / 100 }
      await this.store._write(entry.rel, { frontmatter: nextFm, body: entry.body })
      return { rel: entry.rel, kind, corrections: corrections.length, confidence: nextFm.confidence }
    })
  }

  async refreshMoc() {
    const { groupField, mocTitle, mocDescription } = this.opts
    await rebuildMoc(this.store, this.opts.section, {
      title: mocTitle,
      description: mocDescription,
      groupBy: (fm) => fm[groupField] ?? this.opts.defaultGroup,
    })
  }
}

function summary(entry) {
  return {
    rel: entry.rel,
    id: entry.frontmatter.id,
    title: entry.frontmatter.title,
    group: entry.group,
    tags: entry.frontmatter.tags ?? [],
    status: entry.frontmatter.status ?? 'published',
    cardType: entry.frontmatter.cardType ?? null,
    updated: entry.frontmatter.updated,
    // wiki 卡 frontmatter 有 path（仓库内相对路径），供客户端按文件路径建文件夹树。
    path: entry.frontmatter.path ?? null,
    // 层级卡片字段：AI 扫盘产出的「项目总览 → 模块 → 文件」树靠这两位组装。
    level: entry.frontmatter.level ?? null,
    parent: entry.frontmatter.parent ?? null,
    // 骨架 / AI / 人工 三态，面板角标与「仅重扫未回填」判定的依据。
    analysisLevel: entry.frontmatter.analysisLevel ?? null,
  }
}
