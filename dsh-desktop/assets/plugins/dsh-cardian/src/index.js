// cardian — DeepSeek Harness 知识中心插件（dsh adapter）
//
// Cordis 插件契约：导出 name / inject / Config / apply。启动后在 `ctx.tools`
// 上注册三大功能（RepoWiki / 知识卡片 / 记忆）的模型可调用工具，并把全部内容
// 落到本地 Obsidian 仓库。真正的知识中心逻辑在框架无关的 `core/`，这里只是
// 一层薄薄的 dsh 适配（对应 basic-memory 的 "core vs MCP binding" 分界）。

import { Schema } from './schema.js'
import { createCardian, resolveConfig } from '../core/index.js'
import { RepoWikiService } from '../core/repowiki.js'
import { registerTools } from './tools.js'
import { ConfigError } from '../core/errors.js'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { slugify } from '../core/slug.js'
import { basename } from 'node:path'
import { watch as fsWatch } from 'node:fs'

export const name = 'cardian'

export const inject = ['tools']

export const Config = Schema.object({
  vaultPath: Schema.string()
    .description('Obsidian 仓库（vault）路径，知识卡片/记忆/RepoWiki 都写入该目录')
    .default('./cardian-vault'),
  autoInit: Schema.boolean()
    .description('启动时自动创建仓库目录与三个分区的索引（Map of Content）')
    .default(true),
  aiCondense: Schema.boolean()
    .description('（保留兼容位）AI 扫盘的语义回填现由网关逐文件直调宿主 llm 完成，是否真正回填取决于扫描向导里是否选了模型')
    .default(true),
  semanticSearch: Schema.boolean()
    .description('启用语义检索（与关键词检索混合）')
    .default(true),
  searchAlpha: Schema.number()
    .description('混合检索中关键词与语义的权重（0=纯语义，1=纯关键词）')
    .default(0.5),
  embedderDim: Schema.number()
    .description('本地向量维度（内置 HashEmbedder）')
    .default(256),
  watchVault: Schema.boolean()
    .description('监听 vault 文件变更：在 Obsidian 手工编辑笔记后自动刷新检索索引与三区 MOC，无需手动 reindex')
    .default(true),
})

// ── Typert 远端网关（dsh-hub 同构）────────────────────────────────────────
// 让 Web 面板客户端通过 `ctx.remote.$mount` + `remote.cardianRemote.<method>`
// 调起 core/ 的能力（替代原先坏掉的 `ctx.remote.call`）。
// 同步点：GATEWAY_METHODS ↔ src/typert.js 的 invocations ↔ core/index.js 桥函数。
const GATEWAY_METHODS = [
  'describe',
  'sectionList',
  'sectionGet',
  'sectionUpsert',
  'sectionRemove',
  'ingestProject',
  'ingestStatus',
  // AI 扫盘建库（对标 Qoder 知识中心）：模型目录 + 实时暂停/继续/停止 + diff 重扫。
  // ⚠ 与 src/typert.js invocations、src/client/controller.ts BRIDGE_METHODS 同步。
  'listModels',
  'pauseIngest',
  'resumeIngest',
  'cancelIngest',
  'rescanDiff',
  'status',
  'tagCloud',
  'backlinks',
  'related',
  'graph',
  'doctor',
  'schema',
  'search',
  'recall',
  // 治理动作（记忆晋升 / 到期复习）与导出（整库快照 / 技能包）。
  // ⚠ 与 src/typert.js invocations、src/client/controller.ts BRIDGE_METHODS 同步。
  'promote',
  'due',
  'exportJson',
  'exportSkill',
]

class CardianGateway extends TypertRemoteService {
  constructor(ctx, cardian) {
    super(ctx, 'cardianRemote', { namespace: 'cardian' })
    this.cardian = cardian
    // 一键沉淀（ingestProject）的后台任务表：jobId -> 进度记录，供客户端轮询。
    this.jobs = new Map()
    this.backfillTimeoutMs = cardian?.config?.backfillTimeoutMs ?? 300_000
    this._jobSeq = 0
    // 每个扫盘任务挂一个 AbortController：暂停/停止据此中断在途 LLM 调用。
    this._aborters = new Map()
    for (const method of GATEWAY_METHODS) {
      const decorator = Remote(method)
      decorator(CardianGateway.prototype[method], {
        name: method,
        private: false,
        static: false,
        addInitializer: (initializer) => initializer.call(this),
      })
    }
  }

  describe() {
    return this.cardian.describe()
  }

  sectionList(params = {}) {
    return this.cardian.sectionList(params)
  }

  sectionGet(params = {}) {
    return this.cardian.sectionGet(params)
  }

  sectionUpsert(params = {}) {
    return this.cardian.sectionUpsert(params)
  }

  sectionRemove(params = {}) {
    return this.cardian.sectionRemove(params)
  }

  status() {
    return this.cardian.status()
  }

  tagCloud(params = {}) {
    return this.cardian.tagCloud(params)
  }

  backlinks(params = {}) {
    return this.cardian.backlinks(params.ref)
  }

  related(params = {}) {
    return this.cardian.related(params.ref)
  }

  graph(params = {}) {
    return this.cardian.wiki.graph(params.repo)
  }

  doctor() {
    return this.cardian.doctor()
  }

  schema() {
    return this.cardian.schema()
  }

  search(params = {}) {
    return this.cardian.search(params.query ?? "", params)
  }

  recall(params = {}) {
    return this.cardian.recall(params.query ?? "", params)
  }

  // 记忆治理：把一条长期记忆晋升到仓库根说明文件（PROJECT.md / PERSONAL.md）。
  // 引擎入口 core/memory.js: promote(ref, { target })。
  promote(params = {}) {
    return this.cardian.memory.promote(params.ref, { target: params.target ?? 'shared' })
  }

  // 到期复习列表（SM-2 排期的闪卡），可按牌组过滤。
  // 引擎入口 core/cards.js: due({ deck })。
  due(params = {}) {
    return this.cardian.cards.due({ deck: params.deck ?? null })
  }

  // 整库导出：含全部 frontmatter 与正文的 JSON 快照（备份/迁移）。
  // 引擎的 exportJson() 无参；清单里本方法的 wire 仍是 ['params']（不进
  // ZERO_WIRE_METHODS，以免零 wire 集合三处漂移），宿主直接忽略收到的实参——
  // 与 ingestStatus 同一手法（见客户端 ingestStatus() 传 {} 的注释）。
  exportJson() {
    return this.cardian.exportJson()
  }

  // 分层导出：把圈定的一批知识打包成 Skills/<name>/SKILL.md + notes/ 副本。
  // 引擎入口 core/index.js: exportSkill({ name, description, refs, section, group, limit })。
  exportSkill(params = {}) {
    return this.cardian.exportSkill(params)
  }

  // ── 宿主 LLM 直调（AI 扫盘建库）──────────────────────────────────────
  // 取代原先「扫完骨架后放一个后台 agent 会话自己回填」的做法：网关逐文件
  // 直调 ctx.get('llm').stream()，换取细粒度进度、真正的暂停 / 停止、可指定
  // 模型，以及「先规划层级、再逐张落卡」的编排能力。宿主没 llm 服务时，
  // 优雅降级为「仅骨架」（与旧版无 agents 服务时的行为一致）。

  /** 取宿主 llm 服务；缺席（测试 mock ctx / 未装 dsh-llm）时返回 null。 */
  _llmService() {
    try {
      const llm = typeof this.ctx?.get === 'function' ? this.ctx.get('llm') : null
      return llm && typeof llm.stream === 'function' ? llm : null
    } catch {
      return null
    }
  }

