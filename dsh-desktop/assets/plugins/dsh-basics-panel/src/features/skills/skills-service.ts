/**
 * Skills feature (host): list skills grouped by scope, load one skill for
 * editing, and save an edit back to the skill file. Reads/writes go through
 * the filesystem provider's own paths (resolved via `ctx.skills`), so the
 * registry — not this plugin — is the authority on where a skill lives; a
 * save re-resolves the path from the registry to avoid path spoofing.
 */
import { readFile, stat } from 'node:fs/promises'
import type { SkillDefinition, SkillSummary, BasicsAgents, BasicsAgent } from '../../context-types.ts'
import type { FeatureContext } from '../registry.ts'
import { BasicsError } from '../../wire.ts'
import { requireString, optionalString } from '../../wire.ts'
import { atomicWrite } from '../../atomic.ts'
import { applySkillEdit, splitSkillFile, type SkillEdit } from './frontmatter.ts'

/** Scope keys used by the client to group and label. */
export type SkillScope = 'project' | 'custom' | 'user' | 'bundled' | 'runtime' | 'other'

/**
 * How the skill-view scope was resolved: the caller named a live session
 * (`session`), the host fell back to another live Agent (`fallback`), or no
 * live Agent exists at all (`none` — the list can then only show global skills).
 */
export type SkillScopeSource = 'session' | 'fallback' | 'none'

/** Map a provider `source` string to a scope key. */
export function scopeOfSource(source: string): SkillScope {
  switch (source) {
    case 'project-dsh':
    case 'project-agents':
      return 'project'
    case 'custom':
      return 'custom'
    case 'user-dsh':
    case 'user-agents':
      return 'user'
    case 'bundled':
      return 'bundled'
    case 'runtime':
      return 'runtime'
    default:
      return 'other'
  }
}

/** Order of scope groups in the list. */
const SCOPE_ORDER: readonly SkillScope[] = ['project', 'custom', 'user', 'bundled', 'runtime', 'other']

/** One skill row in the list. */
export interface SkillRow {
  name: string
  description: string
  whenToUse?: string
  modelInvocable: boolean
  userInvocable: boolean
  source: string
  provider: string
  /** Display location (the skill's resource base), when known. */
  location?: string
  editable: boolean
}

/** One scope group in the list. */
export interface SkillGroup {
  scope: SkillScope
  skills: SkillRow[]
}

/** Whether a definition may be edited through the panel. */
function isEditable(def: Pick<SkillDefinition, 'path' | 'source'>): boolean {
  return def.path !== undefined && def.source !== 'bundled' && def.source !== 'runtime'
}

/** Whether a summary's source denotes an editable skill (path resolved later on open). */
function sourceEditable(source: string): boolean {
  return source !== 'bundled' && source !== 'runtime'
}

/** Display location from a summary's resource base. */
function locationOf(summary: SkillSummary): string | undefined {
  if (summary.resourceBase?.kind === 'directory' && summary.resourceBase.path !== undefined) {
    return summary.resourceBase.path
  }
  if (summary.resourceBase?.kind === 'url' && summary.resourceBase.url !== undefined) {
    return summary.resourceBase.url
  }
  return undefined
}

/** A loaded skill for the editor. */
export interface SkillDetail {
  name: string
  description: string
  whenToUse?: string
  metadata?: Record<string, unknown>
  modelInvocable: boolean
  userInvocable: boolean
  body: string
  path?: string
  source: string
  provider: string
  editable: boolean
  mtime?: number
}

function toRow(summary: SkillSummary, readOnly: boolean): SkillRow {
  const location = locationOf(summary)
  return {
    name: summary.name,
    description: summary.description,
    ...(summary.whenToUse !== undefined ? { whenToUse: summary.whenToUse } : {}),
    modelInvocable: summary.invocation.modelInvocable,
    userInvocable: summary.invocation.userInvocable,
    source: summary.source,
    provider: summary.provider,
    ...(location !== undefined ? { location } : {}),
    editable: !readOnly && sourceEditable(summary.source),
  }
}

/** Read the raw skill file body (untrimmed) plus its mtime, falling back to the definition's trimmed content. */
async function readRawBody(def: SkillDefinition): Promise<{ body: string; mtime?: number }> {
  if (def.path === undefined) return { body: def.content }
  try {
    const [raw, info] = await Promise.all([readFile(def.path, 'utf8'), stat(def.path)])
    const parts = splitSkillFile(raw)
    return { body: parts?.body ?? def.content, mtime: info.mtimeMs }
  } catch {
    return { body: def.content }
  }
}

