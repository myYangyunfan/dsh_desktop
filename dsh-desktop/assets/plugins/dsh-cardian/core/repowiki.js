import { promises as fs } from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { NoteService } from './notes.js'
import { slugify } from './slug.js'
import { SECTIONS } from './store.js'
import { ValidationError, PathError, NotFoundError } from './errors.js'
import { clampConfidence, validDate } from './cards.js'

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', 'coverage', '.obsidian',
  '__pycache__', '.venv', 'venv', 'vendor', '.next', '.nuxt', 'target',
])

const TEXT_EXTENSIONS = new Set([
  '.md', '.markdown', '.txt', '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx',
  '.py', '.java', '.go', '.rs', '.c', '.h', '.cc', '.cpp', '.hpp', '.cs',
  '.rb', '.php', '.swift', '.kt', '.kts', '.scala', '.sh', '.bash', '.zsh',
  '.json', '.yaml', '.yml', '.toml', '.xml', '.css', '.scss', '.less', '.html',
  '.sql', '.graphql', '.proto', '.vue', '.svelte',
])

const CONFIG_NAMES = new Set([
  'Dockerfile', 'Makefile', 'CMakeLists.txt', '.gitignore', '.dockerignore',
  '.editorconfig', '.env.example', 'Justfile', 'Cargo.toml',
])

const LANG_BY_EXT = {
  '.js': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript',
  '.ts': 'typescript', '.tsx': 'typescript', '.jsx': 'javascript',
  '.py': 'python', '.java': 'java', '.go': 'go', '.rs': 'rust',
  '.c': 'c', '.h': 'c', '.cc': 'cpp', '.cpp': 'cpp', '.hpp': 'cpp',
  '.cs': 'csharp', '.rb': 'ruby', '.php': 'php', '.swift': 'swift',
  '.kt': 'kotlin', '.kts': 'kotlin', '.scala': 'scala', '.sh': 'shell',
  '.bash': 'shell', '.zsh': 'shell', '.json': 'json', '.yaml': 'yaml',
  '.yml': 'yaml', '.toml': 'toml', '.xml': 'xml', '.css': 'css',
  '.scss': 'scss', '.less': 'less', '.html': 'html', '.sql': 'sql',
  '.graphql': 'graphql', '.proto': 'protobuf', '.vue': 'vue', '.svelte': 'svelte',
  '.md': 'markdown', '.markdown': 'markdown', '.txt': 'text',
}

// RepoWiki：把本地代码仓库扫描成一张张 Wiki 卡片。`ingest` 只生成“骨架卡片”
// （文件元数据 + 代码摘录 + 待补充提示），真正的语义化描述由 agent 通过 `upsert`
// 回填，形成“扫描 → 补充 → 沉淀”的闭环。
export class RepoWikiService extends NoteService {
  constructor(store, deps = {}) {
    super(store, {
      section: SECTIONS.wiki,
      type: 'wiki',
      groupField: 'repo',
      defaultGroup: 'default',
      idPrefix: 'wiki',
      mocTitle: 'RepoWiki',
      mocDescription: '代码仓库的自动 Wiki，按仓库归组。',
      indexer: deps.indexer,
    })
    this.excludes = Array.isArray(deps.excludes) ? deps.excludes.map(String) : []
    this.allowedRoots = Array.isArray(deps.allowedRoots) ? deps.allowedRoots.map((r) => path.resolve(String(r))) : []
  }

  // 最小权限：仓库扫描/同步只允许落在显式声明的根目录内（未配置则不限制）。
  assertAllowedRoot(absRoot) {
    if (this.allowedRoots.length === 0) return
    const ok = this.allowedRoots.some(
      (root) => absRoot === root || absRoot.startsWith(root + path.sep)
    )
    if (!ok) {
      throw new PathError(`仓库路径不在 allowedRoots 白名单内：${absRoot}`, {
        suggestion: '在 cardian 配置的 allowedRoots 中加入该目录，或移除限制',
      })
    }
  }

  plan(args) {
    const repo = slugify(args.repo ?? args.repoName ?? '')
    const relPath = String(args.path ?? '').trim().replace(/^[/\\]+/, '')
    if (!repo) throw new ValidationError('wiki 需要 repo 名称')
    if (!relPath) throw new ValidationError('wiki 需要 path')
    const content = String(args.content ?? args.body ?? '').trim()
    if (!content) throw new ValidationError('wiki 需要 content')
    const title = String(args.title ?? '').trim() || relPath
    return {
      group: repo,
      stem: flattenPath(relPath),
      title,
      tags: args.tags, // undefined → 保留现有标签（merge 语义）
      body: content.endsWith('\n') ? content : content + '\n',
      extra: {
        path: relPath,
        language: args.language ?? null,
        summary: args.summary ?? null,
        status: args.status ?? null,
        confidence: clampConfidence(args.confidence),
        aliases: args.aliases ?? null,
        analysisLevel: args.analysisLevel ?? "manual",
        relations: args.relations ?? null,
        as_of: validDate(args.as_of),
        expires: validDate(args.expires),
        // 层级卡片：level（project / module / file）+ parent（父卡 id）。
        // 两者都走 compact()——缺省（null）时 writeNote 的 preserved 会保住
        // 上一次写入的值，所以局部 upsert 不会把已挂好的层级关系冲掉。
        level: normalizeLevel(args.level),
        parent: args.parent ? String(args.parent) : null,
      },
    }
  }

