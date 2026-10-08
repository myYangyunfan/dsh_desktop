/**
 * Rules feature UI: list every DSH rule file (user-global AGENTS.md plus the
 * project-root-to-cwd instruction chain), create a new rule file in one of
 * the allowed scopes, and edit an existing one. The editor stages the whole
 * file content and commits through `rules.save` (the host re-resolves the
 * path from discovery and rejects a stale mtime). Rule baselines load at
 * session start, so saves take effect for new sessions.
 */
import { useEffect, useState } from 'react'
import type { Context } from '../../../context-types.ts'
import { api, currentSession, type RuleCreateScope, type RuleDetail, type RuleGroup } from '../../api.ts'
import { t } from '../../locales.ts'
import css from '../../panel.module.css'

const RULE_FILE_OPTIONS = ['AGENTS.md', 'CLAUDE.md', 'AGENTS.local.md', 'CLAUDE.local.md']

const SCOPE_OPTIONS: {
  scope: RuleCreateScope
  title: 'rulesScopeGlobal' | 'rulesScopeProject' | 'rulesScopeCwd'
  desc: 'rulesScopeHintGlobal' | 'rulesScopeHintProject' | 'rulesScopeHintCwd'
}[] = [
  { scope: 'global', title: 'rulesScopeGlobal', desc: 'rulesScopeHintGlobal' },
  { scope: 'project', title: 'rulesScopeProject', desc: 'rulesScopeHintProject' },
  { scope: 'cwd', title: 'rulesScopeCwd', desc: 'rulesScopeHintCwd' },
]

function formatSize(bytes: number): string {
  return t('rulesBytes', { count: bytes })
}

function formatMtime(mtime: number): string {
  try {
    return new Date(mtime).toLocaleString()
  } catch {
    return String(mtime)
  }
}

export function RulesSection(props: { ctx: Context }) {
  const { ctx } = props
  const [groups, setGroups] = useState<RuleGroup[] | null>(null)
  const [cwd, setCwd] = useState('')
  const [projectRoot, setProjectRoot] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [editingKey, setEditingKey] = useState<string | null>(null)

  const load = (): void => {
    setError(null)
    api.rulesList(currentSession(ctx))
      .then(result => {
        setGroups(result.groups)
        setCwd(result.cwd)
        setProjectRoot(result.projectRoot)
      })
      .catch((caught: unknown) => {
        setError(caught instanceof Error ? caught.message : String(caught))
      })
  }

  useEffect(load, [ctx])

  if (editingKey !== null) {
    return (
      <RulesEditor
        ctx={ctx}
        ruleKey={editingKey}
        onBack={() => {
          setEditingKey(null)
          load()
        }}
      />
    )
  }

  if (creating) {
    return (
      <RulesCreateForm
        ctx={ctx}
        cwd={cwd}
        projectRoot={projectRoot}
        onBack={() => { setCreating(false) }}
        onCreate={(key: string) => {
          setCreating(false)
          setEditingKey(key)
        }}
      />
    )
  }

  if (groups === null && error === null) {
    return <div className={css.empty}>{t('loading')}</div>
  }
  if (error !== null) {
    return (
      <div className={css.error} role="alert">
        {t('rulesLoadFailed')}: {error}
        <div style={{ marginTop: 8 }}>
          <button type="button" className={css.button} onClick={load}>{t('retry')}</button>
        </div>
      </div>
    )
  }

  const allRules = (groups ?? []).flatMap(group => group.rules)

  return (
    <>
      <p className={css.intro}>{t('rulesIntro')}</p>
      <div className={css.toolbar}>
        <span className={`${css.desc} ${css.mono}`} style={{ padding: '0 2px' }}>
          {t('rulesSessionCwd')}: {cwd}
        </span>
        <button type="button" className={`${css.button} ${css.buttonPrimary}`} onClick={() => { setCreating(true) }}>
          {t('rulesCreate')}
        </button>
        <button type="button" className={css.button} onClick={load}>{t('refresh')}</button>
      </div>
      {allRules.length === 0 && <div className={css.empty}>{t('rulesNoRules')}</div>}
      {(groups ?? []).map(group => (
        <div key={group.scope} className={css.group}>
          <div className={css.groupHeading}>
            <span>{group.scope === 'global' ? t('rulesGlobal') : t('rulesProject')}</span>
            <span className={css.count}>{group.rules.length}</span>
          </div>
          <div className={css.skillList}>
            {group.rules.map(rule => (
              <button
                key={rule.key}
                type="button"
                className={rule.editable ? css.skillRow : `${css.skillRow} ${css.skillRowReadonly}`}
                onClick={() => {
                  if (rule.editable) setEditingKey(rule.key)
                }}
                title={rule.editable ? t('rulesEdit') : t('skillsReadonly')}
              >
                <div className={css.skillMain}>
                  <span className={css.skillName}>{rule.fileName}</span>
                  <span className={`${css.desc} ${css.mono}`}>{t('rulesPath')}: {rule.displayPath}</span>
                  <span className={css.skillDesc}>
                    {rule.size !== undefined && <span>{formatSize(rule.size)}</span>}
                    {rule.size !== undefined && rule.mtime !== undefined && <span> · </span>}
                    {rule.mtime !== undefined && <span>{formatMtime(rule.mtime)}</span>}
                  </span>
                </div>
                {!rule.editable && <span className={css.badge}>{t('skillsReadonly')}</span>}
                {rule.editable && <span className={css.badge}>{t('rulesEdit')}</span>}
              </button>
            ))}
          </div>
        </div>
      ))}
    </>
  )
}