  /** 读宿主默认模型选择（dsh-agent-default-model）；拿不到返回 null。 */
  _defaultModel() {
    const grabs = [
      () => (typeof this.ctx?.get === 'function' ? this.ctx.get('agentDefaultModel') : null),
      () => this.ctx?.agentDefaultModel,
    ]
    for (const grab of grabs) {
      try {
        const svc = grab()
        const sel = typeof svc?.currentSelection === 'function' ? svc.currentSelection() : null
        if (sel && typeof sel.provider === 'string' && typeof sel.model === 'string') {
          return { provider: sel.provider, model: sel.model }
        }
      } catch {}
    }
    return null
  }

  // 模型目录（面板下拉用）：listProviders() → 逐个 listModels()。
  // 无 llm 服务返回 available:false + 空列表，绝不抛错。
  async listModels() {
    const llm = this._llmService()
    const def = this._defaultModel()
    if (!llm) return { available: false, models: [], default: def }
    const out = []
    let providers = []
    try {
      providers = typeof llm.listProviders === 'function' ? (llm.listProviders() ?? []) : []
    } catch {
      providers = []
    }
    for (const p of providers) {
      const pid = String(p?.id ?? p?.provider ?? '').trim()
      if (!pid) continue
      let models = []
      try {
        models = typeof llm.listModels === 'function' ? ((await llm.listModels(pid)) ?? []) : []
      } catch {
        models = []
      }
      for (const m of models) {
        const mid = String(m?.id ?? '').trim()
        if (!mid) continue
        out.push({
          provider: pid,
          model: mid,
          title: String(m?.name ?? mid),
          description: m?.description ? String(m.description) : null,
        })
      }
    }
    if (!out.length && def) {
      out.push({ provider: def.provider, model: def.model, title: def.model, description: '宿主默认模型' })
    }
    return { available: true, models: out, default: def }
  }

  /**
   * 一次完整的模型调用：喂 messages、收集 text-delta、透出 finish 错误。
   * `signal` 来自任务的 AbortController —— 「暂停 / 停止」就是 abort 这个信号；
   * 收到 aborted 收尾时返回已积聚的部分文本（不抛），交由编排层决定去留。
   * 另加单次调用超时（默认 90s）：宿主 llm 挂死时 abort 本地控制器并抛错，
   * 由调用方按「这个文件回填失败」处理，不至于让整条流水线永远卡在一张卡上。
   */
  async _llmComplete(llm, model, prompt, opts = {}) {
    const { signal, system, maxTokens } = opts
    const timeoutMs = Number.isFinite(Number(opts.timeoutMs)) && Number(opts.timeoutMs) > 0
      ? Number(opts.timeoutMs)
      : 90_000
    const local = new AbortController()
    let timedOut = false
    const relay = () => local.abort()
    if (signal) {
      if (signal.aborted) local.abort()
      else signal.addEventListener?.('abort', relay)
    }
    const timer = setTimeout(() => {
      timedOut = true
      local.abort()
    }, timeoutMs)
    const messages = [
      {
        id: typeof crypto?.randomUUID === 'function' ? crypto.randomUUID() : `cardian-${Date.now()}`,
        role: 'user',
        source: { kind: 'user' },
        content: [{ type: 'text', text: String(prompt ?? '') }],
      },
    ]
    const options = { provider: model.provider, model: model.model, messages }
    if (system) options.system = String(system)
    if (maxTokens) options.maxTokens = Number(maxTokens)
    options.signal = local.signal
    let text = ''
    let failure = null
    try {
      for await (const chunk of llm.stream(options)) {
        if (!chunk || typeof chunk !== 'object') continue
        if (chunk.type === 'text-delta') text += String(chunk.text ?? '')
        else if (chunk.type === 'finish') {
          const kind = chunk.reason?.kind
          if (kind === 'error') failure = chunk.reason?.failure?.message ?? '模型调用失败'
          else if (kind === 'aborted') return text
        }
      }
    } finally {
      clearTimeout(timer)
      if (signal) signal.removeEventListener?.('abort', relay)
    }
    if (timedOut && !signal?.aborted) throw new Error(`模型调用超时（${Math.round(timeoutMs / 1000)}s 无响应）`)
    if (failure) throw new Error(failure)
    return text
  }

  /** 从模型回复里提一段 JSON：剥 ```fence，再退化到「首个配对的 {…} / […] 切片」。 */
  _extractJson(text) {
    const raw = String(text ?? '').trim()
    if (!raw) return null
    const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(raw)
    const candidates = []
    if (fenced) candidates.push(String(fenced[1]).trim())
    candidates.push(raw)
    for (const body of candidates) {
      if (!body) continue
      try {
        return JSON.parse(body)
      } catch {}
      const sliced = sliceBalanced(body)
      if (sliced) {
        try {
          return JSON.parse(sliced)
        } catch {}
      }
    }
    return null
  }

  // ── AI 扫盘流水线 ────────────────────────────────────────────────────
  // 三段：scan（只读枚举）→ plan（一次 LLM 调用出层级规划，落总览/模块卡）
  // → enrich（逐文件 LLM 调用，每张即时落盘）。job 记录既是进度真相，也是
  // 暂停 / 继续 / 停止的抓手；files 清单、assignments 归属表等大对象只留在
  // 服务端，过 wire 一律走 _jobSnapshot 的字段白名单（浅拷贝会把
  // AbortController 与几兆字节的数组一起序列化出去，绝不可取）。

  /** job → 可 JSON 序列化的面板快照（白名单，新增内部字段不会漏过 wire）。 */
  _jobSnapshot(job) {
    if (!job) return null
    const list = (arr) => (Array.isArray(arr) ? arr.slice(0, 60) : [])
    const diff = job.diff
      ? {
          repo: job.diff.repo ?? null,
          added: list(job.diff.added),
          changed: list(job.diff.changed).map((c) => (typeof c === 'string' ? c : c?.path)).filter(Boolean),
          removed: list(job.diff.removed),
          addedCount: (job.diff.added ?? []).length,
          changedCount: (job.diff.changed ?? []).length,
          removedCount: (job.diff.removed ?? []).length,
          unchangedCount: (job.diff.unchanged ?? []).length,
          unenrichedCount: (job.diff.unchanged ?? []).filter((u) => !u.enriched).length,
          truncated: !!job.diff.truncated,
          pruneSafe: !!job.diff.pruneSafe,
        }
      : null
    return {
      jobId: job.jobId,
      kind: job.kind,
      dir: job.dir,
      repo: job.repo ?? null,
      repoName: job.repoName,
      maxFiles: job.maxFiles,
      depth: job.depth,
      model: job.model ?? null,
      status: job.status,
      phase: job.phase,
      paused: !!job.paused,
      cancelled: !!job.cancelled,
      pct: job.pct,
      done: job.done,
      total: job.total,
      current: job.current,
      error: job.error,
      summary: job.summary,
      aiStatus: job.aiStatus,
      aiMessage: job.aiMessage,
      overviewCount: job.overviewCount,
      moduleCount: job.moduleCount,
      enrichedCount: job.enrichedCount,
      skippedCount: job.skippedCount,
      failedCount: job.failedCount,
      diff,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
    }
  }

