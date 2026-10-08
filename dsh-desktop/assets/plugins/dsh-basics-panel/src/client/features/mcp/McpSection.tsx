/**
 * MCP feature UI: one group card per source scope, one row per server, each
 * with a status dot, transport badge, enable switch, and an expandable
 * (secret-masked) config detail. Toggling is optimistic and reverts on
 * failure; preset-scope writes show the "new session" hint. The toolbar adds
 * a new server row, which is also the way out of the empty state.
 */
import { useEffect, useRef, useState } from 'react'
import type { Context } from '../../../context-types.ts'
import { api, BasicsApiError, type McpGroup, type McpServerRow } from '../../api.ts'
import { t } from '../../locales.ts'
import { Toggle, StatusDot } from '../../shared.tsx'
import css from '../../panel.module.css'

function scopeLabel(group: McpGroup): string {
  const base = group.scope === 'profile' ? t('mcpScopeProfile') : t('mcpScopePreset')
  return `${base} · ${group.scopeLabel}`
}

function statusOf(server: McpServerRow): { kind: 'connected' | 'enabled' | 'disabled'; text: string } {
  if (server.disabled) return { kind: 'disabled', text: t('mcpDisabled') }
  // A preset-scope server starts inside its session's scoped world, so the host
  // registry cannot count its tools; never report "not active" for that.
  if (server.runtime.probe === 'unknown') return { kind: 'enabled', text: t('mcpPresetScoped') }
  if (server.runtime.mounted && server.runtime.toolCount > 0) {
    return { kind: 'connected', text: `${t('mcpConnected')} · ${t('mcpTools', { count: server.runtime.toolCount })}` }
  }
  if (server.runtime.mounted) return { kind: 'enabled', text: t('mcpEnabled') }
  return { kind: 'disabled', text: t('mcpNotMounted') }
}

/** Whether two views address the same composition row. */
function sameRow(left: McpServerRow, right: McpServerRow): boolean {
  return (left.rowId !== null && left.rowId === right.rowId) || left.serverName === right.serverName
}

/** One group's identity: a preset group carries no file path of its own. */
function groupKey(group: McpGroup): string {
  return `${group.scope}:${group.scopeLabel}:${group.path}`
}

/**
 * The preset a group belongs to. One file may declare the same server name in
 * its profile rows and inside a preset declaration, so the host needs this to
 * address the exact row the user clicked.
 */
function presetOf(group: McpGroup): string | undefined {
  return group.scope === 'preset' ? group.scopeLabel : undefined
}

/** How long a toggle keeps re-reading the list while the hot reload lands. */
const TOGGLE_POLL_INTERVAL_MS = 1500
const TOGGLE_POLL_TIMEOUT_MS = 15000

function joinArgs(args: string[] | undefined): string {
  if (args === undefined || args.length === 0) return ''
  return args.map(value => (/\s/.test(value) ? JSON.stringify(value) : value)).join(' ')
}

function ServerConfig(props: { server: McpServerRow }) {
  const { server } = props
  const detail: Array<[string, string]> = []
  detail.push([t('mcpFieldTransport'), server.transport])
  if (server.command !== undefined) detail.push([t('mcpFieldCommand'), server.command])
  if (server.args !== undefined && server.args.length > 0) detail.push([t('mcpFieldArgs'), joinArgs(server.args)])
  if (server.cwd !== undefined) detail.push([t('mcpFieldCwd'), server.cwd])
  if (server.url !== undefined) detail.push([t('mcpFieldUrl'), server.url])
  if (server.toolCallTimeoutMs !== undefined) detail.push([t('mcpFieldTimeout'), t('mcpSeconds', { count: Math.round(server.toolCallTimeoutMs / 1000) })])
  const envKeys = server.env === undefined ? [] : Object.keys(server.env)
  const headerKeys = server.headers === undefined ? [] : Object.keys(server.headers)
  return (
    <div>
      {detail.map(([label, value]) => (
        <div key={label} className={css.row}>
          <span className={css.title}>{label}</span>
          <span className={`${css.desc} ${css.mono}`}>{value}</span>
        </div>
      ))}
      {envKeys.length > 0 && (
        <div className={css.row}>
          <span className={css.title}>{t('mcpFieldEnv')}</span>
          <span className={`${css.desc} ${css.mono}`}>{envKeys.map(key => `${key}=${t('mcpMasked')}`).join('  ')}</span>
        </div>
      )}
      {headerKeys.length > 0 && (
        <div className={css.row}>
          <span className={css.title}>{t('mcpFieldHeaders')}</span>
          <span className={`${css.desc} ${css.mono}`}>{headerKeys.join('  ')}</span>
        </div>
      )}
    </div>
  )
}

