import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { collectMcpRows, scanMcpSources } from '../src/features/mcp/composition-scan.ts'
import { resolveBasicsConfig } from '../src/config.ts'
import type { Context } from '../src/context-types.ts'

const HOME_PATCH = `# home layer
- insert:
    - id: mcp-home
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: home-srv
`

const WEB_PATCH = `# web layer
- insert:
    - id: mcp-web
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: web-srv
      disabled: true

    - id: preset-mine
      name: '@deepseek-ai/dsh-agent-preset'
      config:
        id: mine
        plugins:
          - id: mcp-in-preset
            name: '@deepseek-ai/dsh-mcp-client'
            config:
              serverName: preset-srv

    - id: preset-empty
      name: '@deepseek-ai/dsh-agent-preset'
      config:
        id: empty
        plugins:
          - id: persona
            name: '@deepseek-ai/dsh-persona'
`

const LEGACY_PRESET = `- id: mcp-legacy
  name: '@deepseek-ai/dsh-mcp-client'
  config:
    serverName: legacy-srv
`

/** A Context stub exposing only the services a scan touches. */
function ctxOf(services: Record<string, unknown>): Context {
  return { get: (name: string) => services[name] } as unknown as Context
}

/** A Loader stub whose entry carries one mounted preset declaration. */
function loaderStub(): unknown {
  return {
    entries: () => [
      {
        options: {
          id: 'preset-shipped',
          name: '@deepseek-ai/dsh-agent-preset',
          config: {
            id: 'shipped',
            plugins: [
              { id: 'persona', name: '@deepseek-ai/dsh-persona' },
              { id: 'mcp-shipped', name: '@deepseek-ai/dsh-mcp-client', config: { serverName: 'shipped-srv' } },
            ],
          },
        },
      },
      {
        // The patch layer already declares this preset; it must not duplicate.
        options: {
          id: 'preset-mine',
          name: '@deepseek-ai/dsh-agent-preset',
          config: { id: 'mine', plugins: [{ id: 'mcp-in-preset', name: '@deepseek-ai/dsh-mcp-client', config: { serverName: 'preset-srv' } }] },
        },
      },
    ],
  }
}

let home: string
let previousHome: string | undefined

beforeAll(async () => {
  home = await mkdtemp(join(tmpdir(), 'basics-scan-'))
  previousHome = process.env.DSH_HOME
  process.env.DSH_HOME = home
  await mkdir(join(home, 'profiles', 'web'), { recursive: true })
  await mkdir(join(home, '.agent-presets', 'legacy'), { recursive: true })
  await writeFile(join(home, 'cordis.patch.yml'), HOME_PATCH, 'utf8')
  await writeFile(join(home, 'profiles', 'web', 'cordis.patch.yml'), WEB_PATCH, 'utf8')
  await writeFile(join(home, '.agent-presets', 'legacy', 'agent.cordis.yml'), LEGACY_PRESET, 'utf8')
})

afterAll(async () => {
  if (previousHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = previousHome
  await rm(home, { recursive: true, force: true })
})

describe('scanMcpSources', () => {
  it('splits profile rows from preset declarations and reads installed presets read-only', async () => {
    const ctx = ctxOf({ agentPresets: { list: async () => [] }, loader: loaderStub() })
    const sources = await scanMcpSources(ctx, resolveBasicsConfig())

    const profile = sources.filter(source => source.scope === 'profile')
    expect(profile.map(source => [source.scopeLabel, source.rows.map(row => row.serverName)])).toEqual([
      ['home', ['home-srv']],
      ['web', ['web-srv']],
    ])

    const presets = sources.filter(source => source.scope === 'preset')
    // `empty` declares no server and is omitted; `mine` comes from the patch
    // layer (editable), `shipped` from the installed declaration (read-only).
    expect(presets.map(source => [source.scopeLabel, source.readOnly, source.path !== '', source.rows.map(row => row.serverName)])).toEqual([
      ['mine', false, true, ['preset-srv']],
      ['shipped', true, false, ['shipped-srv']],
    ])
  })

  it('ignores the legacy preset directory while a roster service answers', async () => {
    const sources = await scanMcpSources(ctxOf({ agentPresets: { list: async () => [] } }), resolveBasicsConfig())
    expect(sources.some(source => source.scopeLabel === 'legacy')).toBe(false)
  })

  it('reads the legacy preset directory on a host without a roster service', async () => {
    const sources = await scanMcpSources(ctxOf({}), resolveBasicsConfig())
    const legacy = sources.find(source => source.scopeLabel === 'legacy')
    expect(legacy?.scope).toBe('preset')
    expect(legacy?.rows.map(row => row.serverName)).toEqual(['legacy-srv'])
  })

  it('marks a preset row mixin as a preset row, not a profile row', () => {
    const rows = collectMcpRows(WEB_PATCH)
    expect(rows.filter(row => row.presetId === undefined).map(row => row.serverName)).toEqual(['web-srv'])
    expect(rows.filter(row => row.presetId === 'mine').map(row => row.serverName)).toEqual(['preset-srv'])
  })
})