  // In-place update is keyed by (repo, path), not title, since two repos may
  // share the same file path.
  async resolveExisting(plan) {
    const repoSlug = slugify(plan.group ?? plan.repo ?? '')
    const wanted = String(plan.extra?.path ?? '').replace(/^[/\\]+/, '')
    const entries = await this.entries()
    return (
      entries.find((e) => e.group === repoSlug && e.frontmatter.path === wanted) ?? null
    )
  }

  async listRepos() {
    const entries = await this.entries()
    return [...new Set(entries.map((e) => e.group).filter(Boolean))].sort()
  }

  async getByPath(repo, relPath) {
    const repoSlug = slugify(repo)
    const wanted = String(relPath ?? '').replace(/^[/\\]+/, '')
    const entries = await this.entries()
    const entry = entries.find(
      (e) => e.group === repoSlug && e.frontmatter.path === wanted
    )
    return entry ? { ...entry.frontmatter, body: entry.body, rel: entry.rel } : null
  }

  async removeByPath(repo, relPath) {
    const repoSlug = slugify(repo)
    const wanted = String(relPath ?? '').replace(/^[/\\]+/, '')
    const entries = await this.entries()
    const entry = entries.find(
      (e) => e.group === repoSlug && e.frontmatter.path === wanted
    )
    if (!entry) return false
    await this.store.remove(entry.rel)
    await this.refreshMoc()
    return true
  }

  async ingest(repoPath, opts = {}) {
    const absRoot = path.resolve(String(repoPath ?? ''))
    this.assertAllowedRoot(absRoot)
    const repoName = String(opts.repoName ?? path.basename(absRoot) ?? 'repo')
    const rawMax = opts.maxFiles == null ? 50 : Number(opts.maxFiles)
    const maxFiles = Number.isFinite(rawMax) && rawMax >= 1 ? Math.floor(rawMax) : 50
    const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : null
    const rawList = await scanFiles(absRoot, maxFiles)
    const filtered = rawList.filter((f) => !pathExcluded(path.relative(absRoot, f), this.excludes))
    // 声明式清单：仓库根放置 wiki.plan.json（{pages:[{path,title?,summary?}]}）
    // 即只按清单产出，绕过自动扫描 —— outline 覆盖模式。
    let declared = null
    try {
      const planRaw = JSON.parse(await fs.readFile(path.join(absRoot, "wiki.plan.json"), "utf8"))
      if (Array.isArray(planRaw.pages)) {
        declared = new Map(planRaw.pages.map((pg) => [String(pg.path || "").replace(/^\/+/, ""), pg]))
      }
    } catch {}
    const files = declared
      ? filtered.filter((f) => declared.has(path.relative(absRoot, f).split(path.sep).join("/")))
      : filtered
    const hints = new Map()
    if (declared) {
      for (const f of files) {
        const rp = path.relative(absRoot, f).split(path.sep).join("/")
        const pg = declared.get(rp)
        if (pg?.title || pg?.summary) hints.set(rp, { title: pg.title, summary: pg.summary })
      }
    }
    const total = files.length
    if (onProgress) onProgress({ done: 0, total, current: '开始写入…' })

    const repo = slugify(repoName)
    const written = []
    const skipped = []
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const relPath = path.relative(absRoot, file).split(path.sep).join('/')
      if (onProgress) onProgress({ done: i, total, current: relPath })

      // 幂等保护：若该 (repo, path) 已有卡片且已被语义回填（body 不再是
      // 骨架模板），跳过覆写——否则再次点击「凝练/沉淀」会把 agent 精心
      // 回填的职责描述打回「待补充」骨架（用户报的「凝练后失效」）。
      const existing = await this.getByPath(repo, relPath)
      let fresh = ''
      try { fresh = await fs.readFile(file, 'utf8') } catch {}
      const unchanged =
        existing &&
        (existing.contentHash === hashText(fresh) ||
          (!existing.contentHash && isUnenrichedBody(existing.frontmatter, existing.body)))
      if (existing && unchanged) {
        skipped.push({ path: relPath, rel: existing.rel })
        continue
      }
      const result = await this._writeSkeleton(absRoot, file, relPath, { repo, repoName }, hints.get(relPath))
      written.push({
        path: relPath,
        note: result.rel,
        language: result.language,
        error: result.error,
        imports: result.imports,
      })
    }

