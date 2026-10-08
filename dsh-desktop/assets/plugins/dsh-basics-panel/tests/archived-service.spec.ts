import { mkdtemp, mkdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Context } from 'cordis'
import { registerArchived, type ArchivedList, type ArchivedMutation } from '../src/features/archived/archived-service.ts'
import type { FeatureContext } from '../src/features/registry.ts'
import { resolveBasicsConfig, type ResolvedBasicsConfig } from '../src/config.ts'
import { BasicsError } from '../src/wire.ts'

let root = ''

/** One stored-session snapshot as the persistence backend reports it. */
interface Snapshot {
  header: { id: string; cwd?: string; createdAt?: number }
  eventCount?: number
  sizeBytes?: number
}

/** Build the fake host context the archived feature consumes. */
function makeCtx(options: {
  archived: string[]
  snapshots: Snapshot[]
  loaded?: string[]
  running?: string[]
  agentsAbsent?: boolean
  detach?: string[]
  registryInitiallyAbsent?: boolean
}) {
  // 模拟真实注册表：权威状态是一个稳定引用的对象，setState 就地替换它。
  const holder = {
    value: { initialized: true, workspaceIds: [] as string[], archivedSessionIds: [...options.archived] },
  }
  // 服务可用性可变：镜像 cordis 的「提供方 fiber 尚未 ACTIVE 时 ctx.get 返回 undefined」。
  // dsh-workspace 未就绪时，它提供的注册表与它打开的 workspace 域都还不存在，故两者一起切换。
  const presence = { registry: options.registryInitiallyAbsent !== true }
  const detached: string[] = options.detach ?? []
  const ctx = {
    get: (name: string) => {
      if (name === 'workspaceRegistry') {
        if (!presence.registry) return undefined
        return {
          get archivedSessionIds() { return holder.value.archivedSessionIds },
          get state() { return holder.value },
          set state(next: typeof holder.value) { holder.value = next },
          list: () => [{
            id: 'ws-1',
            sessionIds: [...options.archived],
            detachSession: async (id: string) => { detached.push(id) },
          }],
          async setState(next: typeof holder.value) {
            holder.value = next
          },
        }
      }
      if (name === 'storageDomain') {
        if (!presence.registry) return undefined
        return {
          get: () => ({
            global: {
              get: () => holder.value,
              set: async (value: unknown) => { holder.value = value as typeof holder.value },
            },
          }),
        }
      }
      if (name === 'agents') {
        // 真机形态：装载过的会话有 Agent（status 为 idle 或 running），冷会话没有 Agent。
        if (options.agentsAbsent === true) return undefined
        return {
          get: (id: string) => {
            if (!(options.loaded ?? []).includes(id)) return undefined
            return { status: (options.running ?? []).includes(id) ? 'running' : 'idle' }
          },
        }
      }
      if (name === 'sessionPersistence') {
        return { list: async () => options.snapshots }
      }
      return undefined
    },
    sessions: {
      get: (id: string) => ((options.loaded ?? []).includes(id) ? { header: { cwd: root } } : undefined),
    },
  } as unknown as Context
  return {
    ctx,
    holder: { get archived() { return holder.value.archivedSessionIds } },
    detached,
    presence,
  }
}

/** Build the archived feature handlers over a temp sessions root. */
function makeApi(options: {
  archived: string[]
  snapshots: Snapshot[]
  loaded?: string[]
  running?: string[]
  agentsAbsent?: boolean
  config?: Partial<ResolvedBasicsConfig>
  registryInitiallyAbsent?: boolean
}) {
  const { ctx, holder, detached, presence } = makeCtx(options)
  const fc: FeatureContext = {
    ctx,
    resolved: resolveBasicsConfig({ sessionsRoot: root, ...options.config }),
    sessionCwdOf: () => root,
  }
  const api = registerArchived(fc) as unknown as {
    'archived.list': () => Promise<ArchivedList>
    'archived.restore': (payload: unknown) => Promise<ArchivedMutation>
    'archived.delete': (payload: unknown) => Promise<ArchivedMutation>
  }
  return { api, holder, detached, presence }
}