  /** 建 job 记录 + 挂 AbortController（暂停 / 停止据此中断在途 LLM 调用）。 */
  _startJob(fields) {
    const jobId = `job-${Date.now()}-${this._jobSeq++}`
    const record = {
      jobId,
      kind: 'full', // 'full' 全量扫盘 | 'diff' 仅变更
      dir: '',
      repo: null,
      repoName: '',
      maxFiles: 50,
      depth: 2,
      model: null,
      status: 'running',
      phase: 'scan', // 'scan' | 'plan' | 'enrich'
      paused: false,
      cancelled: false,
      scanned: false,
      planned: false,
      pct: 0,
      done: 0,
      total: 0,
      current: '准备扫描…',
      error: null,
      summary: null,
      aiStatus: 'none', // none | running | done | error | unavailable
      aiMessage: null,
      aiStartedAt: null,
      aiDeadlineAt: null,
      overviewCount: 0,
      moduleCount: 0,
      enrichedCount: 0,
      skippedCount: 0,
      failedCount: 0,
      diff: null,
      // 仅服务端持有（不进快照）：
      files: null,
      assignments: null,
      overviewId: null,
      startedAt: Date.now(),
      finishedAt: null,
      ...fields,
    }
    this.jobs.set(jobId, record)
    this._aborters.set(jobId, new AbortController())
    return record
  }

  /** 暂停 / 停止检查点：返回 false 表示本轮流水线应当立刻停下。 */
  _gate(job) {
    if (!job) return false
    if (job.cancelled) {
      this._finishJob(job, 'cancelled')
      return false
    }
    if (job.paused) {
      if (job.status === 'running') {
        job.status = 'paused'
        job.current = `已暂停 · 已完成 ${job.done}/${job.total}`
      }
      return false
    }
    return true
  }

  _finishJob(job, status, err) {
    if (!job) return
    if (job.finishedAt && job.status === status) return
    job.status = status
    job.paused = false
    job.cancelled = status === 'cancelled'
    if (status === 'done') {
      job.pct = 100
      job.done = job.total || job.done
      if (job.aiStatus === 'running') job.aiStatus = 'done'
      job.current = ingestHeadline(job)
    } else if (status === 'cancelled') {
      if (job.aiStatus === 'running') job.aiStatus = 'none'
      job.current = `已停止 · 完成 ${job.done}/${job.total}，已落盘 ${job.enrichedCount + job.skippedCount} 张`
    } else if (status === 'error') {
      job.error = err?.message ?? String(err)
      job.current = '失败'
      job.aiStatus = 'error'
      job.aiMessage = job.error
    }
    job.finishedAt = Date.now()
    this._aborters.delete(job.jobId)
  }

  /** 全量：scan → plan → enrich；diff：scan(diff) → enrich；暂停后「继续」只补剩余项。 */
  async _runIngest(jobId) {
    const job = this.jobs.get(jobId)
    if (!job) return
    try {
      if (!job.scanned) {
        if (!(await this._phaseScan(job))) return
      }
      if (job.kind === 'full' && !job.planned) {
        await this._phasePlan(job)
        if (!this._gate(job)) return
      } else if (job.kind === 'diff' && !job.planned) {
        job.planned = true
      }
      if (!(await this._phaseEnrich(job))) return
      this._finishJob(job, 'done')
    } catch (err) {
      this.cardian.logger?.warn?.('[cardian] 扫盘任务异常:', err)
      this._finishJob(job, 'error', err)
    } finally {
      // paused 期间保留 aborter：「继续」可能在旧循环的 finally 落地前就换了新的，
      // 无条件删会把刚放进去的控制器抹掉，导致下一次暂停无法 abort 在途调用。
      if (job.status !== 'paused') this._aborters.delete(jobId)
    }
  }

  // 阶段 scan：只读枚举（diff 任务改用 changedSince，顺带剪掉磁盘上已消失的
  // 孤儿卡）。enumerateFiles 逐文件回调进度，面板能看到清单边列边走。
  async _phaseScan(job) {
    const wiki = this.cardian.wiki
    job.phase = 'scan'
    job.status = 'running'
    job.current = '枚举文件…'
    const report = (p) => {
      job.done = p.done
      job.total = p.total
      job.current = p.current
      job.pct = job.total > 0 ? Math.min(99, Math.round((job.done / job.total) * 100)) : 0
    }
    if (job.kind === 'diff') {
      const diff = await wiki.changedSince(job.dir, {
        repoName: job.repoName,
        maxFiles: job.maxFiles,
        onProgress: report,
      })
      job.repo = diff.repo
      job.diff = diff
      job.files = diff.targets ?? []
      job.total = job.files.length
      job.done = 0
      // 磁盘上消失的文件 → 剪孤儿卡；清单触顶（truncated）时磁盘视图不完整，
      // changedSince 会把 pruneSafe 置 false，此时绝不做删除，避免误剪。
      if (diff.pruneSafe && (diff.removed ?? []).length) {
        job.current = `清理已删除文件 ${diff.removed.length} 张…`
        for (const p of diff.removed) {
          if (!this._gate(job)) return false
          try {
            await wiki.removeByPath(diff.repo, p)
          } catch (err) {
            this.cardian.logger?.warn?.('[cardian] 剪除孤儿卡失败:', p, err)
          }
        }
        await wiki.refreshMoc().catch(() => {})
      }
      job.assignments = await this._assignmentsFromVault(diff.repo)
      job.overviewId = await this._overviewIdOf(diff.repo)
    } else {
      const listed = await wiki.enumerateFiles(job.dir, {
        repoName: job.repoName,
        maxFiles: job.maxFiles,
        onProgress: report,
      })
      job.repo = listed.repo
      job.repoName = listed.repoName
      job.files = listed.files
      job.total = listed.files.length
      job.done = 0
      if (listed.truncated) {
        job.aiMessage = `文件数达上限 ${listed.maxFiles}，本次为部分扫描（可提高上限后重扫）`
      }
      job.assignments = await this._assignmentsFromVault(listed.repo)
      job.overviewId = await this._overviewIdOf(listed.repo)
    }
    job.scanned = true
    if (!this._gate(job)) return false
    if (!job.files.length) {
      job.summary = { repo: job.repo, count: 0, skipped: 0, message: '未找到可分析的文件（目录为空 / 全被排除 / 与上次一致）' }
      if (job.kind === 'diff') {
        job.status = 'done'
        job.current = '没有变更需要重建'
        return false
      }
    }
    return true
  }

  // 阶段 plan：把「文件树 → 模块划分 + 项目总览」一次性交给模型，解析后
  // applyHierarchy 落总览卡与模块卡（层级树的骨架）。无 llm / 无模型 →
  // 降级为「仅骨架」，行为与旧版一致。
  async _phasePlan(job) {
    job.planned = true
    const llm = this._llmService()
    if (job.ai === false) {
      // 调用方显式 ai:false → 仅静态骨架，aiStatus 保持 'none'，不触碰 AI。
      await this._writeSkeletons(job)
      return
    }
    if (!llm || !job.model) {
      job.aiStatus = 'unavailable'
      job.aiMessage = !llm
        ? '宿主无 llm 服务：本次仅生成静态骨架卡（可在对话中让 AI 回填）'
        : '未选择可用模型：本次仅生成静态骨架卡（请在扫描向导里选择模型）'
      await this._writeSkeletons(job)
      return
    }
    job.phase = 'plan'
    job.current = 'AI 规划项目结构（总览 / 模块）…'
    job.aiStatus = 'running'
    job.aiStartedAt = Date.now()
    job.aiDeadlineAt = job.aiStartedAt + this.backfillTimeoutMs
    const controller = this._aborters.get(job.jobId)
    let hierarchy = null
    try {
      const text = await this._llmComplete(llm, job.model, buildPlanPrompt(job), {
        signal: controller?.signal,
        system: PLAN_SYSTEM,
        maxTokens: 2400,
      })
      if (!this._gate(job)) return
      hierarchy = this._extractJson(text)
    } catch (err) {
      if (!this._gate(job)) return
      this.cardian.logger?.warn?.('[cardian] 层级规划失败，退回目录归属:', err)
      job.aiMessage = `层级规划失败（${err?.message ?? err}），已退回逐文件回填`
    }
    if (hierarchy && (hierarchy.overview || Array.isArray(hierarchy.modules))) {
      try {
        const applied = await this.cardian.wiki.applyHierarchy(job.repo, hierarchy)
        job.assignments = applied.assignments
        job.overviewId = applied.overview?.id ?? null
        job.overviewCount = applied.overview?.id ? 1 : 0
        job.moduleCount = (applied.modules ?? []).length
      } catch (err) {
        if (!this._gate(job)) return
        this.cardian.logger?.warn?.('[cardian] 层级卡写入失败:', err)
        job.aiMessage = `层级卡写入失败（${err?.message ?? err}），文件卡将平铺`
      }
    }
  }