/** The create form: pick a scope + candidate file name, then create. */
function RulesCreateForm(props: {
  ctx: Context
  cwd: string
  projectRoot: string
  onBack: () => void
  onCreate: (key: string) => void
}) {
  const { ctx, cwd, projectRoot, onBack, onCreate } = props
  const [scope, setScope] = useState<RuleCreateScope>('global')
  const [fileName, setFileName] = useState('AGENTS.md')
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  // 全局作用域的文件名固定为 AGENTS.md。
  const availableFiles = scope === 'global' ? ['AGENTS.md'] : RULE_FILE_OPTIONS
  const effectiveFile = availableFiles.includes(fileName) ? fileName : availableFiles[0] ?? 'AGENTS.md'

  const targetPath = scope === 'global'
    ? `~/.dsh/${effectiveFile}`
    : scope === 'project'
      ? `${projectRoot}/${effectiveFile}`
      : `${cwd}/${effectiveFile}`

  const create = (): void => {
    setError(null)
    setCreating(true)
    api.rulesCreate(currentSession(ctx), scope, effectiveFile)
      .then(result => { onCreate(result.key) })
      .catch((caught: unknown) => {
        setError(caught instanceof Error ? caught.message : String(caught))
        setCreating(false)
      })
  }

  return (
    <div className={css.editor}>
      <div className={css.groupHeading}>
        <span>{t('rulesCreate')}</span>
      </div>
      <div className={css.field}>
        <span className={css.fieldLabel}>{t('rulesCreateScope')}</span>
        {SCOPE_OPTIONS.map(option => (
          <label key={option.scope} className={css.radioRow}>
            <input
              type="radio"
              name="rule-scope"
              checked={scope === option.scope}
              onChange={() => { setScope(option.scope) }}
            />
            <span className={css.radioText}>
              <span className={css.radioTitle}>{t(option.title)}</span>
              <span className={css.radioDesc}>{t(option.desc)}</span>
            </span>
          </label>
        ))}
      </div>
      <div className={css.field}>
        <span className={css.fieldLabel}>{t('rulesCreateName')}</span>
        <select
          className={css.select}
          value={effectiveFile}
          onChange={event => { setFileName(event.currentTarget.value) }}
        >
          {availableFiles.map(file => (
            <option key={file} value={file}>{file}</option>
          ))}
        </select>
      </div>
      <div className={css.targetPreview}>{targetPath}</div>
      {error !== null && <div className={css.error} role="alert">{t('rulesCreateFailed')}: {error}</div>}
      <div className={css.editorActions}>
        <button type="button" className={css.button} onClick={onBack}>{t('rulesCancel')}</button>
        <button type="button" className={`${css.button} ${css.buttonPrimary}`} disabled={creating} onClick={create}>
          {t('rulesCreate')}
        </button>
      </div>
    </div>
  )
}

/** The editor: whole-file Markdown content with a stale-mtime guard. */
function RulesEditor(props: { ctx: Context; ruleKey: string; onBack: () => void }) {
  const { ctx, ruleKey, onBack } = props
  const [detail, setDetail] = useState<RuleDetail | null>(null)
  const [content, setContent] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    api.rulesGet(currentSession(ctx), ruleKey)
      .then(result => {
        if (cancelled) return
        setDetail(result)
        setContent(result.content)
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : String(caught))
      })
    return () => { cancelled = true }
  }, [ctx, ruleKey])

  const save = (): void => {
    if (detail === null) return
    setError(null)
    setNotice(null)
    setSaving(true)
    api.rulesSave(currentSession(ctx), detail.key, detail.mtime, content)
      .then(result => {
        setDetail({ ...detail, mtime: result.mtime ?? detail.mtime })
        setNotice(t('rulesSaved'))
        setSaving(false)
      })
      .catch((caught: unknown) => {
        const message = caught instanceof Error ? caught.message : String(caught)
        setError(`${t('rulesSaveFailed')}: ${message}`)
        setSaving(false)
      })
  }

  if (error !== null && detail === null) {
    return (
      <div className={css.error} role="alert">
        {t('error')}: {error}
        <div style={{ marginTop: 8 }}>
          <button type="button" className={css.button} onClick={onBack}>{t('rulesBack')}</button>
        </div>
      </div>
    )
  }
  if (detail === null) {
    return <div className={css.empty}>{t('loading')}</div>
  }

  return (
    <div className={css.editor}>
      <div className={css.groupHeading}>
        <span>{detail.fileName}</span>
        <span className={css.badge}>{detail.scope === 'global' ? t('rulesGlobal') : t('rulesProject')}</span>
        {detail.mtime !== undefined && <span className={css.count}>{formatMtime(detail.mtime)}</span>}
      </div>
      <div className={`${css.groupSub} ${css.mono}`}>{t('rulesPath')}: {detail.displayPath}</div>
      <div className={css.field}>
        <span className={css.fieldLabel}>{t('rulesContent')}</span>
        <textarea
          className={`${css.textarea} ${css.textareaMono}`}
          style={{ minHeight: 320 }}
          value={content}
          onChange={event => { setContent(event.currentTarget.value) }}
        />
      </div>
      {notice !== null && <div className={css.pill}>{notice}</div>}
      {error !== null && <div className={css.error} role="alert">{error}</div>}
      <div className={css.editorActions}>
        <button type="button" className={css.button} onClick={onBack}>{t('rulesCancel')}</button>
        <button type="button" className={`${css.button} ${css.buttonPrimary}`} disabled={saving} onClick={save}>
          {t('rulesSave')}
        </button>
      </div>
    </div>
  )
}
