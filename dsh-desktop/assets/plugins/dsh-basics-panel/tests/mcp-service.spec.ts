import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { registerMcp } from '../src/features/mcp/mcp-service.ts'
import { resolveBasicsConfig } from '../src/config.ts'
import type { Context } from '../src/context-types.ts'

// One file declares the same server name twice: once as a profile row and once
// inside a preset declaration. That is the case the scope-aware lookup exists for.
const WEB_PATCH = `# web layer
- insert:
    - id: mcp-dup
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: dup
        transport: stdio

    - id: preset-mine
      name: '@deepseek-ai/dsh-agent-preset'
      config:
        id: mine
        plugins:
          - id: mcp-dup-preset
            name: '@deepseek-ai/dsh-mcp-client'
            config:
              serverName: dup
              transport: stdio
`

const BROKEN_DECLARATION = `- insert:
    - id: preset-no-id
      name: '@deepseek-ai/dsh-agent-preset'
      config:
        plugins:
          - id: mcp-orphan
            name: '@deepseek-ai/dsh-mcp-client'
            config:
              serverName: orphan
`

/** A Context stub: only the services the MCP feature touches. */
function ctxOf(services: Record<string, unknown>): Context {
  return {
    get: (name: string) => services[name],
    tools: { schemas: () => [] },
  } as unknown as Context
}

/** A preset roster stub answering with one activated mcp-client row. */
function roster(fiberState: number | undefined): unknown {
  return {
    list: async () => [],
    compositionInventory: async () => [{
      id: 'mine',
      isDefault: false,
      rows: [{
        entryId: 'mcp-dup-preset',
        moduleName: '@deepseek-ai/dsh-mcp-client',
        enabled: true,
        ...(fiberState === undefined ? {} : { fiberState }),
      }],
    }],
  }
}

const api = (ctx: Context): Record<string, (payload: unknown) => Promise<unknown>> => (
  registerMcp({ ctx, resolved: resolveBasicsConfig(), sessionCwdOf: () => 'C:/fallback' }) as never
)

interface ListResult {
  groups: { scope: string, scopeLabel: string, path: string, readOnly: boolean, servers: { serverName: string, runtime: { mounted: boolean, toolCount: number, probe: string } }[] }[]
}

let home: string
let patchPath: string
let previousHome: string | undefined

beforeAll(async () => {
  home = await mkdtemp(join(tmpdir(), 'basics-mcp-'))
  previousHome = process.env.DSH_HOME
  process.env.DSH_HOME = home
  patchPath = join(home, 'profiles', 'web', 'cordis.patch.yml')
  await mkdir(join(home, 'profiles', 'web'), { recursive: true })
})

beforeEach(async () => {
  await writeFile(patchPath, WEB_PATCH, 'utf8')
})

afterAll(async () => {
  if (previousHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = previousHome
  await rm(home, { recursive: true, force: true })
})

describe('mcp.list preset status', () => {
  const presetRow = async (fiberState: number | undefined): Promise<{ mounted: boolean, probe: string }> => {
    const result = await api(ctxOf({ agentPresets: roster(fiberState) }))['mcp.list']!({}) as ListResult
    const group = result.groups.find(item => item.scope === 'preset')
    return group!.servers[0]!.runtime
  }

  it('reads an active preset row as mounted', async () => {
    expect(await presetRow(2)).toEqual({ mounted: true, toolCount: 0, probe: 'preset' })
  })

  it('reads a pending preset row as not mounted', async () => {
    expect(await presetRow(0)).toEqual({ mounted: false, toolCount: 0, probe: 'preset' })
  })

  it('reports an unknown probe when the inventory has no fiber state', async () => {
    expect(await presetRow(undefined)).toEqual({ mounted: false, toolCount: 0, probe: 'unknown' })
  })

  it('reports an unknown probe when the inventory throws', async () => {
    const ctx = ctxOf({ agentPresets: { list: async () => [], compositionInventory: async () => { throw new Error('nope') } } })
    const result = await api(ctx)['mcp.list']!({}) as ListResult
    expect(result.groups.find(item => item.scope === 'preset')!.servers[0]!.runtime.probe).toBe('unknown')
  })

  it('keeps the profile row on the global probe', async () => {
    const result = await api(ctxOf({ agentPresets: roster(2) }))['mcp.list']!({}) as ListResult
    const profile = result.groups.find(item => item.scope === 'profile')!
    expect(profile.servers.map(server => server.runtime.probe)).toEqual(['global'])
    expect(profile.servers[0]!.serverName).toBe('dup')
  })
})

describe('mcp.setEnabled scope targeting', () => {
  const toggle = async (presetId: string | undefined, rowId: string): Promise<unknown> => (
    api(ctxOf({ agentPresets: roster(2) }))['mcp.setEnabled']!({
      path: patchPath,
      rowId,
      serverName: 'dup',
      enabled: false,
      ...(presetId === undefined ? {} : { presetId }),
    })
  )

  it('edits the preset row when the client names the preset', async () => {
    await toggle('mine', 'mcp-dup-preset')
    const text = await readFile(patchPath, 'utf8')
    expect(text.match(/disabled: true/g)).toHaveLength(1)
    // The nested row is indented deeper than the profile row's own keys.
    expect(text).toContain('transport: stdio\n            disabled: true')
    expect(text).toContain('serverName: dup\n        transport: stdio\n')
  })

  it('edits the profile row when no preset is named', async () => {
    await toggle(undefined, 'mcp-dup')
    const text = await readFile(patchPath, 'utf8')
    expect(text.match(/disabled: true/g)).toHaveLength(1)
    expect(text).toContain('transport: stdio\n      disabled: true')
  })

  it('rejects a preset id that does not hold the row', async () => {
    await expect(toggle('other', 'mcp-dup-preset')).rejects.toThrow(/未找到/)
  })
})

describe('broken preset declarations', () => {
  it('ignores rows of a declaration without config.id', async () => {
    await writeFile(patchPath, BROKEN_DECLARATION, 'utf8')
    const result = await api(ctxOf({}))['mcp.list']!({}) as ListResult
    expect(result.groups.flatMap(group => group.servers).map(server => server.serverName)).not.toContain('orphan')
  })
})
