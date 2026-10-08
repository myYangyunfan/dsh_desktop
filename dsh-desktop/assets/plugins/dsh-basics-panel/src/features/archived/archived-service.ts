/**
 * Archived-sessions feature (host): list every archived session, restore a
 * selection, and delete a selection.
 *
 * DSH archives one-way (a session hidden from every grouping surface keeps its
 * log and its Workspace slot; older builds expose no unarchive action), so this
 * feature supplies the missing surface:
 * - **list** — the registry-global archive set joined with the durable session
 *   listing (cwd, size, event count) and this process's liveness, so the panel
 *   can also show archive entries whose artifacts are already gone;
 * - **restore** — drop ids from the archive set (durable, in-memory, and the
 *   `domain/changed` event every Workspace surface follows), leaving the log
 *   and the accounting slot untouched;
 * - **delete** — remove the session's durable artifact directory, prune its
 *   Workspace accounting slot, then drop it from the archive set. Only
 *   archived sessions that are NOT running are deletable, and the filesystem
 *   work is driven by a fresh scan of the configured sessions root — never by
 *   a client-supplied path.
 *
 * Liveness has two distinct levels, and the panel shows both:
 * - `loaded` — `ctx.sessions.get(id)` answers, i.e. the session object sits in
 *   this process's in-memory store. Archiving never unloads a session, so a
 *   session that is still open in a client stays loaded indefinitely;
 * - `running` — the session's Agent exists and its status is `running`
 *   (dsh-agent's `AgentStatus`), i.e. a driver is actively draining turns.
 *   This is the same predicate the harness's own session list reports.
 * Delete blocks only on `running`: a loaded-but-idle session has no driver to
 * race, so removing its artifacts cannot interleave with a write in flight.
 */
