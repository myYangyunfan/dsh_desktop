import { describe, expect, it } from 'vitest'
import type { Context } from 'cordis'
import { createArchiveStore } from '../src/features/archived/archive-store.ts'
import { BasicsError } from '../src/wire.ts'

/** A workspace-domain state value as the registry stores it. */
interface State {
  initialized: boolean
  workspaceIds: string[]
  archivedSessionIds: string[]
}

/** Build a fake host context over one in-memory workspace domain. */
function makeCtx(options: {
  archived?: string[]
  withPublicApi?: boolean
  withRegistry?: boolean
  withSetState?: boolean
  withDomain?: boolean
  withStateField?: boolean
  /** Mutate the archive set after the pre-write snapshot, before the write runs (simulates a concurrent archiver). */
  beforeWrite?: (archive: (id: string) => void) => void
} = {}) {
  const holder: { state: State } = {
    state: { initialized: true, workspaceIds: [], archivedSessionIds: [...(options.archived ?? [])] },
  }
  const durable: string[][] = []
  /** Service availability at the moment of each `ctx.get` (mutable: mirrors cordis's late-provided services). */
  const present = { registry: options.withRegistry !== false, domain: options.withDomain !== false }
  const domainGlobal = {
    get: () => holder.state,
    set: async (value: unknown) => {
      holder.state = value as State
      durable.push([...(value as State).archivedSessionIds])
    },
  }
  const calls: string[] = []
  const registry: Record<string, unknown> = {
    get archivedSessionIds() { return holder.state.archivedSessionIds },
    list: () => [],
    setState: options.withSetState === false
      ? undefined
      : async (next: unknown) => {
        calls.push('setState')
        holder.state = next as State
        durable.push([...(next as State).archivedSessionIds])
      },
    enqueueOperation: async (operation: () => Promise<void>) => {
      calls.push('enqueue')
      options.beforeWrite?.((id: string) => {
        holder.state = { ...holder.state, archivedSessionIds: [...holder.state.archivedSessionIds, id] }
      })
      return await operation()
    },
  }
  if (options.withStateField !== false) {
    Object.defineProperty(registry, 'state', {
      get: () => holder.state,
      set: (value: State) => { holder.state = value },
      configurable: true,
    })
  }
  if (options.withPublicApi === true) {
    registry.unarchiveSession = async (id: string) => {
      calls.push(`unarchive:${id}`)
      holder.state = { ...holder.state, archivedSessionIds: holder.state.archivedSessionIds.filter(item => item !== id) }
    }
  }
  const ctx = {
    get: (name: string) => {
      if (name === 'workspaceRegistry') return present.registry ? registry : undefined
      if (name === 'storageDomain') return present.domain ? { get: () => ({ global: domainGlobal }) } : undefined
      return undefined
    },
  } as unknown as Context
  return {
    ctx,
    holder,
    durable,
    calls,
    registry,
    /** Simulate the workspace row's fiber becoming active only after this plugin applied. */
    setMounted: (registryPresent: boolean, domainPresent = registryPresent) => {
      present.registry = registryPresent
      present.domain = domainPresent
    },
  }
}