/** Build the skills feature API. */
export function registerSkills(fc: FeatureContext): Record<string, (payload: unknown) => Promise<unknown> | unknown> {
  const { ctx, resolved } = fc

  const cwdOf = (payload: unknown): string | undefined => {
    const cwd = optionalString(payload, 'cwd')
    return cwd === undefined ? fc.sessionCwdOf(payload) : cwd
  }

  /** The most recently registered live top-level Agent (the newest open session). */
  const lastLiveAgent = (agents: BasicsAgents): BasicsAgent | undefined => {
    try {
      const roots = typeof agents.roots === 'function' ? agents.roots() : agents.list?.() ?? []
      return roots[roots.length - 1]
    } catch {
      return undefined
    }
  }

  /**
   * Resolve the viewing scope key (the live Agent) so preset-scoped skill
   * providers are included. DSH ≥0.1.7 mounts the filesystem skill provider
   * inside each session preset's composition, so a read with no scope observes
   * the global layer alone — which holds no skills at all. When the caller
   * cannot name a live session, fall back to the newest live Agent and report
   * that choice instead of rendering a silently empty list.
   */
  const resolveScope = (payload: unknown): { scope?: BasicsAgent; sessionId?: string; source: SkillScopeSource } => {
    const record = payload as Record<string, unknown> | null
    const sessionId = typeof record?.sessionId === 'string' ? record.sessionId : ''
    const agents = ctx.get('agents') as BasicsAgents | undefined
    if (agents !== undefined && typeof agents.get === 'function') {
      if (sessionId !== '') {
        try {
          const agent = agents.get(sessionId)
          if (agent !== undefined) return { scope: agent, sessionId, source: 'session' }
        } catch {
          // Unresolvable session → fall through to the live-agent fallback.
        }
      }
      const fallback = lastLiveAgent(agents)
      if (fallback !== undefined) {
        return {
          scope: fallback,
          ...(typeof fallback.id === 'string' && fallback.id !== '' ? { sessionId: fallback.id } : {}),
          source: 'fallback',
        }
      }
    }
    return { source: 'none' }
  }

  const view = (payload: unknown): { cwd?: string; scope?: object } => {
    const cwd = cwdOf(payload)
    const { scope } = resolveScope(payload)
    return { cwd, ...(scope !== undefined ? { scope } : {}) }
  }

  const list = async (payload: unknown): Promise<{ groups: SkillGroup[]; complete: boolean; scopeSource: SkillScopeSource; sessionId?: string }> => {
    const cwd = cwdOf(payload)
    const { scope, sessionId, source } = resolveScope(payload)
    const snapshot = await ctx.skills.snapshot({ ...(cwd !== undefined ? { cwd } : {}), ...(scope !== undefined ? { scope } : {}) })
    const groups = new Map<SkillScope, SkillRow[]>()
    for (const summary of snapshot.skills) {
      const scopeKey = scopeOfSource(summary.source)
      const bucket = groups.get(scopeKey) ?? []
      bucket.push(toRow(summary, resolved.readOnly))
      groups.set(scopeKey, bucket)
    }
    const ordered = SCOPE_ORDER
      .filter(key => groups.has(key))
      .map(key => ({ scope: key, skills: groups.get(key)! }))
    return {
      groups: ordered,
      complete: snapshot.complete,
      scopeSource: source,
      ...(sessionId !== undefined ? { sessionId } : {}),
    }
  }

  const get = async (payload: unknown): Promise<SkillDetail> => {
    const name = requireString(payload, 'name')
    const def = await ctx.skills.get(name, view(payload))
    if (def === undefined) throw new BasicsError('not-found', `技能 "${name}" 不存在`, 404)
    const { body, mtime } = await readRawBody(def)
    return {
      name: def.name,
      description: def.description,
      ...(def.whenToUse !== undefined ? { whenToUse: def.whenToUse } : {}),
      ...(def.metadata !== undefined ? { metadata: def.metadata } : {}),
      modelInvocable: def.invocation.modelInvocable,
      userInvocable: def.invocation.userInvocable,
      body,
      ...(def.path !== undefined ? { path: def.path } : {}),
      source: def.source,
      provider: def.provider,
      editable: !resolved.readOnly && isEditable(def),
      ...(mtime !== undefined ? { mtime } : {}),
    }
  }

  const save = async (payload: unknown): Promise<{ ok: true; mtime?: number }> => {
    if (resolved.readOnly) throw new BasicsError('read-only', '面板处于只读模式', 403)
    const name = requireString(payload, 'name')
    const record = payload as Record<string, unknown> | null
    const expectedMtime = typeof record?.expectedMtime === 'number' ? record.expectedMtime : undefined
    const edit = (record?.edit ?? {}) as SkillEdit
    const def = await ctx.skills.get(name, view(payload))
    if (def === undefined) throw new BasicsError('not-found', `技能 "${name}" 不存在`, 404)
    if (!isEditable(def)) throw new BasicsError('skill-error', '该技能为只读（内置或运行时技能）', 403)
    const path = def.path!
    let raw: string
    let mtime: number | undefined
    try {
      raw = await readFile(path, 'utf8')
      const info = await stat(path)
      mtime = info.mtimeMs
    } catch (error) {
      throw new BasicsError('fs-error', `无法读取技能文件: ${error instanceof Error ? error.message : String(error)}`, 400)
    }
    if (expectedMtime !== undefined && mtime !== undefined && Math.abs(expectedMtime - mtime) > 1) {
      throw new BasicsError('conflict', '技能文件已被修改，请刷新后重试', 409)
    }
    let next: string
    try {
      next = applySkillEdit(raw, edit)
    } catch (error) {
      throw new BasicsError('skill-error', error instanceof Error ? error.message : String(error), 400)
    }
    if (Buffer.byteLength(next, 'utf8') > resolved.maxSkillBytes) {
      throw new BasicsError('skill-error', `技能文件超过大小上限 ${resolved.maxSkillBytes} 字节`, 400)
    }
    try {
      await atomicWrite(path, next)
    } catch (error) {
      throw new BasicsError('fs-error', `无法写入技能文件: ${error instanceof Error ? error.message : String(error)}`, 400)
    }
    const info = await stat(path).catch(() => undefined)
    return { ok: true, ...(info !== undefined ? { mtime: info.mtimeMs } : {}) }
  }

  return {
    'skills.list': list,
    'skills.get': get,
    'skills.save': save,
  }
}
