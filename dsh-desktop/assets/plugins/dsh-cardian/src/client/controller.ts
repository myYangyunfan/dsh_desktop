// Client-side data controller for the "知识树" view.
//
// The knowledge data lives in the HOST (the Obsidian vault is on disk, managed
// by the cardian host plugin). The browser reaches it through the dsh client
// runtime's typert remote bridge: we `$mount` a remote face for the host
// gateway once, then call `remote.cardian.<method>(params)`.
//
// ⚠️ Face key rule (from @deepseek-ai/dsh-api-gateway ClientRemoteService):
// the installed namespace service is named `remote.${descriptor.namespace}` —
// the NAMESPACE, not the service label. Our descriptor uses `namespace:
// 'cardian'` (mirroring the host gateway binding), so the face lives at
// `remote.cardian`. Polling `remote.cardianRemote` yields undefined forever.
//
// The host plugin exposes a `cardianRemote` gateway. Most methods take one
// `params` object; the four zero-wire methods (describe / status / doctor /
// schema) take none — see ZERO_WIRE_METHODS below. All return plain
// JSON-serializable data:
//   describe()      -> { vaultPath, sections: [{ key, title, count, entries, repos? }] }
//   sectionList({key, query, group, tag, status})  -> one section: { key, title, count, entries, repos? }
//   sectionGet({key, ref, group})                  -> full note or throws NotFoundError
//   sectionUpsert({key, args})                     -> { rel, id, title, group, updated, created? }
//   sectionRemove({key, ref, group})               -> boolean
//   status() / doctor() / schema()                 -> 零 wire，无参直调
// 治理与导出（均带一个 params 对象）：
//   promote({ref, target})    -> { file, promoted, scope, target }（记忆晋升到 PROJECT.md）
//   due({deck})               -> [{ rel, title, front, back, deck, due, interval, reps }]
//   exportJson({})            -> { format, version, exportedAt, count, notes }（整库快照）
//   exportSkill({name,...})   -> { skill, entries }（分层导出 Skills/<name>/）
// AI 扫盘建库（网关逐文件直调宿主 llm，均带一个 params 对象）：
//   listModels({})            -> { available, default, models: [{provider, model, title}] }
//   ingestProject({dir, repoName?, maxFiles?, model?, depth?}) -> IngestJob 快照
//   pauseIngest({jobId}) / resumeIngest({jobId}) / cancelIngest({jobId}) -> 快照
//   rescanDiff({dir, repoName?, maxFiles?, model?})             -> 快照（仅变更项）

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'

export type SectionKey = 'cards' | 'memory' | 'wiki'

export interface KnowledgeEntry {
  rel: string
  id?: string
  title: string
  group?: string
  tags?: string[]
  status?: string
  updated?: string
  type?: string
  score?: number
  /** wiki 卡在仓库内的相对路径（src/lib/store.js），未分组卡片/记忆为 null */
  path?: string | null
  /** 层级卡片所在层：project（总览）/ module（模块）/ file（文件）；老卡为 null */
  level?: 'project' | 'module' | 'file' | null
  /** 父卡 id（文件卡指向所属模块卡，模块卡指向总览卡）；平铺卡为 null */
  parent?: string | null
  /** wiki 卡指纹（内容哈希）与 AI 回填级别，供层级树角标 / 增量提示用 */
  analysisLevel?: string | null
}

export interface KnowledgeSection {
  key: SectionKey
  title: string
  count: number
  repos?: string[]
  entries: KnowledgeEntry[]
}

export interface KnowledgeTree {
  vaultPath: string
  sections: KnowledgeSection[]
}

// A full note returned by sectionGet: frontmatter fields + body + rel.
export interface KnowledgeDetail {
  rel: string
  id: string
  title: string
  body: string
  type?: string
  group?: string
  section: SectionKey
  [k: string]: unknown
}

export interface UpsertResult {
  rel: string
  id: string
  title: string
  group?: string
  updated?: string
  created?: boolean
}