  // 阶段 enrich：逐文件一次 LLM 调用，产出「职责 / 关键实现 / 依赖 / 注意点」
  // 语义正文，立刻 upsert 文件卡（analysisLevel: ai、parent 指向所属模块）。
  // 每张卡落盘即被面板轮询看见；已回填且指纹未变的项跳过 → 幂等。
  async _phaseEnrich(job) {
    const wiki = this.cardian.wiki
    const files = job.files ?? []
    if (job.aiStatus === 'unavailable' || job.ai === false) {
      job.phase = 'enrich'
      job.done = job.total
      return this._gate(job)
    }
    const llm = this._llmService()
    if (!llm || !job.model) return this._gate(job)
    job.phase = 'enrich'
    job.status = 'running'
    const total = files.length
    job.total = total
    const controller = this._aborters.get(job.jobId)
    for (let i = 0; i < total; i++) {
      if (!this._gate(job)) return false
      const f = files[i]
      job.current = f.relPath
      job.pct = total > 0 ? Math.min(99, Math.round(((i + 1) / total) * 100)) : 0
      // 幂等短路：已有卡且是 AI/人工成果、内容指纹未变 → 不重复烧 token。
      const prior = await wiki.getByPath(job.repo, f.relPath).catch(() => null)
      const priorFm = prior?.frontmatter ?? prior ?? {}
      const level = String(priorFm.analysisLevel ?? '')
      if ((level === 'ai' || level === 'manual') && priorFm.contentHash === f.contentHash) {
        job.skippedCount++
        job.done = i + 1
        continue
      }
      if (level === 'manual') {
        // 人工凝练的成果永不被 AI 覆写。
        job.skippedCount++
        job.done = i + 1
        continue
      }
      const owner = RepoWikiService.moduleOwnerOf(job.assignments ?? [], f.relPath)
      let parsed = null
      try {
        const text = await this._llmComplete(llm, job.model, buildFilePrompt(job, f, owner), {
          signal: controller?.signal,
          system: FILE_SYSTEM,
          maxTokens: 1500,
          timeoutMs: 180_000, // 大文件 + 慢模型的单次回填预算；看门狗仍兜底整条流水线
        })
        if (!this._gate(job)) return false
        parsed = this._extractJson(text) ?? { body: String(text ?? '').trim() }
      } catch (err) {
        if (!this._gate(job)) return false
        job.failedCount++
        this.cardian.logger?.warn?.(`[cardian] ${f.relPath} 回填失败:`, err)
        parsed = null
      }
      const body = parsed ? enrichBody(parsed, f, owner) : ''
      if (body) {
        await wiki.writeNote(
          this._filePlan(job, f, owner, parsed, body),
        )
        job.enrichedCount++
      } else {
        // 模型没给可用内容 → 至少留下骨架卡，别让这张卡在树上缺席。
        await this._writeOneSkeleton(job, f, owner)
      }
      job.done = i + 1
      // 心跳：每落一张就把看门狗截止时间往后推，_evaluateAiTimeouts 只在
      // 流水线真正卡死（长时间无进展）时才翻转 aiStatus。
      job.aiDeadlineAt = Date.now() + this.backfillTimeoutMs
    }
    if (!this._gate(job)) return false
    await wiki.refreshMoc().catch(() => {})
    job.summary = {
      repo: job.repo,
      count: job.enrichedCount,
      skipped: job.skippedCount,
      failed: job.failedCount,
      overview: job.overviewCount,
      modules: job.moduleCount,
    }
    return true
  }

  /** 文件卡 upsert 计划：plan() 造骨架，再补 contentHash / 层级字段。 */
  _filePlan(job, f, owner, parsed, body) {
    const plan = this.cardian.wiki.plan({
      repo: job.repo,
      path: f.relPath,
      title: String(parsed.title ?? '').trim() || f.relPath,
      summary: String(parsed.summary ?? '').trim() || `${f.lines} 行 · ${f.language}`,
      content: body,
      analysisLevel: 'ai',
      status: 'published',
      level: 'file',
      parent: owner?.moduleId ?? job.overviewId ?? null,
      tags: [job.repoName, f.language, 'ai-scan'].filter(Boolean),
    })
    // plan() 不带 contentHash —— 没有它 changedSince / ingest 的指纹短路全部
    // 失效（每次 diff 都把未变更文件判成 changed），必须显式补上。
    plan.extra.contentHash = f.contentHash
    plan.extra.imports = f.imports?.length ? f.imports : null
    plan.extra.symbols = f.symbols?.length ? f.symbols : null
    plan.extra.lines = f.lines ?? null
    return plan
  }

  /** 无 AI（或 AI 整体不可用）时的降级路径：逐文件写静态骨架卡。 */
  async _writeSkeletons(job) {
    const wiki = this.cardian.wiki
    const files = job.files ?? []
    job.phase = 'enrich'
    job.total = files.length
    for (let i = 0; i < files.length; i++) {
      if (!this._gate(job)) return false
      const f = files[i]
      job.current = `骨架：${f.relPath}`
      job.pct = files.length > 0 ? Math.min(99, Math.round(((i + 1) / files.length) * 100)) : 0
      const owner = RepoWikiService.moduleOwnerOf(job.assignments ?? [], f.relPath)
      const written = await this._writeOneSkeleton(job, f, owner)
      if (written) job.skippedCount++
      job.done = i + 1
    }
    if (!this._gate(job)) return false
    await wiki.refreshMoc().catch(() => {})
    job.summary = { repo: job.repo, count: job.skippedCount, skipped: 0, skeleton: true }
    return true
  }

  async _writeOneSkeleton(job, f, owner) {
    const wiki = this.cardian.wiki
    try {
      const res = await wiki.skeletonForFile(job.dir, f.absPath, f.relPath, { repo: job.repo, repoName: job.repoName }, {
        level: 'file',
        parent: owner?.moduleId ?? job.overviewId ?? null,
      })
      return res
    } catch (err) {
      this.cardian.logger?.warn?.(`[cardian] 骨架卡写入失败 ${f.relPath}:`, err)
      return null
    }
  }

  /** 已存模块卡 → assignments（diff 任务不重排层级，沿用既有归属）。 */
  async _assignmentsFromVault(repo) {
    if (!repo) return []
    let entries = []
    try {
      entries = await this.cardian.wiki.entries()
    } catch {
      return []
    }
    const out = []
    for (const e of entries) {
      if (e.group !== repo || !e.frontmatter?.module) continue
      for (const p of e.frontmatter.modulePaths ?? []) {
        const pattern = String(p ?? '').replace(/^\/+/, '')
        if (pattern) out.push({ pattern, moduleId: e.frontmatter.id, moduleTitle: e.frontmatter.title })
      }
    }
    out.sort((a, b) => b.pattern.length - a.pattern.length)
    return out
  }

