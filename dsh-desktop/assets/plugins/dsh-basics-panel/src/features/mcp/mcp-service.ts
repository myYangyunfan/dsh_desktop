/**
 * MCP feature (host): list every MCP server grouped by source scope, report
 * its masked config and live runtime status, toggle a server on/off by
 * flipping the `disabled` flag in its source file (profile patches hot-reload;
 * preset compositions take effect for new sessions), and append a new server
 * row into an editable patch layer.
 */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import type { Context, BasicsLoader, BasicsAgentPresets } from '../../context-types.ts'
import type { FeatureContext } from '../registry.ts'
import { BasicsError } from '../../wire.ts'
import { requireString, optionalString, requireBoolean } from '../../wire.ts'
import { atomicWrite, samePath } from '../../atomic.ts'
import { scanMcpSources, isMcpClientName, type McpRowFile, type McpSourceFile } from './composition-scan.ts'
import { addRow, setRowDisabled, setRowConfig, type RowConfigPatch } from './yaml-edit.ts'
import { MASK, maskArgs, maskValues, maskUrl } from './secret-mask.ts'

/** One masked server view shipped to the client. */
export interface McpServerRow {
  rowId: string | null
  serverName: string
  transport: 'stdio' | 'streamable-http' | 'unknown'
  disabled: boolean
  editable: boolean
  command?: string
  args?: string[]
  env?: Record<string, string>
  cwd?: string
  url?: string
  headers?: Record<string, string>
  toolCallTimeoutMs?: number
  /**
   * Live status. `probe` says how trustworthy it is: `global` rows are
   * observed in this process's Loader tree and tool registry, `preset` rows
   * are read from their preset's composition inventory (the server itself
   * starts inside a session's scoped world, where its tools stay invisible to
   * the host registry), and `unknown` means no inventory answered.
   */
  runtime: { mounted: boolean; toolCount: number; probe: 'global' | 'preset' | 'unknown' }
}

/** One scope group in the list. */
export interface McpGroup {
  scope: 'profile' | 'preset'
  scopeLabel: string
  /** Declaring file; empty for a preset declaration read from the Loader tree. */
  path: string
  readOnly: boolean
  servers: McpServerRow[]
}

function maskedView(row: McpRowFile, editable: boolean, mounted: boolean, toolCount: number, probe: 'global' | 'preset' | 'unknown'): McpServerRow {
  const c = row.config
  const transport = c.transport === 'streamable-http' ? 'streamable-http' : c.transport === 'stdio' ? 'stdio' : 'unknown'
  return {
    rowId: row.rowId,
    serverName: row.serverName,
    transport,
    disabled: row.disabled,
    editable,
    ...(typeof c.command === 'string' ? { command: c.command } : {}),
    ...(Array.isArray(c.args) ? { args: maskArgs(c.args as string[]) } : {}),
    ...(typeof c.env === 'object' && c.env !== null ? { env: maskValues(c.env as Record<string, string>) } : {}),
    ...(typeof c.cwd === 'string' && c.cwd !== '' ? { cwd: c.cwd } : {}),
    ...(typeof c.url === 'string' ? { url: maskUrl(c.url) } : {}),
    ...(typeof c.headers === 'object' && c.headers !== null ? { headers: maskValues(c.headers as Record<string, string>) } : {}),
    ...(typeof c.toolCallTimeoutMs === 'number' ? { toolCallTimeoutMs: c.toolCallTimeoutMs } : {}),
    runtime: { mounted, toolCount, probe },
  }
}

