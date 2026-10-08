/**
 * Skills feature UI: a searchable, scope-filtered list grouped by scope, with
 * an inline editor for the editable skills. The editor stages frontmatter
 * fields plus the Markdown body and commits through `skills.save` (the host
 * re-resolves the file path from the registry and rejects a stale mtime).
 */
import { useEffect, useState } from 'react'
import type { Context } from '../../../context-types.ts'
import { api, currentSession, type SkillDetail, type SkillGroup, type SkillsList } from '../../api.ts'
import { t } from '../../locales.ts'
import { StatusDot, Toggle } from '../../shared.tsx'
import css from '../../panel.module.css'

type ScopeFilter = 'all' | 'project' | 'custom' | 'user' | 'bundled' | 'runtime' | 'other'

const SCOPE_FILTERS: ScopeFilter[] = ['all', 'project', 'custom', 'user', 'bundled', 'runtime', 'other']

function scopeLabel(scope: SkillGroup['scope']): string {
  switch (scope) {
    case 'project': return t('skillsScopeProject')
    case 'custom': return t('skillsScopeCustom')
    case 'user': return t('skillsScopeUser')
    case 'bundled': return t('skillsScopeBundled')
    case 'runtime': return t('skillsScopeRuntime')
    default: return t('skillsScopeOther')
  }
}

function filterLabel(scope: ScopeFilter): string {
  return scope === 'all' ? t('skillsFilterAll') : scopeLabel(scope)
}

/** Short, readable session label for the scope hint (ids are long and prefixed). */
function shortSessionId(sessionId: string | undefined): string {
  if (sessionId === undefined || sessionId === '') return '—'
  const tail = sessionId.replace(/^session-/, '')
  return tail.length <= 8 ? tail : `${tail.slice(0, 8)}…`
}

