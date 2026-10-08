/**
 * Composition scanning: locate every source that may declare MCP servers and
 * extract the `mcp-client` rows it holds.
 *
 * Sources are (a) the profile patch layers (home-level and per-profile),
 * (b) the agent-preset declarations those files carry — DSH ≥0.1.7 keeps a
 * preset's composition in the declaration row's `config.plugins`, so a preset
 * is scanned by descending into that list, (c) agent-preset declarations
 * mounted from installed bundles, whose effective `config` is read from the
 * Loader entry and which stay read-only, and (d) any deployment-declared extra
 * files. Legacy directory presets (`$DSH_HOME/.agent-presets/<id>/`) are read
 * only when no agent-preset roster service exists: DSH ≥0.1.7 reads no such
 * directory, so listing it would show inert configuration.
 */
import { readFile, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { parseDocument } from 'yaml'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import type { Context, BasicsLoader } from '../../context-types.ts'
import type { ResolvedBasicsConfig } from '../../config.ts'

/** One `mcp-client` row found in a composition (raw config stays host-side). */
export interface McpRowFile {
  rowId: string | null
  serverName: string
  disabled: boolean
  config: Record<string, unknown>
  /** Preset that owns this row (declared inside its `config.plugins`), when any. */
  presetId?: string
}

/** One composition source and its MCP rows. */
export interface McpSourceFile {
  scope: 'profile' | 'preset'
  scopeLabel: string
  /** Declaring file (empty for a preset declaration read from the Loader tree). */
  path: string
  readOnly: boolean
  rows: McpRowFile[]
}

/** Whether a plugin module specifier names the MCP client bridge. */
export function isMcpClientName(name: unknown): boolean {
  return typeof name === 'string' && /mcp-client/.test(name)
}

/** Whether a plugin module specifier names the agent-preset declaration. */
export function isAgentPresetName(name: unknown): boolean {
  return typeof name === 'string' && /dsh-agent-preset/.test(name)
}

/** Preset identity a declaration publishes (`config.id`), when it is readable. */
function presetIdOfConfig(config: unknown): string | undefined {
  if (config === null || typeof config !== 'object') return undefined
  const id = (config as Record<string, unknown>).id
  return typeof id === 'string' && id !== '' ? id : undefined
}

/** Read one `mcp-client` row from a composition row object. */
function toRowFile(obj: Record<string, unknown>, presetId: string | undefined): McpRowFile {
  const config = (obj.config ?? {}) as Record<string, unknown>
  return {
    rowId: typeof obj.id === 'string' ? obj.id : null,
    serverName: typeof config.serverName === 'string' ? config.serverName : '',
    disabled: obj.disabled === true,
    config,
    ...(presetId !== undefined ? { presetId } : {}),
  }
}

/**
 * Walk a composition value, collecting `mcp-client` rows. A preset declaration
 * re-scopes the rows below it to that preset; an `insert` list and a group's
 * child list are walked in place.
 */
function walkValue(node: unknown, presetId: string | undefined, rows: McpRowFile[]): void {
  if (Array.isArray(node)) {
    for (const item of node) walkValue(item, presetId, rows)
    return
  }
  if (node === null || typeof node !== 'object') return
  const obj = node as Record<string, unknown>
  if (isAgentPresetName(obj.name)) {
    // A preset declaration: its composition lives under `config.plugins`.
    const declared = presetIdOfConfig(obj.config)
    // A declaration without a readable `config.id` is broken for the registry
    // too, and no row target could address its rows; listing them as profile
    // rows would offer an edit the scope-aware editor then refuses.
    if (declared === undefined) return
    walkValue((obj.config as Record<string, unknown> | undefined)?.plugins, declared, rows)
    return
  }
  if (Array.isArray(obj.insert)) {
    for (const item of obj.insert) walkValue(item, presetId, rows)
  }
  if (isMcpClientName(obj.name)) rows.push(toRowFile(obj, presetId))
  // An entry group carries its children in `config`.
  if (Array.isArray(obj.config)) walkValue(obj.config, presetId, rows)
}

/** Every MCP row declared in one already-parsed composition value. */
export function collectMcpRowsFromValue(value: unknown): McpRowFile[] {
  const rows: McpRowFile[] = []
  walkValue(value, undefined, rows)
  return rows
}

/** Every MCP row declared in one already-parsed preset plugin list. */
export function collectPresetRows(presetId: string, plugins: unknown): McpRowFile[] {
  const rows: McpRowFile[] = []
  walkValue(plugins, presetId, rows)
  return rows
}

/**
 * Extract every `mcp-client` row from a composition document (a top-level YAML
 * array). Handles profile patch entries (`{insert: [...]}`), plain rows, preset
 * declarations (`{id, name, config: {plugins}}`) and entry groups alike.
 */
export function collectMcpRows(text: string): McpRowFile[] {
  const doc = parseDocument(text)
  if (doc.errors.length > 0) return []
  return collectMcpRowsFromValue(doc.toJS())
}

/** Group rows by their owning preset, preserving declaration order. */
function byPreset(rows: McpRowFile[]): Map<string, McpRowFile[]> {
  const groups = new Map<string, McpRowFile[]>()
  for (const row of rows) {
    if (row.presetId === undefined) continue
    const bucket = groups.get(row.presetId) ?? []
    bucket.push(row)
    groups.set(row.presetId, bucket)
  }
  return groups
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile()
  } catch {
    return false
  }
}