/** Restore masked placeholders against the raw config so unchanged secrets survive a save. */
function resolveMaskedPatch(patch: RowConfigPatch, raw: Record<string, unknown>): RowConfigPatch {
  const out = { ...patch }
  const rawArgs = Array.isArray(raw.args) ? raw.args as string[] : undefined
  if (Array.isArray(out.args) && rawArgs !== undefined) {
    out.args = out.args.map((value, index) => (value === MASK && rawArgs[index] !== undefined ? rawArgs[index] : value))
  }
  const rawEnv = typeof raw.env === 'object' && raw.env !== null ? raw.env as Record<string, string> : undefined
  if (out.env !== null && out.env !== undefined && rawEnv !== undefined) {
    const env = { ...out.env }
    for (const key of Object.keys(env)) {
      if (env[key] === MASK && rawEnv[key] !== undefined) env[key] = rawEnv[key]
    }
    out.env = env
  }
  if (typeof out.url === 'string' && out.url.includes(MASK) && typeof raw.url === 'string') {
    out.url = raw.url
  }
  return out
}

/** Cross-reference the loader tree and tool registry for live status. */
function runtimeFacts(ctx: Context): { mountedByServer: Map<string, boolean>; toolNames: string[] } {
  const mountedByServer = new Map<string, boolean>()
  try {
    const loader = ctx.get('loader') as BasicsLoader | undefined
    if (loader !== undefined && typeof loader.entries === 'function') {
      for (const entry of loader.entries()) {
        const name = entry.options?.name ?? ''
        if (!/mcp-client/.test(name)) continue
        const cfg = entry.options?.config
        const serverName = cfg !== undefined && typeof cfg.serverName === 'string' ? cfg.serverName : ''
        if (serverName !== '') mountedByServer.set(serverName, !entry.disabled)
      }
    }
  } catch {
    // loader unreadable → status degrades to "unknown" (mounted=false)
  }
  let toolNames: string[] = []
  try {
    toolNames = ctx.tools.schemas().map(schema => schema.name)
  } catch {
    toolNames = []
  }
  return { mountedByServer, toolNames }
}

function toolCountFor(serverName: string, toolNames: string[]): number {
  const prefix = `mcp__${serverName}__`
  let count = 0
  for (const name of toolNames) if (name.startsWith(prefix)) count += 1
  return count
}

/**
 * The cordis `FiberState.ACTIVE` ordinal. The inventory reports the raw numeric
 * enum (0 PENDING, 1 LOADING, 2 ACTIVE, 3 FAILED, 4 DISPOSED, 5 UNLOADING), so
 * a string comparison would silently read every row as inactive.
 */
const FIBER_STATE_ACTIVE = 2

/**
 * Live activation of the MCP rows inside each preset's composition, keyed
 * `presetId::rowId`. A preset's plugins mount in that preset's own scoped
 * world, so the host Loader tree and tool registry cannot see them; the preset
 * registry's inventory is the only host-side witness that the row activated.
 * A row the inventory reports without a fiber state stays out of the map, which
 * the caller reads as "activation unknown" rather than "not active".
 */
async function presetRowStates(ctx: Context): Promise<Map<string, boolean>> {
  const states = new Map<string, boolean>()
  const agentPresets = ctx.get('agentPresets') as BasicsAgentPresets | undefined
  if (agentPresets === undefined || typeof agentPresets.compositionInventory !== 'function') return states
  try {
    for (const preset of await agentPresets.compositionInventory()) {
      for (const row of preset.rows) {
        if (row.entryId === null || !isMcpClientName(row.moduleName)) continue
        if (typeof row.fiberState !== 'number') continue
        states.set(`${preset.id}::${row.entryId}`, row.fiberState === FIBER_STATE_ACTIVE)
      }
    }
  } catch {
    // Inventory unreadable → preset rows report an unknown probe instead.
  }
  return states
}