const MASK = '••••'

function McpEditor(props: { group: McpGroup; server: McpServerRow; onDone: (saved: boolean) => void }) {
  const { group, server, onDone } = props
  const [serverName, setServerName] = useState(server.serverName)
  const [transport, setTransport] = useState(server.transport)
  const [command, setCommand] = useState(server.command ?? '')
  const [argsText, setArgsText] = useState(server.args !== undefined ? JSON.stringify(server.args) : '')
  const [envText, setEnvText] = useState(server.env !== undefined ? JSON.stringify(server.env, null, 2) : '')
  const [url, setUrl] = useState(server.url ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const save = (): void => {
    setError(null)
    let args: string[] | null = null
    if (argsText.trim() !== '') {
      try {
        const value: unknown = JSON.parse(argsText)
        if (!Array.isArray(value)) throw new Error('not-array')
        args = value as string[]
      } catch {
        setError('args 必须是 JSON 数组，例如 ["-y","@x/mcp"]')
        return
      }
    }
    let env: Record<string, string> | null = null
    if (envText.trim() !== '') {
      try {
        const value: unknown = JSON.parse(envText)
        if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('not-object')
        env = value as Record<string, string>
      } catch {
        setError('env 必须是 JSON 对象，例如 {"KEY":"value"}')
        return
      }
    }
    // 仍为脱敏占位符的键保持不变 → 从 patch 移除，保留原值。
    if (env !== null) {
      for (const key of Object.keys(env)) {
        if (env[key] === MASK) delete env[key]
      }
    }
    setSaving(true)
    api.mcpSave(group.path, server.rowId, server.serverName, {
      serverName,
      transport,
      command: command.trim() === '' ? null : command,
      args,
      env,
      url: url.trim() === '' ? null : url,
    }, presetOf(group))
      .then(() => { onDone(true) })
      .catch((caught: unknown) => {
        setError(caught instanceof Error ? caught.message : String(caught))
        setSaving(false)
      })
  }

  return (
    <div className={css.editor}>
      <div className={css.field}>
        <span className={css.fieldLabel}>serverName</span>
        <input className={css.input} value={serverName} onChange={event => { setServerName(event.currentTarget.value) }} />
      </div>
      <div className={css.field}>
        <span className={css.fieldLabel}>transport</span>
        <select className={css.input} value={transport} onChange={event => { setTransport(event.currentTarget.value as McpServerRow['transport']) }}>
          <option value="stdio">stdio</option>
          <option value="streamable-http">streamable-http</option>
          <option value="unknown">unknown</option>
        </select>
      </div>
      <div className={css.field}>
        <span className={css.fieldLabel}>command</span>
        <input className={`${css.input} ${css.textareaMono}`} value={command} onChange={event => { setCommand(event.currentTarget.value) }} />
      </div>
      <div className={css.field}>
        <span className={css.fieldLabel}>args（JSON 数组）</span>
        <textarea className={`${css.textarea} ${css.textareaMono}`} value={argsText} onChange={event => { setArgsText(event.currentTarget.value) }} />
      </div>
      <div className={css.field}>
        <span className={css.fieldLabel}>env（JSON 对象，•••• 保留原值）</span>
        <textarea className={`${css.textarea} ${css.textareaMono}`} style={{ minHeight: 80 }} value={envText} onChange={event => { setEnvText(event.currentTarget.value) }} />
      </div>
      <div className={css.field}>
        <span className={css.fieldLabel}>url</span>
        <input className={`${css.input} ${css.textareaMono}`} value={url} onChange={event => { setUrl(event.currentTarget.value) }} />
      </div>
      {error !== null && <div className={css.error} role="alert">{error}</div>}
      <div className={css.editorActions}>
        <button type="button" className={css.button} onClick={() => { onDone(false) }}>取消</button>
        <button type="button" className={`${css.button} ${css.buttonPrimary}`} disabled={saving} onClick={save}>保存</button>
      </div>
    </div>
  )
}

/**
 * The create form: a new `mcp-client` row appended into the first editable
 * patch layer by the host. This is the way out of the empty state — without a
 * row in any composition file the panel has nothing to list or toggle.
 */
function McpCreateForm(props: { onDone: (created: boolean) => void }) {
  const { onDone } = props
  const [serverName, setServerName] = useState('')
  const [transport, setTransport] = useState<'stdio' | 'streamable-http'>('stdio')
  const [command, setCommand] = useState('')
  const [argsText, setArgsText] = useState('')
  const [envText, setEnvText] = useState('')
  const [url, setUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const create = (): void => {
    setError(null)
    if (serverName.trim() === '') {
      setError('serverName 不能为空')
      return
    }
    let args: string[] | null = null
    if (argsText.trim() !== '') {
      try {
        const value: unknown = JSON.parse(argsText)
        if (!Array.isArray(value)) throw new Error('not-array')
        args = value as string[]
      } catch {
        setError('args 必须是 JSON 数组，例如 ["-y","@x/mcp"]')
        return
      }
    }
    let env: Record<string, string> | null = null
    if (envText.trim() !== '') {
      try {
        const value: unknown = JSON.parse(envText)
        if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('not-object')
        env = value as Record<string, string>
      } catch {
        setError('env 必须是 JSON 对象，例如 {"KEY":"value"}')
        return
      }
    }
    setSaving(true)
    api.mcpCreate(null, {
      serverName: serverName.trim(),
      transport,
      ...(command.trim() === '' ? {} : { command }),
      ...(args === null ? {} : { args }),
      ...(env === null ? {} : { env }),
      ...(url.trim() === '' ? {} : { url }),
    })
      .then(() => { onDone(true) })
      .catch((caught: unknown) => {
        setError(`${t('mcpCreateFailed')}: ${caught instanceof Error ? caught.message : String(caught)}`)
        setSaving(false)
      })
  }

  return (
    <div className={css.editor}>
      <div className={css.groupHeading}>
        <span>{t('mcpCreate')}</span>
      </div>
      <div className={css.field}>
        <span className={css.fieldLabel}>serverName</span>
        <input className={css.input} value={serverName} onChange={event => { setServerName(event.currentTarget.value) }} />
      </div>
      <div className={css.field}>
        <span className={css.fieldLabel}>transport</span>
        <select className={css.select} value={transport} onChange={event => { setTransport(event.currentTarget.value as 'stdio' | 'streamable-http') }}>
          <option value="stdio">stdio</option>
          <option value="streamable-http">streamable-http</option>
        </select>
      </div>
      <div className={css.field}>
        <span className={css.fieldLabel}>command</span>
        <input className={`${css.input} ${css.textareaMono}`} value={command} onChange={event => { setCommand(event.currentTarget.value) }} />
      </div>
      <div className={css.field}>
        <span className={css.fieldLabel}>args（JSON 数组）</span>
        <textarea className={`${css.textarea} ${css.textareaMono}`} value={argsText} onChange={event => { setArgsText(event.currentTarget.value) }} />
      </div>
      <div className={css.field}>
        <span className={css.fieldLabel}>env（JSON 对象）</span>
        <textarea className={`${css.textarea} ${css.textareaMono}`} style={{ minHeight: 80 }} value={envText} onChange={event => { setEnvText(event.currentTarget.value) }} />
      </div>
      <div className={css.field}>
        <span className={css.fieldLabel}>url</span>
        <input className={`${css.input} ${css.textareaMono}`} value={url} onChange={event => { setUrl(event.currentTarget.value) }} />
      </div>
      {error !== null && <div className={css.error} role="alert">{error}</div>}
      <div className={css.editorActions}>
        <button type="button" className={css.button} onClick={() => { onDone(false) }}>取消</button>
        <button type="button" className={`${css.button} ${css.buttonPrimary}`} disabled={saving} onClick={create}>
          {t('mcpCreate')}
        </button>
      </div>
    </div>
  )
}

export function McpSection(_props: { ctx: Context }) {
  const [groups, setGroups] = useState<McpGroup[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState<Set<string>>(new Set())
  const [applying, setApplying] = useState<Set<string>>(new Set())
  const [notice, setNotice] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const load = (): void => {
    setError(null)
    api.mcpList()
      .then(result => { setGroups(result.groups) })
      .catch((caught: unknown) => {
        setError(`${t('mcpLoadFailed')}: ${caught instanceof Error ? caught.message : String(caught)}`)
      })
  }

  useEffect(load, [])

  // The settle poll outlives a toggle by design; stop it when the tab unmounts.
  const disposed = useRef(false)
  useEffect(() => () => { disposed.current = true }, [])

  // One group may declare the same server name twice; the row id disambiguates.
  const keyOf = (group: McpGroup, server: McpServerRow): string => `${groupKey(group)}::${server.rowId ?? server.serverName}`

  /**
   * Keep re-reading the list while a just-toggled server runs through the hot
   * reload. Without this the page showed the pre-reload state ("not active")
   * for a server that was in fact connecting, and only a manual refresh
   * corrected it.
   */
  const pollUntilSettled = (group: McpGroup, server: McpServerRow, enabled: boolean): void => {
    const key = keyOf(group, server)
    const deadline = Date.now() + TOGGLE_POLL_TIMEOUT_MS
    setApplying(prev => new Set(prev).add(key))
    const step = async (): Promise<void> => {
      if (disposed.current) return
      const result = await api.mcpList().catch(() => undefined)
      if (disposed.current) return
      if (result !== undefined) setGroups(result.groups)
      const row = result?.groups
        .find(item => groupKey(item) === groupKey(group))
        ?.servers.find(candidate => sameRow(candidate, server))
      const settled = row === undefined
        || (enabled
          ? row.disabled === false && (row.runtime.probe !== 'global' || row.runtime.toolCount > 0)
          : row.disabled)
      if (settled || Date.now() >= deadline) {
        setApplying(prev => {
          const next = new Set(prev)
          next.delete(key)
          return next
        })
        return
      }
      window.setTimeout(() => { void step() }, TOGGLE_POLL_INTERVAL_MS)
    }
    window.setTimeout(() => { void step() }, TOGGLE_POLL_INTERVAL_MS)
  }

  const toggle = (group: McpGroup, server: McpServerRow, next: boolean): void => {
    const key = keyOf(group, server)
    if (busy.has(key)) return
    setNotice(null)
    // Optimistic update.
    setGroups(prev => prev === null ? prev : prev.map(g => (
      groupKey(g) === groupKey(group)
        ? { ...g, servers: g.servers.map(s => sameRow(s, server) ? { ...s, disabled: !next } : s) }
        : g
    )))
    setBusy(prev => new Set(prev).add(key))
    api.mcpSetEnabled(group.path, server.rowId, server.serverName, next, presetOf(group))
      .then(result => {
        setNotice(result.takesEffect === 'new-session' ? t('mcpTakesEffectNewSession') : t('mcpTakesEffectLive'))
        // Re-read until the hot reload settles, then adopt the authoritative status.
        pollUntilSettled(group, server, next)
      })
      .catch((caught: unknown) => {
        setNotice(`${t('mcpToggleFailed')}: ${caught instanceof BasicsApiError ? caught.message : caught instanceof Error ? caught.message : String(caught)}`)
        // Revert.
        setGroups(prev => prev === null ? prev : prev.map(g => (
          groupKey(g) === groupKey(group)
            ? { ...g, servers: g.servers.map(s => sameRow(s, server) ? { ...s, disabled: server.disabled } : s) }
            : g
        )))
      })
      .finally(() => {
        setBusy(prev => {
          const next = new Set(prev)
          next.delete(key)
          return next
        })
      })
  }

  const flipExpanded = (key: string): void => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  if (groups === null && error === null) {
    return <div className={css.empty}>{t('loading')}</div>
  }
  if (error !== null) {
    return (
      <div className={css.error} role="alert">
        {error}
        <div style={{ marginTop: 8 }}>
          <button type="button" className={css.button} onClick={load}>{t('retry')}</button>
        </div>
      </div>
    )
  }

  if (creating) {
    return (
      <>
        <p className={css.intro}>{t('mcpIntro')}</p>
        <McpCreateForm onDone={created => { setCreating(false); if (created) load() }} />
      </>
    )
  }

  return (
    <>
      <p className={css.intro}>{t('mcpIntro')}</p>
      <p className={css.intro}>{t('mcpNoProject')}</p>
      <div className={css.toolbar}>
        <button type="button" className={`${css.button} ${css.buttonPrimary}`} onClick={() => { setCreating(true) }}>
          {t('mcpCreate')}
        </button>
        <button type="button" className={css.button} onClick={load}>{t('refresh')}</button>
      </div>
      {notice !== null && <div className={css.pill}>{notice}</div>}
      {groups !== null && groups.length === 0 && (
        <div className={css.empty}>
          {t('mcpEmpty')}
          <div style={{ marginTop: 8 }}>
            <button type="button" className={`${css.button} ${css.buttonPrimary}`} onClick={() => { setCreating(true) }}>
              {t('mcpCreate')}
            </button>
          </div>
        </div>
      )}
      {groups !== null && groups.length > 0 && groups.every(group => group.scope === 'profile') && (
        <div className={css.pill}>{t('mcpNoPresetServers')}</div>
      )}
      {groups?.map(group => (
        <div key={groupKey(group)} className={css.group}>
          <div className={css.groupHeading}>
            <span>{scopeLabel(group)}</span>
            {group.readOnly && <span className={css.badge}>{t('mcpReadOnly')}</span>}
            <span className={css.count}>{group.servers.length}</span>
          </div>
          {group.path !== '' && <div className={`${css.groupSub} ${css.mono}`}>{group.path}</div>}
          {group.servers.map(server => {
            const key = keyOf(group, server)
            const status = applying.has(key) ? { kind: 'enabled' as const, text: t('mcpApplying') } : statusOf(server)
            const isOpen = expanded.has(key)
            return (
              <div key={key}>
                <div className={css.row}>
                  <StatusDot kind={status.kind} />
                  <span className={css.rowText}>
                    <span className={css.title}>{server.serverName}</span>
                    <span className={css.desc}>{status.text}</span>
                  </span>
                  <span className={css.badge}>{server.transport}</span>
                  <button
                    type="button"
                    className={css.button}
                    aria-expanded={isOpen}
                    onClick={() => { flipExpanded(key) }}
                  >
                    {isOpen ? '−' : '+'}
                  </button>
                  <Toggle
                    label={t('mcpToggle')}
                    checked={!server.disabled}
                    disabled={!server.editable || busy.has(key) || applying.has(key)}
                    onChange={next => { toggle(group, server, next) }}
                  />
                </div>
                {isOpen && (editing === key ? (
                  <McpEditor
                    group={group}
                    server={server}
                    onDone={saved => {
                      setEditing(null)
                      if (saved) load()
                    }}
                  />
                ) : (
                  <>
                    <ServerConfig server={server} />
                    <button
                      type="button"
                      className={css.button}
                      disabled={!server.editable}
                      onClick={() => { setEditing(key) }}
                    >
                      编辑配置
                    </button>
                  </>
                ))}
              </div>
            )
          })}
        </div>
      ))}
    </>
  )
}