// 一键沉淀任务（host `ingestProject` 创建、`ingestStatus` 轮询）。
// 阶段：scan（只读枚举）→ plan（AI 出总览/模块层级）→ enrich（逐文件回填）。
export interface IngestJob {
  jobId: string
  /** 'full' 全量扫盘 | 'diff' 仅扫描变更 */
  kind?: 'full' | 'diff'
  dir: string
  repo?: string | null
  repoName: string
  maxFiles: number
  depth?: number
  /** 本次使用的模型（null = 无 AI，仅骨架） */
  model?: ModelOption | null
  status: 'running' | 'paused' | 'done' | 'error' | 'cancelled'
  phase: 'scan' | 'plan' | 'enrich'
  paused?: boolean
  cancelled?: boolean
  pct: number
  done: number
  total: number
  current: string
  error?: string | null
  summary?: { repo: string; count: number; skipped?: number; failed?: number; overview?: number; modules?: number } | null
  // AI 回填阶段（网关逐文件直调宿主 llm，不再是放养的 agent 会话）。
  aiStatus?: 'none' | 'running' | 'done' | 'error' | 'unavailable'
  aiMessage?: string | null
  /** 层级卡计数：项目总览 / 模块 / 已回填文件 / 跳过 / 回退骨架 */
  overviewCount?: number
  moduleCount?: number
  enrichedCount?: number
  skippedCount?: number
  failedCount?: number
  /** diff 任务的结果摘要（仅扫描变更） */
  diff?: IngestDiff | null
  startedAt: number
  finishedAt: number | null
}

// 可选模型（host `listModels` → ctx.get('llm').listProviders()/listModels()）。
export interface ModelOption {
  provider: string
  model: string
  title?: string
  description?: string | null
}

export interface ModelCatalog {
  available: boolean
  models: ModelOption[]
  default?: ModelOption | null
}

// diff 摘要（host `rescanDiff` → changedSince）。
export interface IngestDiff {
  repo?: string | null
  added: string[]
  changed: string[]
  removed: string[]
  addedCount: number
  changedCount: number
  removedCount: number
  unchangedCount: number
  /** 未变更但仍是骨架（未回填）的张数——提示用户跑一次全量扫盘 */
  unenrichedCount?: number
  truncated?: boolean
  pruneSafe?: boolean
}

// 到期复习条目（host `due` → cards.due，SM-2 排期产物）。
export interface DueCard {
  rel: string
  title: string
  front?: string
  back?: string | null
  deck?: string | null
  due?: string | null
  interval?: number
  reps?: number
}

// 记忆晋升结果（host `promote` → memory.promote）。
export interface PromoteResult {
  file: string
  promoted: string
  scope?: string | null
  target: string
}

// 技能包导出结果（host `exportSkill` → cardian.exportSkill）。
export interface SkillExportResult {
  skill: string
  entries: number
}

// 整库 JSON 快照（host `exportJson` → sync.exportJson）。
export interface VaultSnapshot {
  format: string
  version: number
  exportedAt: string
  count: number
  notes: Array<{ rel: string; frontmatter: Record<string, unknown>; body: string }>
}

// DSH 已打开的工作区（来自 client 运行时共享的 `workspaces` 服务：
// ctx.get('workspaces').list.getSnapshot().items，实体 view 含
// { workspaceId, path, title, sessionIds, createdAt }）。
export interface WorkspaceItem {
  id: string
  path: string
  title?: string
}

interface ErrorPayload {
  ok: false
  error: { code?: string; message: string; suggestion?: string }
}

function isErrorPayload(v: unknown): v is ErrorPayload {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  return o.ok === false && typeof o.error === 'object' && o.error !== null
}

function isOkEnvelope(v: unknown): v is { ok: true; value: unknown } {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  return o.ok === true && 'value' in o
}

// ---------------------------------------------------------------------------
// Typert remote bridge (dsh-hub pattern), mirroring the host's src/typert.js.
// A loose codec satisfies the loader's structural check without shipping zod
// into the browser bundle; we never actually validate at the boundary.
// ---------------------------------------------------------------------------

function looseCodec() {
  return { mode: 'strict', typeSymbol: 'dsh-cardian/types#Json', schema: { parse: (v: unknown) => v } }
}

// Method set mirrors GATEWAY_METHODS in src/index.js.
const BRIDGE_METHODS = [
  'describe',
  'sectionList',
  'sectionGet',
  'sectionUpsert',
  'sectionRemove',
  'ingestProject',
  'ingestStatus',
  // AI 扫盘建库：模型目录 + 实时暂停/继续/停止 + diff 重扫。
  // （与 src/index.js GATEWAY_METHODS / src/typert.js invocations 同步。）
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
  // 治理动作与导出（与 src/index.js GATEWAY_METHODS / src/typert.js invocations 同步）。
  'promote',
  'due',
  'exportJson',
  'exportSkill',
] as const

