import { describe, it, expect } from 'vitest'
import { addRow, setRowConfig, setRowDisabled } from '../src/features/mcp/yaml-edit.ts'
import { collectMcpRows, collectPresetRows } from '../src/features/mcp/composition-scan.ts'

const PATCH = `# MCP 服务器
- insert:
    # 远程 SSH
    - id: mcp-ssh
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: ssh
        transport: stdio
        command: npx
`

const PRESET = `# 预设组合
- id: mcp-tavily
  name: '@deepseek-ai/dsh-mcp-client'
  config:
    serverName: tavily
    transport: stdio
`

describe('setRowDisabled', () => {
  it('adds the disabled flag to a row inside an insert list and keeps comments', () => {
    const result = setRowDisabled(PATCH, { rowId: 'mcp-ssh', serverName: 'ssh' }, true)
    expect(result.ok).toBe(true)
    expect(result.text).toContain('disabled: true')
    expect(result.text).toContain('# MCP 服务器')
    expect(result.text).toContain('# 远程 SSH')
  })

  it('removes the disabled flag when re-enabled', () => {
    const once = setRowDisabled(PATCH, { serverName: 'ssh' }, true)
    const twice = setRowDisabled(once.text, { serverName: 'ssh' }, false)
    expect(twice.ok).toBe(true)
    expect(twice.text).not.toContain('disabled: true')
  })

  it('matches a direct preset row', () => {
    const result = setRowDisabled(PRESET, { serverName: 'tavily' }, true)
    expect(result.ok).toBe(true)
    expect(result.text).toContain('disabled: true')
  })

  it('returns ok=false for an unknown server', () => {
    const result = setRowDisabled(PATCH, { serverName: 'missing' }, true)
    expect(result.ok).toBe(false)
  })
})

describe('collectMcpRows', () => {
  it('extracts rows from a patch file', () => {
    const rows = collectMcpRows(PATCH)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.serverName).toBe('ssh')
    expect(rows[0]?.rowId).toBe('mcp-ssh')
    expect(rows[0]?.disabled).toBe(false)
  })

  it('extracts rows from a preset file', () => {
    const rows = collectMcpRows(PRESET)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.serverName).toBe('tavily')
  })

  it('ignores non-mcp rows', () => {
    const rows = collectMcpRows('- id: other\n  name: \'@deepseek-ai/dsh-tool-web\'\n')
    expect(rows).toHaveLength(0)
  })
})

// DSH ≥0.1.7 keeps a preset's composition in its declaration row, so a preset
// row is only reachable through `config.plugins` (groups included).
const DECLARATION = `# 预设声明
- insert:
    - id: preset-standard
      name: '@deepseek-ai/dsh-agent-preset'
      config:
        id: standard
        order: 1
        plugins:
          - id: persona
            name: '@deepseek-ai/dsh-persona'
          - id: mcp-standard-ssh
            name: '@deepseek-ai/dsh-mcp-client'
            config:
              serverName: ssh
              transport: stdio
          - id: delegation
            name: cordis:group
            group: true
            config:
              - id: mcp-nested
                name: '@deepseek-ai/dsh-mcp-client'
                config:
                  serverName: nested
- id: mcp-profile-ssh
  name: '@deepseek-ai/dsh-mcp-client'
  config:
    serverName: ssh
    transport: stdio
`

describe('preset declarations', () => {
  it('collects rows nested in a declaration, tagged with their preset', () => {
    const rows = collectMcpRows(DECLARATION)
    expect(rows.map(row => [row.serverName, row.presetId])).toEqual([
      ['ssh', 'standard'],
      ['nested', 'standard'],
      ['ssh', undefined],
    ])
  })

  it('collects rows from a Loader-shaped preset plugin list', () => {
    const rows = collectPresetRows('standard', [
      { id: 'persona', name: '@deepseek-ai/dsh-persona' },
      { id: 'mcp-1', name: '@deepseek-ai/dsh-mcp-client', config: { serverName: 'preset-one' }, disabled: true },
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0]?.serverName).toBe('preset-one')
    expect(rows[0]?.presetId).toBe('standard')
    expect(rows[0]?.disabled).toBe(true)
  })

  it('edits a nested preset row when the target names its preset', () => {
    const result = setRowDisabled(DECLARATION, { rowId: 'mcp-standard-ssh', serverName: 'ssh', presetId: 'standard' }, true)
    expect(result.ok).toBe(true)
    // Exactly one row gains the flag, and it is the nested one (12-space indent).
    expect(result.text.match(/disabled: true/g)).toHaveLength(1)
    expect(result.text).toContain('transport: stdio\n            disabled: true')
    expect(result.text).toContain('serverName: nested')
  })

  it('edits the profile row of a name a preset also declares', () => {
    const result = setRowDisabled(DECLARATION, { rowId: 'mcp-profile-ssh', serverName: 'ssh' }, true)
    expect(result.ok).toBe(true)
    expect(result.text.match(/disabled: true/g)).toHaveLength(1)
    // The profile row sits at the document's top level (2-space indent).
    expect(result.text).toContain('transport: stdio\n  disabled: true')
  })

  it('refuses to edit a preset row through another preset id', () => {
    expect(setRowDisabled(DECLARATION, { serverName: 'nested', presetId: 'other' }, true).ok).toBe(false)
  })

  it('updates the config of a nested preset row', () => {
    const result = setRowConfig(DECLARATION, { serverName: 'nested', presetId: 'standard' }, { command: 'node', args: ['a'] })
    expect(result.ok).toBe(true)
    expect(result.text).toContain('command: node')
    expect(result.text).toContain('serverName: nested')
  })
})

const SEED = {
  id: 'mcp-new',
  name: '@deepseek-ai/dsh-mcp-client',
  config: { serverName: 'new', transport: 'stdio', command: 'npx' },
}

describe('addRow', () => {
  it('appends into an existing insert list and keeps comments', () => {
    const result = addRow(PATCH, SEED)
    expect(result.ok).toBe(true)
    expect(result.text).toContain('# MCP 服务器')
    expect(result.text).toContain('# 远程 SSH')
    expect(collectMcpRows(result.text).map(row => row.serverName)).toEqual(['ssh', 'new'])
  })

  it('seeds an insert block for an empty document', () => {
    const result = addRow('', SEED)
    expect(result.ok).toBe(true)
    expect(result.text).toContain('- insert:')
    expect(collectMcpRows(result.text).map(row => row.serverName)).toEqual(['new'])
  })

  it('appends to a top-level row list that has no insert wrapper', () => {
    const result = addRow(PRESET, SEED)
    expect(result.ok).toBe(true)
    expect(collectMcpRows(result.text).map(row => row.serverName)).toEqual(['tavily', 'new'])
  })

  it('refuses an unparsable document', () => {
    expect(addRow('a: [1,\n', SEED).ok).toBe(false)
  })
})
