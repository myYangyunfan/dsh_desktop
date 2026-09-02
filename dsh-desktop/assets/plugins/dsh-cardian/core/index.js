// Framework-agnostic cardian core. `createCardian()` returns a plain object
// with no dependency on Cordis/DSH, so the same engine can back the dsh plugin,
// a CLI, or an MCP server. The dsh adapter lives in ../src.

import { VaultStore, SECTIONS } from './store.js'
import { CardsService } from './cards.js'
import { MemoryService } from './memory.js'
import { RepoWikiService } from './repowiki.js'
import { Indexer } from './indexer.js'
import { HashEmbedder, cosine } from './embedder.js'
import { LinkIndex } from './links.js'
import { Sync } from './sync.js'
import { slugify } from './slug.js'
import { resolveConfig } from './config.js'
import { createLogger } from './log.js'
import { ValidationError, NotFoundError } from './errors.js'

export function createCardian(options = {}) {
  const config = resolveConfig(options)
  const logger = options.logger ?? createLogger({ level: process.env.CARDian_LOG_LEVEL })
  const store = new VaultStore(config.vaultPath, { logger })
  const indexer = new Indexer(store)
  const embedder = options.embedder ?? new HashEmbedder({ dim: config.embedderDim })
  const cards = new CardsService(store, { indexer, limits: config.limits })
  const memory = new MemoryService(store, { indexer, limits: config.limits })
  const wiki = new RepoWikiService(store, { indexer, allowedRoots: config.allowedRoots, excludes: config.excludes })
  const links = new LinkIndex(store)
  const sync = new Sync({ store, cards, memory, wiki })
  const searchDefaults = {
    semantic: config.semanticSearch,
    alpha: config.searchAlpha,
    topK: 20,
    ...(options.search ?? {}),
  }

  // Section routing for the "知识树" bridge. Every bridge method below takes a
  // single params object and reads fields off it (params.key / params.ref /
  // params.args / ...), so the client panel works regardless of how the dsh
  // client runtime's remote bridge passes arguments (whole object or spread).
  const sectionRoutes = {
    cards: { title: '知识卡片', service: () => cards },
    memory: { title: '记忆', service: () => memory },
    wiki: { title: 'RepoWiki', service: () => wiki },
  }

  function sectionRoute(key) {
    const route = sectionRoutes[String(key ?? '').toLowerCase()]
    if (!route) throw new ValidationError(`未知分区: ${key}（可选: cards / memory / wiki）`)
    return route
  }

  // Normalize a service item (list / search result) into the client entry
  // shape: list() → { rel, id, title, group, tags, status, updated, path },
  // search() → { path, id, title, type, group, tags, updated, score }.
  function sectionEntry(e) {
    if (!e || typeof e !== 'object') return null
    const fm = e.frontmatter ?? {}
    return {
      rel: e.rel ?? e.path ?? null,
      id: e.id ?? fm.id ?? null,
      title: e.title ?? fm.title ?? '(无标题)',
      group: e.group ?? fm.group ?? (fm.scope ?? fm.category ?? fm.repo) ?? null,
      tags: e.tags ?? fm.tags ?? [],
      status: e.status ?? fm.status ?? 'published',
      type: e.type ?? fm.type ?? null,
      updated: e.updated ?? fm.updated ?? null,
      // path 是 wiki 卡的关键树字段（仓库内相对路径，如 src/lib/store.js）；
      // cards/memory 无 path，为 null。优先级：frontmatter.path（真值）>
      // 条目自带 path（list summary 透传的是 frontmatter.path；indexer search
      // 里的 path 是 vault rel 路径，仅作 fallback）。
      path: fm.path ?? e.path ?? null,
      // 层级卡字段（AI 扫盘建的 项目总览 → 模块 → 文件）：list 路径走
      // summary() 直挂，search 路径走 frontmatter，两边都兜住。
      level: e.level ?? fm.level ?? null,
      parent: e.parent ?? fm.parent ?? null,
      // static（骨架）/ ai（AI 回填）/ manual（人工凝练）——面板据此标角标。
      analysisLevel: e.analysisLevel ?? fm.analysisLevel ?? null,
      ...(e.score != null ? { score: e.score } : {}),
    }
  }

  const cardian = {
    name: 'cardian',
    config,
    logger,
    store,
    indexer,
    embedder,
    cards,
    memory,
    wiki,
    links,
    sync,

    async init() {
      await store.init()
      await this.refreshAll()
    },

    async refreshAll() {
      await Promise.all([cards.refreshMoc(), memory.refreshMoc(), wiki.refreshMoc()])
    },

    // Hybrid keyword + semantic search across (or scoped to) the vault.
    async search(query, opts = {}) {
      const type = opts.type ?? null
      const group = opts.group ? slugify(opts.group) : null
      const tag = opts.tag ?? null
      const topK = opts.topK ?? searchDefaults.topK
      const semantic = opts.semantic ?? searchDefaults.semantic
      const alpha = opts.alpha ?? searchDefaults.alpha

      const kw = await indexer.search(query, { type, group, tag, topK: Math.max(topK * 3, 20) })
              if (!semantic || kw.length === 0) {
          const expandedKw = await this._expandWikiGraph(kw, topK, opts.graphExpand !== false)
          return expandedKw.sort((a, b) => b.score - a.score).slice(0, topK)
        }

      const qv = embedder.embed(query)
      const maxKw = Math.max(...kw.map((r) => r.score), 1)
      const merged = kw.map((r) => {
        const doc = indexer.docs.get(r.path)
        const sim = cosine(qv, embedder.embed(doc?.haystack ?? ''))
        const kwNorm = r.score / maxKw
        return {
          ...r,
          keyword: Math.round(kwNorm * 1000) / 1000,
          semantic: Math.round(sim * 1000) / 1000,
          score: Math.round((alpha * kwNorm + (1 - alpha) * sim) * 1000) / 1000,
        }
      })
      return (await this._expandWikiGraph(merged, topK, opts.graphExpand !== false))
        .sort((a, b) => b.score - a.score)
        .slice(0, topK)
    },

    // 图扩展召回：把 Wiki 命中条目的 import 邻居 / 被引用方以降权分数并入，
    // 对应「取回片段 → 拉入调用方 → 融合重排」的检索管线。graphExpand=false 关闭。
    async _expandWikiGraph(list, limit, enabled) {
      if (enabled === false || !Array.isArray(list)) return list
      try {
        const allWiki = (await wiki.entries()).filter((e) => String(e.frontmatter.path || "") !== "")
        const wPages = allWiki.filter(
          (e) => Array.isArray(e.frontmatter.imports) && e.frontmatter.imports.length,
        )
        if (!wPages.length) return list
        const byBase = new Map()
        for (const p of allWiki) {
          const pth = String(p.frontmatter.path || "")
          const base = pth.split("/").pop().replace(/\.[^.]+$/, "")
          byBase.set(base, p)
        }
        const seen = new Set(list.map((m) => m.path))
        const extras = []
        for (const row of list) {
          if (row.type !== 'wiki') continue
          const src = wPages.find((p) => p.rel === row.path)
          if (!src) continue
          for (const spec of src.frontmatter.imports) {
            const base = String(spec).split("/").pop().replace(/\.[^.]+$/, "")
            const tgt = byBase.get(base)
            if (tgt && !seen.has(tgt.rel)) {
              seen.add(tgt.rel)
              extras.push({ path: tgt.rel, title: tgt.frontmatter.title, type: "wiki", group: tgt.group, tags: tgt.frontmatter.tags || [], updated: tgt.frontmatter.updated, score: row.score * 0.25, viaGraph: spec })
            }
          }
        }
        for (const cand of allWiki) {
          if (seen.has(cand.rel)) continue
          const base = String(cand.frontmatter.path || "").split("/").pop().replace(/\.[^.]+$/, "")
          if ((cand.frontmatter.imports || []).some((spc) => String(spc).includes(base))) {
            seen.add(cand.rel)
            extras.push({ path: cand.rel, title: cand.frontmatter.title, type: "wiki", group: cand.group, tags: cand.frontmatter.tags || [], updated: cand.frontmatter.updated, score: (list[0]?.score ?? 1) * 0.2, viaGraph: `${cand.frontmatter.path} -> ${base}` })
          }
        }
        return [...list, ...extras.slice(0, limit)]
      } catch {}
      return list
    },

    // Curated, budgeted recall ("own your context window"): returns a small,
    // high-signal bundle re-ranked by importance, recency and confidence, with
    // an abstention path when nothing clears the bar.
    async recall(query, opts = {}) {
      const { scope = null, type = null, topK = 4, minConfidence = null } = opts
      const results = await this.search(query, {
        type,
        topK: Math.max(topK * 4, 20),
        semantic: opts.semantic ?? searchDefaults.semantic,
        alpha: opts.alpha ?? searchDefaults.alpha,
      })

      const now = Date.now()
      const maxRaw = Math.max(...results.map((r) => r.score), 1)
      const scored = []
      for (const r of results) {
        const doc = this.indexer.docs.get(r.path)
        const fm = doc?.frontmatter ?? {}
        if (scope && r.type === 'memory' && slugify(fm.scope) !== slugify(scope)) continue
        const confidence = fm.confidence != null ? Number(fm.confidence) : null
        if (minConfidence != null && (confidence == null || confidence < minConfidence)) continue
        const importance = Number(fm.importance) || 0
        const confidenceNum = confidence != null ? Number(confidence) : 0
        // Normalize the raw keyword/semantic score, then boost by importance,
        // confidence and recency so the boost is meaningful in both modes.
        let boost =
          importance * 0.1 +
          confidenceNum * 0.1 +
          // 用户交互历史：被反复召回的知识小幅上调（上限封顶，避免强者恒强）。
          Math.min(0.1, (Number(fm.hits) || 0) * 0.01)
        if (fm.updated) {
          const ageDays = (now - Date.parse(fm.updated)) / 86400000
          if (Number.isFinite(ageDays)) boost += Math.max(0, 1 - ageDays / 90) * 0.1
        }
        const rawNorm = r.score / maxRaw
        let excerptText = ""
        try {
          const d = this.indexer.docs.get(r.path)
          const hs = String(d?.haystack ?? '')
          const i = hs.toLowerCase().indexOf(String(query).toLowerCase())
          excerptText = i >= 0 ? hs.slice(Math.max(0, i - 60), i + 200) : hs.slice(0, 180)
        } catch {}
        scored.push({
          ...r,
          importance,
          confidence,
          excerpt: excerptText,
          score: Math.round((rawNorm + boost) * 1000) / 1000,
        })
      }
      scored.sort((a, b) => b.score - a.score)
      const results2 = scored.slice(0, topK)
      const pending = []
      // 记录本次召回触达（fire-and-forget，可用 flushUsage 等待）：hits/lastRecalledAt 回写笔记，
      // 让「历史交互行为」参与下一轮的动态排序；写失败静默，不影响返回。
      for (const r of results2) {
        if (this.config.trackUsage === false) continue
        pending.push(
          store
            .read(r.path)
          .then((note) => {
            if (!note) return
            const fm = note.frontmatter ?? {}
            return this.store._write(r.path, {
              frontmatter: { ...fm, hits: (Number(fm.hits) || 0) + 1, lastRecalledAt: new Date().toISOString() },
                body: note.body,
              })
            })
            .catch(() => {}),
        )
      }
      this._usageWrites = (this._usageWrites ?? []).concat(pending)
      return { query, count: results2.length, results: results2 }
    },

    async flushUsage() {
      await Promise.allSettled(this._usageWrites ?? [])
      this._usageWrites = []
    },

    async tagCloud(opts = {}) {
      return indexer.tagCloud(opts)
    },

    // Resolve a user reference (id / title / slug / alias) to a note.
    async resolveRef(ref) {
      const needle = String(ref ?? '').trim()
      if (!needle) return null
      const needleSlug = slugify(needle)
      const notes = await store.snapshot()
      return (
        notes.find((n) => {
          const stem = n.rel.split('/').pop().replace(/\.md$/, '')
          const aliases = n.frontmatter.aliases ?? []
          return (
            n.frontmatter.id === needle ||
            n.frontmatter.title === needle ||
            slugify(stem) === needleSlug ||
            slugify(n.frontmatter.title) === needleSlug ||
            aliases.some((a) => String(a) === needle || slugify(String(a)) === needleSlug)
          )
        }) ?? null
      )
    },

    async backlinks(ref) {
      const note = await this.resolveRef(ref)
      if (!note) return []
      return links.backlinks(note.rel)
    },

    async related(ref, opts = {}) {
      const note = await this.resolveRef(ref)
      if (!note) return []
      return links.related(note.rel, opts)
    },

    async status() {
      const repos = await wiki.listRepos()
      const now = Date.now()
      let stale = 0
      for (const n of await store.snapshot()) {
        if (n.frontmatter.expires && Date.parse(n.frontmatter.expires) < now) stale++
      }
      return {
        vaultPath: store.root,
        sections: {
          wiki: (await wiki.list()).length,
          cards: (await cards.list()).length,
          memory: (await memory.list()).length,
        },
        repos,
        stale,
      }
    },

    // Force a full rebuild of the search index (useful after external edits).
    async reindex() {
      await indexer.rebuild()
      return { indexed: indexer.docs.size }
    },

    // Health check: MOC presence, orphan temp files, missing required fields,
    // and expired notes.
    async doctor() {
      const problems = []
      for (const dir of Object.values(SECTIONS)) {
        if (!(await store.exists(`${dir}/README.md`))) {
          problems.push({ level: 'error', path: `${dir}/README.md`, issue: '缺少 MOC 索引' })
        }
      }
      for (const rel of await store.tmpFiles()) {
        problems.push({ level: 'error', path: rel, issue: '孤儿临时文件（崩溃残留）' })
      }
      const now = Date.now()
      for (const n of await store.snapshot()) {
        const fm = n.frontmatter
        if (!fm.id) problems.push({ level: 'error', path: n.rel, issue: '缺少 id' })
        if (!fm.type) problems.push({ level: 'error', path: n.rel, issue: '缺少 type' })
        if (!fm.title) problems.push({ level: 'warn', path: n.rel, issue: '缺少 title' })
        if (fm.expires) {
          const t = Date.parse(String(fm.expires))
          if (Number.isNaN(t)) problems.push({ level: 'warn', path: n.rel, issue: 'expires 不是有效日期' })
          else if (t < now) problems.push({ level: 'info', path: n.rel, issue: '已过期' })
        }
      }
      const seenTitle = new Map()
      for (const n of await store.snapshot()) {
        const key = `${slugify(n.frontmatter.title)}|${n.rel.split('/')[1]}`
        seenTitle.set(key, (seenTitle.get(key) ?? 0) + 1)
      }
      for (const [k, c] of seenTitle) {
        if (c > 1) {
          const t2g = k.split('|')
          problems.push({ level: 'warn', issue: `疑似重复条目：${t2g[0]} 在同分区出现 ${c} 次（建议合并或区分命名）` })
        }
      }
      const errors = problems.filter((p) => p.level === 'error').length
      return { healthy: errors === 0, errors, problemCount: problems.length, problems }
    },

    // Introspect the frontmatter fields currently in use and their value types.
    async schema() {
      const notes = await store.snapshot()
      const fields = new Map()
      for (const n of notes) {
        for (const key of Object.keys(n.frontmatter)) {
          if (!fields.has(key)) fields.set(key, new Set())
          const v = n.frontmatter[key]
          fields.get(key).add(v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v)
        }
      }
      return [...fields.entries()]
        .map(([field, types]) => ({ field, types: [...types].sort() }))
        .sort((a, b) => a.field.localeCompare(b.field))
    },

    // 人类反馈闭环：跨分区路由到 cards/memory/wiki 的 annotate。
    async feedback(ref, kind = 'correction', text = '') {
      for (const svc of [cards, memory, wiki]) {
        if (await svc.find(ref)) return { ...(await svc.annotate(ref, kind, text)), section: svc.opts.type }
      }
      return null
    },

    // 技能封装：把一批知识（按 refs 或 section/group 圈定）导出为自包含的
    // 可复用工作流单元（SKILL.md + notes/ 副本），落到仓库根目录。
    async exportSkill({ name = 'skill', description = '', refs = [], section = null, group = null, limit = 20 } = {}) {
      const picked = []
      for (const ref of refs) {
        const n = await this.resolveRef(ref)
        if (n && !picked.some((p2) => p2.rel === n.rel)) picked.push(n)
      }
      if (!picked.length) {
        const pools = [['cards', cards], ['memory', memory], ['wiki', wiki]]
        for (const [key, svc] of pools) {
          if (section && key !== section) continue
          for (const e of await svc.list({ group })) {
            if (picked.length >= limit) break
            const note = await store.read(e.rel)
            if (note) picked.push({ rel: e.rel, frontmatter: note.frontmatter, body: note.body })
          }
          if (picked.length >= limit) break
        }
      }
      if (!picked.length) throw new ValidationError('没有可圈定的知识条目')
      const slug = slugify(name)
      const dir = `Skills/${slug}`
      const links = []
      let i = 0
      for (const n of picked) {
        const stem = (slugify(n.frontmatter.title) || 'note') + '-' + ++i
        const fm = Object.fromEntries(
          Object.entries(n.frontmatter).filter(([k]) => k !== 'corrections' && k !== 'history'),
        )
        await store.write(`${dir}/notes/${stem}.md`, { frontmatter: fm, body: n.body })
        links.push(`- [${n.frontmatter.title}](./notes/${stem}.md)`)
      }
      const desc = String(description || `包含 ${links.length} 条知识的复用单元`)
      const body = [
        '---',
        `name: ${slug}`,
        `description: ${desc}`,
        'source: cardian-knowledge-tree',
        '---',
        "",
        `# ${name}`,
        "",
        `从知识树圈定 ${links.length} 条笔记，作为可复用的工作流单元。`,
        "",
        ...links,
        "",
      ].join('\n')
      await store.write(`${dir}/SKILL.md`, { frontmatter: {}, body })
      return { skill: dir, entries: links.length }
    },
    // Read model for the "知识树" client view: the full knowledge tree as a
    // stable, JSON-serializable shape (sections → entries), decoupled from the
    // Obsidian file layout.
    async describe() {
      const [cardsList, memList, wikiList, repos] = await Promise.all([
        cards.list(),
        memory.list(),
        wiki.list(),
        wiki.listRepos(),
      ])
      return {
        vaultPath: store.root,
        sections: [
          { key: 'cards', title: '知识卡片', count: cardsList.length, entries: cardsList },
          { key: 'memory', title: '记忆', count: memList.length, entries: memList },
          { key: 'wiki', title: 'RepoWiki', count: wikiList.length, repos, entries: wikiList },
        ],
      }
    },

    // --- 知识树 panel bridge ---------------------------------------------
    // One params object per method; all normalize defensively (see sectionRoute
    // above). The panel hits these instead of the raw services so every call is
    // scoped to one section and errors carry the CardianError payload shape.

    async sectionList(params = {}) {
      const route = sectionRoute(params.key)
      const svc = route.service()
      const query = String(params.query ?? '').trim()
      const opts = {
        group: params.group ? String(params.group) : null,
        tag: params.tag ? String(params.tag) : null,
        status: params.status ? String(params.status) : null,
        topK: params.topK ?? 200,
      }
      const items = query ? await svc.search(query, opts) : await svc.list(opts)
      const out = {
        key: params.key,
        title: route.title,
        count: items.length,
        entries: items.map(sectionEntry).filter(Boolean),
      }
      if (params.key === 'wiki') out.repos = await wiki.listRepos()
      return out
    },

    async sectionGet(params = {}) {
      const route = sectionRoute(params.key)
      const note = await route.service().get(params.ref, params.group ?? null)
      if (!note) throw new NotFoundError(`${route.title}不存在: ${params.ref}`)
      return { ...note, section: params.key }
    },

    async sectionUpsert(params = {}) {
      const route = sectionRoute(params.key)
      return route.service().upsert(params.args ?? {})
    },

    async sectionRemove(params = {}) {
      const route = sectionRoute(params.key)
      return route.service().remove(params.ref, params.group ?? null)
    },

    async exportJson() {
      return sync.exportJson()
    },
    async importJson(data) {
      return sync.importJson(data)
    },
    async importMarkdownFolder(dir, opts = {}) {
      return sync.importMarkdownFolder(dir, opts)
    },
  }

  return cardian
}

export { VaultStore, SECTIONS, CardsService, MemoryService, RepoWikiService, Indexer, HashEmbedder, LinkIndex, Sync, resolveConfig }