type BridgeMethod = (typeof BRIDGE_METHODS)[number]

// Wire-parameter arity MUST mirror the host manifests (src/typert.js
// invocations and src/index.js CardianGateway method signatures). Most bridge
// methods take one wire named `params`, but a few read-only methods take NONE:
// `describe`, `status`, `doctor`, `schema`. For those the host's strict
// descriptor declares zero parameters, and BOTH arg-count guards reject a
// mismatch:
//   - client mounted face: `cardian/<method> expected N argument(s), got M`
//   - host strict validation: `args fields do not match the descriptor`
// So every zero-wire method must map to `parameters: []` client-side AND be
// invoked with no positional arguments (see callHost's params===undefined path).
const ZERO_WIRE_METHODS: readonly BridgeMethod[] = ['describe', 'status', 'doctor', 'schema']

function remoteFaceDescriptor() {
  return {
    package: 'dsh-cardian',
    descriptors: BRIDGE_METHODS.map((method) => ({
      id: `dsh-cardian#cardianRemote/${method}`,
      service: 'cardianRemote',
      namespace: 'cardian',
      method,
      invocation: { kind: 'direct' },
      parameters: ZERO_WIRE_METHODS.includes(method)
        ? []
        : [{ name: 'params', wire: 'params', source: 'json', codec: looseCodec() }],
      result: looseCodec(),
    })),
  }
}

type RemoteFace = Record<string, (params?: unknown) => Promise<unknown>>

const FACE_RETRY = { tries: 10, delay: 50 } // 10 x 50ms

export class KnowledgeController {
  private ctx: ClientContext
  private listeners = new Set<() => void>()
  private mountPromise: Promise<boolean>
  // face 首次解析成功的标记：只在第一次成功时打一条日志，避免每次调用刷屏。
  private faceResolvedOnce = false
  open = false

  constructor(ctx: ClientContext) {
    this.ctx = ctx
    // Mount the remote face exactly once; later calls reuse it.
    this.mountPromise = ctx.remote
      .$mount(remoteFaceDescriptor())
      .then(
        (dispose: unknown) => {
          if (typeof this.ctx.effect === 'function') {
            this.ctx.effect(() => dispose, 'dsh-cardian: remote face')
          }
          return true
        },
        (err: unknown) => {
          console.error('[cardian] remote face 挂载失败:', err)
          return false
        },
      )
  }

  // The face may register slightly after mount resolves; retry briefly.
  private async face(): Promise<RemoteFace> {
    const ok = await this.mountPromise
    if (!ok) throw new Error("cardian 远端网关未就绪")
    const cands: Array<[string, () => unknown]> = [
      ["remote.cardian", () => (this.ctx as unknown as Record<string, unknown>)?.remote?.["cardian"]],
      ["remote.cardianRemote", () => (this.ctx as unknown as Record<string, unknown>)?.remote?.["cardianRemote"]],
      ["get.cardianRemote", () => (this.ctx.get ? (this.ctx as unknown as { get(n: string): unknown }).get("cardianRemote") : undefined)],
      ["get.remote.cardian", () => (this.ctx.get ? (this.ctx as unknown as { get(n: string): unknown }).get("remote.cardian") : undefined)],
      ["get.remote.cardianRemote", () => (this.ctx.get ? (this.ctx as unknown as { get(n: string): unknown }).get("remote.cardianRemote") : undefined)],
    ]
    const remoteRoot = (this.ctx as unknown as Record<string, unknown>)?.remote as
      | Record<string, unknown>
      | undefined
    let lastDiag = ""
    for (let i = 0; i < FACE_RETRY.tries; i++) {
      for (const [name, getter] of cands) {
        try {
          const face = getter() as RemoteFace | undefined
          if (face && (typeof face === "object" || typeof face === "function")) {
            if (!this.faceResolvedOnce) {
              console.log("[cardian] 远端网关解析成功 via " + name)
              this.faceResolvedOnce = true
            }
            return face
          }
          if (name === "remote.cardian" && face) {
            lastDiag = "已返回对象但形状不符: keys=" + Object.keys(face).join(",")
          }
        } catch {}
      }
      lastDiag = "remoteRoot=" + (remoteRoot ? "keys=" + Object.keys(remoteRoot).join(",") : String(remoteRoot))
      await new Promise((r) => setTimeout(r, FACE_RETRY.delay))
    }
    throw new Error(
      "[cardian] 远端网关不可达。候选路径=" + cands.map((c2) => c2[0]).join("/") + ";最后诊断=" + lastDiag)
  }