  async _overviewIdOf(repo) {
    if (!repo) return null
    try {
      const ov = await this.cardian.wiki.getByPath(repo, '__OVERVIEW__')
      return ov?.frontmatter?.id ?? ov?.id ?? null
    } catch {
      return null
    }
  }

  /** 归一化 params.model：接受 {provider,model} / 'provider/model' / 空。 */
  _resolveModel(raw) {
    const pick = (v) => {
      if (!v) return null
      if (typeof v === 'object') {
        const provider = String(v.provider ?? '').trim()
        const model = String(v.model ?? '').trim()
        return provider && model ? { provider, model } : null
      }
      const s = String(v).trim()
      if (!s) return null
      const i = s.indexOf('/')
      if (i > 0 && i < s.length - 1) return { provider: s.slice(0, i), model: s.slice(i + 1) }
      return null
    }
    return pick(raw) || pick(this._defaultModel())
  }

  // 一键沉淀（AI 扫盘）：立即返回 jobId，流水线后台跑，进度经 ingestStatus
  // 轮询。params = {dir, repoName?, maxFiles?, model?:{provider,model}, depth?}
  ingestProject(params = {}) {
    const dir = String(params.dir ?? '').trim()
    if (!dir) throw new Error('缺少项目文件夹路径（dir）')
    const job = this._startJob({
      kind: 'full',
      dir,
      repoName: String(params.repoName ?? '').trim() || basename(dir),
      maxFiles: clampPosInt(params.maxFiles, 50),
      depth: clampPosInt(params.depth, 2),
      model: this._resolveModel(params.model),
      ai: params.ai !== false, // ai:false → 仅骨架，不 spawn AI
    })
    void this._runIngest(job.jobId)
    return this._jobSnapshot(job)
  }

  // 仅扫描变更：added + changed 走 enrich，removed 剪孤儿卡（truncated 时不剪）。
  rescanDiff(params = {}) {
    const dir = String(params.dir ?? '').trim()
    if (!dir) throw new Error('缺少项目文件夹路径（dir）')
    const job = this._startJob({
      kind: 'diff',
      dir,
      repoName: String(params.repoName ?? '').trim() || basename(dir),
      maxFiles: clampPosInt(params.maxFiles, 200),
      depth: clampPosInt(params.depth, 2),
      model: this._resolveModel(params.model),
      ai: params.ai !== false,
      current: '比对磁盘变更…',
    })
    void this._runIngest(job.jobId)
    return this._jobSnapshot(job)
  }

  /** 暂停：置位 + abort 在途调用；已完成卡片保留（即时落盘过）。 */
  pauseIngest(params = {}) {
    const job = this.jobs.get(String(params.jobId ?? ''))
    if (!job) throw new Error('任务不存在（可能已结束或面板刷新过）')
    if (!applyIngestControl(job, 'pause')) return this._jobSnapshot(job)
    try {
      this._aborters.get(job.jobId)?.abort?.()
    } catch {}
    return this._jobSnapshot(job)
  }

  /** 继续：清 paused，换新 AbortController，只跑剩余未回填项（幂等）。 */
  resumeIngest(params = {}) {
    const job = this.jobs.get(String(params.jobId ?? ''))
    if (!job) throw new Error('任务不存在（可能已结束或面板刷新过）')
    if (!applyIngestControl(job, 'resume')) return this._jobSnapshot(job)
    this._aborters.set(job.jobId, new AbortController())
    void this._runIngest(job.jobId)
    return this._jobSnapshot(job)
  }

  /** 停止：不再处理剩余项，已落盘卡片保留（不可再「继续」，重扫即可）。 */
  cancelIngest(params = {}) {
    const job = this.jobs.get(String(params.jobId ?? ''))
    if (!job) throw new Error('任务不存在（可能已结束或面板刷新过）')
    if (!applyIngestControl(job, 'cancel')) return this._jobSnapshot(job)
    try {
      this._aborters.get(job.jobId)?.abort?.()
    } catch {}
    this._finishJob(job, 'cancelled')
    return this._jobSnapshot(job)
  }

  // 超时看门狗：AI 回填 running 超过 deadline → 标 error，面板可见。
  // enrich 每落一张卡会把 aiDeadlineAt 往后推（心跳），因此只有流水线
  // 真的卡死（长时间零进展）才会被翻转。已暂停的任务不算卡死：
  // 挂起期间冻结看门狗（deadline 随轮询顺延），恢复后从当下重新计时。
  _evaluateAiTimeouts(now = Date.now()) {
    for (const j of this.jobs.values()) {
      if (j.aiStatus !== 'running') continue
      if (j.status === 'paused') {
        j.aiDeadlineAt = Math.max(j.aiDeadlineAt ?? 0, now + this.backfillTimeoutMs)
        continue
      }
      if (!j.aiDeadlineAt) j.aiDeadlineAt = (j.aiStartedAt ?? Date.now()) + this.backfillTimeoutMs
      if (now > j.aiDeadlineAt) {
        j.aiStatus = 'error'
        j.aiMessage =
          'AI 回填超时未完成（常见原因：该模型无响应或凭据失效）。' +
          (j.total ? `已回填 ${j.enrichedCount ?? 0}/${j.total} 张；` : '') +
          '可点「暂停」后重试，或改选其它模型再扫。'
      }
    }
  }

  // 任务列表（最新在前，最多 50 条）——面板轮询用。
  ingestStatus() {
    try {
      this._evaluateAiTimeouts()
    } catch {}
    const jobs = [...this.jobs.values()]
      .sort((a, b) => b.startedAt - a.startedAt)
      .slice(0, 50)
      .map((j) => this._jobSnapshot(j))
    return { jobs }
  }
}

// ── AI 扫盘任务控制（模块级纯函数便于单测）─────────────────────────────
/**
 * 控制指令 → job 状态翻转。返回 true 表示指令生效，调用方再补 abort /
 * 重启流水线；对不匹配当前状态的指令（已暂停再 pause、已结束再 cancel、
 * 已 cancelled 再 resume）一律返回 false，保证面板重复点按钮幂等不会把
 * 已结束任务拉回 running。
 */
export function applyIngestControl(job, op) {
  if (!job) return false
  if (op === 'pause') {
    if (job.status !== 'running') return false
    job.cancelled = false
    job.paused = true
    job.status = 'paused'
    job.current = `已暂停 · 已完成 ${job.done}/${job.total}`
    return true
  }
  if (op === 'resume') {
    if (job.status !== 'paused' || job.cancelled) return false
    job.paused = false
    job.status = 'running'
    job.current = `继续 · 已完成 ${job.done}/${job.total}`
    return true
  }
  if (op === 'cancel') {
    if (job.cancelled || job.status === 'done' || job.status === 'error' || job.status === 'cancelled') return false
    job.cancelled = true
    job.paused = false
    return true
  }
  return false
}

// ── AI 扫盘提示词与正文装配（模块级，纯函数便于单测）────────────────────
const PLAN_SYSTEM =
  '你是资深软件架构师，擅长把代码仓库梳理成有层级的项目文档。只输出 JSON，不要任何解释性文字。'
const FILE_SYSTEM =
  '你是资深工程师，为团队内部代码知识库撰写文件级说明。只输出 JSON，不要任何解释性文字。'