/** Build the MCP feature API. */
export function registerMcp(fc: FeatureContext): Record<string, (payload: unknown) => Promise<unknown> | unknown> {
  const { ctx, resolved } = fc

  const list = async (): Promise<{ groups: McpGroup[] }> => {
    const sources = await scanMcpSources(ctx, resolved)
    const { mountedByServer, toolNames } = runtimeFacts(ctx)
    const presetStates = await presetRowStates(ctx)
    const groups: McpGroup[] = sources.map((source: McpSourceFile) => ({
      scope: source.scope,
      scopeLabel: source.scopeLabel,
      path: source.path,
      readOnly: source.readOnly,
      servers: source.rows.map(row => {
        const editable = !resolved.readOnly && !source.readOnly
        if (source.scope === 'preset') {
          const state = row.rowId === null ? undefined : presetStates.get(`${source.scopeLabel}::${row.rowId}`)
          return maskedView(row, editable, state === true, 0, state === undefined ? 'unknown' : 'preset')
        }
        const mounted = mountedByServer.get(row.serverName) ?? false
        return maskedView(row, editable, mounted, toolCountFor(row.serverName, toolNames), 'global')
      }),
    }))
    return { groups }
  }

  /**
   * Resolve the addressed row inside the editable scan. A file may declare the
   * same server name in its profile rows and inside a preset declaration, so
   * the client's `presetId` (the group it rendered) selects the scope; without
   * it the first source holding a matching row wins, which keeps older client
   * bundles working.
   */
  const resolveTarget = (
    sources: McpSourceFile[],
    path: string,
    match: (row: McpRowFile) => boolean,
    presetId: string | null,
  ): { source: McpSourceFile; row: McpRowFile } => {
    const candidates = sources.filter(s => s.path !== '' && !s.readOnly && samePath(s.path, path))
    if (candidates.length === 0) {
      throw new BasicsError('forbidden', '该文件不在可编辑范围内', 403)
    }
    for (const source of candidates) {
      if (presetId !== null && (source.scope !== 'preset' || source.scopeLabel !== presetId)) continue
      const row = source.rows.find(match)
      if (row !== undefined) return { source, row }
    }
    throw new BasicsError('not-found', '配置中未找到对应的 MCP 服务器行', 404)
  }

  const setEnabled = async (payload: unknown): Promise<{ ok: true; disabled: boolean; takesEffect: 'live' | 'new-session' }> => {
    if (resolved.readOnly) throw new BasicsError('read-only', '面板处于只读模式', 403)
    const path = requireString(payload, 'path')
    const serverName = requireString(payload, 'serverName')
    const rowId = optionalString(payload, 'rowId') ?? null
    const enabled = requireBoolean(payload, 'enabled')
    const presetId = optionalString(payload, 'presetId') ?? null

    const sources = await scanMcpSources(ctx, resolved)
    const { source, row } = resolveTarget(
      sources,
      path,
      r => r.serverName === serverName || (rowId !== null && r.rowId === rowId),
      presetId,
    )

    let text: string
    try {
      text = await readFile(path, 'utf8')
    } catch (error) {
      throw new BasicsError('fs-error', `无法读取配置: ${error instanceof Error ? error.message : String(error)}`, 400)
    }
    const result = setRowDisabled(text, { rowId, serverName, presetId: row.presetId ?? null }, !enabled)
    if (!result.ok) {
      throw new BasicsError('mcp-error', `配置中未找到服务器 "${serverName}" 对应的行`, 400)
    }
    try {
      await atomicWrite(path, result.text)
    } catch (error) {
      throw new BasicsError('fs-error', `无法写入配置: ${error instanceof Error ? error.message : String(error)}`, 400)
    }
    return {
      ok: true,
      disabled: !enabled,
      takesEffect: source.scope === 'preset' ? 'new-session' : 'live',
    }
  }

  const save = async (payload: unknown): Promise<{ ok: true }> => {
    if (resolved.readOnly) throw new BasicsError('read-only', '面板处于只读模式', 403)
    const path = requireString(payload, 'path')
    const serverName = requireString(payload, 'serverName')
    const rowId = optionalString(payload, 'rowId') ?? null
    const presetId = optionalString(payload, 'presetId') ?? null
    const record = payload as Record<string, unknown> | null
    const patch = (record?.patch ?? {}) as RowConfigPatch

    const sources = await scanMcpSources(ctx, resolved)
    const { row } = resolveTarget(
      sources,
      path,
      r => r.serverName === serverName || (rowId !== null && r.rowId === rowId),
      presetId,
    )

    let text: string
    try {
      text = await readFile(path, 'utf8')
    } catch (error) {
      throw new BasicsError('fs-error', `无法读取配置: ${error instanceof Error ? error.message : String(error)}`, 400)
    }
    const result = setRowConfig(text, { rowId, serverName, presetId: row.presetId ?? null }, resolveMaskedPatch(patch, row.config))
    if (!result.ok) {
      throw new BasicsError('mcp-error', `配置中未找到服务器 "${serverName}" 对应的行`, 400)
    }
    try {
      await atomicWrite(path, result.text)
    } catch (error) {
      throw new BasicsError('fs-error', `无法写入配置: ${error instanceof Error ? error.message : String(error)}`, 400)
    }
    return { ok: true }
  }

  /**
   * Append a new `mcp-client` row. Without an explicit `path` the row lands in
   * the first editable profile source, falling back to the home-level patch when
   * the deployment has none yet — the empty-state case this method exists for.
   */
  const create = async (payload: unknown): Promise<{ ok: true; serverName: string; path: string }> => {
    if (resolved.readOnly) throw new BasicsError('read-only', '面板处于只读模式', 403)
    const serverName = requireString(payload, 'serverName')
    const transport = requireString(payload, 'transport')
    if (transport !== 'stdio' && transport !== 'streamable-http') {
      throw new BasicsError('bad-request', '非法的传输方式 "transport"（仅 stdio / streamable-http）')
    }
    const record = (payload ?? {}) as Record<string, unknown>
    const command = optionalString(payload, 'command')
    const url = optionalString(payload, 'url')
    const cwd = optionalString(payload, 'cwd')
    const args = Array.isArray(record.args)
      ? record.args.filter((value): value is string => typeof value === 'string')
      : undefined
    const envValue = record.env
    const env = envValue !== null && typeof envValue === 'object' && !Array.isArray(envValue)
      ? envValue as Record<string, string>
      : undefined
    const toolCallTimeoutMs = typeof record.toolCallTimeoutMs === 'number' ? record.toolCallTimeoutMs : undefined

    const sources = await scanMcpSources(ctx, resolved)
    if (sources.some(source => source.rows.some(row => row.serverName === serverName))) {
      throw new BasicsError('conflict', `MCP 服务器 "${serverName}" 已存在`, 409)
    }

    const pathParam = optionalString(payload, 'path')
    let target: string
    if (pathParam !== undefined) {
      const source = sources.find(
        candidate => candidate.path !== '' && !candidate.readOnly && samePath(candidate.path, pathParam),
      )
      if (source === undefined) throw new BasicsError('forbidden', '该文件不在可编辑范围内', 403)
      target = source.path
    } else {
      target = sources.find(source => source.scope === 'profile' && !source.readOnly)?.path
        ?? join(resolveDshHome(), 'cordis.patch.yml')
    }

    const config: Record<string, unknown> = { serverName, transport }
    if (command !== undefined) config.command = command
    if (url !== undefined) config.url = url
    if (cwd !== undefined) config.cwd = cwd
    if (args !== undefined) config.args = args
    if (env !== undefined) config.env = env
    if (toolCallTimeoutMs !== undefined) config.toolCallTimeoutMs = toolCallTimeoutMs

    let text = ''
    try {
      text = await readFile(target, 'utf8')
    } catch {
      text = ''
    }
    const result = addRow(text, { id: `mcp-${serverName}`, name: '@deepseek-ai/dsh-mcp-client', config })
    if (!result.ok) throw new BasicsError('mcp-error', '无法解析 MCP 组合文件以追加新服务器', 400)
    try {
      await atomicWrite(target, result.text)
    } catch (error) {
      throw new BasicsError('fs-error', `无法写入配置: ${error instanceof Error ? error.message : String(error)}`, 400)
    }
    return { ok: true, serverName, path: target }
  }

  return {
    'mcp.list': list,
    'mcp.setEnabled': setEnabled,
    'mcp.save': save,
    'mcp.create': create,
  }
}