  private async callHost<T>(method: BridgeMethod, params?: Record<string, unknown>): Promise<T> {
    const face = await this.face()
    let result: unknown
    try {
      // Zero-wire methods (see ZERO_WIRE_METHODS: describe/status/doctor/schema)
      // must be invoked with NO positional argument — passing an empty object
      // would trip both the client-side arg-count assert (`expected 0
      // argument(s), got 1`) and the host's strict args validation. Callers of
      // those methods omit `params`; every other method passes one object.
      //
      // ⚠️ 必须 await：face[method]() 返回 Promise（resolve 成 RPC 信封
      // `{ok:true,value}` / `{ok:false,error}`）。不 await 的话信封检查
      // isErrorPayload/isOkEnvelope 拿到的只是 Promise 对象，全部落空，
      // 调用方拿到整包信封 → `.entries`/`.sections` 全是 undefined →
      // 渲染期 `entries.map` 崩溃。等值判断必须在 await 之后。
      result = params === undefined ? await face[method]() : await face[method](params)
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : String(err))
    }
    if (isErrorPayload(result)) {
      const e = new Error(result.error.message ?? 'cardian 调用失败')
      ;(e as Error & { code?: string }).code = result.error.code
      ;(e as Error & { suggestion?: string }).suggestion = result.error.suggestion
      throw e
    }
    if (isOkEnvelope(result)) return result.value as T
    return result as T
  }

  // Minimal pub/sub so the trigger and panel share the open/close signal
  // without a heavier store.
  subscribe(fn: () => void) {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  emit() {
    for (const fn of this.listeners) fn()
  }

  describe(): Promise<KnowledgeTree> {
    return this.callHost<KnowledgeTree>('describe')
  }

  // ---- Section bridge (one params object per host call) -------------------

  sectionList(
    key: SectionKey,
    filters: { query?: string; group?: string; tag?: string; status?: string } = {},
  ): Promise<KnowledgeSection> {
    return this.callHost<KnowledgeSection>('sectionList', { key, ...filters })
  }

  sectionGet(key: SectionKey, ref: string, group?: string): Promise<KnowledgeDetail | null> {
    return this.callHost<KnowledgeDetail | null>('sectionGet', { key, ref, group })
  }

  sectionUpsert(key: SectionKey, args: Record<string, unknown>): Promise<UpsertResult> {
    return this.callHost<UpsertResult>('sectionUpsert', { key, args })
  }

  sectionRemove(key: SectionKey, ref: string, group?: string): Promise<boolean> {
    return this.callHost<boolean>('sectionRemove', { key, ref, group })
  }

  async getStatus() {
    return this.callHost<Record<string, unknown>>('status')
  }

  async tagCloud() {
    return this.callHost<Array<{ tag: string; count: number }>>('tagCloud', {})
  }

  async backlinks(ref: string) {
    return this.callHost<Array<{ path: string; title?: string }>>('backlinks', { ref })
  }

  async related(ref: string) {
    return this.callHost<Array<{ path: string; title?: string }>>('related', { ref })
  }

  async graph(repo: string | null) {
    if (!repo) return null
    return this.callHost<{ nodes: unknown[]; edges: Array<{ from: string; to: string }> }>('graph', { repo })
  }

  async getDoctor() {
    return this.callHost<{ healthy: boolean; problems: Array<{ level: string; issue: string }> }>('doctor')
  }

  async getSchema() {
    return this.callHost<Array<{ field: string; types: string[] }>>('schema')
  }

  async crossSearch(query: string) {
    return this.callHost<KnowledgeEntry[]>('search', { query })
  }

  // ---- Project ingest bridge -------------------------------------------------

  ingestProject(options: {
    dir: string
    repoName?: string
    maxFiles?: number
    model?: ModelOption | { provider: string; model: string } | string | null
    depth?: number
    ai?: boolean
  }): Promise<IngestJob> {
    return this.callHost('ingestProject', options)
  }

  // ingestStatus 在清单里非 describe（parameters=['params']），客户端必须传 1
  // 个位置参数（{} 即可）；host 方法签名无参、忽略该值。
  ingestStatus(): Promise<{ jobs: IngestJob[] }> {
    return this.callHost('ingestStatus', {})
  }

  // ---- AI 扫盘控制桥 -----------------------------------------------------
  // 同样都是 parameters=['params']：调用点必须递一个对象，否则 face 报
  // `expected 1 argument(s), got 0`。

  // 模型目录（扫描向导下拉）：宿主无 llm 服务时 available=false。
  listModels(): Promise<ModelCatalog> {
    return this.callHost<ModelCatalog>('listModels', {})
  }

  /** 暂停扫盘：中断在途模型调用，已完成卡片保留。 */
  pauseIngest(jobId: string): Promise<IngestJob> {
    return this.callHost<IngestJob>('pauseIngest', { jobId })
  }

  /** 继续扫盘：只处理剩余未回填项（幂等）。 */
  resumeIngest(jobId: string): Promise<IngestJob> {
    return this.callHost<IngestJob>('resumeIngest', { jobId })
  }

  /** 停止扫盘：不再处理剩余项（已落盘卡片保留）。 */
  cancelIngest(jobId: string): Promise<IngestJob> {
    return this.callHost<IngestJob>('cancelIngest', { jobId })
  }

  /** 仅扫描变更：added/changed 走 AI 回填，removed 剪孤儿卡。 */
  rescanDiff(options: {
    dir: string
    repoName?: string
    maxFiles?: number
    model?: ModelOption | { provider: string; model: string } | string | null
  }): Promise<IngestJob> {
    return this.callHost<IngestJob>('rescanDiff', options)
  }

  // ---- 治理动作 / 导出桥 -----------------------------------------------
  // 以下四个方法在清单里都是 parameters=['params']（非零 wire），所以调用点
  // 必须传一个对象，否则 mounted face 报 `cardian/<method> expected 1
  // argument(s), got 0`。

  // 把一条记忆晋升为仓库根说明（shared → PROJECT.md，local → PERSONAL.md）。
  promote(ref: string, target: 'shared' | 'local' = 'shared'): Promise<PromoteResult> {
    return this.callHost<PromoteResult>('promote', { ref, target })
  }

  // 到期需复习的闪卡列表（可按牌组过滤）。
  due(deck?: string): Promise<DueCard[]> {
    return this.callHost<DueCard[]>('due', deck ? { deck } : {})
  }

  // 整库导出（JSON 快照，备份/迁移用）：宿主 exportJson() 忽略该 params。
  exportVault(): Promise<VaultSnapshot> {
    return this.callHost<VaultSnapshot>('exportJson', {})
  }

  // 分层导出：把圈定的一批知识打包成 Skills/<name>/SKILL.md + notes/ 副本。
  exportSkill(options: {
    name: string
    description?: string
    refs?: string[]
    section?: SectionKey
    group?: string
    limit?: number
  }): Promise<SkillExportResult> {
    return this.callHost<SkillExportResult>('exportSkill', options)
  }

  // 读取 DSH 当前已打开的工作区列表（client 运行时共享服务，无需过网关）。
  // 拿不到服务/快照时返回空数组，绝不抛错。
  listWorkspaces(): WorkspaceItem[] {
    try {
      const ws = this.ctx.get('workspaces')
      const snap = ws?.list?.getSnapshot?.()
      const items = Array.isArray(snap?.items) ? snap.items : []
      const out: WorkspaceItem[] = []
      for (const it of items) {
        let view: unknown
        try {
          view = typeof it?.getSnapshot === 'function' ? it.getSnapshot()?.view : it
        } catch {
          view = it
        }
        if (typeof view !== 'object' || view === null) continue
        const v = view as { workspaceId?: unknown; id?: unknown; path?: unknown; title?: unknown }
        if (typeof v.path !== 'string') continue
        out.push({
          id: String(v.workspaceId ?? v.id ?? ''),
          path: v.path,
          title: typeof v.title === 'string' ? v.title : undefined,
        })
      }
      return out
    } catch (err) {
      console.warn('[cardian] 读取工作区列表失败:', err)
      return []
    }
  }

  // Props injected into the two rendered components (owner props such as the
  // footer action's `wide` arrive separately from the slot owner).
  triggerProps() {
    return { controller: this }
  }

  panelProps() {
    return { controller: this }
  }
}