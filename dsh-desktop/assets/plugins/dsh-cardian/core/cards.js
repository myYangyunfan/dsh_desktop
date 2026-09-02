import { NoteService } from './notes.js'
import { slugify } from './slug.js'
import { SECTIONS } from './store.js'
import { ValidationError, NotFoundError } from './errors.js'

function cardTypeOf(v) {
  if (v === undefined || v === null || v === '') return null
  const s = String(v).trim().toLowerCase()
  return s || null
}

// 知识卡片：原子化的知识单元。标题 + 自由 Markdown 正文，可按分类、标签归组和
// 检索。可选 `source`（来源）、`status`（draft/published）、`confidence`（0-1）。
export class CardsService extends NoteService {
  constructor(store, deps = {}) {
    super(store, {
      limits: deps.limits,
      section: SECTIONS.card,
      type: 'card',
      groupField: 'category',
      defaultGroup: 'general',
      idPrefix: 'card',
      mocTitle: '知识卡片',
      mocDescription: '原子化知识卡片，按分类归组。',
      indexer: deps.indexer,
    })
  }

  plan(args) {
    const title = String(args.title ?? '').trim()
    const content = String(args.content ?? args.body ?? '').trim()
    if (!title) throw new ValidationError('知识卡片需要 title')
    if (!content) throw new ValidationError('知识卡片需要 content')
    const category = args.category ? String(args.category).trim() : null
    return {
      id: args.id ? String(args.id) : null, // 按 id 原地更新（改标题不重复建卡）；不落盘
      group: category || undefined, // undefined → 保留原分类或默认
      stem: slugify(title),
      title,
      tags: args.tags,
      body: content.endsWith('\n') ? content : content + '\n',
      extra: {
        source: args.source ?? null,
        aliases: args.aliases ?? null,
        status: args.status ?? null,
        confidence: clampConfidence(args.confidence),
        summary: args.summary ?? null,
        relations: args.relations ?? null,
        as_of: validDate(args.as_of),
        expires: validDate(args.expires),
        cardType: cardTypeOf(args.cardType),
        front: args.front ?? null,
        back: args.back ?? null,
        deck: args.deck ?? null,
      },
    }
  }

  // 按卡片类型（机读分类）过滤；类型缺失的条目归入 untyped。
  async list(opts = {}) {
    const all = await super.list(opts)
    const want = opts && opts.cardType ? String(opts.cardType).toLowerCase() : null
    if (!want) return all
    return all.filter((e) => String(e.cardType ?? 'untyped').toLowerCase() === want)
  }
  // Grade a flashcard with an SM-2 style review and reschedule it.
  // grade: 0=again, 1=hard, 2=good, 3=easy.
  async review(ref, grade = 2) {
    return this.store.transact(async () => {
      const entry = await this.find(ref)
      if (!entry) throw new NotFoundError(`卡片不存在: ${ref}`)
      const fm = entry.frontmatter
      if (!fm.front) throw new ValidationError('该卡片没有 front，不是闪卡')

      const g = Math.max(0, Math.min(3, Number.isFinite(Number(grade)) ? Math.round(Number(grade)) : 0))
      const ease = Number(fm.ease) || 2.5
      let reps = Number(fm.reps) || 0
      let interval = Number(fm.interval) || 0
      let newEase = ease

      if (g < 2) {
        reps = 0
        interval = 0
        newEase = Math.max(1.3, ease - 0.2)
      } else {
        reps += 1
        if (reps === 1) interval = 1
        else if (reps === 2) interval = 6
        else interval = Math.max(1, Math.round(interval * ease))
        newEase = Math.max(1.3, ease + (0.1 - (3 - g) * (0.08 + (3 - g) * 0.02)))
      }
      const due = new Date(Date.now() + interval * 86400000).toISOString()
      const nextFm = {
        ...fm,
        reps,
        interval,
        ease: Math.round(newEase * 100) / 100,
        due,
        reviewed: new Date().toISOString(),
      }
      await this.store._write(entry.rel, { frontmatter: nextFm, body: entry.body })
      return { rel: entry.rel, title: fm.title, grade: g, interval, due, ease: nextFm.ease }
    })
  }

  // List flashcards that are due for review (optionally by deck).
  async due({ deck = null } = {}) {
    const now = Date.now()
    const entries = await this.entries()
    return entries
      .filter((e) => e.frontmatter.front)
      .filter((e) => !deck || e.frontmatter.deck === deck)
      .filter((e) => !e.frontmatter.due || Date.parse(String(e.frontmatter.due)) <= now)
      .map((e) => ({
        rel: e.rel,
        title: e.frontmatter.title,
        front: e.frontmatter.front,
        back: e.frontmatter.back ?? null,
        deck: e.frontmatter.deck ?? null,
        due: e.frontmatter.due ?? null,
        interval: e.frontmatter.interval ?? 0,
        reps: e.frontmatter.reps ?? 0,
      }))
  }
}

export function clampConfidence(value) {
  if (value === undefined || value === null || value === '') return null
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  return Math.min(1, Math.max(0, n))
}

// Validate an ISO date string, returning it unchanged or throwing. Used for
// `as_of` / `expires` so stale detection never sees garbage.
export function validDate(value) {
  if (value === undefined || value === null || value === '') return null
  const s = String(value)
  if (Number.isNaN(Date.parse(s))) throw new ValidationError(`无效日期: ${value}`)
  return s
}
