import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { registerMcp } from '../src/features/mcp/mcp-service.ts'
import { resolveBasicsConfig } from '../src/config.ts'
import type { Context } from '../src/context-types.ts'

const HOME_PATCH = `# 用户级 MCP 组合
- insert:
    - id: mcp-existing
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: existing
        transport: stdio
        command: npx
`

/** A Context stub: the MCP feature only reads the loader tree. */
function ctxOf(services: Record<string, unknown> = {}): Context {
  return {
    get: (name: string) => services[name],
    tools: { schemas: () => [] },
  } as unknown as Context
}

const api = (ctx: Context): Record<string, (payload: unknown) => Promise<unknown>> => (
  registerMcp({ ctx, resolved: resolveBasicsConfig(), sessionCwdOf: () => 'C:/fallback' }) as never
)

interface Created {
  ok: true
  serverName: string
  path: string
}

interface ListResult {
  groups: { path: string, servers: { serverName: string, transport: string, command?: string }[] }[]
}

let home: string
let homePatch: string
let previousHome: string | undefined

beforeAll(async () => {
  home = await mkdtemp(join(tmpdir(), 'basics-create-'))
  previousHome = process.env.DSH_HOME
  process.env.DSH_HOME = home
  homePatch = join(home, 'cordis.patch.yml')
  await mkdir(join(home, 'profiles', 'web'), { recursive: true })
})

beforeEach(async () => {
  await rm(homePatch, { force: true })
  await rm(join(home, 'profiles', 'web', 'cordis.patch.yml'), { force: true })
})

afterAll(async () => {
  if (previousHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = previousHome
  await rm(home, { recursive: true, force: true })
})

describe('mcp.create', () => {
  /** Create one stdio server; `path` lets a case target a specific layer. */
  const create = async (payload: Record<string, unknown>): Promise<Created> => (
    await api(ctxOf())['mcp.create']!(payload) as Created
  )

  it('appends the row to an editable profile layer and keeps the comments', async () => {
    await writeFile(homePatch, HOME_PATCH, 'utf8')
    const result = await create({ serverName: 'fs', transport: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-fs'] })
    expect(result.serverName).toBe('fs')
    expect(result.path).toBe(homePatch)
    const text = await readFile(homePatch, 'utf8')
    expect(text).toContain('# 用户级 MCP 组合')
    expect(text).toContain('- id: mcp-fs')
    expect(text).toContain('serverName: fs')
  })

  it('lists the new server right after it was written', async () => {
    await writeFile(homePatch, HOME_PATCH, 'utf8')
    await create({ serverName: 'fs', transport: 'stdio', command: 'npx' })
    const listed = await api(ctxOf())['mcp.list']!({}) as ListResult
    const servers = listed.groups.flatMap(group => group.servers)
    expect(servers.map(server => server.serverName)).toEqual(['existing', 'fs'])
    expect(servers.find(server => server.serverName === 'fs')).toMatchObject({ transport: 'stdio', command: 'npx' })
  })

  it('seeds the home-level patch when the deployment has none yet', async () => {
    const result = await create({ serverName: 'first', transport: 'streamable-http', url: 'http://127.0.0.1:9000/mcp' })
    expect(result.path).toBe(homePatch)
    const text = await readFile(homePatch, 'utf8')
    expect(text).toContain('- insert:')
    expect(text).toContain('transport: streamable-http')
    expect(text).toContain('url: http://127.0.0.1:9000/mcp')
  })

  it('rejects a server name already declared in any layer', async () => {
    await writeFile(homePatch, HOME_PATCH, 'utf8')
    await expect(create({ serverName: 'existing', transport: 'stdio', command: 'npx' })).rejects.toThrow(/已存在/)
  })

  it('rejects a transport the MCP client cannot speak', async () => {
    await writeFile(homePatch, HOME_PATCH, 'utf8')
    await expect(create({ serverName: 'sse', transport: 'sse' })).rejects.toThrow(/非法的传输方式/)
  })

  it('refuses a path outside the editable layers', async () => {
    await writeFile(homePatch, HOME_PATCH, 'utf8')
    const elsewhere = join(home, 'profiles', 'web', 'cordis.patch.yml')
    await expect(create({ path: `${elsewhere}.missing`, serverName: 'fs', transport: 'stdio' })).rejects.toThrow(/可编辑范围/)
  })
})