/** 层级规划提示：喂文件树（路径 / 语言 / 行数 / 主要符号），要总览 + 模块 JSON。 */
export function buildPlanPrompt(job) {
  const files = job.files ?? []
  const listed = files.slice(0, 400).map((f) => {
    const sym = (f.symbols ?? []).slice(0, 6).join(', ')
    return `- ${f.relPath} (${f.language}, ${f.lines} 行)${sym ? ` — 主要符号: ${sym}` : ''}`
  })
  if (files.length > listed.length) listed.push(`- …（另有 ${files.length - listed.length} 个文件未列出）`)
  const depth = Math.max(1, Number(job.depth) || 2)
  return [
    `项目名：${job.repoName}`,
    `文件总数：${files.length}`,
    '',
    `请把该项目梳理成「项目总览 + 模块」两级结构，模块按目录前缀归并（以使用前 ${depth} 层目录为粒度），尽量覆盖清单里的文件。`,
    '',
    '文件清单：',
    ...listed,
    '',
    '只输出如下 JSON（不要输出任何 JSON 之外的文字）：',
    '{"overview":{"title":"<项目名> · 项目总览","summary":"2-4 句：这个项目做什么、整体架构思路、关键技术栈"},',
    '"modules":[{"id":"<英文短横线 slug>","title":"<中文模块名>","summary":"1-2 句职责","paths":["<清单里出现过的目录前缀，不带前导斜杠>"]}]}',
    '',
    '要求：modules 3~8 个；paths 必须是上面清单里真实存在的路径前缀；无法归类的文件留在总览层即可，不要强行编造。',
  ].join('\n')
}

/** 单文件语义回填提示：喂静态抽取结果 + 源码摘录，要 title / summary / 四段正文。 */
export function buildFilePrompt(job, f, owner = null) {
  const excerpt = String(f.excerpt ?? '').split('\n').slice(0, 60).join('\n')
  return [
    `项目：${job.repoName}`,
    owner?.moduleTitle ? `所属模块：${owner.moduleTitle}` : null,
    `文件：${f.relPath}`,
    `语言：${f.language}　行数：${f.lines}`,
    f.imports?.length ? `静态依赖：${f.imports.slice(0, 20).join(', ')}` : null,
    f.symbols?.length ? `静态符号：${f.symbols.slice(0, 20).join(', ')}` : null,
    '',
    '源码摘录（可能被截断）：',
    '```' + (f.language === 'text' ? '' : f.language),
    excerpt,
    '```',
    '',
    '请说明这个文件在该项目里实际承担什么工作。只输出 JSON：',
    '{"title":"人类可读标题（例如「定位引擎（LocationEngine）」）","summary":"一句话职责，不超过 40 字","body":"Markdown 正文"}',
    '',
    'body 必须按顺序包含四个二级小节：## 职责、## 关键实现、## 依赖、## 注意点。',
    '每节 1-4 句或项目符号，总计 200-600 字；不要大段转贴源码；摘录里没有依据的写「未在摘录中体现」，不要编造。',
  ]
    .filter((line) => line !== null)
    .join('\n')
}