    if (onProgress) onProgress({ done: files.length, total, current: '刷新索引…' })
    await this.refreshMoc()
    if (onProgress) onProgress({ done: files.length, total, current: '完成' })
    return {
      repo,
      repoName,
      count: written.length,
      skipped: skipped.length,
      reserved: skipped.map((s) => s.path),
      files: written,
    }
  }

  // 为单个文件生成/重写骨架 Wiki 页（ingest 与 sync 共用）。返回写入结果与
  // 派生元数据（imports/symbols/contentHash）。
  async _writeSkeleton(absRoot, file, relPath, { repo, repoName }, hint = null) {
    // 内容哈希命中即短路：未变更的文件不做任何重抽取/重写（增量索引成本为零）。
    const prior = await this.getByPath(repo, relPath)
    try {
      const fresh = await fs.readFile(file, 'utf8')
      const isSkeleton = (body) => String(body || '').includes('## 待补充')
      if (
        prior &&
        (prior.frontmatter.contentHash === hashText(fresh) ||
          (!prior.frontmatter.contentHash && isSkeleton(prior.body)))
      ) {
        return {
          rel: prior.rel, skippedUnchanged: true, language: prior.frontmatter.language,
          error: null, imports: prior.frontmatter.imports ?? [],
          symbols: prior.frontmatter.symbols ?? [], contentHash: prior.frontmatter.contentHash,
        }
      }
    } catch {}
    const excerpt = await excerptOf(file, 30)
    const stat = await fs.stat(file).catch(() => null)
    const language = languageOf(relPath)
    const codeBlock = excerpt.error
      ? `> ⚠️ 读取失败：${excerpt.error}`
      : '```' + (language === 'text' ? '' : language) + '\n' + excerpt.text + '\n```'
    const imports = extractImports(excerpt.text, language)
    const symbols = extractSymbols(excerpt.full, language)
    const depsSection = imports.length
      ? `\n## 依赖\n\n${imports.map((d) => `- \`${d}\``).join('\n')}\n`
      : ''
    const symSection = symbols.length
      ? `\n## 符号\n\n${symbols.map((s) => `- \`${s}\``).join('\n')}\n`
      : ''
    const body = [
      `## 概览`,
      '',
      `- **路径**：\`${relPath}\``,
      `- **语言**：${language}`,
      `- **行数**：${excerpt.lines}`,
      `- **大小**：${stat?.size ?? 0} 字节`,
      '',
      `## 代码摘录`,
      '',
      codeBlock,
      depsSection,
      symSection,
      `## 待补充`,
      '',
      `> 该页面由 \`cardian.wiki.ingest\` 自动生成。请用 \`cardian.wiki.upsert\` 补充该模块的职责、关键函数与依赖关系。`,
      '',
    ].join('\n')

    const result = await this.writeNote({
      group: repo,
      stem: flattenPath(relPath),
      title: hint?.title || relPath,
      tags: hint?.title ? [repoName, language, 'declared'] : [repoName, language],
      body,
      extra: {
        path: relPath,
        language,
        summary: hint?.summary || `${excerpt.lines} 行 · ${language}`,
        analysisLevel: "static",
        imports,
        symbols,
        contentHash: excerpt.hash,
        // 骨架卡默认是「文件」层；网关若在层级规划后重扫，可经 hint 传入
        // 所属模块 id，避免把 AI 建好的父子关系打回平铺。
        level: normalizeLevel(hint?.level) ?? 'file',
        parent: hint?.parent ? String(hint.parent) : null,
      },
    })
    return { ...result, language, error: excerpt.error, imports, symbols, contentHash: excerpt.hash }
  }

  // 为单个文件生成/重写骨架页的公开入口（网关逐文件流水线用：AI 回填失败时
  // 至少留一张骨架卡，别让该文件在知识树上缺席）。
  async skeletonForFile(repoPath, file, relPath, ctx = {}, hint = null) {
    const absRoot = path.resolve(String(repoPath ?? ''))
    this.assertAllowedRoot(absRoot)
    const repo = slugify(ctx.repo ?? ctx.repoName ?? '')
    if (!repo) throw new ValidationError('wiki.skeletonForFile 需要 repo 名称')
    return this._writeSkeleton(absRoot, file, relPath, { repo, repoName: ctx.repoName ?? repo }, hint)
  }

  // 双向同步：以磁盘为准刷新指定仓库的 Wiki。
  //   * 新增文件 → 生成骨架页；
  //   * 文件变更 → 骨架页整体重建；已语义回填的页保留正文，仅刷新指纹并
  //     标记 staleSynced（供 agent 注意到「代码变了，描述可能过时」）；
  //   * 磁盘上消失的文件 → 剪除对应孤儿页（可关）。
  async sync(repoPath, opts = {}) {
    const absRoot = path.resolve(String(repoPath ?? ''))
    this.assertAllowedRoot(absRoot)
    const repoName = String(opts.repoName ?? path.basename(absRoot) ?? 'repo')
    const repo = slugify(repoName)
    const pruneOrphans = opts.pruneOrphans !== false
    const rawMax = opts.maxFiles == null ? 100 : Number(opts.maxFiles)
    const maxFiles = Number.isFinite(rawMax) && rawMax >= 1 ? Math.floor(rawMax) : 100

    const rawList = await scanFiles(absRoot, maxFiles)
    const files = rawList.filter((f) => !pathExcluded(path.relative(absRoot, f), this.excludes))
    const disk = new Map()
    for (const file of files) {
      const relPath = path.relative(absRoot, file).split(path.sep).join('/')
      disk.set(relPath, file)
    }

    const pages = (await this.entries()).filter((e) => e.group === repo)
    const pageByPath = new Map(pages.map((p) => [p.frontmatter.path, p]))
    const report = { repo, repoName, added: [], changed: [], pruned: [], preserved: [], unchanged: 0 }

    for (const [relPath, file] of disk) {
      const page = pageByPath.get(relPath)
      if (!page) {
        await this._writeSkeleton(absRoot, file, relPath, { repo, repoName })
        report.added.push(relPath)
        continue
      }
      const full = await fs.readFile(file, 'utf8').catch(() => '')
      if (
        page.frontmatter.contentHash === hashText(full) ||
        (!page.frontmatter.contentHash && isUnenrichedBody(page.frontmatter, page.body))
      ) {
        report.unchanged++
        continue
      }
      if (isUnenrichedBody(page.frontmatter, page.body)) {
        await this._writeSkeleton(absRoot, file, relPath, { repo, repoName })
        report.changed.push(relPath)
      } else {
        await this.store._write(page.rel, {
          frontmatter: {
            ...page.frontmatter,
            contentHash: hashText(full),
            lastSyncAt: new Date().toISOString(),
            staleSynced: true,
          },
          body: page.body,
        })
        report.preserved.push(relPath)
      }
    }

    if (pruneOrphans) {
      if (rawList.length >= maxFiles) {
        report.pruneSkipped = 'maxFiles 触顶，跳过孤儿剪枝以免误删'
      } else {
        for (const page of pages) {
          const ppath = page.frontmatter.path
          if (ppath === '__OVERVIEW__' || page.frontmatter.overview) continue
          // 层级卡（总览 / 模块）不对应磁盘文件，永不作为孤儿剪除。
          if (!isDiskFileCard(page.frontmatter)) continue
          if (!disk.has(ppath)) {
            await this.store._remove(page.rel)
            report.pruned.push(ppath)
          }
        }
      }
    }

    if (report.added.length || report.changed.length || report.pruned.length || report.preserved.length) {
      await this.refreshMoc()
    }
    return report
  }

  // 项目概览（服务“人读”）：聚合体量、目录、语言分布、被引最多的核心模块
  // 与全部页面清单，幂等刷新到固定路径 __OVERVIEW__。
  async overview(repoName) {
    const repo = slugify(repoName)
    if (!repo) throw new ValidationError("wiki.overview 需要 repo 名称")
    const pages = (await this.entries()).filter((e) => e.group === repo && e.frontmatter.path !== "__OVERVIEW__")
    if (!pages.length) throw new NotFoundError("该仓库暂无 Wiki 页，请先 ingest/sync")
    const g = await this.graph(repo)
    const topCalled = Object.entries(g.callers || {}).sort((a, b) => b[1] - a[1]).slice(0, 5)
    const dirs = [...new Set(pages.map((p) => String(p.frontmatter.path || "").split("/").slice(0, -1).join("/") || "(根)"))].sort()
    const langs = {}
    for (const p of pages) {
      const l = p.frontmatter.language;
      if (l) langs[l] = (langs[l] || 0) + 1
    }
    const langTxt = Object.entries(langs).map(([l, n]) => `${l}×${n}`).join(" · ") || "未知"
    const dirTxt = dirs.length <= 12 ? dirs.join(" / ") : dirs.slice(0, 12).join(" / ") + " …"
    const callTxt = topCalled.length
      ? topCalled.map(([p2, c]) => "- `" + p2 + "` — 被 " + c + " 处引用").join("\n")
      : "- 暂无跨文件依赖边（可运行 graph 查看 imports 是否解析）"
    const links = pages
      .map((p) => {
        const stem = p.rel.split("/").pop().replace(/\.md$/, "")
        return `- [[${stem}|${p.frontmatter.path}]]`
      })
      .join("\n")
    const body = [
      "# 项目概览", "",
      "> 人读向导航层：先看这里，再按需进入具体模块页。", "",
      "## 体量", "",
      `- 页面：${pages.length}`,
      `- 语言分布：${langTxt}`,
      `- 目录：${dirTxt}`, "",
      "## 核心模块（被引最多）", "",
      callTxt, "",
      "## 页面清单", "",
      links, "",
    ].join("\n")
    const result = await this.writeNote({
      group: repo,
      stem: "project-overview",
      title: `${repo} · 项目概览`,
      tags: [repo, "overview"],
      body,
      extra: { path: "__OVERVIEW__", language: null, summary: `人读概览：${pages.length} 页`, overview: true },
    })
    return { ...result, pages: pages.length, topCalled }
  }
  // 代码图谱：把仓库内页面按 import 关系连成有向边（依赖方 → 被依赖方），
  // 并给出被引用计数（谁在调用这个模块）。
  async graph(repoName) {
    const repo = slugify(repoName ?? '')
    if (!repo) throw new ValidationError('wiki.graph 需要 repo 名称')
    const pages = (await this.entries()).filter((e) => e.group === repo)
    const byPath = new Map(pages.filter((p) => p.frontmatter.path).map((p) => [p.frontmatter.path, p]))

    const resolveSpec = (spec) => {
      let s = String(spec).replace(/^[@~]\//, '').replace(/^\.\//, '')
      const tail = s.split('/').pop() ?? ''
      const tailBase = tail.replace(/\.(js|mjs|cjs|ts|tsx|jsx|py|go|rs)$/, '')
      const direct = byPath.get(s.endsWith(tail) ? `${s}${guessExt(s)}` : s)
      if (direct) return direct
      return (
        [...byPath.values()].find((p) => {
          const base = path.basename(p.frontmatter.path).replace(/\.[^.]+$/, '')
          return base === tailBase || base === spec.split('/').pop()?.replace(/\.[^.]+$/, '')
        }) ?? null
      )
    }

    const nodes = pages.map((p) => ({
      path: p.frontmatter.path,
      title: p.frontmatter.title,
      symbols: p.frontmatter.symbols ?? [],
      imports: p.frontmatter.imports ?? [],
    }))
    const edges = []
    const inDegree = new Map()
    for (const node of nodes) {
      for (const spec of node.imports) {
        const target = resolveSpec(spec)
        if (!target || target.frontmatter.path === node.path) continue
        edges.push({ from: node.path, to: target.frontmatter.path, via: spec })
        inDegree.set(target.frontmatter.path, (inDegree.get(target.frontmatter.path) ?? 0) + 1)
      }
    }
    return { repo, nodes, edges, callers: Object.fromEntries([...inDegree.entries()].sort()) }
  }

  // ── AI 扫盘建库 ────────────────────────────────────────────────────────
  // 下面三个方法是为「网关逐文件直调 LLM」的流水线服务的底座：enumerateFiles
  // 只读枚举、applyHierarchy 落层级卡、changedSince 出 diff。三者对目标仓库
  // 全程只读（仅 readdir / stat / readFile），写入只发生在 cardian 自己的 vault。

  // 只读枚举仓库内可分析文件（不写盘），返回网关编排所需的清单。
  async enumerateFiles(repoPath, opts = {}) {
    const absRoot = path.resolve(String(repoPath ?? ''))
    this.assertAllowedRoot(absRoot)
    const repoName = String(opts.repoName ?? path.basename(absRoot) ?? 'repo')
    const repo = slugify(repoName)
    const rawMax = opts.maxFiles == null ? 50 : Number(opts.maxFiles)
    const maxFiles = Number.isFinite(rawMax) && rawMax >= 1 ? Math.floor(rawMax) : 50
    const excerptLines = Number.isFinite(Number(opts.excerptLines)) && Number(opts.excerptLines) >= 1
      ? Math.floor(Number(opts.excerptLines))
      : 40
    const rawList = await scanFiles(absRoot, maxFiles)
    const files = rawList.filter((f) => !pathExcluded(path.relative(absRoot, f), this.excludes))
    const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : null
    const out = []
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const relPath = path.relative(absRoot, file).split(path.sep).join('/')
      if (onProgress) onProgress({ done: i, total: files.length, current: `发现：${relPath}` })
      const language = languageOf(relPath)
      const excerpt = await excerptOf(file, excerptLines)
      const stat = await fs.stat(file).catch(() => null)
      out.push({
        relPath,
        absPath: file,
        language,
        lines: excerpt.lines,
        size: stat?.size ?? 0,
        contentHash: excerpt.hash,
        excerpt: excerpt.text,
        imports: extractImports(excerpt.text, language),
        symbols: extractSymbols(excerpt.full, language),
        error: excerpt.error ?? null,
      })
    }
    if (onProgress) onProgress({ done: files.length, total: files.length, current: `清单完成：${files.length} 个文件` })
    return {
      repo,
      repoName,
      repoPath: absRoot,
      maxFiles,
      // 触顶意味着清单不完整：上层（diff 剪枝）据此放弃孤儿判定，避免误删。
      truncated: rawList.length >= maxFiles,
      files: out,
    }
  }

  // 应用 AI 产出的层级规划：落 1 张项目总览卡（level: project）+ N 张模块概述
  // 卡（level: module, parent: 总览 id），并把「文件 → 所属模块」的归属关系
  // 以 assignments（可 JSON 序列化）返回，供网关在逐文件回填时挂 parent。
  async applyHierarchy(repoInput, hierarchy = {}) {
    const repo = slugify(String(repoInput ?? ''))
    if (!repo) throw new ValidationError('wiki.applyHierarchy 需要 repo 名称')
    const overview = hierarchy.overview && typeof hierarchy.overview === 'object' ? hierarchy.overview : {}
    const rawModules = Array.isArray(hierarchy.modules) ? hierarchy.modules : []
    const modules = []
    const seenSlug = new Set()
    for (const m of rawModules) {
      if (!m || typeof m !== 'object') continue
      const title = String(m.title ?? m.id ?? '').trim()
      if (!title) continue
      let slug = slugify(String(m.id ?? '') || title) || `module-${modules.length + 1}`
      while (seenSlug.has(slug)) slug = `${slug}-2`
      seenSlug.add(slug)
      const paths = (Array.isArray(m.paths) ? m.paths : [])
        .map((p) => String(p ?? '').trim().replace(/^\/+/, '').replace(/\/+$/, ''))
        .filter((p) => p && p !== '.')
      modules.push({ slug, title, summary: String(m.summary ?? '').trim(), paths })
    }

    // 先写总览卡：模块卡的 parent 指向它，总览正文再回链到各模块标题。
    const overviewTitle = String(overview.title ?? '').trim() || `${repo} · 项目总览`
    const overviewSummary = String(overview.summary ?? '').trim()
    const ovBody = [
      `# ${overviewTitle}`,
      '',
      overviewSummary ? `${overviewSummary}\n` : `> 由 cardian AI 扫盘生成的项目总览。\n`,
      '## 模块',
      '',
      ...(modules.length
        ? modules.map((m) => `- [[${wikiLinkTarget(m.title)}]]${m.summary ? ` — ${m.summary}` : ''}`)
        : ['- （本次未识别出明确模块）']),
      '',
      '> 阅读顺序：总览 → 模块 → 文件。层级由 AI 依据目录与依赖关系生成。',
      '',
    ].join('\n')
    const ov = await this.writeNote({
      group: repo,
      stem: 'project-overview',
      title: overviewTitle,
      tags: [repo, 'overview', 'ai-scan'],
      body: ovBody,
      extra: {
        path: '__OVERVIEW__',
        language: null,
        summary: overviewSummary || `AI 扫盘总览：${modules.length} 个模块`,
        level: 'project',
        overview: true,
        analysisLevel: 'ai',
      },
    })

    const assignments = []
    const written = []
    for (const m of modules) {
      const modBody = [
        `# ${m.title}`,
        '',
        m.summary || '> 该模块由 cardian AI 扫盘识别。',
        '',
        '## 负责路径',
        '',
        ...(m.paths.length ? m.paths.map((p) => `- \`${p}\``) : ['- （未声明具体路径）']),
        '',
      ].join('\n')
      const res = await this.writeNote({
        group: repo,
        stem: `module-${m.slug}`,
        title: m.title,
        tags: [repo, 'module', 'ai-scan'],
        body: modBody,
        extra: {
          path: `__MODULE__/${m.slug}`,
          language: null,
          summary: m.summary || `模块：${m.title}`,
          level: 'module',
          parent: ov.id,
          module: true,
          modulePaths: m.paths.length ? m.paths : null,
          analysisLevel: 'ai',
        },
      })
      written.push({ id: res.id, title: m.title, slug: m.slug, paths: m.paths, rel: res.rel })
    }

    // 归属：最长前缀优先，未命中任何模块的文件留在总览下。
    for (const m of written) {
      for (const p of m.paths) assignments.push({ pattern: p, moduleId: m.id, moduleTitle: m.title })
    }
    assignments.sort((a, b) => b.pattern.length - a.pattern.length)

    await this.refreshMoc()
    return {
      repo,
      overview: { id: ov.id, title: overviewTitle, rel: ov.rel },
      modules: written,
      assignments,
    }
  }

  // 给定文件相对路径，从 applyHierarchy 的 assignments 里找所属模块卡 id。
  static moduleOwnerOf(assignments, relPath) {
    const p = String(relPath ?? '').replace(/^\/+/, '')
    for (const a of assignments ?? []) {
      const pat = String(a.pattern ?? '')
      if (!pat) continue
      if (p === pat || p.startsWith(pat + '/')) return a
    }
    return null
  }

  // diff 底座：把磁盘现状与已存卡逐一对账，返回 { added, changed, removed,
  // unchanged, targets, truncated, pruneSafe }。网关据此只重扫变更项（removed
  // 才剪孤儿卡）；targets 是 added + changed 的完整文件元数据，可直接喂 enrich。
  async changedSince(repoPath, opts = {}) {
    const listed = await this.enumerateFiles(repoPath, opts)
    const { repo, files, truncated } = listed
    const pages = (await this.entries()).filter((e) => e.group === repo && isDiskFileCard(e.frontmatter))
    const cardByPath = new Map(pages.map((p) => [p.frontmatter.path, p]))
    const added = []
    const changed = []
    const unchanged = []
    const targets = []
    for (const f of files) {
      const card = cardByPath.get(f.relPath)
      if (!card) {
        added.push(f.relPath)
        targets.push(f)
        continue
      }
      const enriched = !isUnenrichedBody(card.frontmatter, card.body)
      if (card.frontmatter.contentHash === f.contentHash) {
        unchanged.push({ path: f.relPath, enriched })
        continue
      }
      changed.push({ path: f.relPath, enriched, contentHash: f.contentHash })
      targets.push(f)
    }
    const onDisk = new Set(files.map((f) => f.relPath))
    const removed = [...cardByPath.keys()].filter((p) => !onDisk.has(p))
    if (typeof opts.onProgress === 'function') {
      opts.onProgress({
        done: files.length,
        total: files.length,
        current: `比对完成：新增 ${added.length} / 变更 ${changed.length} / 删除 ${removed.length}`,
      })
    }
    return {
      repo,
      repoName: listed.repoName,
      added,
      changed,
      removed,
      unchanged,
      targets,
      truncated,
      // 清单触顶时磁盘视图不完整，removed 不可信 → 禁止据此剪卡。
      pruneSafe: !truncated,
    }
  }
}

