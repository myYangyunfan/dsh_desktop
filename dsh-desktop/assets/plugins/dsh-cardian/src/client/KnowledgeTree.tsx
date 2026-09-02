// "知识中心" (Knowledge Center) surface for the dsh web client.
//
// 版式对标 Qoder Quest 知识中心：顶栏 + 左侧导航栏（分区导航 / 搜索 /
// 知识树 / 深度洞察）+ 右侧内容区（总览 / 详情 / 编辑 / 洞察）。浏览、检索、
// 详情、创建、编辑、删除、工作区沉淀、深度洞察全部保留，数据链路仍走
// KnowledgeController → typert 网关，宿主契约不变。
//
// 面板对 DSH 的两个槽位贡献（都是 list 槽，纯增量、不替换既有入口）：
//   1. `sidebar.footer.action` — 侧边栏底部触发钮（左下角）。
//   2. `shell.overlay`         — 覆盖中间对话列的全幅面板（精确占位见几何 effect）。

import { Component, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import {
  KnowledgeController,
  type KnowledgeEntry,
  type KnowledgeDetail,
  type IngestJob,
  type ModelCatalog,
  type WorkspaceItem,
} from './controller'
import { CARDian_CSS } from './styles'
import { Icon, Markdown, type IconName } from './ui'

type SectionKey = 'cards' | 'memory' | 'wiki'
type InsightKey = 'status' | 'tagCloud' | 'graph' | 'doctor'

interface SectionMeta {
  key: SectionKey
  label: string
  icon: IconName
}

const SECTIONS: SectionMeta[] = [
  { key: 'cards', label: '知识卡片', icon: 'cards' },
  { key: 'memory', label: '记忆', icon: 'memory' },
  { key: 'wiki', label: 'RepoWiki', icon: 'wiki' },
]

const SECTION_TITLES: Record<SectionKey, string> = { cards: '知识卡片', memory: '记忆', wiki: 'RepoWiki' }

const INSIGHTS: Array<{ key: InsightKey; label: string; icon: IconName }> = [
  { key: 'status', label: '状态总览', icon: 'status' },
  { key: 'tagCloud', label: '标签洞察', icon: 'tag' },
  { key: 'graph', label: '依赖图谱', icon: 'graph' },
  { key: 'doctor', label: '健康检查', icon: 'doctor' },
]

// ---------- Sidebar foot trigger ----------

export interface KnowledgeTreeTriggerProps {
  controller: KnowledgeController
  wide: boolean
}

export function KnowledgeTreeTrigger({ controller, wide }: KnowledgeTreeTriggerProps) {
  // Re-render when the panel opens/closes so `data-on`（激活高亮）跟得上状态。
  const [, force] = useState(0)
  useEffect(() => controller.subscribe(() => force((n) => n + 1)), [controller])

  const onToggle = useCallback(() => {
    controller.open = !controller.open
    controller.emit()
  }, [controller])

  // 样式与同槽位（sidebar.footer.action）的其它按钮一致：
  // 宽态 = 整行图标+文字按钮，rail 态 = 36×36 圆形图标钮（同设置/侧会话钮）。
  return (
    <button
      type="button"
      className="cardian-kt-trigger"
      data-rail={wide ? '0' : '1'}
      data-on={controller.open ? '1' : '0'}
      onClick={onToggle}
      aria-label="知识中心"
      aria-haspopup="dialog"
      aria-expanded={controller.open}
      title="知识中心"
    >
      <Icon name="knowledge" size={wide ? 15 : 17} />
      {wide && <span className="cardian-kt-trigger-label">知识中心</span>}
    </button>
  )
}

// ---------- 表单字段定义 ----------

interface FieldDef {
  name: string
  label: string
  type: 'text' | 'textarea' | 'select' | 'number'
  required?: boolean
  placeholder?: string
  hint?: string
  options?: string[]
  wide?: boolean // 表单网格里占整行
}

const SECTION_FIELDS: Record<SectionKey, FieldDef[]> = {
  cards: [
    { name: 'title', label: '标题', type: 'text', required: true, placeholder: '给这条知识起个名字', wide: true },
    { name: 'content', label: '正文', type: 'textarea', required: true, placeholder: '支持 Markdown：标题 / 列表 / 代码块 / [[双向链接]]…', wide: true },
    {
      name: 'cardType',
      label: '卡片类型',
      type: 'select',
      options: ['overview', 'tech stack', 'convention', 'setup & commands'],
      hint: '机读分类（Agent 消费结构化上下文用）',
    },
    { name: 'category', label: '分类', type: 'text', placeholder: 'general' },
    { name: 'tags', label: '标签', type: 'text', hint: '逗号分隔' },
    { name: 'status', label: '状态', type: 'select', options: ['published', 'draft'] },
    { name: 'source', label: '来源', type: 'text' },
    { name: 'confidence', label: '置信度 0-1', type: 'number' },
    { name: 'summary', label: '摘要', type: 'textarea', wide: true },
    { name: 'aliases', label: '别名', type: 'text', hint: '逗号分隔' },
    { name: 'front', label: '闪卡正面', type: 'textarea', hint: '填写后成为可复习的闪卡' },
    { name: 'back', label: '闪卡背面', type: 'textarea' },
    { name: 'deck', label: '闪卡牌组', type: 'text' },
    { name: 'as_of', label: '事实截止日期', type: 'text', placeholder: 'YYYY-MM-DD' },
    { name: 'expires', label: '过期日期', type: 'text', placeholder: 'YYYY-MM-DD' },
  ],
  memory: [
    { name: 'title', label: '标题', type: 'text', required: true, placeholder: '这条记忆的主题', wide: true },
    { name: 'content', label: '内容', type: 'textarea', required: true, placeholder: 'Markdown 内容…', wide: true },
    { name: 'scope', label: '作用域', type: 'text', hint: '留空默认 global' },
    { name: 'kind', label: '类型', type: 'select', options: ['semantic', 'episodic', 'procedural'] },
    { name: 'importance', label: '重要度 1-5', type: 'number' },
    { name: 'tags', label: '标签', type: 'text', hint: '逗号分隔' },
    { name: 'facts', label: '关键事实', type: 'textarea', hint: '每行一条', wide: true },
    { name: 'status', label: '状态', type: 'select', options: ['published', 'draft'] },
    { name: 'confidence', label: '置信度 0-1', type: 'number' },
    { name: 'summary', label: '摘要', type: 'textarea', wide: true },
    { name: 'aliases', label: '别名', type: 'text' },
    { name: 'as_of', label: '事实截止日期', type: 'text', placeholder: 'YYYY-MM-DD' },
    { name: 'expires', label: '过期日期', type: 'text', placeholder: 'YYYY-MM-DD' },
  ],
  wiki: [
    { name: 'repo', label: '仓库', type: 'text', required: true, placeholder: '仓库名（slug）' },
    { name: 'path', label: '文件路径', type: 'text', required: true, placeholder: 'src/lib/store.js' },
    { name: 'title', label: '标题', type: 'text', hint: '默认同文件路径', wide: true },
    { name: 'content', label: '内容', type: 'textarea', required: true, placeholder: '该文件的语义化描述…', wide: true },
    { name: 'language', label: '语言', type: 'text' },
    { name: 'tags', label: '标签', type: 'text', hint: '逗号分隔' },
    { name: 'status', label: '状态', type: 'select', options: ['published', 'draft'] },
    { name: 'confidence', label: '置信度 0-1', type: 'number' },
    { name: 'summary', label: '摘要', type: 'textarea', wide: true },
    { name: 'aliases', label: '别名', type: 'text' },
    { name: 'as_of', label: '事实截止日期', type: 'text', placeholder: 'YYYY-MM-DD' },
    { name: 'expires', label: '过期日期', type: 'text', placeholder: 'YYYY-MM-DD' },
  ],
}

// ---------- 内容区状态机 ----------

type Content =
  | { kind: 'overview' }
  | { kind: 'detail'; key: SectionKey; entry: KnowledgeEntry; note: KnowledgeDetail | null; highlight: string }
  | { kind: 'form'; key: SectionKey; entry: KnowledgeEntry | null } // entry null → create
  | { kind: 'insight'; insight: InsightKey }

interface RefHit {
  path: string
  title?: string
  type?: string
  relation?: string
}

function msg(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

function fmtDate(s: unknown): string {
  return String(s ?? '').slice(0, 10)
}

// 相关条目 rel 路径 → 所属分区（vault 三大目录：Cards/ Memory/ Repos/）。
function sectionOfRel(rel: unknown): SectionKey | null {
  const p = String(rel ?? '').toLowerCase()
  if (p.startsWith('cards/')) return 'cards'
  if (p.startsWith('memory/')) return 'memory'
  if (p.startsWith('repos/')) return 'wiki'
  return null
}

// Internal error boundary. The shell wraps every slot entry in its own
// boundary that — on a render crash — RETIRES the entry for the whole session
// ("abdicate"): the exact "click once, flickers, then clicks do nothing"
// symptom. Catch the error HERE instead and show an inline banner so the entry
// survives and the failure is visible instead of silent.
export class PanelBoundary extends Component<
  { children: ReactNode; onClose?: () => void },
  { error: string | null; stack?: string }
> {
  state: { error: string | null; stack?: string } = { error: null }

  static getDerivedStateFromError(err: unknown): { error: string | null; stack?: string } {
    return {
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    }
  }

  componentDidCatch(err: unknown) {
    console.error('[cardian] 面板渲染异常（已拦截，槽入口保留）:', err)
  }

  render() {
    if (this.state.error !== null) {
      return (
        <div className="cardian-kt-crash" role="alert">
          <p className="cardian-kt-crash-title">
            <Icon name="alert" size={16} /> 知识中心面板渲染出错
          </p>
          <pre className="cardian-kt-crash-text">
            {this.state.error}
            {this.state.stack ? `\n\n${this.state.stack}` : ''}
          </pre>
          <div className="cardian-kt-crash-actions">
            <button type="button" className="cardian-kt-btn cardian-kt-btn--primary" onClick={() => this.setState({ error: null })}>
              重试
            </button>
            {this.props.onClose && (
              <button type="button" className="cardian-kt-btn" onClick={this.props.onClose}>
                关闭面板
              </button>
            )}
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

// Registration-safe wrapper: PanelBoundary wraps the panel so a render crash
// inside it cannot abdicate the shell.overlay entry.
export function KnowledgeTreePanelSafe({ controller }: { controller: KnowledgeController }) {
  return (
    <PanelBoundary
      onClose={() => {
        controller.open = false
        controller.emit()
      }}
    >
      <KnowledgeTreePanel controller={controller} />
    </PanelBoundary>
  )
}

// Windows 路径比较忽略大小写（realpath 规范化后仍可能有盘符大小写差异）。
function sameDir(a: string, b: string): boolean {
  if (!a || !b) return false
  return a === b || a.toLowerCase() === b.toLowerCase()
}

// 从绝对路径取最后一段做显示名兜底。
function titleFromPath(p: string): string {
  const parts = p.split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] ?? p
}

function splitList(s: string): string[] {
  return s
    .split(/[,，、\n]/)
    .map((x) => x.trim())
    .filter(Boolean)
}

// 类型筛选键：cards 按 cardType、memory 按 kind、wiki 无子类型（恒 untyped →
// 分布单一，筛选 chips 自动隐藏）。KnowledgeEntry 未声明 cardType/kind，这里
// 走 unknown 断言读取（与周边既有 e.cardType 用法一致，esbuild 不做类型检查）。
function typeKeyOf(e: KnowledgeEntry, key: SectionKey): string {
  const rec = e as unknown as Record<string, unknown>
  if (key === 'memory') return String(rec.kind ?? 'untyped')
  return String(rec.cardType ?? 'untyped')
}

// ---------- AI 扫盘进卡（分阶段进度 + 实时暂停/继续/停止）----------
const INGEST_STAGES: Array<{ key: 'scan' | 'plan' | 'enrich'; label: string }> = [
  { key: 'scan', label: '① 扫描文件' },
  { key: 'plan', label: '② 规划层级' },
  { key: 'enrich', label: '③ 逐文件回填' },
]

/** 阶段状态：前面的阶段已完成，当前阶段进行中（暂停时仍标进行中）。 */
export function stageStateOf(job: IngestJob, stage: 'scan' | 'plan' | 'enrich'): 'done' | 'active' | 'pending' {
  const order = ['scan', 'plan', 'enrich']
  if (job.status === 'done') return 'done'
  const cur = order.indexOf(job.phase ?? 'scan')
  const at = order.indexOf(stage)
  if (at < cur) return 'done'
  if (at === cur) return 'active'
  return 'pending'
}

function jobStatusText(job: IngestJob): string {
  if (job.status === 'paused') return '已暂停'
  if (job.status === 'cancelled') return '已停止'
  if (job.status === 'error') return '失败'
  if (job.status === 'running') return `${job.pct}%`
  return '完成'
}

interface ScanProgressProps {
  job: IngestJob
  busy: boolean
  onView: (repoName: string) => void
  onControl: (op: 'pause' | 'resume' | 'cancel', jobId: string) => void
  onRescan: (dir: string, repoName: string) => void
}

// 一张扫盘任务的进度卡：总进度条 + 三段阶段标记 + 当前文件 + 层级计数 +
// 控制按钮（running → 暂停；paused → 继续/停止；done → 查看项目/再扫变更）。
function ScanProgress({ job, busy, onView, onControl, onRescan }: ScanProgressProps) {
  const pct = Math.min(100, Math.max(0, Number(job.pct) || 0))
  const live = job.status === 'running' || job.status === 'paused'
  const diff = job.diff
  return (
    <div className={`cardian-kt-scanprog cardian-kt-scanprog--${job.status}`}>
      <div className="cardian-kt-scanprog-head">
        <span className="cardian-kt-scanprog-title">
          <Icon name={job.kind === 'diff' ? 'diff' : 'sparkle'} size={13} />
          {job.kind === 'diff' ? '增量扫描' : 'AI 扫盘'} · {job.repoName}
        </span>
        <span className="cardian-kt-scanprog-state">
          {jobStatusText(job)}
          {job.model ? ` · ${job.model.provider}/${job.model.model}` : ' · 仅骨架'}
        </span>
      </div>
      <div className="cardian-kt-bar">
        <div className="cardian-kt-bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="cardian-kt-stages">
        {INGEST_STAGES.map((s) => (
          <span key={s.key} className={`cardian-kt-stage cardian-kt-stage--${stageStateOf(job, s.key)}`}>
            {s.label}
          </span>
        ))}
      </div>
      <p className="cardian-kt-scanprog-cur" title={job.current}>
        {job.current || job.error || '…'}
      </p>
      <div className="cardian-kt-scanprog-stats">
        <span>总览 {job.overviewCount ?? 0}</span>
        <span>模块 {job.moduleCount ?? 0}</span>
        <span>已回填 {job.enrichedCount ?? 0}</span>
        <span>跳过 {job.skippedCount ?? 0}</span>
        {Number(job.failedCount) > 0 && <span>回退骨架 {job.failedCount}</span>}
        <span>
          进度 {job.done}/{job.total}
        </span>
      </div>
      {diff && (
        <p className="cardian-kt-scanprog-diff">
          新增 {diff.addedCount} · 变更 {diff.changedCount} · 删除 {diff.removedCount} · 未变更 {diff.unchangedCount}
          {diff.truncated ? '（清单触顶，不剪孤儿卡）' : ''}
          {(diff.unenrichedCount ?? 0) > 0 ? `· ${diff.unenrichedCount} 张仍是骨架，可跑一次全量扫盘` : ''}
        </p>
      )}
      {job.aiMessage && <p className="cardian-kt-scanprog-note">{job.aiMessage}</p>}
      {job.error && <p className="cardian-kt-scanprog-error">{job.error}</p>}
      <div className="cardian-kt-scanprog-actions">
        {job.status === 'running' && (
          <button type="button" className="cardian-kt-ws-action" disabled={busy} onClick={() => onControl('pause', job.jobId)}>
            <Icon name="pause" size={11} /> 暂停
          </button>
        )}
        {job.status === 'paused' && (
          <button type="button" className="cardian-kt-ws-action" disabled={busy} onClick={() => onControl('resume', job.jobId)}>
            <Icon name="play" size={11} /> 继续
          </button>
        )}
        {live && (
          <button type="button" className="cardian-kt-ws-action cardian-kt-ws-action--danger" disabled={busy} onClick={() => onControl('cancel', job.jobId)}>
            <Icon name="stop" size={11} /> 停止
          </button>
        )}
        {job.status === 'done' && (
          <button type="button" className="cardian-kt-ws-action" onClick={() => onView(job.repoName)}>
            <Icon name="repo" size={11} /> 查看项目
          </button>
        )}
        {job.status !== 'running' && job.status !== 'paused' && (
          <button type="button" className="cardian-kt-ws-action" disabled={busy} onClick={() => onRescan(job.dir, job.repoName)}>
            <Icon name="diff" size={11} /> 再扫变更
          </button>
        )}
      </div>
    </div>
  )
}

// ---------- 知识树 ----------
// 结构：group（cards=category / memory=scope / wiki=repo 项目）→
// 层级卡（wiki 专属：AI 扫盘的 项目总览 → 模块 → 文件，按 frontmatter.parent
// 组装；无层级线索时回退按 path 段拆的目录树）→ 文件条目。
// 点击 group/模块/目录节点展开/收起，带卡片的节点右侧有「打开」小钮。
interface TreeNode {
  key: string
  label: string
  kind: 'group' | 'dir' | 'file' | 'module' | 'overview'
  entry?: KnowledgeEntry
  children: TreeNode[]
}

// 卡片属于哪一层：优先看 frontmatter.level，兼容老卡的 __OVERVIEW__ /
// __MODULE__/ 路径约定；都没命中的一律当文件卡。
function cardLevelOf(e: KnowledgeEntry): 'project' | 'module' | 'file' {
  const p = String(e.path ?? '')
  if (e.level === 'project' || p === '__OVERVIEW__') return 'project'
  if (e.level === 'module' || p.startsWith('__MODULE__')) return 'module'
  return 'file'
}

// wiki 文件节点显示名：骨架卡 title 就是完整路径 → 用 basename；语义回填过
// 的卡 title 已是凝练名（如「AudioEngine（双播放器）」）→ 直接用 title。
function fileLabel(entry: KnowledgeEntry, fallbackBase = ''): string {
  const t = entry.title ?? ''
  const p = entry.path ?? ''
  if (t && t !== p) return t
  return fallbackBase || titleFromPath(p) || t || '(无标题)'
}

const TREE_KIND_RANK: Record<TreeNode['kind'], number> = { group: 0, overview: 0, module: 1, dir: 2, file: 3 }

function sortTree(node: TreeNode) {
  node.children.sort((a, b) => {
    const ra = TREE_KIND_RANK[a.kind]
    const rb = TREE_KIND_RANK[b.kind]
    if (ra !== rb) return ra - rb
    return a.label.localeCompare(b.label)
  })
  for (const c of node.children) sortTree(c)
}

// 按 frontmatter.parent 组装「项目总览 → 模块 → 文件」层级树。整批都没有
// 层级线索（老数据 / 纯静态骨架扫描）→ 返回 null，由调用方回退目录树。
function buildWikiLevelTree(list: KnowledgeEntry[], g: string): TreeNode[] | null {
  const nodes = new Map<string, TreeNode>()
  let hasHierarchy = false
  for (const e of list) {
    const lvl = cardLevelOf(e)
    if (e.parent || lvl !== 'file') hasHierarchy = true
    const id = String(e.id ?? e.rel ?? '')
    if (!id) continue
    nodes.set(id, {
      key: `h:${g}:${id}`,
      label: lvl === 'file' ? fileLabel(e) : e.title || '(无标题)',
      kind: lvl === 'project' ? 'overview' : lvl === 'module' ? 'module' : 'file',
      entry: e,
      children: [],
    })
  }
  if (!hasHierarchy) return null
  const buckets: TreeNode[] = []
  for (const e of list) {
    const id = String(e.id ?? e.rel ?? '')
    const node = nodes.get(id)
    if (!node) continue
    const parent = e.parent ? nodes.get(String(e.parent)) : undefined
    if (parent && parent !== node) parent.children.push(node)
    else buckets.push(node)
  }
  // 未归入任何模块的文件挂到总览卡下（与 core/repowiki.js 的归属规则一致），
  // 多个总览卡（重复扫盘产物）时只挂第一个，其余当普通节点展示。
  const root = buckets.find((n) => n.kind === 'overview')
  if (root) {
    const rest: TreeNode[] = []
    for (const n of buckets) {
      if (n === root || n.kind === 'module' || n.kind === 'overview') rest.push(n)
      else root.children.push(n)
    }
    buckets.length = 0
    buckets.push(...rest, root)
  }
  buckets.sort((a, b) => TREE_KIND_RANK[a.kind] - TREE_KIND_RANK[b.kind] || a.label.localeCompare(b.label))
  return buckets
}

// 把一节条目组装成树。wiki 按 path 前段生成目录层级；cards/memory 只有
// group 一层（点击项目展开看条目）。
function buildTree(entries: KnowledgeEntry[], key: SectionKey): TreeNode[] {
  const byGroup = new Map<string, KnowledgeEntry[]>()
  for (const e of entries ?? []) {
    const g = e.group ?? '未分组'
    const list = byGroup.get(g) ?? []
    list.push(e)
    byGroup.set(g, list)
  }
  const out: TreeNode[] = []
  for (const [g, list] of [...byGroup.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const children: TreeNode[] = []
    if (key === 'wiki') {
      const hierarchical = buildWikiLevelTree(list, g)
      if (hierarchical) {
        for (const node of hierarchical) sortTree(node)
        children.push(...hierarchical)
      } else {
      // path（如 src/lib/store.js）→ src > lib > store.js
      const dirs = new Map<string, TreeNode>()
      const sorted = [...list].sort((a, b) => (a.path ?? '').localeCompare(b.path ?? ''))
      for (const entry of sorted) {
        const segs = (entry.path ?? '').split('/').filter(Boolean)
        if (segs.length <= 1) {
          children.push({ key: `g:${g}:f:${entry.id ?? entry.rel}`, label: fileLabel(entry, segs[0]), kind: 'file', entry, children: [] })
          continue
        }
        let parent = children
        let acc = ''
        for (let i = 0; i < segs.length - 1; i++) {
          acc = acc ? `${acc}/${segs[i]}` : segs[i]
          const dk = `d:${g}:${acc}`
          let node = dirs.get(dk)
          if (!node) {
            node = { key: dk, label: segs[i], kind: 'dir', children: [] }
            dirs.set(dk, node)
            parent.push(node)
          }
          parent = node.children
        }
        parent.push({
          key: `g:${g}:f:${entry.id ?? entry.rel}`,
          label: fileLabel(entry, segs[segs.length - 1]),
          kind: 'file',
          entry,
          children: [],
        })
      }
      }
    } else {
      for (const entry of list) {
        children.push({ key: `g:${g}:f:${entry.id ?? entry.rel}`, label: entry.title ?? '(无标题)', kind: 'file', entry, children: [] })
      }
    }
    const groupNode: TreeNode = { key: `g:${g}`, label: g, kind: 'group', children }
    sortTree(groupNode)
    out.push(groupNode)
  }
  return out
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function countMatches(text: string, term: string): number {
  if (!term) return 0
  return text.split(new RegExp(escapeRegExp(term), 'gi')).length - 1
}

// 树节点标题的命中高亮（搜索结果里的关键词标黄）。
function highlightTitle(text: string, term: string): ReactNode {
  if (!term) return text
  const parts = text.split(new RegExp(`(${escapeRegExp(term)})`, 'gi'))
  return parts.map((p, i) =>
    p.toLowerCase() === term.toLowerCase() ? (
      <mark key={i} className="kt-md-mark">
        {p}
      </mark>
    ) : (
      p
    ),
  )
}

function pickDefined(form: Record<string, string>, keys: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const k of keys) {
    const v = form[k]
    if (v !== undefined && v !== '') out[k] = v
  }
  return out
}

function buildArgs(key: SectionKey, form: Record<string, string>): Record<string, unknown> {
  const args: Record<string, unknown> = {
    title: (form.title ?? '').trim(),
    content: form.content ?? '',
  }
  if (key === 'cards') {
    Object.assign(args, pickDefined(form, ['cardType', 'category', 'source', 'summary', 'front', 'back', 'deck', 'as_of', 'expires']))
    if (form.status) args.status = form.status
  } else if (key === 'memory') {
    Object.assign(args, pickDefined(form, ['scope', 'kind', 'summary', 'as_of', 'expires']))
    if (form.status) args.status = form.status
    if (form.facts) args.facts = splitList(form.facts)
    if (form.importance !== '') {
      const n = Math.round(Number(form.importance))
      if (Number.isFinite(n)) args.importance = Math.min(5, Math.max(1, n))
    }
  } else {
    Object.assign(args, pickDefined(form, ['repo', 'path', 'title', 'language', 'summary', 'as_of', 'expires']))
    if (form.status) args.status = form.status
  }
  if (form.tags) args.tags = splitList(form.tags)
  if (form.aliases) args.aliases = splitList(form.aliases)
  if (form.confidence !== '') {
    const n = Number(form.confidence)
    if (Number.isFinite(n)) args.confidence = Math.min(1, Math.max(0, n))
  }
  return args
}

function toForm(key: SectionKey, note: KnowledgeDetail | null): Record<string, string> {
  if (!note) return {}
  const join = (v: unknown) => (Array.isArray(v) ? v.map(String).join(', ') : v != null ? String(v) : '')
  return {
    title: String(note.title ?? ''),
    content: String(note.body ?? '').replace(/\n+$/, ''),
    ...(key === 'cards'
      ? {
          category: join(note.category ?? note.group),
          cardType: join(note.cardType),
          source: join(note.source),
          front: join(note.front),
          back: join(note.back),
          deck: join(note.deck),
        }
      : key === 'memory'
        ? {
            scope: join(note.scope ?? note.group),
            kind: join(note.kind),
            importance: note.importance != null ? String(note.importance) : '',
            facts: Array.isArray(note.facts) ? note.facts.map(String).join('\n') : '',
          }
        : {
            repo: join(note.repo ?? note.group),
            path: join(note.path),
            language: join(note.language),
          }),
    tags: join(note.tags),
    status: join(note.status),
    confidence: note.confidence != null ? String(note.confidence) : '',
    summary: join(note.summary),
    aliases: join(note.aliases),
    as_of: join(note.as_of),
    expires: join(note.expires),
  }
}

// ---------- 依赖图谱：纯 SVG 力导向可视化 ----------
// 零 npm 依赖（硬约束）：节点斥力 + 边弹簧 + 向心力的简化模拟，在 useMemo 里
// 跑固定步数（确定性播种，不引第三方布局库），收敛后归一化铺满 viewBox。
// 悬停高亮邻接子图、点击节点回抛给调用方定位到对应条目。
interface GraphNode {
  path: string
  title?: string
  degree?: number
}
interface GraphEdge {
  from: string
  to: string
}

function GraphView({
  nodes,
  edges,
  onSelect,
}: {
  nodes: GraphNode[]
  edges: GraphEdge[]
  onSelect?: (node: GraphNode) => void
}) {
  const [hover, setHover] = useState<string | null>(null)

  // 去重节点 + 只保留两端都存在的边 + 统计度数（决定节点半径）。
  const { vnodes, vedges, adjacency } = useMemo(() => {
    const seen = new Map<string, GraphNode>()
    for (const n of nodes ?? []) {
      const p = String(n?.path ?? '')
      if (p && !seen.has(p)) seen.set(p, { path: p, title: n?.title, degree: 0 })
    }
    const ve: GraphEdge[] = []
    const adj = new Map<string, Set<string>>()
    for (const e of edges ?? []) {
      const f = String(e?.from ?? '')
      const t = String(e?.to ?? '')
      if (!seen.has(f) || !seen.has(t) || f === t) continue
      ve.push({ from: f, to: t })
      const fn = seen.get(f)!
      const tn = seen.get(t)!
      fn.degree = (fn.degree ?? 0) + 1
      tn.degree = (tn.degree ?? 0) + 1
      ;(adj.get(f) ?? new Set<string>()).add(t)
      ;(adj.get(t) ?? new Set<string>()).add(f)
      adj.set(f, adj.get(f)!)
      adj.set(t, adj.get(t)!)
    }
    return { vnodes: [...seen.values()], vedges: ve, adjacency: adj }
  }, [nodes, edges])

  // 力导向布局：环形播种 → 迭代斥力/弹簧/向心 → 归一化到画布内边距。
  const layout = useMemo(() => {
    const W = 680
    const H = 470
    const CX = W / 2
    const CY = H / 2
    const n = vnodes.length
    if (n === 0) return { W, H, pts: [] as Array<{ node: GraphNode; x: number; y: number }> }
    const pts = vnodes.map((node, i) => {
      const a = (i / n) * Math.PI * 2
      const r = n <= 1 ? 0 : Math.min(W, H) * 0.34
      return { node, x: CX + Math.cos(a) * r, y: CY + Math.sin(a) * r, vx: 0, vy: 0 }
    })
    const idx = new Map(vnodes.map((node, i) => [node.path, i]))
    const springs = vedges
      .map((e) => ({ a: idx.get(e.from), b: idx.get(e.to) }))
      .filter((s): s is { a: number; b: number } => s.a !== undefined && s.b !== undefined)
    const ITER = 180
    const REP = 7000
    const SPRING = 0.02
    const SPRING_LEN = 96
    const CENTER = 0.012
    const DAMP = 0.86
    for (let step = 0; step < ITER; step++) {
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          let dx = pts[i].x - pts[j].x
          let dy = pts[i].y - pts[j].y
          let d2 = dx * dx + dy * dy
          if (d2 < 0.01) {
            dx = (i - j) * 0.5 + 0.3
            dy = 0.4
            d2 = dx * dx + dy * dy
          }
          const d = Math.sqrt(d2) || 1
          const f = REP / d2
          const fx = (dx / d) * f
          const fy = (dy / d) * f
          pts[i].vx += fx
          pts[i].vy += fy
          pts[j].vx -= fx
          pts[j].vy -= fy
        }
      }
      for (const s of springs) {
        const a = pts[s.a]
        const b = pts[s.b]
        const dx = b.x - a.x
        const dy = b.y - a.y
        const d = Math.sqrt(dx * dx + dy * dy) || 1
        const f = (d - SPRING_LEN) * SPRING
        const fx = (dx / d) * f
        const fy = (dy / d) * f
        a.vx += fx
        a.vy += fy
        b.vx -= fx
        b.vy -= fy
      }
      for (const p of pts) {
        p.vx += (CX - p.x) * CENTER
        p.vy += (CY - p.y) * CENTER
        p.vx *= DAMP
        p.vy *= DAMP
        p.x += Math.max(-14, Math.min(14, p.vx))
        p.y += Math.max(-14, Math.min(14, p.vy))
      }
    }
    const pad = 52
    const xs = pts.map((p) => p.x)
    const ys = pts.map((p) => p.y)
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const minY = Math.min(...ys)
    const maxY = Math.max(...ys)
    const s = Math.min((W - pad * 2) / Math.max(1, maxX - minX), (H - pad * 2) / Math.max(1, maxY - minY))
    const ox = (W - (maxX - minX) * s) / 2 - minX * s
    const oy = (H - (maxY - minY) * s) / 2 - minY * s
    return { W, H, pts: pts.map((p) => ({ node: p.node, x: p.x * s + ox, y: p.y * s + oy })) }
  }, [vnodes, vedges])

  const posByPath = new Map(layout.pts.map((p) => [p.node.path, p]))
  const isNeighbor = (p: string) => hover === p || (adjacency.get(hover ?? '')?.has(p) ?? false)

  if (vnodes.length === 0) return <p className="cardian-kt-hint">该仓库暂无可解析的依赖节点。</p>

  return (
    <div className="cardian-kt-graph">
      <svg viewBox={`0 0 ${layout.W} ${layout.H}`} className="cardian-kt-graph-svg" preserveAspectRatio="xMidYMid meet" role="img" aria-label="依赖图谱">
        <g className="cardian-kt-graph-edges">
          {vedges.map((e, i) => {
            const a = posByPath.get(e.from)
            const b = posByPath.get(e.to)
            if (!a || !b) return null
            const active = hover !== null && (e.from === hover || e.to === hover)
            return (
              <line
                key={`e${i}`}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                className={`cardian-kt-graph-edge${hover && !active ? ' cardian-kt-graph-edge--dim' : ''}${active ? ' cardian-kt-graph-edge--hi' : ''}`}
              />
            )
          })}
        </g>
        <g className="cardian-kt-graph-nodes">
          {layout.pts.map((p) => {
            const r = 5 + Math.min(9, (p.node.degree ?? 0) * 1.5)
            const dim = hover !== null && !isNeighbor(p.node.path)
            return (
              <g
                key={p.node.path}
                className={`cardian-kt-graph-node${hover === p.node.path ? ' cardian-kt-graph-node--active' : ''}${dim ? ' cardian-kt-graph-node--dim' : ''}`}
                transform={`translate(${p.x},${p.y})`}
                role="button"
                tabIndex={0}
                aria-label={p.node.title ?? p.node.path}
                onMouseEnter={() => setHover(p.node.path)}
                onMouseLeave={() => setHover((cur) => (cur === p.node.path ? null : cur))}
                onFocus={() => setHover(p.node.path)}
                onBlur={() => setHover((cur) => (cur === p.node.path ? null : cur))}
                onClick={() => onSelect?.(p.node)}
                onKeyDown={(e) => {
                  if ((e.key === 'Enter' || e.key === ' ') && onSelect) {
                    e.preventDefault()
                    onSelect(p.node)
                  }
                }}
              >
                <circle r={r} className="cardian-kt-graph-dot" />
                <text y={-r - 5} textAnchor="middle" className="cardian-kt-graph-label">
                  {titleFromPath(p.node.title || p.node.path)}
                </text>
              </g>
            )
          })}
        </g>
      </svg>
    </div>
  )
}

export function KnowledgeTreePanel({ controller }: { controller: KnowledgeController }) {
  const [, force] = useState(0)
  const [vaultPath, setVaultPath] = useState('')
  const [activeTab, setActiveTab] = useState<SectionKey>('cards')
  const [counts, setCounts] = useState<Record<SectionKey, number>>({ cards: 0, memory: 0, wiki: 0 })
  const [query, setQuery] = useState('')
  const [activeGroup, setActiveGroup] = useState<string | null>(null)
  const [entries, setEntries] = useState<KnowledgeEntry[]>([])
  // 分组候选池：在无分组过滤的加载时记录全部分组，保证选中某分组后
  // chips 行不会整体消失（旧版按当前条目算分组 → 选中即无组可切）。
  const [groupPool, setGroupPool] = useState<string[]>([])
  // 文件夹树展开状态：key（g:group / d:group:dir）→ 是否展开。
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [content, setContent] = useState<Content>({ kind: 'overview' })
  const [confirmEntry, setConfirmEntry] = useState<KnowledgeEntry | null>(null)
  const [formState, setFormState] = useState<Record<string, string>>({})
  // 深度洞察抽屉状态
  const [insightData, setInsightData] = useState<unknown>(null)
  // 知识卡片 Tab 的类型筛选（chips 带数量），纯客户端过滤
  const [typeFilter, setTypeFilter] = useState<string | null>(null)
  // 详情下方的关联知识（backlinks + related），序号防竞态
  const [relLinks, setRelLinks] = useState<{ backlinks: RefHit[]; related: RefHit[] } | null>(null)
  const detailSeq = useRef(0)

  // ---- 工作区沉淀（ingest）状态 ----
  const [jobs, setJobs] = useState<IngestJob[]>([])
  const [workspaces, setWorkspaces] = useState<WorkspaceItem[]>([])
  const [ingestBusy, setIngestBusy] = useState(false)
  // AI 扫盘向导：模型目录 + 表单（目标夹 / 模型 / 上限 / 层级深度）。
  const [catalog, setCatalog] = useState<ModelCatalog | null>(null)
  const [catalogBusy, setCatalogBusy] = useState(false)
  const [scanOpen, setScanOpen] = useState(false)
  const [scanMode, setScanMode] = useState<'full' | 'diff'>('full')
  const [scanDir, setScanDir] = useState('')
  const [scanRepo, setScanRepo] = useState('')
  const [scanMax, setScanMax] = useState('50')
  const [scanDepth, setScanDepth] = useState('2')
  // '' = 宿主默认模型；其余为 `provider/model`
  const [scanModel, setScanModel] = useState('')

  // Subscribe to the controller's toggle signal.
  useEffect(() => controller.subscribe(() => force((n) => n + 1)), [controller])

  // Inject the stylesheet once (no CSS build pipeline needed).
  useEffect(() => {
    if (typeof document === 'undefined') return
    if (document.querySelector('style[data-plugin-css="cardian-kt"]')) return
    const tag = document.createElement('style')
    tag.dataset.plugin = 'dsh-cardian'
    tag.dataset.pluginCss = 'cardian-kt'
    tag.textContent = CARDian_CSS
    document.head.appendChild(tag)
  }, [])

  const panelRef = useRef<HTMLDivElement | null>(null)

  // Replace-the-center geometry: while the panel is open, measure the shell
  // frame's columns (sidebar | center | details) and size the panel to span
  // exactly the center area, hiding the chat column underneath it. Kept in
  // sync while open (sidebar/details drag via ResizeObserver + window resize)
  // and fully restored on close.
  useLayoutEffect(() => {
    if (!controller.open) return
    if (typeof document === 'undefined') return
    try {
      const overlay = document.querySelector<HTMLElement>('[data-shell-overlay]')
      const frame = overlay?.parentElement
      if (!frame) {
        console.warn('[cardian] 未找到 shell overlay 层，面板保持全幅覆盖')
        return
      }
      if (frame.children.length < 4) {
        console.warn(`[cardian] frame 子节点不足 4（实际 ${frame.children.length}），跳过几何定位（面板保持全幅）`)
        return
      }
      const sidebarCol = frame.children[0] as HTMLElement | undefined
      const centerCol = frame.children[1] as HTMLElement | undefined
      const detailsCol = frame.children[2] as HTMLElement | undefined
      const panel = panelRef.current
      if (!sidebarCol || !centerCol || !panel) {
        console.warn('[cardian] 几何定位缺少列/面板引用，面板保持全幅')
        return
      }

      const sync = () => {
        panel.style.left = `${sidebarCol.offsetWidth}px`
        panel.style.right = `${detailsCol ? detailsCol.offsetWidth : 0}px`
      }
      const previousVisibility = centerCol.style.visibility
      // Opaque panel covers the center anyway; visibility preserves the chat
      // column's layout box so nothing downstream re-measures to 0x0.
      centerCol.style.visibility = 'hidden'
      sync()

      const ro = new ResizeObserver(sync)
      ro.observe(sidebarCol)
      if (detailsCol) ro.observe(detailsCol)
      window.addEventListener('resize', sync)

      return () => {
        ro.disconnect()
        window.removeEventListener('resize', sync)
        centerCol.style.visibility = previousVisibility
        panel.style.left = ''
        panel.style.right = ''
      }
    } catch (err) {
      console.warn('[cardian] 面板几何定位异常（面板保持全幅）:', err)
    }
  }, [controller.open])

  const reload = useCallback(
    async (key: SectionKey, q: string, group?: string | null) => {
      setLoading(true)
      setError(null)
      try {
        const r = await controller.sectionList(key, {
          ...(q.trim() ? { query: q.trim() } : {}),
          ...(group ? { group } : {}),
        })
        // 防御：任何形状异常都不允许污染 entries/counts 状态（否则渲染期
        // `entries.map` 会崩掉整个面板）。错数据 → 空列表 + 错误横幅由
        // sectionList 的 catch 负责展示。
        const list = Array.isArray(r && r.entries) ? r.entries : []
        setEntries(list)
        if (!group && !q.trim()) setGroupPool([...new Set(list.map((e) => e.group).filter(Boolean) as string[])].sort())
        setCounts((prev) => ({ ...prev, [key]: typeof r.count === 'number' ? r.count : list.length }))
        return r
      } catch (err) {
        setError(msg(err))
        return null
      } finally {
        setLoading(false)
      }
    },
    [controller],
  )

  // On open: reset transient state, load counts, and let the debounce effect
  // below load the active tab's entries.
  useEffect(() => {
    if (!controller.open) return
    setError(null)
    setContent({ kind: 'overview' })
    setConfirmEntry(null)
    setQuery('')
    setTypeFilter(null)
    setActiveGroup(null)
    setGroupPool([])
    // 拉一次 DSH 已打开的工作区（RepoWiki 沉淀 dock 用）。
    setWorkspaces(controller.listWorkspaces())
    // 模型目录（扫盘向导下拉）：面板打开时拉一次，无 llm 服务时 available:false。
    setCatalogBusy(true)
    controller
      .listModels()
      .then((c) => setCatalog(c))
      .catch(() => setCatalog({ available: false, models: [], default: null }))
      .finally(() => setCatalogBusy(false))
    controller
      .describe()
      .then((t) => {
        setVaultPath(t.vaultPath ?? '')
        const c = { cards: 0, memory: 0, wiki: 0 } as Record<SectionKey, number>
        for (const s of t.sections ?? []) c[s.key as SectionKey] = s.count
        setCounts(c)
      })
      .catch((err) => setError(msg(err)))
  }, [controller.open, controller])

  // Debounced search + tab/group switch reload.
  useEffect(() => {
    if (!controller.open) return
    const t = setTimeout(() => reload(activeTab, query, activeGroup), query ? 200 : 0)
    return () => clearTimeout(t)
  }, [controller.open, activeTab, query, activeGroup, reload])

  // 工作区沉淀：轮询任务进度。RepoWiki 标签激活时常驻轮询（dock 就地显示
  // 进度/状态）；其它标签仅在仍有任务在跑时继续轮询。runningKey 做依赖串：
  // 只有任务状态翻转/新增才重进效果，避免每轮 setJobs 造成轮询死循环。
  const runningKey = jobs.map((j) => `${j.jobId}:${j.status}`).join('|')
  useEffect(() => {
    if (!controller.open) return
    if (activeTab !== 'wiki' && !jobs.some((j) => j.status === 'running')) return
    let alive = true
    const tick = async () => {
      try {
        const r = await controller.ingestStatus()
        if (!alive) return
        setJobs(Array.isArray(r.jobs) ? r.jobs : [])
      } catch {
        /* 保留旧数据，下一轮再试 */
      }
    }
    tick()
    const timer = setInterval(tick, 1000)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [controller.open, activeTab, runningKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // 及时刷新已建立的卡片：只要有任务新落了卡（回填/模块计数在涨），就把当前
  // 分区的条目重拉一次，面板树与总览里的卡片随扫随长，不等整轮跑完。
  const cardSignal = jobs
    .map((j) => `${j.jobId}:${(j.enrichedCount ?? 0) + (j.skippedCount ?? 0) + (j.moduleCount ?? 0) + (j.overviewCount ?? 0)}`)
    .join('|')
  useEffect(() => {
    if (!controller.open || !cardSignal) return
    reload(activeTab, query, activeGroup)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardSignal])

  const switchTab = (key: SectionKey) => {
    setActiveTab(key)
    setQuery('')
    setTypeFilter(null)
    setActiveGroup(null)
    setContent({ kind: 'overview' })
    setConfirmEntry(null)
    setError(null)
  }

  // ---- 内容区动作 ----

  const openDetail = async (entry: KnowledgeEntry, key: SectionKey = activeTab, ref?: string, group?: string | null) => {
    const seq = ++detailSeq.current
    const useKey = key
    const useRef = ref ?? entry.id ?? entry.rel ?? ''
    const useGroup = ref !== undefined ? group ?? null : entry.group ?? null
    setContent({ kind: 'detail', key: useKey, entry, note: null, highlight: query.trim() })
    setRelLinks(null)
    setError(null)
    setLoading(true)
    try {
      const note = await controller.sectionGet(useKey, useRef, useGroup ?? undefined)
      if (seq === detailSeq.current) setContent((c) => (c.kind === 'detail' ? { ...c, note } : c))
    } catch (err) {
      if (seq === detailSeq.current) setError(msg(err))
    } finally {
      if (seq === detailSeq.current) setLoading(false)
    }
    // 关联知识是装饰性信息：失败静默，不打断主详情流。
    void (async () => {
      try {
        const [bl, rl] = await Promise.all([controller.backlinks(useRef), controller.related(useRef)])
        if (seq !== detailSeq.current) return
        setRelLinks({ backlinks: Array.isArray(bl) ? bl : [], related: Array.isArray(rl) ? rl : [] })
      } catch {
        /* 无关联数据时整块隐藏 */
      }
    })()
  }

  // 关联条目 chip → 按 rel 前缀判定分区，以标题为 ref 跳转打开。
  const jumpToRef = (hit: RefHit) => {
    const key = sectionOfRel(hit.path)
    if (!key) return
    void openDetail({ rel: hit.path, title: hit.title ?? hit.path }, key, hit.title ?? hit.path, null)
  }

  // [[wikilink]] 点击 → 解析标题并跳转。用 controller 已暴露的 crossSearch 找
  // 命中条目，按其 rel 前缀归到对应分区打开；检索失败则防御式回退到当前分区按
  // 标题打开（sectionGet 支持以标题为 ref）。不改 controller，纯消费既有方法。
  const openWikiTitle = (title: string) => {
    const t = title.trim()
    if (!t) return
    void (async () => {
      try {
        const hits = await controller.crossSearch(t)
        const hit = Array.isArray(hits) && hits.length > 0 ? hits[0] : null
        if (hit) {
          const key = sectionOfRel(hit.rel) ?? activeTab
          void openDetail(hit, key, hit.title ?? hit.rel ?? t, hit.group ?? null)
          return
        }
      } catch {
        /* 检索不可用 → 回退当前分区按标题解析 */
      }
      void openDetail({ rel: t, title: t }, activeTab, t, null)
    })()
  }

  const backToOverview = () => {
    detailSeq.current++
    setContent({ kind: 'overview' })
    setConfirmEntry(null)
    setError(null)
  }

  const openCreate = () => {
    setFormState({})
    setContent({ kind: 'form', key: activeTab, entry: null })
    setError(null)
  }

  const openEdit = (entry: KnowledgeEntry | null, note: KnowledgeDetail | null, key: SectionKey) => {
    setFormState(toForm(key, note))
    setContent({ kind: 'form', key, entry })
    setError(null)
  }

  const setField = (name: string, value: string) => setFormState((f) => ({ ...f, [name]: value }))

  const submitForm = async (e: FormEvent) => {
    e.preventDefault()
    if (content.kind !== 'form') return
    const key = content.key
    setSaving(true)
    setError(null)
    try {
      const args = buildArgs(key, formState)
      // 编辑时带上稳定 id：改标题/改分类也能原地更新而不产生重复卡。
      if (content.entry?.id) args.id = content.entry.id
      await controller.sectionUpsert(key, args)
      setFormState({})
      setContent({ kind: 'overview' })
      setConfirmEntry(null)
      await reload(key, '', activeGroup)
    } catch (err) {
      setError(msg(err))
    } finally {
      setSaving(false)
    }
  }

  const doDelete = async () => {
    if (content.kind !== 'detail' || !confirmEntry) return
    const key = content.key
    setLoading(true)
    setError(null)
    try {
      const ok = await controller.sectionRemove(key, confirmEntry.id ?? confirmEntry.rel, confirmEntry.group)
      if (!ok) setError('删除失败：未找到该条目')
      setConfirmEntry(null)
      setContent({ kind: 'overview' })
      await reload(key, '', activeGroup)
    } catch (err) {
      setError(msg(err))
    } finally {
      setLoading(false)
    }
  }

  // ---- 深度洞察 ----

  const openInsight = (key: InsightKey) => {
    if (content.kind === 'insight' && content.insight === key) {
      setContent({ kind: 'overview' })
      return
    }
    setContent({ kind: 'insight', insight: key })
    setInsightData(null)
    setError(null)
    void (async () => {
      try {
        let data: unknown
        if (key === 'status') data = await controller.getStatus()
        else if (key === 'tagCloud') data = await controller.tagCloud()
        else if (key === 'graph') data = await controller.graph(activeGroup ?? null)
        else data = await controller.getDoctor()
        // graph 在未选仓库时直接返回 null——给个提示对象兜住，避免永远停在"加载中"。
        setInsightData(data ?? { info: '先在左侧 RepoWiki 选中一个仓库分组，再查看依赖图谱。' })
      } catch (err) {
        setInsightData({ error: msg(err) })
      }
    })()
  }

  // ---- 工作区沉淀（ingest）动作 ----

  const refreshJobs = useCallback(async () => {
    try {
      const r = await controller.ingestStatus()
      setJobs(Array.isArray(r.jobs) ? r.jobs : [])
    } catch {
      /* 保留旧列表，下一轮再试 */
    }
  }, [controller])

  const loadWorkspaces = useCallback(() => {
    setWorkspaces(controller.listWorkspaces())
  }, [controller])

  /** 把向导里的模型选项（'provider/model' / ''）解成 host 要的 {provider,model}。 */
  const resolveScanModel = () => {
    const s = scanModel.trim()
    if (s) {
      const i = s.indexOf('/')
      if (i > 0 && i < s.length - 1) return { provider: s.slice(0, i), model: s.slice(i + 1) }
    }
    return catalog?.default ?? null
  }

  const openScan = (mode: 'full' | 'diff', preset?: { dir?: string; repoName?: string }) => {
    setScanMode(mode)
    setScanDir(preset?.dir ?? scanDir ?? workspaces[0]?.path ?? '')
    setScanRepo(preset?.repoName ?? (preset?.dir ? titleFromPath(preset.dir) : scanRepo))
    setScanOpen(true)
    if (!catalog && !catalogBusy) {
      setCatalogBusy(true)
      controller
        .listModels()
        .then((c) => setCatalog(c))
        .catch(() => setCatalog({ available: false, models: [], default: null }))
        .finally(() => setCatalogBusy(false))
    }
  }

  const submitScan = async (e: FormEvent) => {
    e.preventDefault()
    const dir = scanDir.trim()
    if (!dir) {
      setError('请填写要扫描的项目文件夹路径')
      return
    }
    setIngestBusy(true)
    setError(null)
    try {
      const options = {
        dir,
        ...(scanRepo.trim() ? { repoName: scanRepo.trim() } : {}),
        maxFiles: Number(scanMax) > 0 ? Number(scanMax) : undefined,
        depth: Number(scanDepth) > 0 ? Number(scanDepth) : undefined,
        model: resolveScanModel(),
      }
      if (scanMode === 'diff') await controller.rescanDiff(options)
      else await controller.ingestProject(options)
      setScanOpen(false)
      setActiveTab('wiki')
      await refreshJobs()
    } catch (err) {
      setError(msg(err))
    } finally {
      setIngestBusy(false)
    }
  }

  // 暂停 / 继续 / 停止：网关据此 abort 在途模型调用，已落盘卡片保留。
  const controlIngest = async (op: 'pause' | 'resume' | 'cancel', jobId: string) => {
    setIngestBusy(true)
    setError(null)
    try {
      if (op === 'pause') await controller.pauseIngest(jobId)
      else if (op === 'resume') await controller.resumeIngest(jobId)
      else await controller.cancelIngest(jobId)
      await refreshJobs()
    } catch (err) {
      setError(msg(err))
    } finally {
      setIngestBusy(false)
    }
  }

  // 对某个已打开的工作区目录直接发起扫盘（快捷路径：用当前选中的模型/默认模型，
  // 不弹向导）；需要换模型或调上限时用 openScan。
  const startIngestPath = async (path: string, title?: string) => {
    setIngestBusy(true)
    setError(null)
    try {
      await controller.ingestProject({
        dir: path,
        ...(title && title.trim() ? { repoName: title.trim() } : {}),
        model: resolveScanModel(),
      })
      await refreshJobs()
    } catch (err) {
      setError(msg(err))
    } finally {
      setIngestBusy(false)
    }
  }

  // 完成项 → 切 RepoWiki 标签并按该项目分组浏览（reload 由 debounce 触发）。
  const viewProject = (repoName: string) => {
    setActiveTab('wiki')
    setQuery('')
    setActiveGroup(repoName)
    setContent({ kind: 'overview' })
    setConfirmEntry(null)
    setError(null)
  }

  // ---- 派生数据 ----

  const visibleEntries = useMemo(
    () => (typeFilter ? (entries ?? []).filter((e) => typeKeyOf(e, activeTab) === typeFilter) : entries ?? []),
    [entries, typeFilter, activeTab],
  )
  const tree = useMemo(() => buildTree(visibleEntries, activeTab), [visibleEntries, activeTab])

  const wikiRepoCards = useMemo(() => {
    if (activeTab !== 'wiki' || activeGroup) return []
    const agg = new Map<string, { group: string; count: number; updated: string | null }>()
    for (const e of entries ?? []) {
      const g = e.group ?? '未分组'
      const cur = agg.get(g) ?? { group: g, count: 0, updated: null }
      cur.count += 1
      if (!cur.updated || String(e.updated ?? '') > String(cur.updated)) cur.updated = e.updated ?? null
      agg.set(g, cur)
    }
    return [...agg.values()].sort((a, b) => String(b.updated).localeCompare(String(a.updated)))
  }, [entries, activeTab, activeGroup])

  // 进度卡列表：进行中/已暂停的任务全部展示（可能同时在跑多个仓库），
  // 否则只展示最近一条已结束任务，让「完成/失败/已停止」有回执而不刷屏。
  const scanJobs = useMemo(() => {
    const live = (jobs ?? []).filter((j) => j.status === 'running' || j.status === 'paused')
    const rest = (jobs ?? [])
      .filter((j) => j.status !== 'running' && j.status !== 'paused')
      .sort((a, b) => String(b.startedAt ?? '').localeCompare(String(a.startedAt ?? '')))
    return live.length > 0 ? [...live, ...rest.slice(0, 1)] : rest.slice(0, 1)
  }, [jobs])

  const cardTypes = useMemo(() => {
    const m = new Map<string, number>()
    for (const e of entries ?? []) {
      const k = typeKeyOf(e, activeTab)
      m.set(k, (m.get(k) ?? 0) + 1)
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [entries, activeTab])

  const recentEntries = useMemo(
    () => [...(visibleEntries ?? [])].sort((a, b) => String(b.updated ?? '').localeCompare(String(a.updated ?? ''))).slice(0, 9),
    [visibleEntries],
  )

  // 折叠树展开状态：显式切换过的按 expanded 记录；未切换过的：
  // 总览/模块节点默认展开（帮用户一眼看到层级结构），group 仅在
  // 「只看某项目」过滤激活时默认展开，目录默认收起。
  const isOpen = (node: TreeNode) =>
    expanded[node.key] !== undefined
      ? expanded[node.key]
      : node.kind === 'overview' || node.kind === 'module' || (node.kind === 'group' && !!activeGroup)

  const toggleNode = (key: string) => setExpanded((prev) => ({ ...prev, [key]: !prev[key] }))

  const countLeaves = (node: TreeNode): number => (node.kind === 'file' ? 1 : node.children.reduce((n, c) => n + countLeaves(c), 0))

  const selectedRel = content.kind === 'detail' ? content.entry.rel : null

  const renderTree = (nodes: TreeNode[], depth: number): ReactNode =>
    nodes.map((node) => {
      if (node.kind === 'file' && node.children.length === 0) {
        const active = node.entry && selectedRel === node.entry.rel
        return (
          <button
            key={node.key}
            type="button"
            className={`cardian-kt-tree-item${active ? ' cardian-kt-tree-item--active' : ''}`}
            style={{ paddingLeft: `${10 + depth * 14}px` }}
            onClick={() => node.entry && openDetail(node.entry)}
            title={node.label}
          >
            <Icon name="file" size={13} />
            <span className="cardian-kt-tree-title">{highlightTitle(node.label, query.trim())}</span>
            {node.entry?.analysisLevel === 'ai' && <span className="cardian-kt-tree-badge">AI</span>}
            {node.entry?.analysisLevel === 'static' && <span className="cardian-kt-tree-badge">骨架</span>}
            {node.entry && node.entry.status !== 'published' && <span className="cardian-kt-tree-meta">#{node.entry.status}</span>}
          </button>
        )
      }
      const open = isOpen(node)
      const branchIcon: IconName =
        node.kind === 'overview' ? 'knowledge' : node.kind === 'module' ? 'module' : open ? 'folderOpen' : 'folder'
      return (
        <div key={node.key}>
          <div className={`cardian-kt-tree-branch${node.entry ? ' cardian-kt-tree-branch--card' : ''}`} style={{ paddingLeft: `${8 + depth * 14}px` }}>
            <button
              type="button"
              className="cardian-kt-tree-node"
              onClick={() => toggleNode(node.key)}
              aria-expanded={open}
              title={node.label}
            >
              <span className={`cardian-kt-chev${open ? ' cardian-kt-chev--open' : ''}`}>
                <Icon name="chevron" size={11} strokeWidth={2.4} />
              </span>
              <Icon name={branchIcon} size={13} />
              <span className="cardian-kt-tree-title">{node.label}</span>
              <span className="cardian-kt-tree-count">{countLeaves(node)}</span>
            </button>
            {node.entry && (
              <button
                type="button"
                className="cardian-kt-tree-openbtn"
                onClick={() => node.entry && openDetail(node.entry)}
                title="打开这张卡片"
                aria-label="打开这张卡片"
              >
                <Icon name="file" size={11} />
              </button>
            )}
          </div>
          {open && node.children.length > 0 && <div>{renderTree(node.children, depth + 1)}</div>}
        </div>
      )
    })

  if (!controller.open) return null

  // ---------- 左栏：搜索 / 分区导航 / 知识树 / 深度洞察 ----------
  const rail = (
    <aside className="cardian-kt-rail">
      <div className="cardian-kt-searchwrap">
        <Icon name="search" size={13} />
        <input
          className="cardian-kt-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`搜索${SECTION_TITLES[activeTab]}…`}
          aria-label="搜索"
        />
        {query && (
          <button type="button" className="cardian-kt-search-clear" onClick={() => setQuery('')} aria-label="清空搜索">
            <Icon name="close" size={11} strokeWidth={2.4} />
          </button>
        )}
      </div>
  
      <nav className="cardian-kt-nav" role="tablist" aria-label="知识分区">
        {SECTIONS.map((s) => (
          <button
            key={s.key}
            type="button"
            role="tab"
            aria-selected={activeTab === s.key}
            className={`cardian-kt-nav-item${activeTab === s.key ? ' cardian-kt-nav-item--active' : ''}`}
            onClick={() => switchTab(s.key)}
          >
            <Icon name={s.icon} size={15} />
            <span className="cardian-kt-nav-label">{s.label}</span>
            <span className="cardian-kt-nav-count">{counts[s.key]}</span>
          </button>
        ))}
      </nav>
  
      <div className="cardian-kt-rail-tree">
        {cardTypes.length > 1 && (
          <div className="cardian-kt-chips" role="group" aria-label="按类型筛选">
            <button
              type="button"
              className={`cardian-kt-chip-f${typeFilter === null ? ' cardian-kt-chip-f--active' : ''}`}
              onClick={() => setTypeFilter(null)}
            >
              全部
            </button>
            {cardTypes.map(([k, n]) => (
              <button
                key={k}
                type="button"
                className={`cardian-kt-chip-f${typeFilter === k ? ' cardian-kt-chip-f--active' : ''}`}
                onClick={() => setTypeFilter(typeFilter === k ? null : k)}
              >
                {k} <span className="cardian-kt-chip-n">{n}</span>
              </button>
            ))}
          </div>
        )}
  
        {groupPool.length > 1 && (
          <div className="cardian-kt-chips" role="group" aria-label="分组筛选">
            <button
              type="button"
              className={`cardian-kt-chip-f${activeGroup === null ? ' cardian-kt-chip-f--active' : ''}`}
              onClick={() => setActiveGroup(null)}
            >
              全部组
            </button>
            {groupPool.map((g) => (
              <button
                key={g}
                type="button"
                className={`cardian-kt-chip-f${activeGroup === g ? ' cardian-kt-chip-f--active' : ''}`}
                onClick={() => setActiveGroup(activeGroup === g ? null : g)}
                title={g}
              >
                {g}
              </button>
            ))}
          </div>
        )}
  
        {loading && entries.length === 0 && <p className="cardian-kt-hint">加载中…</p>}
        {!loading && visibleEntries.length === 0 && (
          <p className="cardian-kt-hint">{query.trim() ? `没有匹配「${query.trim()}」的结果` : '这个分区还是空的'}</p>
        )}
        {/* 搜索时切扁平结果列表（跨目录命中，树结构无意义）；空查询才用树。 */}
        {query.trim() && !loading
          ? visibleEntries.map((entry) => (
              <button
                key={entry.rel ?? entry.id}
                type="button"
                className={`cardian-kt-tree-item${selectedRel === entry.rel ? ' cardian-kt-tree-item--active' : ''}`}
                onClick={() => openDetail(entry)}
                title={entry.title}
              >
                <Icon name="file" size={13} />
                <span className="cardian-kt-tree-title">{highlightTitle(entry.title, query.trim())}</span>
                {entry.group && <span className="cardian-kt-tree-meta">{entry.group}</span>}
              </button>
            ))
          : renderTree(tree, 0)}
      </div>
  
      <div className="cardian-kt-rail-foot">
        <p className="cardian-kt-rail-foot-label">深度洞察</p>
        {INSIGHTS.map((s) => (
          <button
            key={s.key}
            type="button"
            className={`cardian-kt-nav-item cardian-kt-nav-item--flat${content.kind === 'insight' && content.insight === s.key ? ' cardian-kt-nav-item--active' : ''}`}
            onClick={() => openInsight(s.key)}
          >
            <Icon name={s.icon} size={14} />
            <span className="cardian-kt-nav-label">{s.label}</span>
          </button>
        ))}
      </div>
    </aside>
  )
  
  // ---------- 右栏：总览 ----------
  const statCards = SECTIONS.map((s) => ({ ...s, n: counts[s.key] }))
  const overviewView = (
    <div className="cardian-kt-scroll">
      <div className="cardian-kt-page">
        <div className="cardian-kt-stats">
          {statCards.map((s) => (
            <button
              key={s.key}
              type="button"
              className={`cardian-kt-stat${activeTab === s.key ? ' cardian-kt-stat--active' : ''}`}
              onClick={() => switchTab(s.key)}
            >
              <span className="cardian-kt-stat-icon">
                <Icon name={s.icon} size={17} />
              </span>
              <span className="cardian-kt-stat-num">{s.n}</span>
              <span className="cardian-kt-stat-label">{s.label}</span>
            </button>
          ))}
        </div>
  
        {activeTab === 'wiki' && !activeGroup && (
          <>
            {/* AI 扫盘入口：大按钮开向导，右侧给「仅扫描变更」与模型提示 */}
            <div className="cardian-kt-scan-cta">
              <button type="button" className="cardian-kt-scan-cta-main" onClick={() => openScan('full')} disabled={ingestBusy}>
                <Icon name="sparkle" size={16} />
                <span className="cardian-kt-scan-cta-label">AI 扫描项目 · 建立知识库</span>
                <span className="cardian-kt-scan-cta-sub">
                  先由模型把项目梳理成「总览 → 模块」层级，再逐文件回填职责/关键实现/依赖/注意点；全程只读目标仓库，写入只落在知识库。
                </span>
              </button>
              <div className="cardian-kt-scan-cta-side">
                <button
                  type="button"
                  className="cardian-kt-ws-action"
                  onClick={() => openScan('diff')}
                  disabled={ingestBusy}
                  title="只重扫磁盘上新增/变更的文件，并清理已删除文件的孤儿卡"
                >
                  <Icon name="diff" size={12} /> 仅扫描变更
                </button>
                <span className="cardian-kt-scan-cta-model">
                  {catalogBusy
                    ? '模型目录加载中…'
                    : !catalog
                      ? '未取到模型目录（将仅生成静态骨架卡）'
                      : !catalog.available
                        ? '宿主无 llm 服务 → 仅生成静态骨架卡'
                        : catalog.default
                          ? `默认模型：${catalog.default.provider}/${catalog.default.model}`
                          : catalog.models.length > 0
                            ? '宿主未设默认模型，请在向导里选一个'
                            : '宿主未配置任何模型 → 仅生成静态骨架卡'}
                </span>
              </div>
            </div>

            {scanJobs.map((job) => (
              <ScanProgress
                key={job.jobId}
                job={job}
                busy={ingestBusy}
                onView={viewProject}
                onControl={controlIngest}
                onRescan={(dir, repoName) => openScan('diff', { dir, repoName })}
              />
            ))}

            <div className="cardian-kt-project-dock">
              <div className="cardian-kt-project-dock-head">
                <span className="cardian-kt-project-dock-title">
                  <Icon name="ingest" size={14} /> 已打开的工作区（快捷沉淀）
                </span>
                <button type="button" className="cardian-kt-iconbtn" onClick={loadWorkspaces} title="刷新工作区列表" aria-label="刷新工作区列表">
                  <Icon name="refresh" size={13} />
                </button>
              </div>
              <p className="cardian-kt-project-dock-hint">
                点「沉淀」用上方选定的模型（默认取宿主默认模型）直接扫这个目录；点「向导」可改模型、文件上限与层级深度。进度与暂停/继续见上方进度卡。
              </p>
              {workspaces.length === 0 && <p className="cardian-kt-hint">没有可用的工作区。先在侧边栏打开一个工作区目录，再回来点「沉淀」。</p>}
              {workspaces.map((w) => {
                const job = jobs.find((j) => sameDir(j.dir, w.path))
                return (
                  <div key={w.id || w.path} className="cardian-kt-ws-row">
                    <div className="cardian-kt-ws-info">
                      <span className="cardian-kt-ws-title">
                        <Icon name="folder" size={13} /> {w.title || titleFromPath(w.path)}
                      </span>
                      <span className="cardian-kt-ws-path" title={w.path}>
                        {w.path}
                      </span>
                    </div>
                    {job && (
                      <span className="cardian-kt-ws-state">
                        {jobStatusText(job)}
                        {job.status === 'running' || job.status === 'paused' ? ` ${job.done}/${job.total}` : ''}
                      </span>
                    )}
                    {(!job || job.status === 'done' || job.status === 'error' || job.status === 'cancelled') && (
                      <button type="button" className="cardian-kt-ws-action" onClick={() => startIngestPath(w.path, w.title)} disabled={ingestBusy}>
                        {job && job.status === 'error' ? '重试' : job && job.status === 'done' ? '重扫' : '沉淀'}
                      </button>
                    )}
                    <button
                      type="button"
                      className="cardian-kt-ws-action"
                      onClick={() => openScan('full', { dir: w.path, repoName: w.title })}
                      disabled={ingestBusy}
                    >
                      向导
                    </button>
                  </div>
                )
              })}
            </div>
  
            {wikiRepoCards.length > 0 && (
              <>
                <h3 className="cardian-kt-h3">已沉淀的仓库</h3>
                <div className="cardian-kt-repo-grid">
                  {wikiRepoCards.map((r) => (
                    <button key={r.group} type="button" className="cardian-kt-repo-card" onClick={() => setActiveGroup(r.group)}>
                      <span className="cardian-kt-repo-icon">
                        <Icon name="repo" size={16} />
                      </span>
                      <span className="cardian-kt-repo-name">{r.group}</span>
                      <span className="cardian-kt-repo-meta">
                        {r.count} 页 · 更新于 {fmtDate(r.updated) || '—'}
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </>
        )}
  
        {loading && entries.length === 0 && <p className="cardian-kt-hint">加载中…</p>}
        {!loading && entries.length === 0 && (
          <div className="cardian-kt-empty">
            <span className="cardian-kt-empty-icon">
              <Icon name="empty" size={26} />
            </span>
            <p className="cardian-kt-empty-title">还没有{SECTION_TITLES[activeTab]}</p>
            <p className="cardian-kt-empty-hint">
              {activeTab === 'cards' && '点右上角「新建」沉淀第一张卡片；或在对活用 cardian.card.upsert 工具写入知识。'}
              {activeTab === 'memory' && '点右上角「新建」记录第一条记忆；或在对活用 cardian.memory.commit 提交。'}
              {activeTab === 'wiki' && '用上方「工作区沉淀」一键扫描项目生成骨架卡，或用 cardian.wiki.ingest 工具扫描仓库。'}
            </p>
          </div>
        )}
        {!loading && entries.length > 0 && visibleEntries.length === 0 && (
          <div className="cardian-kt-filter-empty">
            <p className="cardian-kt-filter-empty-text">当前分区没有类型为「{typeFilter}」的条目。</p>
            <button type="button" className="cardian-kt-chip-f cardian-kt-chip-f--active" onClick={() => setTypeFilter(null)}>
              清除筛选
            </button>
          </div>
        )}
        {visibleEntries.length > 0 && (
          <>
            <h3 className="cardian-kt-h3">
              {activeGroup ? `${activeGroup} · ` : ''}
              {typeFilter ? `类型「${typeFilter}」· ` : ''}最近更新
            </h3>
            <div className="cardian-kt-entry-grid">
              {recentEntries.map((entry) => (
                <button key={entry.rel ?? entry.id} type="button" className="cardian-kt-entry-card" onClick={() => openDetail(entry)} title={entry.title}>
                  <span className="cardian-kt-entry-card-title">{entry.title}</span>
                  <span className="cardian-kt-entry-card-meta">
                    {[entry.group, entry.status !== 'published' ? `#${entry.status}` : null, fmtDate(entry.updated)]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
  
  // ---------- 右栏：详情 ----------
  const detailView = (() => {
    if (content.kind !== 'detail') return null
    const { entry, note } = content
    return (
      <div className="cardian-kt-scroll">
        <div className="cardian-kt-page">
          <div className="cardian-kt-crumb">
            <button type="button" className="cardian-kt-back" onClick={backToOverview}>
              <Icon name="back" size={13} /> 返回
            </button>
            <span className="cardian-kt-crumb-sep">/</span>
            <span className="cardian-kt-crumb-text">{SECTION_TITLES[content.key]}</span>
            {entry.group && (
              <>
                <span className="cardian-kt-crumb-sep">/</span>
                <span className="cardian-kt-crumb-text">{entry.group}</span>
              </>
            )}
            <span className="cardian-kt-flex" />
            <button
              type="button"
              className="cardian-kt-iconbtn"
              onClick={() => openEdit(entry, note, content.key)}
              title="编辑"
              aria-label="编辑"
              disabled={!note}
            >
              <Icon name="edit" size={14} />
            </button>
            <button
              type="button"
              className="cardian-kt-iconbtn cardian-kt-iconbtn--danger"
              onClick={() => setConfirmEntry(entry)}
              title="删除"
              aria-label="删除"
              disabled={!note}
            >
              <Icon name="trash" size={14} />
            </button>
          </div>

          {loading && !note && <p className="cardian-kt-hint">加载中…</p>}
          {note && (
            <article className="cardian-kt-article">
              <h1 className="cardian-kt-article-title">{note.title ?? entry.title}</h1>
              <div className="cardian-kt-article-meta">
                {[note.type, note.status !== 'published' ? `#${note.status}` : null]
                  .filter(Boolean)
                  .map((x) => (
                    <span key={String(x)} className="cardian-kt-chip">
                      {String(x)}
                    </span>
                  ))}
                {note.updated ? <span className="cardian-kt-chip">更新于 {fmtDate(note.updated)}</span> : null}
                {typeof note.confidence === 'number' && <span className="cardian-kt-chip">置信度 {note.confidence}</span>}
                {Array.isArray(note.tags) &&
                  (note.tags as string[]).map((t) => (
                    <span key={t} className="cardian-kt-chip cardian-kt-chip--tag">
                      #{t}
                    </span>
                  ))}
              </div>
              {note.summary ? <p className="cardian-kt-lead">{String(note.summary)}</p> : null}
              {(() => {
                const term = content.highlight ?? ''
                const hits = term ? countMatches(String(note.body ?? ''), term) : 0
                return (
                  <>
                    {term && hits > 0 && <div className="cardian-kt-matches">共 {hits} 处匹配「{term}」</div>}
                    <Markdown text={String(note.body ?? '')} highlight={term} onWikiSelect={openWikiTitle} />
                  </>
                )
              })()}

              {relLinks && (relLinks.backlinks.length > 0 || relLinks.related.length > 0) && (
                <div className="cardian-kt-rel">
                  {relLinks.related.length > 0 && (
                    <div className="cardian-kt-rel-block">
                      <p className="cardian-kt-rel-label">
                        <Icon name="link" size={12} /> 关联条目
                      </p>
                      <div className="cardian-kt-rel-chips">
                        {relLinks.related.map((r) => (
                          <button key={`r:${r.path}`} type="button" className="cardian-kt-rel-chip" onClick={() => jumpToRef(r)} title={r.relation ?? 'related'}>
                            {r.title ?? r.path}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {relLinks.backlinks.length > 0 && (
                    <div className="cardian-kt-rel-block">
                      <p className="cardian-kt-rel-label">
                        <Icon name="ingest" size={12} /> 被引用
                      </p>
                      <div className="cardian-kt-rel-chips">
                        {relLinks.backlinks.map((r) => (
                          <button key={`b:${r.path}`} type="button" className="cardian-kt-rel-chip" onClick={() => jumpToRef(r)} title={r.path}>
                            {r.title ?? r.path}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </article>
          )}
          {!loading && !note && <p className="cardian-kt-hint">无法加载该条目。</p>}
        </div>
        {confirmEntry && (
          <div className="cardian-kt-confirm">
            <p className="cardian-kt-confirm-text">确定删除「{confirmEntry.title}」？此操作不可恢复。</p>
            <div className="cardian-kt-confirm-actions">
              <button type="button" className="cardian-kt-btn" onClick={() => setConfirmEntry(null)}>
                取消
              </button>
              <button type="button" className="cardian-kt-btn cardian-kt-btn--danger" onClick={doDelete} disabled={loading}>
                {loading ? '删除中…' : '确认删除'}
              </button>
            </div>
          </div>
        )}
      </div>
    )
  })()

  // ---------- 右栏：表单 ----------
  const formView = (() => {
    if (content.kind !== 'form') return null
    const key = content.key
    const isEdit = content.entry !== null
    return (
      <div className="cardian-kt-scroll">
        <div className="cardian-kt-page">
          <div className="cardian-kt-crumb">
            <button type="button" className="cardian-kt-back" onClick={backToOverview}>
              <Icon name="back" size={13} /> 返回
            </button>
            <span className="cardian-kt-crumb-sep">/</span>
            <span className="cardian-kt-crumb-text">{isEdit ? `编辑 · ${content.entry?.title ?? ''}` : `新建 · ${SECTION_TITLES[key]}`}</span>
          </div>
          <form className="cardian-kt-form" onSubmit={submitForm}>
            {(SECTION_FIELDS[key] ?? []).map((f) => (
              <label key={f.name} className={`cardian-kt-form-field${f.wide || f.type === 'textarea' ? ' cardian-kt-form-field--wide' : ''}`}>
                <span className="cardian-kt-form-label">
                  {f.label}
                  {f.required ? <em className="cardian-kt-form-required"> *</em> : null}
                </span>
                {f.type === 'textarea' ? (
                  <textarea
                    className="cardian-kt-form-textarea"
                    value={formState[f.name] ?? ''}
                    onChange={(e) => setField(f.name, e.target.value)}
                    placeholder={f.placeholder}
                    rows={f.name === 'content' ? 8 : 3}
                    required={f.required}
                  />
                ) : f.type === 'select' ? (
                  <select className="cardian-kt-form-input" value={formState[f.name] ?? ''} onChange={(e) => setField(f.name, e.target.value)}>
                    <option value="">（默认）</option>
                    {(f.options ?? []).map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    className="cardian-kt-form-input"
                    type={f.type}
                    value={formState[f.name] ?? ''}
                    onChange={(e) => setField(f.name, e.target.value)}
                    placeholder={f.placeholder}
                    required={f.required}
                  />
                )}
                {key === 'wiki' && f.name === 'repo' && groupPool.length > 0 && <span className="cardian-kt-form-hint">已有仓库：{groupPool.join('、')}</span>}
                {f.hint && !(key === 'wiki' && f.name === 'repo') && <span className="cardian-kt-form-hint">{f.hint}</span>}
              </label>
            ))}
            <div className="cardian-kt-form-actions">
              <button type="button" className="cardian-kt-btn" onClick={backToOverview}>
                取消
              </button>
              <button type="submit" className="cardian-kt-btn cardian-kt-btn--primary" disabled={saving}>
                {saving ? '保存中…' : isEdit ? '保存修改' : '创建'}
              </button>
            </div>
          </form>
        </div>
      </div>
    )
  })()

  // ---------- 右栏：深度洞察 ----------
  const insightView = (() => {
    if (content.kind !== 'insight') return null
    const meta = INSIGHTS.find((s) => s.key === content.insight)!
    const d = insightData as
      | { error?: string; info?: string; sections?: Record<string, number>; repos?: string[]; stale?: number; vaultPath?: string }
      | Array<{ tag: string; count: number }>
      | { nodes?: Array<{ path: string }>; edges?: Array<{ from: string; to: string }>; callers?: Record<string, number> }
      | { healthy?: boolean; problems?: Array<{ level: string; issue: string }> }
      | null
    const failed = d && !Array.isArray(d) && 'error' in d && (d as { error?: string }).error
    return (
      <div className="cardian-kt-scroll">
        <div className="cardian-kt-page">
          <div className="cardian-kt-crumb">
            <button type="button" className="cardian-kt-back" onClick={backToOverview}>
              <Icon name="back" size={13} /> 返回
            </button>
            <span className="cardian-kt-crumb-sep">/</span>
            <span className="cardian-kt-crumb-text">{meta.label}</span>
          </div>
          {!insightData && <p className="cardian-kt-hint">加载洞察中…</p>}
          {failed && <p className="cardian-kt-hint">读取失败：{(d as { error: string }).error}</p>}
          {d && !Array.isArray(d) && (d as { info?: string }).info && <p className="cardian-kt-hint">{(d as { info: string }).info}</p>}

          {content.insight === 'status' && d && !Array.isArray(d) && !failed && (
            <>
              <div className="cardian-kt-stats">
                {SECTIONS.map((s) => (
                  <div key={s.key} className="cardian-kt-stat cardian-kt-stat--static">
                    <span className="cardian-kt-stat-icon">
                      <Icon name={s.icon} size={17} />
                    </span>
                    <span className="cardian-kt-stat-num">{(d.sections ?? {})[s.key] ?? 0}</span>
                    <span className="cardian-kt-stat-label">{s.label}</span>
                  </div>
                ))}
              </div>
              <div className="cardian-kt-insight-card">
                <p className="cardian-kt-insight-line">仓库：{d.repos && d.repos.length > 0 ? d.repos.join('、') : '暂无沉淀'}</p>
                <p className="cardian-kt-insight-line">
                  过期条目：{typeof d.stale === 'number' ? `${d.stale} 条` : '—'}
                  {typeof d.stale === 'number' && d.stale > 0 ? '（引用前请核实内容）' : ''}
                </p>
                {d.vaultPath && (
                  <p className="cardian-kt-insight-line" title={d.vaultPath}>
                    仓库路径：{d.vaultPath}
                  </p>
                )}
              </div>
            </>
          )}

          {content.insight === 'tagCloud' && Array.isArray(d) && (
            <div className="cardian-kt-tagcloud">
              {d.length === 0 && <p className="cardian-kt-hint">还没有带标签的条目。</p>}
              {(() => {
                const max = Math.max(1, ...d.map((t) => t.count))
                return d.map((t) => (
                  <span key={t.tag} className="cardian-kt-chip cardian-kt-chip--tag" style={{ fontSize: `${11 + Math.round((t.count / max) * 6)}px` }}>
                    #{t.tag} <span className="cardian-kt-chip-n">{t.count}</span>
                  </span>
                ))
              })()}
            </div>
          )}

          {content.insight === 'graph' && d && !Array.isArray(d) && !failed && (() => {
            const gd = d as {
              nodes?: Array<{ path?: string; title?: string }>
              edges?: Array<{ from?: string; to?: string }>
              callers?: Record<string, number>
            }
            const gnodes = (gd.nodes ?? []).filter((x) => x && x.path) as GraphNode[]
            const gedges = (gd.edges ?? []).filter((x) => x && x.from && x.to) as GraphEdge[]
            const top = Object.entries(gd.callers ?? {})
              .sort((a, b) => b[1] - a[1])
              .slice(0, 8)
            const max = Math.max(1, ...top.map((x) => x[1]))
            return (
              <>
                <div className="cardian-kt-insight-card cardian-kt-graph-card">
                  <div className="cardian-kt-graph-head">
                    <p className="cardian-kt-insight-line">
                      <Icon name="graph" size={13} /> 节点 {gnodes.length} · 依赖边 {gedges.length}
                    </p>
                    <span className="cardian-kt-graph-tip">悬停高亮邻接，点击节点打开对应条目</span>
                  </div>
                  <GraphView
                    nodes={gnodes}
                    edges={gedges}
                    onSelect={(nd) =>
                      void openDetail(
                        { rel: nd.path, title: nd.title ?? titleFromPath(nd.path), path: nd.path },
                        'wiki',
                        nd.title ?? nd.path,
                        activeGroup,
                      )
                    }
                  />
                </div>
                {top.length > 0 && (
                  <div className="cardian-kt-insight-card">
                    <p className="cardian-kt-rel-label">
                      <Icon name="link" size={12} /> 被引排行
                    </p>
                    {top.map(([p, c]) => (
                      <div key={p} className="cardian-kt-bar-row" title={p}>
                        <span className="cardian-kt-bar-name">{titleFromPath(p)}</span>
                        <span className="cardian-kt-bar-track">
                          <span className="cardian-kt-bar-value" style={{ width: `${(c / max) * 100}%` }} />
                        </span>
                        <span className="cardian-kt-bar-num">被引 {c}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )
          })()}

          {content.insight === 'doctor' && d && !Array.isArray(d) && !failed && (
            <div className="cardian-kt-insight-card">
              <p className={`cardian-kt-doctor-head${(d as { healthy?: boolean }).healthy ? ' cardian-kt-doctor-head--ok' : ''}`}>
                <Icon name={(d as { healthy?: boolean }).healthy ? 'check' : 'alert'} size={14} />
                {(d as { healthy?: boolean }).healthy ? '知识库状态健康' : '有若干问题需要处理'}
              </p>
              {((d as { problems?: Array<{ level: string; issue: string }> }).problems ?? []).map((p, i) => (
                <p key={i} className="cardian-kt-insight-line">
                  <span className={`cardian-kt-level cardian-kt-level--${p.level === 'error' ? 'error' : p.level === 'warn' ? 'warn' : 'info'}`}>{p.level}</span>
                  {p.issue}
                </p>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  })()

  // ---------- 面板骨架 ----------
  return (
    <div className="cardian-kt-panel" role="dialog" aria-label="知识中心" ref={panelRef}>
      <header className="cardian-kt-header">
        <span className="cardian-kt-logo">
          <Icon name="knowledge" size={17} />
        </span>
        <span className="cardian-kt-title" title={vaultPath ? `知识库：${vaultPath}` : undefined}>
          知识中心
        </span>
        {vaultPath && <span className="cardian-kt-vault" title={vaultPath}>{titleFromPath(vaultPath.replace(/[\\/]+$/, ''))}</span>}
        <span className="cardian-kt-flex" />
        <button type="button" className="cardian-kt-btn cardian-kt-btn--primary" onClick={openCreate} title={`新建${SECTION_TITLES[activeTab]}`}>
          <Icon name="plus" size={13} strokeWidth={2.2} /> 新建
        </button>
        <button
          type="button"
          className="cardian-kt-iconbtn"
          onClick={() => reload(activeTab, query, activeGroup)}
          aria-label="刷新"
          title="刷新"
          disabled={loading}
        >
          <Icon name="refresh" size={14} />
        </button>
        <button
          type="button"
          className="cardian-kt-iconbtn"
          onClick={() => {
            controller.open = false
            controller.emit()
          }}
          aria-label="关闭"
          title="关闭"
        >
          <Icon name="close" size={14} strokeWidth={2.2} />
        </button>
      </header>

      {error && (
        <div className="cardian-kt-banner" role="alert">
          <Icon name="alert" size={13} />
          <span className="cardian-kt-banner-text">{error}</span>
          <button type="button" className="cardian-kt-banner-close" onClick={() => setError(null)} aria-label="关闭错误提示">
            <Icon name="close" size={11} strokeWidth={2.4} />
          </button>
        </div>
      )}

      <div className="cardian-kt-layout">
        {rail}
        <main className="cardian-kt-main">
          {content.kind === 'overview' && overviewView}
          {content.kind === 'detail' && detailView}
          {content.kind === 'form' && formView}
          {content.kind === 'insight' && insightView}
        </main>
      </div>

      {/* ---------- AI 扫盘向导（overlay 表单）----------
          目标夹：DSH 已打开工作区快捷选择 + 手输路径；模型：listModels 下拉；
          外加文件上限与层级深度。提交后走 ingestProject / rescanDiff。 */}
      {scanOpen && (
        <div className="cardian-kt-scan-overlay" role="presentation" onClick={() => setScanOpen(false)}>
          <form className="cardian-kt-scan" onClick={(e) => e.stopPropagation()} onSubmit={(e) => void submitScan(e)}>
            <div className="cardian-kt-scan-head">
              <span className="cardian-kt-scan-title">
                <Icon name={scanMode === 'diff' ? 'diff' : 'sparkle'} size={15} />
                {scanMode === 'diff' ? '仅扫描变更 · 增量沉淀' : 'AI 扫描项目 · 建立知识库'}
              </span>
              <button type="button" className="cardian-kt-iconbtn" onClick={() => setScanOpen(false)} aria-label="关闭向导" title="关闭">
                <Icon name="close" size={13} strokeWidth={2.2} />
              </button>
            </div>
            <p className="cardian-kt-scan-note">
              {scanMode === 'diff'
                ? '只重扫磁盘上新增/变更的文件，删除的文件同步清理孤儿卡；未变更的卡片不重写。'
                : '三个阶段：① 只读枚举文件 → ② 模型规划「总览 → 模块」层级 → ③ 逐文件回填语义正文。全过程对目标仓库只读，写入只落在知识库 vault。'}
            </p>

            {workspaces.length > 0 && (
              <div className="cardian-kt-scan-field">
                <span className="cardian-kt-scan-label">已打开的工作区</span>
                <div className="cardian-kt-scan-ws">
                  {workspaces.map((w) => (
                    <button
                      key={w.id || w.path}
                      type="button"
                      className={`cardian-kt-chip${scanDir === w.path ? ' cardian-kt-chip--active' : ''}`}
                      onClick={() => {
                        setScanDir(w.path)
                        setScanRepo(w.title || titleFromPath(w.path))
                      }}
                      title={w.path}
                    >
                      <Icon name="folder" size={11} /> {w.title || titleFromPath(w.path)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <label className="cardian-kt-scan-field">
              <span className="cardian-kt-scan-label">项目文件夹（绝对路径）*</span>
              <input
                className="cardian-kt-scan-input"
                value={scanDir}
                onChange={(e) => setScanDir(e.target.value)}
                placeholder="例如 D:/projects/my-app"
                spellCheck={false}
                autoFocus
              />
            </label>

            <div className="cardian-kt-scan-row">
              <label className="cardian-kt-scan-field">
                <span className="cardian-kt-scan-label">项目名（可选）</span>
                <input
                  className="cardian-kt-scan-input"
                  value={scanRepo}
                  onChange={(e) => setScanRepo(e.target.value)}
                  placeholder="留空则取文件夹名"
                  spellCheck={false}
                />
              </label>
              <label className="cardian-kt-scan-field cardian-kt-scan-field--sm">
                <span className="cardian-kt-scan-label">文件上限</span>
                <input
                  className="cardian-kt-scan-input"
                  type="number"
                  min={1}
                  max={500}
                  value={scanMax}
                  onChange={(e) => setScanMax(e.target.value)}
                  title="单次最多处理多少个文件，超出部分截断"
                />
              </label>
              <label className="cardian-kt-scan-field cardian-kt-scan-field--sm">
                <span className="cardian-kt-scan-label">层级深度</span>
                <input
                  className="cardian-kt-scan-input"
                  type="number"
                  min={1}
                  max={4}
                  value={scanDepth}
                  onChange={(e) => setScanDepth(e.target.value)}
                  title="模块划分参考的目录层级深度"
                />
              </label>
            </div>

            <div className="cardian-kt-scan-field">
              <span className="cardian-kt-scan-label">生成模型</span>
              <select className="cardian-kt-scan-input" value={scanModel} onChange={(e) => setScanModel(e.target.value)} disabled={catalogBusy}>
                <option value="">{catalog?.default ? `宿主默认（${catalog.default.provider}/${catalog.default.model}）` : '宿主默认（未设置 → 仅骨架）'}</option>
                {(catalog?.models ?? []).map((m) => {
                  const v = `${m.provider}/${m.model}`
                  return (
                    <option key={v} value={v}>
                      {m.title || m.model} · {m.provider}
                    </option>
                  )
                })}
              </select>
              <span className="cardian-kt-scan-help">
                {catalogBusy
                  ? '模型目录加载中…'
                  : catalog && !catalog.available
                    ? '宿主未暴露 llm 服务：将降级为仅生成静态骨架卡，可稍后配好模型重扫。'
                    : (catalog?.models ?? []).length === 0
                      ? '未取到可选模型：将沿用宿主默认模型，若也没有则仅生成静态骨架卡。'
                      : `已取到 ${(catalog?.models ?? []).length} 个模型；逐文件回填会按串行推进以便控制进度与暂停。`}
              </span>
            </div>

            <div className="cardian-kt-scan-actions">
              <button type="button" className="cardian-kt-btn" onClick={() => setScanOpen(false)}>
                取消
              </button>
              <button type="submit" className="cardian-kt-btn cardian-kt-btn--primary" disabled={ingestBusy || !scanDir.trim()}>
                <Icon name="sparkle" size={13} /> {ingestBusy ? '提交中…' : scanMode === 'diff' ? '开始增量扫描' : '开始扫描'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
