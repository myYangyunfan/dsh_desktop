import { describe, it, expect } from 'vitest'
import { currentSession } from '../src/client/api.ts'
import { registerSkills } from '../src/features/skills/skills-service.ts'
import { resolveBasicsConfig } from '../src/config.ts'
import type { Context } from '../src/context-types.ts'

/** A client Context stub carrying only the sessions feed. */
function clientCtx(snapshot: unknown): Context {
  return { sessions: { list: { getSnapshot: () => snapshot } } } as unknown as Context
}

describe('currentSession (client)', () => {
  it('reads the legacy current field (DSH <= 0.1.6)', () => {
    const ctx = clientCtx({
      current: 'session-old',
      byId: { 'session-old': { id: 'session-old', cwd: 'C:/work', displayTitle: 'old' } },
    })
    expect(currentSession(ctx)).toEqual({ sessionId: 'session-old', cwd: 'C:/work' })
  })

  it('resolves the session the main view retains (DSH >= 0.1.7, no current field)', () => {
    const ctx = clientCtx({
      ids: ['session-b', 'session-a'],
      byId: {
        'session-a': { id: 'session-a', displayTitle: 'a', retainedBy: { sidebar: 1 } },
        'session-b': { id: 'session-b', cwd: 'C:/work/b', displayTitle: 'b', retainedBy: { mainView: 1, sidebar: 1 } },
      },
    })
    expect(currentSession(ctx)).toEqual({ sessionId: 'session-b', cwd: 'C:/work/b' })
  })

  it('returns an empty ref when nothing identifies a session', () => {
    const ctx = clientCtx({ ids: [], byId: {} })
    expect(currentSession(ctx)).toEqual({ sessionId: '', cwd: undefined })
  })

  it('ignores a stale legacy current id', () => {
    const ctx = clientCtx({ current: 'session-gone', byId: { 'session-live': { id: 'session-live', displayTitle: 'live', retainedBy: { mainView: 1 } } } })
    expect(currentSession(ctx).sessionId).toBe('session-live')
  })
})

/** A host Context stub recording the skill view options the service asks for. */
function hostCtx(seen: { options?: Record<string, unknown> }, agents: unknown): Context {
  return {
    get: (name: string) => (name === 'agents' ? agents : undefined),
    skills: {
      snapshot: async (options: Record<string, unknown>) => {
        seen.options = options
        return { skills: [], complete: true }
      },
      get: async () => undefined,
    },
  } as unknown as Context
}

const agentA = { id: 'session-a', status: 'idle' }
const agentB = { id: 'session-b', status: 'idle' }
const agentsWithRoots = { get: (id: string) => (id === 'session-b' ? agentB : undefined), roots: () => [agentA, agentB] }

describe('skills.list scope resolution (host)', () => {
  const list = async (ctx: Context, payload: Record<string, unknown>): Promise<Record<string, unknown>> => {
    const api = registerSkills({ ctx, resolved: resolveBasicsConfig(), sessionCwdOf: () => 'C:/fallback' })
    return await api['skills.list']!(payload) as Record<string, unknown>
  }

  it('uses the session the client named', async () => {
    const seen: { options?: Record<string, unknown> } = {}
    const result = await list(hostCtx(seen, agentsWithRoots), { sessionId: 'session-b', cwd: 'C:/work' })
    expect(seen.options?.scope).toBe(agentB)
    expect(result.scopeSource).toBe('session')
    expect(result.sessionId).toBe('session-b')
  })

  it('falls back to the newest live Agent when the client cannot name one', async () => {
    const seen: { options?: Record<string, unknown> } = {}
    const result = await list(hostCtx(seen, agentsWithRoots), {})
    expect(seen.options?.scope).toBe(agentB)
    expect(result.scopeSource).toBe('fallback')
    expect(result.sessionId).toBe('session-b')
  })

  it('falls back when the named session has no live Agent in this process', async () => {
    const seen: { options?: Record<string, unknown> } = {}
    const result = await list(hostCtx(seen, agentsWithRoots), { sessionId: 'session-stored' })
    expect(seen.options?.scope).toBe(agentB)
    expect(result.scopeSource).toBe('fallback')
  })

  it('reports no scope when the host exposes no live Agent', async () => {
    const seen: { options?: Record<string, unknown> } = {}
    const result = await list(hostCtx(seen, { get: () => undefined, roots: () => [] }), {})
    expect(seen.options?.scope).toBeUndefined()
    expect(seen.options?.cwd).toBe('C:/fallback')
    expect(result.scopeSource).toBe('none')
    expect(result.sessionId).toBeUndefined()
  })
})