/** 模型产出 → 卡片正文（补齐标题头 / 兜底缺小节 / 去掉整段 ```fence）。 */
export function enrichBody(parsed, f, owner = null) {
  let body = String(parsed?.body ?? parsed?.content ?? '').trim()
  const fenced = /^```(?:markdown|md)?\s*\n([\s\S]*?)\n```\s*$/i.exec(body)
  if (fenced) body = String(fenced[1]).trim()
  if (!body) return ''
  if (!/^##\s/m.test(body)) body = `## 职责\n\n${body}`
  const title = String(parsed?.title ?? '').trim() || f.relPath
  const head =
    `# ${title}\n\n` +
    `> \`${f.relPath}\` · ${f.language} · ${f.lines} 行` +
    `${owner?.moduleTitle ? ` · 模块：${owner.moduleTitle}` : ''}\n`
  let out = `${head}\n${body}\n`
  if (f.imports?.length && !/^##\s*依赖/m.test(out)) {
    out += `\n## 依赖\n\n${f.imports.map((d) => `- \`${d}\``).join('\n')}\n`
  }
  return out
}

/** 任务收尾语（面板进度条右侧一行说明）。 */
function ingestHeadline(job) {
  const made = Number(job.enrichedCount ?? 0) + Number(job.skippedCount ?? 0)
  const bits = [`${made} 张卡片`]
  if (job.overviewCount || job.moduleCount) bits.unshift(`总览 ${job.overviewCount} / 模块 ${job.moduleCount}`)
  if (Number(job.failedCount)) bits.push(`${job.failedCount} 张回退骨架`)
  if (job.kind === 'diff' && job.diff) {
    bits.push(
      `新增 ${(job.diff.added ?? []).length} / 变更 ${(job.diff.changed ?? []).length} / 删除 ${(job.diff.removed ?? []).length}`,
    )
  }
  return `完成 · ${bits.join(' · ')}`
}

function clampPosInt(value, fallback) {
  const n = Number(value)
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : fallback
}

/** 从一段混排文字里切出第一个配对完整的 {…} / […]（容忍尾部多余解释）。 */
function sliceBalanced(text) {
  const src = String(text ?? '')
  const start = src.search(/[{[]/)
  if (start < 0) return null
  const open = src[start]
  const close = open === '{' ? '}' : ']'
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < src.length; i++) {
    const ch = src[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === open) depth++
    else if (ch === close) {
      depth--
      if (depth === 0) return src.slice(start, i + 1)
    }
  }
  return null
}

// ── 对话活动 → 记忆 / 三区刷新钩子 ──────────────────────────────────────
// 目标（对齐知识中心能力模型）：与项目有关的每次对话活动都刷新记忆，并让
// RepoWiki / 知识卡片 / 记忆 三个分区保持新鲜。实现：监听 dsh-session 的
// 全局 session/event（user/message），从会话 cwd 推导项目（与 RepoWiki 的
// repo slug 对齐：basename(cwd) → slugify），然后：
//   1) 记忆刷新：以 scope=<project> upsert 一条固定标题的 episodic 记忆
//      （合并语义 → 稳定 id + 追加修订历史），记录最近活动时间与用户消息摘录；
//   2) 三区刷新：refreshAll()（重建三个 MOC 索引），保证「知识树」面板视图新鲜。
function installConversationHook(ctx, cardian) {
  if (typeof ctx.on !== 'function') return
  const handle = (session, event) => {
    try {
      if (!event || event.type !== 'user/message') return
      if (!session || typeof cardian.ready?.then !== 'function') return
      const cwd = session?.header?.cwd ?? session?.cwd
      if (typeof cwd !== 'string' || !cwd) return
      const projectSlug = slugify(cwd.split(/[\\/]/).filter(Boolean).pop() ?? '')
      if (!projectSlug) return
      // 只在确有该项目 RepoWiki 分区时刷新（避免为无关会话写记忆）。
      cardian.ready.then(async () => {
        try {
          const repos = await cardian.wiki.listRepos()
          if (!repos.includes(projectSlug)) return
          const snippet = String(event.data?.message?.content?.[0]?.text ?? '')
            .replace(/\s+/g, ' ')
            .slice(0, 120)
          const now = new Date().toISOString()
          await cardian.memory.upsert({
            title: `最近对话 · ${projectSlug}`,
            content:
              `项目 ${projectSlug} 的最近一次对话活动（${now}）。\n\n` +
              (snippet ? `> ${snippet}\n` : '') +
              `\n该记忆由 cardian 对话活动钩子自动维护，每次有新对话都会刷新（scope=${projectSlug}）。\n`,
            scope: projectSlug,
            kind: 'episodic',
            importance: 2,
            tags: [projectSlug, 'conversation-activity'],
            summary: `最近对话活动 @ ${now}`,
            facts: [`最近活动：${now}`, projectSlug, 'conversation-activity'],
          })
          await cardian.refreshAll()
        } catch (err) {
          cardian.logger?.warn?.('[cardian] 对话活动刷新失败:', err)
        }
      })
    } catch (err) {
      cardian.logger?.warn?.('[cardian] 对话活动钩子异常:', err)
    }
  }
  try {
    ctx.on('session/event', handle, { global: true })
  } catch (err) {
    cardian.logger?.warn?.('[cardian] 注册会话事件监听失败:', err)
  }
}

// ── /cardian 斜杠命令（systemPrompt 约定）─────────────────────────────────
// dsh 插件协议没有命令注册面（ctx 只有 tools / slots / systemPrompt / …），
// 且内核不拦截 "/" 开头的用户消息——它们原样进 agent。因此用一段系统提示
// 约定把 /cardian 前缀映射到既有 cardian.* 工具：零内核依赖，web 与桌面
// 两端经同一插件即时生效。
export const SLASH_GUIDE = [
  '\n[cardian 斜杠命令] 用户消息以 `/cardian` 开头时视为知识中心命令：直接调用对应 cardian.* 工具执行，用紧凑列表或表格汇报结果，不要寒暄，不要整段复述长正文。',
  '- `/cardian`（无参或 help）→ 列出本命令清单',
  '- `/cardian status` → cardian.status',
  '- `/cardian search <关键词>` → cardian.search（可注明 section: wiki|cards|memory）',
  '- `/cardian recall <关键词>` → cardian.recall',
  '- `/cardian tag [分区]` → cardian.tagCloud',
  '- `/cardian doctor` 与 `/cardian reindex` → cardian.doctor / cardian.reindex',
  '- `/cardian wiki list` | `/cardian wiki graph <repo>` | `/cardian wiki get <repo> <路径>` | `/cardian wiki sync <本地路径>` → 对应 cardian.wiki.*',
  '- `/cardian card get <ref>` | `/cardian card due` | `/cardian card add <标题> | <正文>` → 对应 cardian.card.*',
  '- `/cardian memory list` | `/cardian memory commit <标题> | <内容>` → 对应 cardian.memory.*',
  '',
].join('\n')

// ── Vault 文件监听：Obsidian 手工编辑 → 自动刷新 ──────────────────────────
// 检索层对纯内容编辑本就免疫（indexer.ensureFresh() 逐文件 mtime diff），
// 但手工新增/删除/改名笔记后三区 MOC 不会自我修复。这里把外部变更变成
// 一次显式 reindex + refreshAll：
//   * 只认 .md 笔记；README/_index/index/MOC 与点开头路径一律忽略——
//     refreshAll() 重建的正是这些 MOC 文件，不忽略就会自触发成环；
//   * Obsidian 原子保存（临时文件替换）会连发多个事件，1.2s debounce 合并；
//     刷新进行中到达的变更排队合并，绝不丢事件也绝不并发重建；
//   * watch 不可用（目录消失/平台限制）只 warn，绝不影响插件主流程。
const MOC_STEM = /^(README|_index|index|MOC|moc)$/i

export function installVaultWatcher(ctx, cardian) {
  const vaultPath = cardian?.config?.vaultPath
  if (!vaultPath || typeof fsWatch !== 'function') return null
  const stats = { events: 0, ignored: 0, rebuilds: 0, lastChange: null, error: null }
  const pending = new Set()
  let queuedPaths = null
  let draining = false
  let timer = null
  let watcher = null

  const flush = async (paths) => {
    queuedPaths = paths
    if (draining) return
    draining = true
    try {
      while (queuedPaths) {
        const batch = queuedPaths
        queuedPaths = null
        try {
          await cardian.reindex()
          await cardian.refreshAll()
          stats.rebuilds++
          stats.lastChange = batch[0] ?? null
          ctx.logger?.info?.(`[cardian] vault 变更（${batch.join('、')}）→ 检索索引与 MOC 已自动刷新`)
        } catch (err) {
          ctx.logger?.warn?.('[cardian] vault 自动刷新失败:', err)
        }
      }
    } finally {
      draining = false
    }
  }

  const schedule = (rel) => {
    pending.add(rel)
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      const paths = [...pending]
      pending.clear()
      void flush(paths)
    }, 1200)
    if (typeof timer.unref === 'function') timer.unref()
  }

  try {
    watcher = fsWatch(vaultPath, { recursive: true }, (_event, fileName) => {
      try {
        stats.events++
        const rel = String(fileName ?? '')
        if (!/\.md$/i.test(rel)) return
        const parts = rel.split(/[\\/]/)
        if (parts.some((p) => p.startsWith('.'))) return
        if (MOC_STEM.test(parts[parts.length - 1].replace(/\.md$/i, ''))) {
          stats.ignored++
          return
        }
        schedule(rel)
      } catch {}
    })
    watcher.on?.('error', (err) => {
      stats.error = err?.message ?? String(err)
      ctx.logger?.warn?.('[cardian] vault 监听中断（自动刷新停用）:', err)
    })
    // FSWatcher 默认撑住事件循环：不 unref 的话，测试/CLI 等短生命周期
    // 进程会永远退不出去（runner 卡死在等子进程）。unref 后不阻止退出，
    // 常驻宿主（dsh web）里的监听行为完全不受影响。
    try {
      watcher.unref?.()
    } catch {}
  } catch (err) {
    ctx.logger?.warn?.('[cardian] vault 监听不可用（自动刷新停用）:', err)
    return null
  }

  return {
    stats,
    close() {
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      try {
        watcher?.close?.()
      } catch {}
    },
  }
}

// ── Typert host 清单（与 src/typert.js 同步）─────────────────────────────
// 运行时注入的 entry 不在 typert-loader 的解析树内：loader 用自身 baseUrl
// require.resolve('<pkg>/package.json') 找包，而注入包经 junction 挂在
// profile node_modules，解析失败被静默跳过（resolveArtifact 返回 null），
// 所以 loader 自动注册对“运行时注入形态”不生效。这里改为直接
// ctx.typert.register(manifest) 手动注册——registry 与 loader 同源契约，
// validateCodec 只要求 strict codec 带 parse()，因此用直通 schema 即可
// （避免引入 zod 依赖：profile node_modules 没有 zod，import 会炸掉插件加载）。
// 维护铁律：本清单与 src/typert.js / src/client/controller.ts 的
// BRIDGE_METHODS 三处同步。
const JSON_CODEC = () => ({
  mode: 'strict',
  typeSymbol: 'dsh-cardian/types#Json',
  schema: { parse: (value) => value }, // 直通编解码；客户端 looseCodec 同步直通
})

// Read-only gateway methods that carry NO wire argument. This set MUST match
// src/typert.js invocations (inv('describe')/inv('status')/inv('doctor')/
// inv('schema') with no parameter array) AND the client descriptor in
// src/client/controller.ts (ZERO_WIRE_METHODS). The host RPC dispatcher runs
// strict assertExactArguments against this manifest, so a mismatch either way
// trips "args fields do not match the descriptor" on the host or "expected N
// argument(s), got M" on the client.
const ZERO_WIRE_METHODS = new Set(['describe', 'status', 'doctor', 'schema'])

const TYPERT_MANIFEST = {
  package: 'dsh-cardian',
  face: 'host',
  schemas: [],
  invocations: GATEWAY_METHODS.map((method) => {
    const params = ZERO_WIRE_METHODS.has(method) ? [] : ['params']
    return {
      id: `dsh-cardian#cardianRemote/${method}`,
      service: 'cardianRemote',
      namespace: 'cardian',
      method,
      invocation: { kind: 'direct' },
      parameters: params.map((name) => ({ name, wire: name, source: 'json', codec: JSON_CODEC() })),
      result: JSON_CODEC(),
    }
  }),
  model: { services: [], events: [], objects: [] },
}