/** Create one session directory holding a generation log. */
async function seedSession(id: string, bytes = 10): Promise<string> {
  const directory = join(root, '--proj--', id)
  await mkdir(directory, { recursive: true })
  await writeFile(join(directory, 'session.jsonl.zstd'), 'x'.repeat(bytes), 'utf8')
  return directory
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'basics-archived-'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('archived.list', () => {
  it('joins the archive set with the stored-session listing', async () => {
    await seedSession('session-1')
    const { api } = makeApi({
      archived: ['session-1', 'session-ghost'],
      snapshots: [
        { header: { id: 'session-1', cwd: 'C:/proj', createdAt: 100 }, sizeBytes: 10, eventCount: 4 },
      ],
    })
    const result = await api['archived.list']()
    expect(result.archivedIds).toEqual(['session-1', 'session-ghost'])
    expect(result.totalBytes).toBe(10)
    expect(result.readOnly).toBe(false)
    expect(result.deleteEnabled).toBe(true)
    expect(result.listingFailed).toBe(false)
    expect(result.maxBatchIds).toBe(200)
    const stored = result.rows.find(row => row.id === 'session-1')
    expect(stored).toMatchObject({ cwd: 'C:/proj', createdAt: 100, stored: true, loaded: false, running: false, deletable: true, restorable: true })
    // 悬空条目（磁盘上已无产物）同样可删：只清理归档记录。
    const ghost = result.rows.find(row => row.id === 'session-ghost')
    expect(ghost).toMatchObject({ stored: false, deletable: true })
  })

  it('separates a loaded-but-idle session from a running one', async () => {
    const { api } = makeApi({
      archived: ['session-idle', 'session-busy'],
      snapshots: [{ header: { id: 'session-idle' } }, { header: { id: 'session-busy' } }],
      loaded: ['session-idle', 'session-busy'],
      running: ['session-busy'],
    })
    const result = await api['archived.list']()
    // 装载但空闲：保留徽标，但不再拦住删除。
    expect(result.rows.find(row => row.id === 'session-idle'))
      .toMatchObject({ loaded: true, running: false, deletable: true })
    // 真的在跑回合：仍然拦住删除。
    expect(result.rows.find(row => row.id === 'session-busy'))
      .toMatchObject({ loaded: true, running: true, deletable: false })
  })

  it('treats every session as idle when the agent registry is absent', async () => {
    // 未挂载 dsh-agent 的部署：拿不到 Agent，就不敢只凭内存判定「运行中」。
    const { api } = makeApi({
      archived: ['session-1'],
      snapshots: [{ header: { id: 'session-1' } }],
      loaded: ['session-1'],
      agentsAbsent: true,
    })
    const result = await api['archived.list']()
    expect(result.rows[0]).toMatchObject({ loaded: true, running: false, deletable: true })
  })

  it('only counts an explicit running status as running', async () => {
    // 上游 Agent 必带 status；这里锁住「只认 status === 'running'」的正向判定，
    // 免得换成「status !== 'idle'」之类写法后，字段缺失也会被当成正在运行。
    const { ctx } = makeCtx({
      archived: ['session-1'],
      snapshots: [{ header: { id: 'session-1' } }],
      loaded: ['session-1'],
    })
    const statusless = {
      get: (name: string) => (name === 'agents' ? { get: () => ({}) } : (ctx.get as (key: string) => unknown)(name)),
      // 复用同一份假会话存储，只替换 Agent 注册表。
      sessions: (ctx as unknown as { sessions: unknown }).sessions,
    } as unknown as Context
    const fc: FeatureContext = { ctx: statusless, resolved: resolveBasicsConfig({ sessionsRoot: root }), sessionCwdOf: () => root }
    const api = registerArchived(fc) as unknown as { 'archived.list': () => Promise<ArchivedList> }
    const result = await api['archived.list']()
    expect(result.rows[0]).toMatchObject({ loaded: true, running: false, deletable: true })
  })

  it('does not judge deletability when the stored-session listing fails', async () => {
    const { ctx } = makeCtx({ archived: ['session-1'], snapshots: [] })
    // 存储列表读取失败：服务降级为 listingFailed，且不敢对可删除性下判断。
    const failing = {
      get: (name: string) => (name === 'sessionPersistence'
        ? { list: async () => { throw new Error('listing unavailable') } }
        : (ctx.get as (key: string) => unknown)(name)),
    } as unknown as Context
    const fc: FeatureContext = { ctx: failing, resolved: resolveBasicsConfig({ sessionsRoot: root }), sessionCwdOf: () => root }
    const api = registerArchived(fc) as unknown as { 'archived.list': () => Promise<ArchivedList> }
    const result = await api['archived.list']()
    expect(result.listingFailed).toBe(true)
    expect(result.rows[0]).toMatchObject({ stored: false, deletable: false })
  })

  it('displays the sessions root as configured', async () => {
    const { api } = makeApi({ archived: [], snapshots: [] })
    const configured = await api['archived.list']()
    expect(configured.sessionsRoot).toBe(root.replaceAll('\\', '/'))
    expect(configured.listingFailed).toBe(false)

    const { ctx } = makeCtx({ archived: [], snapshots: [] })
    const fc: FeatureContext = { ctx, resolved: resolveBasicsConfig({}), sessionCwdOf: () => root }
    const fallback = registerArchived(fc) as unknown as { 'archived.list': () => Promise<ArchivedList> }
    // 留空时展示 $DSH_HOME/sessions（不触盘，仅路径换算）。
    expect((await fallback['archived.list']()).sessionsRoot).toMatch(/\/sessions$/)
  })

  it('reports a registry that only becomes available after this plugin applied', async () => {
    // 时序回归：apply 时 dsh-workspace 仍在启动，ctx.get 严格模式返回 undefined；
    // 服务随后就绪，列表必须反映当前状态（而不是固化应用时刻的结果）。
    await seedSession('session-1')
    const { api, presence } = makeApi({
      archived: ['session-1'],
      snapshots: [{ header: { id: 'session-1', cwd: 'C:/proj', createdAt: 100 }, sizeBytes: 10, eventCount: 4 }],
      registryInitiallyAbsent: true,
    })
    const before = await api['archived.list']()
    expect(before.mounted).toBe(false)
    expect(before.writable).toBe(false)
    expect(before.rows).toEqual([])

    presence.registry = true
    const after = await api['archived.list']()
    expect(after.mounted).toBe(true)
    expect(after.writable).toBe(true)
    expect(after.archivedIds).toEqual(['session-1'])
    expect(after.rows[0]).toMatchObject({ stored: true, restorable: true })
  })

  it('refuses every mutation in read-only mode', async () => {
    const { api } = makeApi({ archived: ['session-1'], snapshots: [], config: { readOnly: true } })
    await expect(api['archived.restore']({ ids: ['session-1'] })).rejects.toBeInstanceOf(BasicsError)
    await expect(api['archived.delete']({ ids: ['session-1'] })).rejects.toBeInstanceOf(BasicsError)
  })
})

describe('archived.restore', () => {
  it('drops the ids from the archive set and reports the absent ones', async () => {
    await seedSession('session-1')
    const { api, holder } = makeApi({ archived: ['session-1', 'session-2'], snapshots: [] })
    const result = await api['archived.restore']({ ids: ['session-1', 'session-nope', 'session-1'] })
    expect(result.changed).toEqual(['session-1'])
    expect(result.skipped).toEqual([{ id: 'session-nope', reason: '该会话不在归档集合中' }])
    expect(result.archivedIds).toEqual(['session-2'])
    expect(holder.archived).toEqual(['session-2'])
  })

  it('rejects an empty or oversized id list', async () => {
    const { api } = makeApi({ archived: ['session-1'], snapshots: [], config: { maxBatchIds: 1 } })
    await expect(api['archived.restore']({ ids: [] })).rejects.toBeInstanceOf(BasicsError)
    await expect(api['archived.restore']({ ids: ['a', 'b'] })).rejects.toBeInstanceOf(BasicsError)
    // 原始列表长度先于去重校验，避免超长请求换来实现里的长扫描。
    await expect(api['archived.restore']({ ids: ['a', 'a'] })).rejects.toBeInstanceOf(BasicsError)
    await expect(api['archived.restore']({ ids: [42] })).rejects.toBeInstanceOf(BasicsError)
  })
})

describe('archived.delete', () => {
  it('removes the artifacts, prunes the workspace slot, and clears the archive entry', async () => {
    const directory = await seedSession('session-1', 12)
    const { api, holder, detached } = makeApi({
      archived: ['session-1', 'session-2'],
      snapshots: [{ header: { id: 'session-1' }, sizeBytes: 12 }],
    })
    const result = await api['archived.delete']({ ids: ['session-1'] })
    expect(result.changed).toEqual(['session-1'])
    expect(result.skipped).toEqual([])
    expect(result.freedBytes).toBe(12)
    expect(result.archivedIds).toEqual(['session-2'])
    expect(holder.archived).toEqual(['session-2'])
    expect(detached).toEqual(['session-1'])
    await expect(stat(directory)).rejects.toThrow()
  })

  it('purges a dangling archive entry that has no artifacts left', async () => {
    const { api } = makeApi({ archived: ['session-gone'], snapshots: [] })
    const result = await api['archived.delete']({ ids: ['session-gone'] })
    expect(result.changed).toEqual(['session-gone'])
    expect(result.freedBytes).toBe(0)
    expect(result.archivedIds).toEqual([])
  })

  it('deletes a loaded but idle session and skips a running one', async () => {
    const idleDirectory = await seedSession('session-idle', 8)
    const busyDirectory = await seedSession('session-busy', 8)
    const { api } = makeApi({
      archived: ['session-idle', 'session-busy'],
      snapshots: [{ header: { id: 'session-idle' }, sizeBytes: 8 }, { header: { id: 'session-busy' }, sizeBytes: 8 }],
      loaded: ['session-idle', 'session-busy'],
      running: ['session-busy'],
    })

    // 装载但空闲：没有驱动在动，产物可以删。
    const idle = await api['archived.delete']({ ids: ['session-idle'] })
    expect(idle.changed).toEqual(['session-idle'])
    expect(idle.freedBytes).toBe(8)
    await expect(stat(idleDirectory)).rejects.toThrow()

    const busy = await api['archived.delete']({ ids: ['session-busy'] })
    expect(busy.changed).toEqual([])
    expect(busy.skipped[0]?.reason).toContain('正在运行')
    expect((await stat(busyDirectory)).isDirectory()).toBe(true)

    const other = await api['archived.delete']({ ids: ['session-other'] })
    expect(other.changed).toEqual([])
    expect(other.skipped[0]?.reason).toContain('未归档')
  })

  it('skips an id whose directory name would need escaping', async () => {
    const { api, holder } = makeApi({ archived: ['session~escaped'], snapshots: [] })
    const result = await api['archived.delete']({ ids: ['session~escaped'] })
    expect(result.changed).toEqual([])
    expect(result.skipped[0]?.reason).toContain('无法安全映射')
    // 归档记录保持原样，等待人工处置。
    expect(holder.archived).toEqual(['session~escaped'])
  })

  it('refuses when deletion is disabled by configuration', async () => {
    const { api } = makeApi({ archived: ['session-1'], snapshots: [], config: { allowSessionDelete: false } })
    const result = await api['archived.list']()
    expect(result.deleteEnabled).toBe(false)
    expect(result.rows[0]?.deletable).toBe(false)
    await expect(api['archived.delete']({ ids: ['session-1'] })).rejects.toBeInstanceOf(BasicsError)
  })
})
