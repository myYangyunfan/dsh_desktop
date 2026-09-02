// Model-callable tools exposed by the cardian dsh adapter. Every tool maps
// onto the framework-agnostic core and always reads/writes the Obsidian vault.
//
// Following basic-memory's "progressive tool discovery", each tool carries
// behavior hints (`readOnly` / `idempotent` / `destructive`). Return values are
// plain structured JSON (12-factor "tools are structured outputs"), and thrown
// errors are compacted into `{ ok:false, error:{code,message,suggestion} }`
// (12-factor Factor 9) instead of raw stack traces.

import { toErrorPayload, ValidationError } from '../core/errors.js'

const str = (description) => ({ type: 'string', description, required: true })
const strOpt = (description) => ({ type: 'string', description, required: false })
const arrOpt = (description) => ({ type: 'array', items: { type: 'string' }, description, required: false })
const numOpt = (description) => ({ type: 'number', description, required: false })
const boolOpt = (description) => ({ type: 'boolean', description, required: false })

function params(props, required = []) {
  const properties = {}
  for (const [key, value] of Object.entries(props)) properties[key] = value
  return { type: 'object', properties, required }
}

function register(ctx, key, def) {
  if (!ctx.tools || typeof ctx.tools.register !== 'function') return
  const { behavior, execute, ...rest } = def
  const wrapped = async (rawArgs) => {
    try {
      const args = rawArgs ?? {}
      const required = def.parameters?.required ?? []
      const missing = required.filter((r) => args[r] === undefined || args[r] === null || args[r] === '')
      if (missing.length) {
        throw new ValidationError(`缺少必填参数: ${missing.join(', ')}`)
      }
      return await execute(args)
    } catch (err) {
      return toErrorPayload(err)
    }
  }
  // dsh-tools register() takes a SINGLE definition object (name + output + execute).
  // The unconstrained annotation-only schema `{}` validates against any lossless-JSON
  // value every tool returns, and render produces the host's text content blocks.
  ctx.tools.register({
    ...rest,
    name: key,
    behavior,
    readOnly: behavior === 'read',
    idempotent: behavior === 'read' || behavior === 'idempotent' || behavior === 'destroy',
    destructive: behavior === 'destroy',
    output: {
      schema: {},
      render: (_args, value) => [
        { type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) },
      ],
    },
    execute: wrapped,
  })
}

const SECTION_TYPE = { wiki: 'wiki', cards: 'card', memory: 'memory' }