/** 手动注册 host 端 Typert 清单（loader 对注入 entry 静默跳过，见上文）。返回可撤销函数。 */
function registerTypertHost(ctx) {
  try {
    const typert = typeof ctx.get === 'function' ? ctx.get('typert') : null
    if (!typert || typeof typert.register !== 'function') {
      ctx.logger?.warn?.('[cardian] typert 服务不可用，跳过远端清单注册')
      return null
    }
    if (typeof typert.getPackage === 'function' && typert.getPackage('dsh-cardian', 'host')) {
      return null // 已注册（如重启后经 bundles + loader 装配）——幂等跳过
    }
    return typert.register(TYPERT_MANIFEST)
  } catch (err) {
    ctx.logger?.warn?.('[cardian] typert 清单注册失败（面板远端调用将不可用）:', err)
    return null
  }
}

/** 纯函数版超时评估（单测用）：翻转则返回 true。 */
export function evaluateAiTimeouts(jobList, now, timeoutMs = 300_000) {
  let changed = false
  for (const j of jobList) {
    if (j.aiStatus !== 'running') continue
    const dl = j.aiDeadlineAt ?? (j.aiStartedAt ?? 0) + timeoutMs
    if (now > dl) {
      j.aiStatus = 'error'
      changed = true
    }
  }
  return changed
}

export function apply(ctx, config = {}) {
  // Fail fast on invalid configuration (basic-memory style) before doing work.
  const resolved = resolveConfig(config)

  const cardian = createCardian({
    ...resolved,
    logger: ctx.logger,
  })

  // 供其它插件/agent 编程式访问，也便于测试。
  // ⚠️ 先 provide 后赋值：dsh 的 cordis fork 的 ctx 是 Proxy，未声明属性直接
  // 赋值会被 set trap 拦截（cannot set property ... without provide）。
  if (typeof ctx.provide === 'function') {
    ctx.provide('cardian', cardian)
  } else {
    ctx.cardian = cardian
  }

  registerTools(ctx, cardian)

  // 注册 Typert 远端网关：Web 面板通过 `remote.cardianRemote.<method>` 调用
  // （替代坏掉的 ctx.remote.call）。TypertRemoteService 基类会经
  // ctx.reflect.provide 自动注册 'cardianRemote'。
  // ⚠️ 网关依赖宿主 ctx.reflect（Cordis Service 基类构造需要），在测试的
  // 最小 mock ctx 里不存在——缺省时优雅降级（工具注册不受影响）。
  try {
    new CardianGateway(ctx, cardian)
  } catch (err) {
    ctx.logger?.warn?.('[cardian] Typert 网关不可用（宿主 ctx.reflect 缺失？）:', err)
  }

  // RAG 预注入（知识中心核心集成：agent 执行任务前先检索增强上下文）：
  // 把知识树概览——分区计数、Top 重要记忆、过期/待同步提示——注册为系统
  // 提示段。seam 缺席（测试 mock ctx）或装配期读取失败都静默降级为空串，
  // 绝不阻塞主循环。
  try {
    if (typeof ctx.systemPrompt?.section === 'function') {
      ctx.systemPrompt.section(async () => {
        try {
          await cardian.ready?.then?.(() => {}) ?? cardian.ready
          const s = await cardian.status()
          const secs = s.sections ?? {}
          const reposTxt = (s.repos ?? []).join("、") || "无"
          let txt =
            "[知识树上下文 · cardian]\n" +
            `- 体量：RepoWiki ${secs.wiki ?? 0} / 知识卡片 ${secs.cards ?? 0} / 记忆 ${secs.memory ?? 0}` +
            `${reposTxt !== "无" ? `；已沉淀仓库：${reposTxt}` : ""}\n`
          try {
            const mems = await cardian.memory.entries()
            const top = mems
              .filter((m) => (m.frontmatter.status ?? "published") !== "draft")
              .sort((a, b) => (Number(b.frontmatter.importance) || 0) - (Number(a.frontmatter.importance) || 0))
              .slice(0, 3)
            if (top.length) {
              txt += "- 重要记忆：\n"
              for (const m of top) {
                const imp = Number(m.frontmatter.importance) || 3
                const fm = m.frontmatter
                const firstFact = Array.isArray(fm.facts) && fm.facts.length ? String(fm.facts[0]) : ""
                txt += `  - [${imp}] ${fm.title}${firstFact ? ` — ${firstFact}` : ""}\n`
              }
            }
            if ((s.stale ?? 0) > 0) txt += `- 注意：有 ${s.stale} 条笔记已过 expires，引用前请核实\n`
          } catch {}
          txt += "- 以上摘要与条目是本项目的既有约定/决策，规划与生成代码时应作为行为约束优先遵守\n"
          txt += "\n需要细节时优先调用 cardian.search / cardian.recall 工具。\n"
          txt += SLASH_GUIDE
          return txt
        } catch {
          return ''
        }
      })
    }
  } catch (err) {
    ctx.logger?.warn?.('[cardian] 系统提示段注册不可用:', err)
  }
  // 对话活动 → 记忆 / 三区刷新钩子（依赖 cardian 就绪，内部自行 await）。
  installConversationHook(ctx, cardian)

  // Vault 文件监听（Obsidian 手工编辑 → 自动 reindex + MOC 刷新）：
  // init 完成后再挂，避开初始化写 MOC 的窗口；disposed 守卫覆盖
  // 「init 未完成但插件已卸载」时 watcher 尚未挂上的泄漏路径。
  // 实例挂在 cardian.watcher 上，供 status / 测试观测。
  let disposed = false
  let vaultWatcher = null
  if (resolved.watchVault) {
    ;(cardian.ready ?? Promise.resolve())
      .then(() => {
        if (disposed) return
        vaultWatcher = installVaultWatcher(ctx, cardian)
        if (vaultWatcher) cardian.watcher = vaultWatcher
      })
      .catch(() => {})
  }

  // 手动注册 Typert host 清单（loader 对运行时注入 entry 静默跳过）。
  // 返回值是 registry 的 effect disposer：随 apply 的卸载回调撤销，
  // 保证 uninject→reinject 不会撞 “package face already registered”。
  let disposeTypert = null
  try {
    disposeTypert = registerTypertHost(ctx)
  } catch (err) {
    ctx.logger?.warn?.('[cardian] typert 清单注册异常:', err)
  }

  if (resolved.autoInit) {
    cardian.ready = cardian.init().catch((err) => {
      const log = ctx.logger?.error ?? console.error
      log('[cardian] 初始化失败:', err)
    })
  } else {
    cardian.ready = Promise.resolve()
  }

  return () => {
    // 停掉 vault 文件监听（含 init 未完成、watcher 尚未挂上的窗口期）。
    disposed = true
    if (vaultWatcher && typeof vaultWatcher.close === 'function') {
      try {
        vaultWatcher.close()
      } catch {}
    }
    // 撤销手动 Typert 注册（幂等：未注册则为 null）
    if (typeof disposeTypert === 'function') {
      try {
        disposeTypert()
      } catch (err) {
        ctx.logger?.warn?.('[cardian] 撤销 typert 注册失败:', err)
      }
    }
    // provide 分支：service 清理由 ctx.provide 注册的 fiber effect 负责
    if (typeof ctx.provide !== 'function') delete ctx.cardian
  }
}

export { createCardian, resolveConfig }
export { CardianGateway } // installVaultWatcher / SLASH_GUIDE 在定义处已导出
// Exported for the gateway-contract regression test (see test/gateway-contract.test.mjs):
// keeps the three synced manifests (typert.js / index.js / controller.ts) honest.
export { GATEWAY_METHODS, TYPERT_MANIFEST, ZERO_WIRE_METHODS }
export { CardianError, ValidationError, NotFoundError, ConfigError, PathError, StoreError } from '../core/errors.js'