import { join, relative } from 'node:path'
import { dshHomeDisplay, resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import type { FeatureContext } from '../registry.ts'
import { BasicsError, requireStringList } from '../../wire.ts'
import type { BasicsAgents, BasicsStoredSession } from '../../context-types.ts'
import { createArchiveStore } from './archive-store.ts'
import { findSessionArtifact, isInside, isSafeSessionId, removeSessionArtifact } from './session-artifacts.ts'

/** One archived-session row in the list. */
export interface ArchivedSessionRow {
  id: string
  cwd?: string
  createdAt?: number
  sizeBytes?: number
  eventCount?: number
  /** The session object is loaded in this process's in-memory session store. */
  loaded: boolean
  /** The session's Agent is draining turns right now (dsh-agent `status === 'running'`). */
  running: boolean
  /** A durable artifact exists for the id (a dangling archive entry has none). */
  stored: boolean
  /** Whether the panel may restore this row. */
  restorable: boolean
  /** Whether the panel may delete this row. */
  deletable: boolean
}

/** The archived-sessions list payload. */
export interface ArchivedList {
  rows: ArchivedSessionRow[]
  archivedIds: string[]
  totalBytes: number
  /** Whether the archive set can be written in this deployment. */
  writable: boolean
  /** Whether a workspace registry is mounted at all. */
  mounted: boolean
  /** Whether the panel is in read-only mode. */
  readOnly: boolean
  /** Whether delete is enabled by configuration. */
  deleteEnabled: boolean
  /** Upper bound on the ids one restore/delete call may address. */
  maxBatchIds: number
  /** Whether the durable session listing could be read. */
  listingFailed: boolean
  /** Display form of the scanned sessions root. */
  sessionsRoot: string
}

/** One skipped id with its reason (Chinese, shown as-is by the panel). */
export interface ArchivedSkip {
  id: string
  reason: string
}

/** The restore/delete result. */
export interface ArchivedMutation {
  ok: true
  /** Ids the operation actually changed. */
  changed: string[]
  /** Ids the operation refused, with the reason. */
  skipped: ArchivedSkip[]
  /** The complete archive set after the operation. */
  archivedIds: string[]
  /** Bytes removed from disk (delete only). */
  freedBytes: number
  /** Set when the durable write landed but the process snapshot could not be resynchronized. */
  staleSnapshot: boolean
  /** Set when the filesystem work succeeded but a follow-up cleanup step failed. */
  warning?: string
}

/** Message of any thrown value. */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Build the archived feature API. */
export function registerArchived(fc: FeatureContext): Record<string, (payload: unknown) => Promise<unknown> | unknown> {
  const { ctx, resolved } = fc
  const store = createArchiveStore(ctx)

  /** The sessions root the JSONL backend owns (configured override, else `$DSH_HOME/sessions`). */
  const sessionsRoot = (): string => (resolved.sessionsRoot !== '' ? resolved.sessionsRoot : join(resolveDshHome(), 'sessions'))

  /**
   * Display form of the sessions root: `~/.dsh/sessions` (or `$DSH_HOME/...`)
   * when it lives under the harness home, the absolute path otherwise.
   * `dshHomeDisplay` only names the home itself, so the tail is joined here.
   */
  const displayRoot = (): string => {
    const root = sessionsRoot()
    const home = resolveDshHome()
    if (isInside(home, root)) {
      return `${dshHomeDisplay(home)}/${relative(home, root).replaceAll('\\', '/')}`
    }
    return root.replaceAll('\\', '/')
  }

  /** Read the durable session listing, or undefined when the backend cannot answer. */
  const storedSessions = async (): Promise<Map<string, BasicsStoredSession> | undefined> => {
    const persistence = ctx.get('sessionPersistence')
    if (persistence === undefined || typeof persistence.list !== 'function') return undefined
    try {
      const snapshots = await persistence.list()
      const map = new Map<string, BasicsStoredSession>()
      for (const snapshot of snapshots) {
        const id = snapshot?.header?.id
        if (typeof id === 'string' && id !== '') map.set(id, snapshot)
      }
      return map
    } catch {
      return undefined
    }
  }

  /**
   * The live Agent registry as it stands now. Resolved per call, never captured
   * while this plugin applies — the same Cordis strict-`get` window that hides
   * `workspaceRegistry` also hides `agents`.
   */
  const agentsOf = (): BasicsAgents | undefined => {
    try {
      const agents = ctx.get('agents') as BasicsAgents | undefined
      return agents !== undefined && typeof agents.get === 'function' ? agents : undefined
    } catch {
      return undefined
    }
  }

  /** Whether the session is attached to an Agent in this process. */
  const isLoaded = (id: string): boolean => {
    try {
      return ctx.sessions.get(id) !== undefined
    } catch {
      return false
    }
  }

  /** Whether the session's Agent is draining turns right now. */
  const isRunning = (agents: BasicsAgents | undefined, id: string): boolean => {
    if (agents === undefined) return false
    try {
      return agents.get(id)?.status === 'running'
    } catch {
      return false
    }
  }

  /** Prune deleted ids from every Workspace's accounting slot (best-effort). */
  const detachFromWorkspaces = async (ids: readonly string[]): Promise<void> => {
    const registry = ctx.get('workspaceRegistry')
    if (registry === undefined || typeof registry.list !== 'function') return
    let workspaces
    try {
      workspaces = registry.list()
    } catch {
      return
    }
    for (const workspace of workspaces) {
      for (const id of ids) {
        if (!workspace.sessionIds.includes(id)) continue
        try {
          await workspace.detachSession(id)
        } catch {
          // 记账清理失败不应阻断已完成的文件删除。
        }
      }
    }
  }

  const list = async (): Promise<ArchivedList> => {
    // 服务可用性在同一份快照内只解析一次：避免 mounted / writable / rows 分别来自不同时刻而互相矛盾，
    // 也免去每行都去解析一次注册表或 Agent 注册表。
    const archivedIds = store.ids()
    const writable = store.writable()
    const mounted = store.mounted
    const agents = agentsOf()
    const persisted = await storedSessions()
    const rows = archivedIds.map((id): ArchivedSessionRow => {
      const snapshot = persisted?.get(id)
      const header = snapshot?.header
      const running = isRunning(agents, id)
      const stored = snapshot !== undefined
      return {
        id,
        ...(typeof header?.cwd === 'string' && header.cwd !== '' ? { cwd: header.cwd } : {}),
        ...(typeof header?.createdAt === 'number' ? { createdAt: header.createdAt } : {}),
        ...(typeof snapshot?.sizeBytes === 'number' ? { sizeBytes: snapshot.sizeBytes } : {}),
        ...(typeof snapshot?.eventCount === 'number' ? { eventCount: snapshot.eventCount } : {}),
        loaded: isLoaded(id),
        running,
        stored,
        restorable: !resolved.readOnly && writable,
        // 悬空条目（磁盘上已无产物）同样可删——只清理归档记录；但列表整体读不到时不下判断。
        // 只有「真的在跑回合」才拦住删除：装载但空闲的会话没有驱动在动，删产物不会和落盘交错。
        deletable: !resolved.readOnly && resolved.allowSessionDelete && persisted !== undefined && !running,
      }
    })
    rows.sort((left, right) => (right.createdAt ?? 0) - (left.createdAt ?? 0))
    const totalBytes = rows.reduce((sum, row) => sum + (row.sizeBytes ?? 0), 0)
    return {
      rows,
      archivedIds,
      totalBytes,
      writable,
      mounted,
      readOnly: resolved.readOnly,
      deleteEnabled: resolved.allowSessionDelete,
      maxBatchIds: resolved.maxBatchIds,
      listingFailed: persisted === undefined,
      sessionsRoot: displayRoot(),
    }
  }

  const restore = async (payload: unknown): Promise<ArchivedMutation> => {
    if (resolved.readOnly) throw new BasicsError('read-only', '面板处于只读模式', 403)
    const ids = requireStringList(payload, 'ids', resolved.maxBatchIds)
    const result = await store.drop(ids)
    const absent = new Set(result.absent)
    return {
      ok: true,
      changed: ids.filter(id => !absent.has(id)),
      skipped: result.absent.map(id => ({ id, reason: '该会话不在归档集合中' })),
      archivedIds: result.archivedIds,
      freedBytes: 0,
      staleSnapshot: result.staleSnapshot,
    }
  }

  const remove = async (payload: unknown): Promise<ArchivedMutation> => {
    if (resolved.readOnly) throw new BasicsError('read-only', '面板处于只读模式', 403)
    if (!resolved.allowSessionDelete) {
      throw new BasicsError('forbidden', '当前部署已禁用归档会话删除（allowSessionDelete: false）', 403)
    }
    const ids = requireStringList(payload, 'ids', resolved.maxBatchIds)
    const root = sessionsRoot()
    const archived = new Set(store.ids())
    // 本批 id 共用一个 Agent 注册表快照：批内所有行都按同一时刻的运行态判断。
    const agents = agentsOf()
    const changed: string[] = []
    const skipped: ArchivedSkip[] = []
    let freedBytes = 0

    for (const id of ids) {
      if (!archived.has(id)) {
        skipped.push({ id, reason: '该会话未归档，本页仅支持删除已归档会话' })
        continue
      }
      if (isRunning(agents, id)) {
        skipped.push({ id, reason: '该会话正在运行（Agent 状态为 running），请先结束该回合再删除' })
        continue
      }
      const artifact = await findSessionArtifact(root, id)
      if (artifact === undefined) {
        if (!isSafeSessionId(id)) {
          // 需要转义的 id（上游会编码成 ~XXXX 目录名）：不猜目录，留给人工处理。
          skipped.push({ id, reason: '会话 ID 无法安全映射到目录名，未做删除' })
          continue
        }
        // 归档集合里的悬空条目：磁盘上已无产物，仅清理归档记录。
        changed.push(id)
        continue
      }
      try {
        freedBytes += await removeSessionArtifact(root, id, artifact.directory)
        changed.push(id)
      } catch (error) {
        skipped.push({ id, reason: `删除失败：${messageOf(error)}` })
      }
    }

    let staleSnapshot = false
    let warning: string | undefined
    if (changed.length > 0) {
      await detachFromWorkspaces(changed)
      try {
        const dropped = await store.drop(changed)
        staleSnapshot = dropped.staleSnapshot
      } catch (error) {
        warning = `会话文件已删除，但归档记录清理失败：${messageOf(error)}`
      }
    }
    return {
      ok: true,
      changed,
      skipped,
      archivedIds: store.ids(),
      freedBytes,
      staleSnapshot,
      ...(warning !== undefined ? { warning } : {}),
    }
  }

  return {
    'archived.list': list,
    'archived.restore': restore,
    'archived.delete': remove,
  }
}