// 层级卡片允许的 level 值；其它一律归一为 null（不覆写已存值）。
const WIKI_LEVELS = new Set(['project', 'module', 'file'])
function normalizeLevel(level) {
  const l = String(level ?? '').trim().toLowerCase()
  return WIKI_LEVELS.has(l) ? l : null
}

// 是否「对应磁盘文件」的卡片：总览卡与模块卡是纯导航层，不参与
// diff 对账与孤儿剪枝。
function isDiskFileCard(frontmatter) {
  const fm = frontmatter ?? {}
  const p = String(fm.path ?? '')
  if (!p || p === '__OVERVIEW__') return false
  if (fm.overview === true || fm.module === true) return false
  if (fm.level === 'project' || fm.level === 'module') return false
  return !p.startsWith('__MODULE__')
}

// [[wikilink]] 目标：客户端的行内解析只收 [^\]\n]+，且 openWikiTitle 以整段
// 文本做检索/标题解析 → 去掉会破坏链接的字符，不给 alias 形式。
function wikiLinkTarget(title) {
  return String(title ?? '')
    .replace(/\[\[|\]\]/g, '')
    .replace(/[\]\n|]/g, ' ')
    .trim()
}

// 未被 AI/人工增强过的页面（可被再次扫描自由重写）：旧版「待补充」骨架，
// 或新版 analysisLevel: static 页面。语义回填（ai/manual）受保护。
function isUnenrichedBody(frontmatter, body) {
  const fm = frontmatter ?? {}
  if (fm.analysisLevel === 'ai' || fm.analysisLevel === 'manual') return false
  return (
    String(body ?? '').includes('## 待补充') ||
    fm.analysisLevel === 'static' ||
    fm.ingest === true
  )
}

