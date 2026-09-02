import { NoteService, normalizeTags } from './notes.js'
import { slugify } from './slug.js'
import { SECTIONS } from './store.js'
import { NotFoundError, ValidationError } from './errors.js'
import { clampConfidence, validDate } from './cards.js'

const KINDS = new Set(['semantic', 'episodic', 'procedural'])

// 记忆：跨会话持久化的记忆条目。按 scope 归组（默认 global），支持 facts 列表、
// importance 权重、kind（semantic/episodic/procedural）与 status/confidence，
// 供 agent 在后续任务中检索复用。
export class MemoryService extends NoteService {
  constructor(store, deps = {}) {
    super(store, {
      limits: deps.limits,
      section: SECTIONS.memory,
      type: 'memory',
      groupField: 'scope',
      defaultGroup: 'global',
      idPrefix: 'mem',
      mocTitle: '记忆',
      mocDescription: '跨会话持久记忆，按 scope 归组。',
      indexer: deps.indexer,
    })
  }

  plan(args) {
    const title = String(args.title ?? '').trim()
    const content = String(args.content ?? args.body ?? '').trim()
    if (!title) throw new ValidationError('记忆需要 title')
    if (!content) throw new ValidationError('记忆需要 content')
    const scope = args.scope ? String(args.scope).trim() : null
    const factsProvided = Array.isArray(args.facts)
    const facts = factsProvided ? normalizeTags(args.facts) : null
    const importanceProvided = args.importance !== undefined && args.importance !== null
    const importance = importanceProvided
      ? Math.min(5, Math.max(1, Math.round(Number(args.importance))))
      : null
    const kind = args.kind ? String(args.kind).trim().toLowerCase() : null
    if (kind && !KINDS.has(kind)) {
      throw new ValidationError(`kind 必须是 ${[...KINDS].join(' | ')}`)
    }
    return {
      id: args.id ? String(args.id) : null, // 按 id 原地更新（改标题不重复建条目）；不落盘
      group: scope || undefined, // undefined → 保留原 scope 或默认
      stem: slugify(title),
      title,
      tags: args.tags,
      body: content.endsWith('\n') ? content : content + '\n',
      extra: {
        facts,
        importance,
        kind: kind ?? null,
        aliases: args.aliases ?? null,
        status: args.status ?? null,
        confidence: clampConfidence(args.confidence),
        summary: args.summary ?? null,
        relations: args.relations ?? null,
        as_of: validDate(args.as_of),
        expires: validDate(args.expires),
      },
    }
  }

  // Append an append-only revision entry on every update, capped at 20. Entries
  // are flat "ISO 前标题" strings so they round-trip through the YAML frontmatter.
  decorate(frontmatter, prevFm) {
    if (!prevFm?.id) return frontmatter
    const history = Array.isArray(prevFm.history) ? prevFm.history.slice(-19) : []
    history.push(`${frontmatter.updated} ${prevFm.title ?? frontmatter.title}`)
    return { ...frontmatter, history }
  }

  // 把一条值得长期保留的记忆晋升到本地说明文件（PROJECT.md），等价于
  // “评审记忆 → 建议晋升”的人工流程：内容追加为带时间戳的小节。
  async promote(ref, { target = 'shared' } = {}) {
    const note = await this.get(ref)
    if (!note) throw new NotFoundError(`条目不存在: ${ref}`)
    const today = new Date().toISOString().slice(0, 10)
    const head = String(note.summary ?? "").trim()
    const facts = Array.isArray(note.facts) && note.facts.length ? "" : ""
    const section = [
      "",
      `## ${today} · 晋升自记忆库：${note.title}`,
      head ? head : String(note.body ?? "").split("\n").find(Boolean)?.replace(/^#+\s*/, "") ?? "",
      "",
    ].join("\n")
    const destFile = target === "local" ? "PERSONAL.md" : "PROJECT.md"
    const prev = await this.store.read(destFile)
    const body = ((prev && prev.body) || "# 项目说明（由知识树维护的记忆晋升区）\n") + section
    await this.store.write(destFile, { frontmatter: { title: target === "local" ? "个人说明" : "项目说明", type: "promoted" }, body })
    return { file: destFile, promoted: note.title, scope: note.scope, target }
  }
  // Render the Facts section from the final merged facts list, so the note body
  // never drifts from its frontmatter.
  finalizeBody(body, frontmatter) {
    const facts = frontmatter.facts ?? []
    if (!facts.length) return body
    return (
      body.trimEnd() + `\n\n## Facts\n\n${facts.map((f) => `- ${f}`).join('\n')}\n`
    )
  }
}