describe('createArchiveStore', () => {
  it('reads the registry archive set and drops ids durably', async () => {
    const { ctx, holder, durable, calls } = makeCtx({ archived: ['a', 'b', 'c'] })
    const store = createArchiveStore(ctx)
    expect(store.mounted).toBe(true)
    expect(store.writable()).toBe(true)
    expect(store.ids()).toEqual(['a', 'b', 'c'])

    const result = await store.drop(['b', 'c'])
    expect(result.archivedIds).toEqual(['a'])
    expect(result.absent).toEqual([])
    expect(result.staleSnapshot).toBe(false)
    expect(holder.state.archivedSessionIds).toEqual(['a'])
    expect(durable).toEqual([['a']])
    // 与注册表自身的写入串行化。
    expect(calls).toContain('enqueue')
    expect(store.ids()).toEqual(['a'])
  })

  it('reports ids that are not archived and skips the write', async () => {
    const { ctx, durable } = makeCtx({ archived: ['a'] })
    const store = createArchiveStore(ctx)
    const result = await store.drop(['zzz'])
    expect(result.absent).toEqual(['zzz'])
    expect(result.archivedIds).toEqual(['a'])
    expect(durable).toEqual([])
  })

  it('prefers the upstream unarchiveSession API when present', async () => {
    const { ctx, calls, durable } = makeCtx({ archived: ['a', 'b'], withPublicApi: true })
    const store = createArchiveStore(ctx)
    const result = await store.drop(['b'])
    expect(calls).toContain('unarchive:b')
    expect(calls).not.toContain('setState')
    expect(result.archivedIds).toEqual(['a'])
    expect(durable).toEqual([])
  })

  it('falls back to the domain global when the registry exposes no setState', async () => {
    const { ctx, holder } = makeCtx({ archived: ['a', 'b'], withSetState: false })
    const store = createArchiveStore(ctx)
    const result = await store.drop(['a'])
    expect(result.archivedIds).toEqual(['b'])
    expect(result.staleSnapshot).toBe(false)
    expect(holder.state.archivedSessionIds).toEqual(['b'])
  })

  it('reports removed ids from the state the write actually saw', async () => {
    // 并发归档：写前快照里 'b' 尚未归档，但写入读到的状态已包含 'b' —— 不能把它当成“未归档”跳过。
    const { ctx, holder } = makeCtx({ archived: ['a'], beforeWrite: archive => { archive('b') } })
    const store = createArchiveStore(ctx)
    const result = await store.drop(['a', 'b'])
    expect(result.absent).toEqual([])
    expect(result.archivedIds).toEqual([])
    expect(holder.state.archivedSessionIds).toEqual([])
  })

  it('picks up a workspace registry that mounts after the plugin applied', async () => {
    // 插件应用时 dsh-workspace 的 fiber 仍在启动（ctx.get 严格模式返回 undefined），
    // 服务稍后就绪——因此读取必须延迟到调用时刻，而不是在应用时捕获。
    const { ctx, holder, setMounted } = makeCtx({ archived: ['a', 'b'] })
    setMounted(false)
    const store = createArchiveStore(ctx)
    expect(store.mounted).toBe(false)
    expect(store.writable()).toBe(false)
    expect(store.ids()).toEqual([])

    setMounted(true)
    expect(store.mounted).toBe(true)
    expect(store.writable()).toBe(true)
    expect(store.ids()).toEqual(['a', 'b'])

    const result = await store.drop(['a'])
    expect(result.archivedIds).toEqual(['b'])
    expect(holder.state.archivedSessionIds).toEqual(['b'])
  })

  it('refuses when no workspace registry is mounted', async () => {
    const { ctx } = makeCtx({ withRegistry: false })
    const store = createArchiveStore(ctx)
    expect(store.mounted).toBe(false)
    expect(store.writable()).toBe(false)
    expect(store.ids()).toEqual([])
    await expect(store.drop(['a'])).rejects.toBeInstanceOf(BasicsError)
  })

  it('refuses when neither a setState nor a domain global is reachable', async () => {
    const { ctx } = makeCtx({ archived: ['a'], withSetState: false, withDomain: false })
    const store = createArchiveStore(ctx)
    expect(store.writable()).toBe(false)
    await expect(store.drop(['a'])).rejects.toBeInstanceOf(BasicsError)
  })

  it('refuses the global write when the registry snapshot cannot be resynchronized', async () => {
    const { ctx, durable } = makeCtx({ archived: ['a'], withSetState: false, withStateField: false })
    const store = createArchiveStore(ctx)
    await expect(store.drop(['a'])).rejects.toBeInstanceOf(BasicsError)
    // 预检失败时不得写入磁盘，避免后续注册表写入把已恢复的会话又写回归档。
    expect(durable).toEqual([])
  })
})