function flattenPath(relPath) {
  // Strip the file extension, then slugify each remaining path segment.
  const withoutExt = relPath.replace(/\.[^.\\/]+$/, '')
  const parts = withoutExt.split(/[/\\]/).filter(Boolean).map(slugify)
  return parts.join('-') || 'root'
}

function languageOf(relPath) {
  const base = path.basename(relPath)
  if (CONFIG_NAMES.has(base)) return base === 'Dockerfile' ? 'dockerfile' : 'text'
  return LANG_BY_EXT[path.extname(relPath).toLowerCase()] ?? 'text'
}

// Extract import/require/use/include specifiers so each wiki page can answer
// "what does this module depend on?". Language-aware, and comments are stripped
// first to avoid false positives.
function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
    .split('\n')
    .map((line) => {
      const t = line.trim()
      const isDirective = /^#\s*(include|define|if|ifdef|ifndef|endif|pragma|import|error|warning|undef|elif|else)\b/.test(t)
      return t.startsWith('#') && !isDirective ? '' : line
    })
    .join('\n')
}

function extractImports(text, language) {
  const source = stripComments(text)
  const out = new Set()
  const add = (spec) => {
    const s = String(spec ?? '').trim()
    if (s) out.add(s)
  }

  if (language === 'go') {
    for (const m of source.matchAll(/\bimport\s+"([^"]+)"/g)) add(m[1])
    for (const m of source.matchAll(/\bimport\s*\(([\s\S]*?)\)/g)) {
      for (const q of m[1].matchAll(/"([^"]+)"/g)) add(q[1])
    }
  }

  const patterns = []
  if (language === 'python') {
    patterns.push(/\bfrom\s+([\w.]+)\s+import\b/g, /\bimport\s+([\w.]+)/g)
  } else if (language === 'rust') {
    patterns.push(/\buse\s+([\w:]+(?:::\w+)*)/g)
  } else if (language === 'java') {
    patterns.push(/\bimport\s+([\w.]+)\s*;/g)
  } else if (language === 'csharp') {
    patterns.push(/\busing\s+([\w.]+)\s*;/g)
  } else if (language === 'ruby') {
    patterns.push(/\brequire_relative\s+['"]([^'"]+)['"]/g, /\brequire\s+['"]([^'"]+)['"]/g)
  } else if (language === 'c' || language === 'cpp') {
    patterns.push(/#include\s*[<"]([^>"]+)[>"]/g)
  }
  // JS/TS and fallback for other languages.
  patterns.push(/(?:from\s*|import\s*|require\s*\(\s*)['"]([^'"]+)['"]/g)

  for (const re of patterns) {
    for (const m of source.matchAll(re)) add(m[1])
  }
  return [...out]
}

function pathExcluded(rel, excludes) {
  return Array.isArray(excludes) && excludes.some((x) => rel.includes(x))
}

async function scanFiles(dir, maxFiles, excludes) {
  const out = []
  async function walk(current) {
    if (out.length >= maxFiles) return
    const entries = await fs.readdir(current, { withFileTypes: true })
    entries.sort((a, b) => a.name.localeCompare(b.name))
    for (const entry of entries) {
      if (out.length >= maxFiles) return
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue
        await walk(path.join(current, entry.name))
      } else if (entry.isFile() && isTextFile(entry.name)) {
        out.push(path.join(current, entry.name))
      }
    }
  }
  await walk(dir)
  return out
}

function isTextFile(name) {
  return (
    CONFIG_NAMES.has(name) ||
    TEXT_EXTENSIONS.has(path.extname(name).toLowerCase()) ||
    /^readme/i.test(name)
  )
}

async function excerptOf(file, maxLines) {
  try {
    const text = await fs.readFile(file, 'utf8')
    const lines = text.split(/\r?\n/)
    return {
      lines: lines.length,
      text: lines.slice(0, maxLines).join('\n'),
      error: null,
      full: text,
      hash: hashText(text),
    }
  } catch (err) {
    return { lines: 0, text: '', error: err?.message ?? String(err), full: '', hash: hashText('') }
  }
}

function hashText(text) {
  return createHash('sha1').update(String(text ?? '')).digest('hex').slice(0, 12)
}

function guessExt(spec) {
  return /\.[a-z]+$/.test(spec) ? '' : '.js'
}

// 从源码提取导出/定义符号（函数、类、结构等），语言感知。用于 Wiki 页的
// 「符号」元数据与检索加权，是代码图谱的轻量代用层。
export function extractSymbols(text, language = 'text') {
  const src = stripComments(text)
  const out = new Set()
  const cap = (m) => m && m[1] && out.size < 12 && out.add(m[1])
  const rules =
    language === 'python'
      ? [/\bdef\s+([A-Za-z_]\w*)/g, /\bclass\s+([A-Za-z_]\w*)/g]
      : language === 'rust'
        ? [/\bfn\s+([A-Za-z_]\w*)/g, /\b(?:struct|enum|trait)\s+([A-Za-z_]\w*)/g]
        : language === 'go'
          ? [/\bfunc\s+(?:\([^)]*\)\s*)?([A-Za-z_]\w*)/g, /\btype\s+([A-Za-z_]\w*)\s+struct/g]
          : [
              /\bexport\s+(?:default\s+)?(?:async\s+)?function\s+\*?\s*([A-Za-z_$][\w$]*)/g,
              /\bexport\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g,
              /\bexport\s+(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/g,
              /\bexports\.([A-Za-z_$][\w$]*)\s*=/g,
            ]
  for (const re of rules) {
    let m
    while ((m = re.exec(src))) cap(m)
  }
  return [...out]
}