export function SkillsSection(props: { ctx: Context }) {
  const { ctx } = props
  const [groups, setGroups] = useState<SkillGroup[] | null>(null)
  const [complete, setComplete] = useState(true)
  const [scopeSource, setScopeSource] = useState<SkillsList['scopeSource']>('session')
  const [scopeSession, setScopeSession] = useState<string | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<ScopeFilter>('all')
  const [editing, setEditing] = useState<string | null>(null)

  const load = (): void => {
    setError(null)
    api.skillsList(currentSession(ctx))
      .then(result => {
        setGroups(result.groups)
        setComplete(result.complete)
        setScopeSource(result.scopeSource ?? 'session')
        setScopeSession(result.sessionId)
      })
      .catch((caught: unknown) => {
        setError(caught instanceof Error ? caught.message : String(caught))
      })
  }

  useEffect(load, [ctx])

  if (editing !== null) {
    return (
      <SkillsEditor
        ctx={ctx}
        name={editing}
        onBack={() => {
          setEditing(null)
          load()
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
        {t('error')}: {error}
        <div style={{ marginTop: 8 }}>
          <button type="button" className={css.button} onClick={load}>{t('retry')}</button>
        </div>
      </div>
    )
  }

  const needle = search.trim().toLowerCase()
  const visible = (groups ?? []).map(group => ({
    ...group,
    skills: group.skills.filter(skill => (
      (filter === 'all' || group.scope === filter)
      && (needle === '' || skill.name.toLowerCase().includes(needle) || skill.description.toLowerCase().includes(needle))
    )),
  })).filter(group => group.skills.length > 0)

  return (
    <>
      <p className={css.intro}>{t('skillsIntro')}</p>
      {!complete && <div className={css.pill}>{t('skillsIncomplete')}</div>}
      {scopeSource === 'fallback' && (
        <div className={css.pill}>{t('skillsScopeFallback', { session: shortSessionId(scopeSession) })}</div>
      )}
      {scopeSource === 'none' && <div className={css.pill}>{t('skillsNoScope')}</div>}
      <div className={css.toolbar}>
        <input
          type="search"
          className={`${css.input} ${css.textarea}`}
          style={{ padding: '8px 12px' }}
          placeholder={t('skillsSearch')}
          value={search}
          onChange={event => { setSearch(event.currentTarget.value) }}
        />
        <button type="button" className={css.button} onClick={load}>{t('refresh')}</button>
      </div>
      <div className={css.toolbar}>
        {SCOPE_FILTERS.map(scope => (
          <button
            key={scope}
            type="button"
            className={scope === filter ? `${css.badge}` : css.button}
            style={scope === filter ? { background: 'var(--dsw-alias-brand-primary)', color: '#fff' } : { padding: '2px 10px' }}
            aria-pressed={scope === filter}
            onClick={() => { setFilter(scope) }}
          >
            {filterLabel(scope)}
          </button>
        ))}
      </div>
      {visible.length === 0 && <div className={css.empty}>{t('skillsNoSkills')}</div>}
      {visible.map(group => (
        <div key={group.scope} className={css.group}>
          <div className={css.groupHeading}>
            <span>{scopeLabel(group.scope)}</span>
            <span className={css.count}>{group.skills.length}</span>
          </div>
          <div className={css.skillList}>
            {group.skills.map(skill => (
              <button
                key={skill.name}
                type="button"
                className={skill.editable ? css.skillRow : `${css.skillRow} ${css.skillRowReadonly}`}
                onClick={() => {
                  if (skill.editable) setEditing(skill.name)
                }}
                title={skill.editable ? t('skillsOpen') : t('skillsReadonly')}
              >
                <div className={css.skillMain}>
                  <span className={css.skillName}>{skill.name}</span>
                  <span className={css.skillDesc}>{skill.description}</span>
                  {skill.location !== undefined && <span className={`${css.desc} ${css.mono}`}>{t('skillsLocation')}: {skill.location}</span>}
                </div>
                {!skill.editable && <span className={css.badge}>{t('skillsReadonly')}</span>}
                <StatusDot kind={skill.editable ? 'enabled' : 'disabled'} />
              </button>
            ))}
          </div>
        </div>
      ))}
    </>
  )
}

function SkillsEditor(props: { ctx: Context; name: string; onBack: () => void }) {
  const { ctx, name, onBack } = props
  const [detail, setDetail] = useState<SkillDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [description, setDescription] = useState('')
  const [whenToUse, setWhenToUse] = useState('')
  const [metadata, setMetadata] = useState('')
  const [modelInvocable, setModelInvocable] = useState(true)
  const [userInvocable, setUserInvocable] = useState(true)
  const [body, setBody] = useState('')

  useEffect(() => {
    let cancelled = false
    api.skillsGet(currentSession(ctx), name)
      .then(result => {
        if (cancelled) return
        setDetail(result)
        setDescription(result.description)
        setWhenToUse(result.whenToUse ?? '')
        setMetadata(result.metadata !== undefined ? JSON.stringify(result.metadata, null, 2) : '')
        setModelInvocable(result.modelInvocable)
        setUserInvocable(result.userInvocable)
        setBody(result.body)
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : String(caught))
      })
    return () => { cancelled = true }
  }, [ctx, name])

  const save = (): void => {
    if (detail === null) return
    setError(null)
    setNotice(null)
    // Parse the metadata JSON (empty clears it).
    let parsedMetadata: Record<string, unknown> | null = null
    if (metadata.trim() !== '') {
      try {
        const value: unknown = JSON.parse(metadata)
        if (value !== null && (typeof value !== 'object' || Array.isArray(value))) {
          setError(t('skillsMetadata') + ' 必须是 JSON 对象')
          return
        }
        parsedMetadata = value as Record<string, unknown>
      } catch {
        setError(t('skillsMetadata') + ' 不是合法 JSON')
        return
      }
    }
    setSaving(true)
    api.skillsSave(currentSession(ctx), name, detail.mtime, {
      description,
      whenToUse: whenToUse.trim() === '' ? null : whenToUse,
      metadata: parsedMetadata,
      modelInvocable,
      userInvocable,
      body,
    })
      .then(() => {
        setNotice(t('skillsSaved'))
        setSaving(false)
      })
      .catch((caught: unknown) => {
        const message = caught instanceof Error ? caught.message : String(caught)
        setError(`${t('skillsSaveFailed')}: ${message}`)
        setSaving(false)
      })
  }

  if (error !== null) {
    return (
      <div className={css.error} role="alert">
        {t('error')}: {error}
        <div style={{ marginTop: 8 }}>
          <button type="button" className={css.button} onClick={onBack}>{t('skillsBack')}</button>
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
        <span>{t('skillsName')}: {detail.name}</span>
        <span className={css.badge}>{detail.source}</span>
      </div>
      {detail.path !== undefined && <div className={`${css.groupSub} ${css.mono}`}>{detail.path}</div>}
      <div className={css.field}>
        <span className={css.fieldLabel}>{t('skillsDescription')}</span>
        <textarea
          className={css.textarea}
          value={description}
          onChange={event => { setDescription(event.currentTarget.value) }}
        />
      </div>
      <div className={css.field}>
        <span className={css.fieldLabel}>{t('skillsWhenToUse')}</span>
        <textarea
          className={css.textarea}
          value={whenToUse}
          onChange={event => { setWhenToUse(event.currentTarget.value) }}
        />
      </div>
      <div className={css.field}>
        <span className={css.fieldLabel}>{t('skillsMetadata')}</span>
        <textarea
          className={`${css.textarea} ${css.textareaMono}`}
          style={{ minHeight: 80 }}
          value={metadata}
          placeholder='{ "key": "value" }'
          onChange={event => { setMetadata(event.currentTarget.value) }}
        />
      </div>
      <div className={css.row}>
        <span className={css.rowText}>
          <span className={css.title}>{t('skillsModelInvocable')}</span>
          <span className={css.desc}>{t('skillsDisableModel')}</span>
        </span>
        <Toggle checked={modelInvocable} onChange={setModelInvocable} label={t('skillsModelInvocable')} />
      </div>
      <div className={css.row}>
        <span className={css.rowText}>
          <span className={css.title}>{t('skillsUserInvocable')}</span>
        </span>
        <Toggle checked={userInvocable} onChange={setUserInvocable} label={t('skillsUserInvocable')} />
      </div>
      <div className={css.field}>
        <span className={css.fieldLabel}>{t('skillsBody')}</span>
        <textarea
          className={`${css.textarea} ${css.textareaMono}`}
          value={body}
          onChange={event => { setBody(event.currentTarget.value) }}
        />
      </div>
      {notice !== null && <div className={css.pill}>{notice}</div>}
      <div className={css.editorActions}>
        <button type="button" className={css.button} onClick={onBack}>{t('skillsCancel')}</button>
        <button type="button" className={`${css.button} ${css.buttonPrimary}`} disabled={saving} onClick={save}>
          {t('skillsSave')}
        </button>
      </div>
    </div>
  )
}