export function registerTools(ctx, cardian) {
  const { cards, memory, wiki } = cardian

  register(ctx, 'cardian.status', {
    name: 'cardian.status',
    description: '查看知识中心(cardian)状态：Obsidian 仓库路径、三大功能(RepoWiki/知识卡片/记忆)的条目数与仓库列表、过期笔记数。',
    behavior: 'read',
    parameters: params({}),
    async execute() {
      return cardian.status()
    },
  })

  register(ctx, 'cardian.reindex', {
    name: 'cardian.reindex',
    description: '强制重建检索索引（在 Obsidian 里手工编辑笔记后调用以刷新搜索结果）。',
    behavior: 'idempotent',
    parameters: params({}),
    async execute() {
      return cardian.reindex()
    },
  })

  register(ctx, 'cardian.wiki.overview', {
    name: 'cardian.wiki.overview',
    description: '为人读者生成/刷新某仓库的项目级概览页（体量、目录、语言分布、核心模块被引排行、页面清单）。',
    behavior: 'idempotent',
    parameters: params({ repo: str('仓库名称') }, ['repo']),
    async execute(args) {
      return wiki.overview(args.repo)
    },
  })

  register(ctx, 'cardian.memory.promote', {
    name: 'cardian.memory.promote',
    description: '把一条长期记忆晋升到仓库根 PROJECT.md 本地说明文件（评审式记忆治理）。',
    behavior: 'idempotent',
    parameters: params({ ref: str("记忆 id / 标题 / slug"), target: strOpt("shared | local") }, ["ref"]),
    async execute(args) {
      return memory.promote(args.ref, { target: args.target ?? 'shared' })
    },
  })
  register(ctx, 'cardian.wiki.sync', {
    name: 'cardian.wiki.sync',
    description: '以磁盘为准双向同步指定仓库的 RepoWiki：新增生成骨架、变更重建骨架（语义回填卡只刷指纹并标 staleSynced）、剪除孤儿页。',
    behavior: 'idempotent',
    parameters: params({
      repoPath: str('本地仓库绝对/相对路径'),
      repoName: strOpt('仓库名称（默认取目录名）'),
      pruneOrphans: boolOpt('是否剪除孤儿页（默认 true）'),
      maxFiles: numOpt('最多扫描文件数（默认 100）'),
    }, ['repoPath']),
    async execute(args) {
      return wiki.sync(args.repoPath, { repoName: args.repoName, pruneOrphans: args.pruneOrphans !== false, maxFiles: args.maxFiles })
    },
  })

  register(ctx, 'cardian.wiki.graph', {
    name: 'cardian.wiki.graph',
    description: '返回某仓库的代码图谱：节点（页面+导出符号）与依赖边（import 关系），含每个模块的被引计数。',
    behavior: 'read',
    parameters: params({ repo: str('仓库名称') }, ['repo']),
    async execute(args) {
      return wiki.graph(args.repo)
    },
  })

  register(ctx, 'cardian.feedback', {
    name: 'cardian.feedback',
    description: '人类反馈闭环：对某条知识的修正（置信度下调）或确认（上调）记回笔记本身，供召回加权。',
    behavior: 'idempotent',
    parameters: params({ ref: str('条目 id / 标题 / slug'), kind: strOpt('correction | confirm'), note: strOpt('反馈说明') }, ['ref']),
    async execute(args) {
      return cardian.feedback(args.ref, args.kind ?? 'correction', args.note ?? '')
    },
  })

  register(ctx, 'cardian.skill.export', {
    name: 'cardian.skill.export',
    description: '把一批知识圈定为可复用的技能单元：生成 Skills/<name>/SKILL.md 与 notes/ 副本。',
    behavior: 'idempotent',
    parameters: params({
      name: str('技能名称'),
      description: strOpt('一句话描述'),
      refs: arrOpt('条目引用列表（优先）'),
      section: strOpt('限定分区 cards | memory | wiki'),
      group: strOpt('限定分组（分类/作用域/仓库）'),
    }, ["name"]),
    async execute(args) {
      return cardian.exportSkill(args)
    },
  })
  register(ctx, 'cardian.doctor', {
    name: 'cardian.doctor',
    description: '健康检查：MOC 索引、孤儿临时文件、缺少必填字段、过期笔记。',
    behavior: 'read',
    parameters: params({}),
    async execute() {
      return cardian.doctor()
    },
  })

  register(ctx, 'cardian.schema', {
    name: 'cardian.schema',
    description: '列出当前仓库里实际使用的 frontmatter 字段及其值类型。',
    behavior: 'read',
    parameters: params({}),
    async execute() {
      return cardian.schema()
    },
  })

  register(ctx, 'cardian.search', {
    name: 'cardian.search',
    description: '知识中心混合检索（关键词 + 语义），覆盖 RepoWiki/知识卡片/记忆，返回按相关度排序的条目。',
    behavior: 'read',
    parameters: params({
      query: str('搜索关键词'),
      section: strOpt('限定分区：wiki | cards | memory'),
      tag: strOpt('限定标签'),
      topK: numOpt('返回条数（默认 20）'),
      semantic: boolOpt('是否启用语义检索（默认 true）'),
    }, ['query']),
    async execute(args) {
      return cardian.search(args.query, {
        type: SECTION_TYPE[args.section] ?? null,
        tag: args.tag,
        topK: args.topK,
        semantic: args.semantic,
      })
    },
  })

  register(ctx, 'cardian.recall', {
    name: 'cardian.recall',
    description: '精简召回：返回少量高信号上下文（按重要度/新鲜度/置信度重排），供 agent 快速了解“关于此事我知道什么”。',
    behavior: 'read',
    parameters: params({
      query: str('召回关键词'),
      section: strOpt('限定分区：wiki | cards | memory'),
      scope: strOpt('记忆作用域（仅对 memory 生效）'),
      topK: numOpt('返回条数（默认 4）'),
      minConfidence: numOpt('最低置信度 0-1'),
    }, ['query']),
    async execute(args) {
      return cardian.recall(args.query, {
        type: SECTION_TYPE[args.section] ?? null,
        scope: args.scope,
        topK: args.topK,
        minConfidence: args.minConfidence,
      })
    },
  })

  register(ctx, 'cardian.tagCloud', {
    name: 'cardian.tagCloud',
    description: '返回标签云（标签及其出现次数），可按分区过滤。',
    behavior: 'read',
    parameters: params({ section: strOpt('限定分区：wiki | cards | memory') }),
    async execute(args) {
      return cardian.tagCloud({ type: SECTION_TYPE[args.section] ?? null })
    },
  })

  register(ctx, 'cardian.backlinks', {
    name: 'cardian.backlinks',
    description: '查询某个条目（按 id/标题/slug/别名）被哪些其它条目 [[wikilink]] 引用。',
    behavior: 'read',
    parameters: params({ ref: str('条目 id / 标题 / slug / 别名') }, ['ref']),
    async execute(args) {
      return cardian.backlinks(args.ref)
    },
  })

  register(ctx, 'cardian.related', {
    name: 'cardian.related',
    description: '按共享标签查找与某条目相关的其它条目。',
    behavior: 'read',
    parameters: params({ ref: str('条目 id / 标题 / slug / 别名') }, ['ref']),
    async execute(args) {
      return cardian.related(args.ref)
    },
  })

  register(ctx, 'cardian.export', {
    name: 'cardian.export',
    description: '导出整个知识中心为 JSON（含全部 frontmatter 与正文），用于备份或迁移。',
    behavior: 'read',
    parameters: params({}),
    async execute() {
      return cardian.exportJson()
    },
  })

  register(ctx, 'cardian.import', {
    name: 'cardian.import',
    description: '从 cardian.export 的 JSON 快照导入并还原知识中心。',
    behavior: 'idempotent',
    parameters: params({ data: { type: 'object', description: 'export 返回的快照对象', required: true } }, ['data']),
    async execute(args) {
      return cardian.importJson(args.data)
    },
  })

  register(ctx, 'cardian.importMarkdown', {
    name: 'cardian.importMarkdown',
    description: '扫描一个文件夹里的 Markdown 笔记导入为知识卡片（带 type 的 frontmatter 会路由到记忆/RepoWiki）。',
    behavior: 'idempotent',
    parameters: params({
      dir: str('本地文件夹路径'),
      category: strOpt('默认分类（默认 imported）'),
    }, ['dir']),
    async execute(args) {
      return cardian.importMarkdownFolder(args.dir, { category: args.category })
    },
  })

  // ---- RepoWiki ----
  register(ctx, 'cardian.wiki.ingest', {
    name: 'cardian.wiki.ingest',
    description: '扫描本地代码仓库目录，为每个源文件生成一张 Wiki 骨架卡片（路径、语言、行数、代码摘录）。生成后用 cardian.wiki.upsert 回填语义描述。',
    behavior: 'idempotent',
    parameters: params({
      repoPath: str('本地仓库绝对/相对路径'),
      repoName: strOpt('仓库名称（默认取目录名）'),
      maxFiles: numOpt('最多扫描的文件数（默认 50）'),
    }, ['repoPath']),
    async execute(args) {
      return wiki.ingest(args.repoPath, { repoName: args.repoName, maxFiles: args.maxFiles })
    },
  })

  register(ctx, 'cardian.wiki.upsert', {
    name: 'cardian.wiki.upsert',
    description: '创建或更新一张 RepoWiki 卡片，描述仓库中某个文件/模块的职责与结构。',
    behavior: 'idempotent',
    parameters: params({
      repo: str('仓库名称（slug）'),
      path: str('文件/模块在仓库内的相对路径，如 src/lib/store.js'),
      content: str('Wiki 卡片正文（Markdown）'),
      title: strOpt('卡片标题（默认等于 path）'),
      tags: arrOpt('标签'),
      language: strOpt('语言'),
      summary: strOpt('一句话摘要'),
      status: strOpt('draft | published'),
      confidence: numOpt('置信度 0-1'),
      aliases: arrOpt('别名'),
      relations: arrOpt('类型化关系，如 "depends_on [[目标]]"'),
      as_of: strOpt('事实截止日期（ISO）'),
      expires: strOpt('过期日期（ISO）'),
    }, ['repo', 'path', 'content']),
    async execute(args) {
      return wiki.upsert(args)
    },
  })

  register(ctx, 'cardian.wiki.get', {
    name: 'cardian.wiki.get',
    description: '读取某仓库中指定路径的 Wiki 卡片。',
    behavior: 'read',
    parameters: params({ repo: str('仓库名称'), path: str('文件相对路径') }, ['repo', 'path']),
    async execute(args) {
      return wiki.getByPath(args.repo, args.path)
    },
  })

  register(ctx, 'cardian.wiki.list', {
    name: 'cardian.wiki.list',
    description: '列出 RepoWiki 卡片；不传 repo 时列出所有已扫描仓库。',
    behavior: 'read',
    parameters: params({ repo: strOpt('仓库名称（可选）') }),
    async execute(args) {
      if (!args.repo) return { repos: await wiki.listRepos(), entries: await wiki.list() }
      return wiki.list({ group: args.repo })
    },
  })

  register(ctx, 'cardian.wiki.delete', {
    name: 'cardian.wiki.delete',
    description: '删除某仓库中指定路径的 Wiki 卡片。',
    behavior: 'destroy',
    parameters: params({ repo: str('仓库名称'), path: str('文件相对路径') }, ['repo', 'path']),
    async execute(args) {
      return { deleted: await wiki.removeByPath(args.repo, args.path) }
    },
  })

  // ---- 知识卡片 ----
  register(ctx, 'cardian.card.upsert', {
    name: 'cardian.card.upsert',
    description: '创建或更新一张知识卡片（原子化知识单元），同标题幂等更新。',
    behavior: 'idempotent',
    parameters: params({
      title: str('卡片标题'),
      content: str('卡片正文（Markdown）'),
      tags: arrOpt('标签'),
      category: strOpt('分类（默认 general）'),
      cardType: strOpt('卡片类型：overview | tech stack | convention | setup & commands'),
      source: strOpt('知识来源'),
      status: strOpt('draft | published'),
      confidence: numOpt('置信度 0-1'),
      summary: strOpt('一句话摘要'),
      relations: arrOpt('类型化关系，如 "relates_to [[目标]]"'),
      as_of: strOpt('事实截止日期（ISO）'),
      expires: strOpt('过期日期（ISO）'),
      front: strOpt('闪卡正面（问题/术语）'),
      back: strOpt('闪卡背面（答案/定义）'),
      deck: strOpt('闪卡牌组'),
    }, ['title', 'content']),
    async execute(args) {
      return cards.upsert(args)
    },
  })

  register(ctx, 'cardian.card.review', {
    name: 'cardian.card.review',
    description: '复习一张闪卡并按 SM-2 算法重新排期（grade: 0=again, 1=hard, 2=good, 3=easy）。',
    behavior: 'idempotent',
    parameters: params({
      ref: str('卡片 id / 标题 / slug / 别名'),
      grade: numOpt('评分 0-3（默认 2）'),
    }, ['ref']),
    async execute(args) {
      return cards.review(args.ref, args.grade)
    },
  })

  register(ctx, 'cardian.card.due', {
    name: 'cardian.card.due',
    description: '列出到期需要复习的闪卡，可按牌组过滤。',
    behavior: 'read',
    parameters: params({ deck: strOpt('牌组（可选）') }),
    async execute(args) {
      return cards.due({ deck: args.deck })
    },
  })

  register(ctx, 'cardian.card.get', {
    name: 'cardian.card.get',
    description: '按 id、标题、slug 或别名读取一张知识卡片。',
    behavior: 'read',
    parameters: params({ ref: str('卡片 id / 标题 / slug / 别名') }, ['ref']),
    async execute(args) {
      return cards.get(args.ref)
    },
  })

  register(ctx, 'cardian.card.list', {
    name: 'cardian.card.list',
    description: '列出知识卡片，可按分类、标签或状态过滤。',
    behavior: 'read',
    parameters: params({ category: strOpt('分类'), tag: strOpt('标签'), status: strOpt('状态') }),
    async execute(args) {
      return cards.list({ group: args.category, tag: args.tag, status: args.status, cardType: args.cardType })
    },
  })

  register(ctx, 'cardian.card.search', {
    name: 'cardian.card.search',
    description: '在知识卡片中检索（关键词 + 语义）。',
    behavior: 'read',
    parameters: params({ query: str('关键词'), topK: numOpt('返回条数') }, ['query']),
    async execute(args) {
      return cardian.search(args.query, { type: 'card', topK: args.topK ?? 20 })
    },
  })

  register(ctx, 'cardian.card.delete', {
    name: 'cardian.card.delete',
    description: '删除一张知识卡片。',
    behavior: 'destroy',
    parameters: params({ ref: str('卡片 id / 标题 / slug / 别名') }, ['ref']),
    async execute(args) {
      return { deleted: await cards.remove(args.ref) }
    },
  })

  // ---- 记忆 ----
  register(ctx, 'cardian.memory.commit', {
    name: 'cardian.memory.commit',
    description: '提交一条持久记忆（跨会话可检索），可选 scope、facts、importance、kind。',
    behavior: 'idempotent',
    parameters: params({
      title: str('记忆标题'),
      content: str('记忆内容（Markdown）'),
      tags: arrOpt('标签'),
      scope: strOpt('作用域（默认 global）'),
      facts: arrOpt('关键事实列表'),
      importance: numOpt('重要度 1-5（默认 3）'),
      kind: strOpt('semantic | episodic | procedural'),
      status: strOpt('draft | published'),
      confidence: numOpt('置信度 0-1'),
      summary: strOpt('一句话摘要'),
      relations: arrOpt('类型化关系，如 "relates_to [[目标]]"'),
      as_of: strOpt('事实截止日期（ISO）'),
      expires: strOpt('过期日期（ISO）'),
    }, ['title', 'content']),
    async execute(args) {
      return memory.upsert(args)
    },
  })

  register(ctx, 'cardian.memory.get', {
    name: 'cardian.memory.get',
    description: '按 id、标题、slug 或别名读取一条记忆。',
    behavior: 'read',
    parameters: params({ ref: str('记忆 id / 标题 / slug / 别名') }, ['ref']),
    async execute(args) {
      return memory.get(args.ref)
    },
  })

  register(ctx, 'cardian.memory.history', {
    name: 'cardian.memory.history',
    description: '查看某条记忆的修订历史（追加式变更记录）。',
    behavior: 'read',
    parameters: params({ ref: str('记忆 id / 标题 / slug / 别名') }, ['ref']),
    async execute(args) {
      const note = await memory.get(args.ref)
      if (!note) return { history: [] }
      return { title: note.title, history: note.history ?? [] }
    },
  })

  register(ctx, 'cardian.memory.list', {
    name: 'cardian.memory.list',
    description: '列出记忆，可按 scope、标签或状态过滤。',
    behavior: 'read',
    parameters: params({ scope: strOpt('作用域'), tag: strOpt('标签'), status: strOpt('状态') }),
    async execute(args) {
      return memory.list({ group: args.scope, tag: args.tag, status: args.status })
    },
  })

  register(ctx, 'cardian.memory.search', {
    name: 'cardian.memory.search',
    description: '在记忆中检索（关键词 + 语义）。',
    behavior: 'read',
    parameters: params({ query: str('关键词'), topK: numOpt('返回条数') }, ['query']),
    async execute(args) {
      return cardian.search(args.query, { type: 'memory', topK: args.topK ?? 20 })
    },
  })

  register(ctx, 'cardian.memory.delete', {
    name: 'cardian.memory.delete',
    description: '删除一条记忆。',
    behavior: 'destroy',
    parameters: params({ ref: str('记忆 id / 标题 / slug / 别名') }, ['ref']),
    async execute(args) {
      return { deleted: await memory.remove(args.ref) }
    },
  })
}