async function listDirs(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true })
    return entries.filter(e => e.isDirectory()).map(e => e.name)
  } catch {
    return []
  }
}

async function rowsOf(path: string): Promise<McpRowFile[]> {
  try {
    return collectMcpRows(await readFile(path, 'utf8'))
  } catch {
    return []
  }
}

/** Preset declarations mounted from installed bundles, with their live config. */
function loaderPresetRows(ctx: Context): { id: string; rows: McpRowFile[] }[] {
  const found: { id: string; rows: McpRowFile[] }[] = []
  try {
    const loader = ctx.get('loader') as BasicsLoader | undefined
    if (loader === undefined || typeof loader.entries !== 'function') return found
    for (const entry of loader.entries()) {
      if (!isAgentPresetName(entry.options?.name)) continue
      const config = entry.options?.config
      const id = presetIdOfConfig(config) ?? entry.options?.id
      if (typeof id !== 'string' || id === '') continue
      const plugins = (config as Record<string, unknown> | undefined)?.plugins
      found.push({ id, rows: collectPresetRows(id, plugins) })
    }
  } catch {
    // Loader unreadable → preset scope degrades to the file-declared rows only.
  }
  return found
}

/**
 * Legacy directory presets (`$DSH_HOME/.agent-presets/<id>/agent.cordis.yml`),
 * the DSH ≤0.1.6 layout. Read only when no roster service answers, because
 * DSH ≥0.1.7 mounts no such directory (its own migration guide says so).
 */
async function legacyDirectoryPresets(ctx: Context): Promise<McpSourceFile[]> {
  if (ctx.get('agentPresets') !== undefined) return []
  const root = join(resolveDshHome(), '.agent-presets')
  const sources: McpSourceFile[] = []
  for (const id of await listDirs(root)) {
    const path = join(root, id, 'agent.cordis.yml')
    if (!(await isFile(path))) continue
    sources.push({ scope: 'preset', scopeLabel: id, path, readOnly: false, rows: await rowsOf(path) })
  }
  return sources
}

/** Discover every composition source and its MCP rows. */
export async function scanMcpSources(ctx: Context, resolved: ResolvedBasicsConfig): Promise<McpSourceFile[]> {
  const home = resolveDshHome()
  const profiles: McpSourceFile[] = []
  const presets: McpSourceFile[] = []
  const seenPresets = new Set<string>()

  /** Split one file's rows into its profile source and one source per preset. */
  const addFile = (scopeLabel: string, path: string, rows: McpRowFile[]): void => {
    profiles.push({ scope: 'profile', scopeLabel, path, readOnly: false, rows: rows.filter(row => row.presetId === undefined) })
    for (const [presetId, presetRows] of byPreset(rows)) {
      seenPresets.add(presetId)
      presets.push({ scope: 'preset', scopeLabel: presetId, path, readOnly: false, rows: presetRows })
    }
  }

  const homePatch = join(home, 'cordis.patch.yml')
  if (await isFile(homePatch)) addFile('home', homePatch, await rowsOf(homePatch))

  for (const profileName of await listDirs(join(home, 'profiles'))) {
    const path = join(home, 'profiles', profileName, 'cordis.patch.yml')
    if (await isFile(path)) addFile(profileName, path, await rowsOf(path))
  }

  for (const extra of resolved.extraMcpFiles) {
    if (await isFile(extra)) addFile('extra', extra, await rowsOf(extra))
  }

  presets.push(...await legacyDirectoryPresets(ctx))

  // Installed bundles declare their presets outside the editable patch layer:
  // show those rows read-only, and skip a preset an editable file already
  // declares (the patch layer overrides the bundle's declaration wholesale).
  for (const preset of loaderPresetRows(ctx)) {
    if (seenPresets.has(preset.id) || preset.rows.length === 0) continue
    seenPresets.add(preset.id)
    presets.push({ scope: 'preset', scopeLabel: preset.id, path: '', readOnly: true, rows: preset.rows })
  }

  // Presets without any MCP row are omitted on purpose: an empty preset card
  // reads as a broken page rather than as "this preset declares no server".
  return [...profiles, ...presets.filter(source => source.rows.length > 0)]
}
