/**
 * Archive-set access (host): read the registry-global archived-session set and
 * drop ids from it durably.
 *
 * DSH keeps the set in the `workspace` domain's global singleton, owned by
 * `ctx.workspaceRegistry`. Restoring a session means removing its id from that
 * set — the session's own log and its Workspace accounting slot are never
 * touched, so a restore puts the row back exactly where it was.
 *
 * Write path selection (the upstream set is one-way on older builds):
 * 1. `registry.unarchiveSession(id)` — the public API on DSH builds that ship
 *    it (upstream added it after 0.1.5-rc.3); used whenever present.
 * 2. Otherwise the same durable write the registry itself performs: build the
 *    next state from the domain's authoritative value and commit it through
 *    `registry.setState` on the registry's own operation chain, so the durable
 *    medium, the registry's in-memory snapshot, and the `domain/changed` event
 *    every Workspace surface follows all move together.
 * 3. A deployment whose registry exposes neither is refused with a clear
 *    message instead of writing state another writer cannot observe.
 */
import type { Context, BasicsDomainGlobal } from '../../context-types.ts'
import { BasicsError } from '../../wire.ts'

/** The result of dropping ids from the archive set. */
export interface ArchiveDropResult {
  /** The complete archive set after the write. */
  archivedIds: string[]
  /** Requested ids that were not archived (nothing to do). */
  absent: string[]
  /** Set when the durable write landed but the process snapshot could not be resynchronized. */
  staleSnapshot: boolean
}

/** The archive-set face the archived-sessions feature consumes. */
export interface ArchiveStore {
  /** Whether a workspace registry is mounted here at all. */
  readonly mounted: boolean
  /** Current archived ids (registry order). */
  ids(): string[]
  /** Whether this deployment can write the archive set. */
  writable(): boolean
  /** Drop ids from the archive set durably (idempotent per id). */
  drop(ids: readonly string[]): Promise<ArchiveDropResult>
}

/** The registry members this module reads, including the internals it falls back to. */
interface RegistryInternals {
  archivedSessionIds?: unknown
  state?: unknown
  unarchiveSession?: (sessionId: string) => Promise<void>
  setState?: (state: unknown) => Promise<void>
  enqueueOperation?: <T>(operation: () => Promise<T>) => Promise<T>
}

/** Whether a value is a plain non-null object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Read a state object's archived ids as a string list. */
function toStringList(value: unknown): string[] | undefined {
  return Array.isArray(value) ? value.map(id => String(id)) : undefined
}

/** Read the workspace domain's global state, preferring the domain over any cached snapshot. */
function readState(registry: RegistryInternals, global: BasicsDomainGlobal | undefined): Record<string, unknown> | undefined {
  try {
    const fromDomain = global?.get()
    if (isRecord(fromDomain)) return fromDomain
  } catch {
    // 域未打开时退回注册表快照。
  }
  return isRecord(registry.state) ? registry.state : undefined
}

/**
 * Build the archive store over one host context.
 *
 * Both services are resolved on EVERY call, never captured while the plugin
 * applies: Cordis's `ctx.get` (strict) answers `undefined` until the fiber
 * that provides a service is ACTIVE, and `dsh-workspace` opens the workspace
 * domain, recovers pending mutations, and indexes stored headers across
 * several awaits before it publishes `workspaceRegistry`. This plugin, whose
 * own `inject` list never names that service, therefore applies inside that
 * window — a captured value would be `undefined` for the whole process
 * lifetime even though the registry is live a moment later.
 */
export function createArchiveStore(ctx: Context): ArchiveStore {
  /** The workspace registry as it stands now (undefined while its fiber is not active). */
  const registryOf = (): RegistryInternals | undefined => ctx.get('workspaceRegistry') as RegistryInternals | undefined

  /** The `workspace` domain's global singleton as it stands now. */
  const globalOf = (): BasicsDomainGlobal | undefined => {
    try {
      const domain = ctx.get('storageDomain') as { get?(name: string): { global?: BasicsDomainGlobal } | undefined } | undefined
      return domain?.get?.('workspace')?.global
    } catch {
      // 域设施未启动：调用方会退回注册表快照。
      return undefined
    }
  }

  const idsOf = (registry: RegistryInternals | undefined, global: BasicsDomainGlobal | undefined): string[] => {
    try {
      const direct = toStringList(registry?.archivedSessionIds)
      if (direct !== undefined) return direct
    } catch {
      // 注册表未启动时退回域状态。
    }
    return toStringList(readState(registry ?? {}, global)?.archivedSessionIds) ?? []
  }

  const ids = (): string[] => idsOf(registryOf(), globalOf())

  const writable = (): boolean => {
    const registry = registryOf()
    if (registry === undefined) return false
    if (typeof registry.unarchiveSession === 'function') return true
    if (typeof registry.setState === 'function') return true
    return typeof globalOf()?.set === 'function'
  }

  /**
   * Commit one whole state value through the registry's own write path when it
   * exists. The fallback path pre-flights the in-process snapshot assignment
   * BEFORE the durable write: a build whose registry state cannot be
   * resynchronized is refused instead of leaving a medium that the next
   * registry write would silently revert.
   */
  const commit = async (registry: RegistryInternals, global: BasicsDomainGlobal | undefined, next: Record<string, unknown>): Promise<boolean> => {
    if (typeof registry.setState === 'function') {
      await registry.setState(next)
      return registry.state === next
    }
    if (!('state' in registry) || typeof global?.set !== 'function') {
      throw new BasicsError('archive-error', '当前 DSH 版本未暴露归档集合的写入通道，无法恢复会话', 500)
    }
    try {
      const snapshot = registry.state
      registry.state = snapshot
      await global.set(next)
      registry.state = next
    } catch (error) {
      throw new BasicsError('archive-error', `写入归档集合失败：${error instanceof Error ? error.message : String(error)}`, 500)
    }
    return registry.state === next
  }

  const drop = async (remove: readonly string[]): Promise<ArchiveDropResult> => {
    const registry = registryOf()
    if (registry === undefined) {
      throw new BasicsError('archive-error', '当前部署未挂载工作区注册表（workspaceRegistry），无法管理归档会话', 500)
    }
    // 本次操作全程使用同一对句柄，避免中途的服务替换让读与写落在不同实现上。
    const global = globalOf()
    const wanted = new Set(remove)
    const before = idsOf(registry, global)
    if (before.every(id => !wanted.has(id))) {
      return { archivedIds: before, absent: [...wanted], staleSnapshot: false }
    }

    if (typeof registry.unarchiveSession === 'function') {
      const removed = [...wanted].filter(id => before.includes(id))
      for (const id of removed) await registry.unarchiveSession(id)
      return { archivedIds: idsOf(registry, global), absent: [...wanted].filter(id => !removed.includes(id)), staleSnapshot: false }
    }

    let staleSnapshot = false
    // 实际移除的 id 以内层写入读到的状态为准：写前快照与实际写入之间可能有并发的归档变更。
    let removed: string[] = []
    const write = async (): Promise<void> => {
      const current = readState(registry, global)
      const currentIds = toStringList(current?.archivedSessionIds)
      if (current === undefined || currentIds === undefined) {
        throw new BasicsError('archive-error', '无法读取 DSH 的归档集合状态，无法恢复会话', 500)
      }
      const filtered = currentIds.filter(id => !wanted.has(id))
      if (filtered.length === currentIds.length) return
      removed = [...wanted].filter(id => currentIds.includes(id))
      staleSnapshot = !(await commit(registry, global, { ...current, archivedSessionIds: filtered }))
    }

    if (typeof registry.enqueueOperation === 'function') {
      await registry.enqueueOperation(write)
    } else {
      await write()
    }
    return { archivedIds: idsOf(registry, global), absent: [...wanted].filter(id => !removed.includes(id)), staleSnapshot }
  }

  return {
    // 只读投影：注册表可能在面板已经打开之后才挂载完成，故每次读取都重新解析。
    get mounted() { return registryOf() !== undefined },
    ids,
    writable,
    drop,
  }
}
