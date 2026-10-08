/**
 * Archived-sessions feature UI: list every archived session (the registry's
 * one-way archive set joined with the durable session listing), restore a
 * selection, and delete single rows, a selection, or everything at once.
 *
 * Titles and last-activity come from the client session feed the sidebar uses
 * (`ctx.sessions.list`), so the panel shows exactly the labels the user sees
 * there; the host contributes the storage facts. Every destructive action goes
 * through an inline confirmation that names the count, and the host re-checks
 * each id (archived, not running, artifact found) before touching the disk.
 * A row carries two independent liveness flags: `running` (an Agent is draining
 * turns — deletion is blocked) and `loaded` (the session object merely sits in
 * this process's memory, which archiving never unloads — deletion is allowed
 * behind an explicit warning).
 */
import { useEffect, useMemo, useState } from 'react'
import type { Context } from '../../../context-types.ts'
import { api, type ArchivedList, type ArchivedMutation, type ArchivedRow } from '../../api.ts'
import { t } from '../../locales.ts'
import css from '../../panel.module.css'

/** Fallback batch size when the host does not report its cap. */
const DEFAULT_BATCH_IDS = 200

/** Human-readable byte size (binary units; numbers stay locale-neutral). */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value >= 10 ? Math.round(value) : value.toFixed(1)} ${units[unit] ?? 'KB'}`
}

/** Local time of an epoch-millisecond stamp. */
function formatTime(time: number): string {
  try {
    return new Date(time).toLocaleString()
  } catch {
    return String(time)
  }
}

/**
 * Re-pull the sidebar's session-list baseline (best-effort): a deleted session
 * stays in the client feed until the next pull, and a restored one is already
 * back through the Workspace archive frame.
 */
function refreshSessionList(ctx: Context): void {
  const refresh = ctx.sessions.refresh
  if (typeof refresh !== 'function') return
  try {
    void refresh.call(ctx.sessions).catch(() => {})
  } catch {
    // 刷新失败不影响已完成的操作结果。
  }
}

/** The pending destructive action awaiting confirmation. */
interface PendingAction {
  kind: 'restore' | 'delete'
  ids: string[]
}

export function ArchivedSection(props: { ctx: Context }) {
  const { ctx } = props
  const [data, setData] = useState<ArchivedList | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [pending, setPending] = useState<PendingAction | null>(null)
  const [busy, setBusy] = useState(false)
  const [titles, setTitles] = useState<Record<string, string>>({})

  /**
   * Reload the list. A user-triggered refresh clears the previous result
   * notice; an action's own reload keeps it (`keepNotice`) so the outcome
   * stays readable.
   */
  const load = (options?: { keepNotice?: boolean }): void => {
    setError(null)
    if (options?.keepNotice !== true) setNotice(null)
    api.archivedList()
      .then(result => {
        setData(result)
        // 列表刷新后剔除已消失的选择。
        const alive = new Set(result.rows.map(row => row.id))
        setSelected(previous => previous.filter(id => alive.has(id)))
      })
      .catch((caught: unknown) => {
        setError(caught instanceof Error ? caught.message : String(caught))
      })
  }

  // 标题直接复用侧边栏的会话列表（同一份 Host 投影），标题变化时同步刷新。
  useEffect(() => {
    const read = (): void => {
      const snapshot = ctx.sessions.list.getSnapshot()
      const next: Record<string, string> = {}
      for (const [id, summary] of Object.entries(snapshot.byId)) {
        const label = summary.displayTitle
        if (typeof label === 'string' && label !== '') next[id] = label
      }
      setTitles(next)
    }
    read()
    return ctx.sessions.list.subscribe(read)
  }, [ctx])

  useEffect(load, [ctx])

  const rows = useMemo(() => data?.rows ?? [], [data])
  const selectedSet = useMemo(() => new Set(selected), [selected])
  const restorableSelected = rows.filter(row => selectedSet.has(row.id) && row.restorable).map(row => row.id)
  const deletableSelected = rows.filter(row => selectedSet.has(row.id) && row.deletable).map(row => row.id)
  const deletableAll = rows.filter(row => row.deletable).map(row => row.id)
  const allSelected = rows.length > 0 && selected.length === rows.length

  const toggleAll = (): void => {
    setSelected(allSelected ? [] : rows.map(row => row.id))
  }

  const toggleOne = (id: string): void => {
    setSelected(previous => (previous.includes(id) ? previous.filter(item => item !== id) : [...previous, id]))
  }

  /** Run one confirmed action (chunked to the host's batch cap) and fold the result into the notice area. */
  const run = (action: PendingAction): void => {
    setBusy(true)
    setNotice(null)
    setError(null)
    const chunkSize = Math.max(1, data?.maxBatchIds ?? DEFAULT_BATCH_IDS)
    const call = action.kind === 'delete' ? api.archivedDelete : api.archivedRestore
    runInBatches(action.ids, chunkSize, call)
      .then((result: ArchivedMutation) => {
        const changed = new Set(result.changed)
        setSelected(previous => previous.filter(id => !changed.has(id)))
        setPending(null)
        setBusy(false)
        if (action.kind === 'delete' && result.changed.length > 0) refreshSessionList(ctx)
        load({ keepNotice: true })
        setNotice(describeResult(action.kind, result))
      })
      .catch((caught: unknown) => {
        setError(caught instanceof Error ? caught.message : String(caught))
        setPending(null)
        setBusy(false)
      })
  }

  if (data === null && error === null) {
    return <div className={css.empty}>{t('loading')}</div>
  }
  if (error !== null && data === null) {
    return (
      <div className={css.error} role="alert">
        {t('archivedLoadFailed')}: {error}
        <div style={{ marginTop: 8 }}>
          <button type="button" className={css.button} onClick={() => { load() }}>{t('retry')}</button>
        </div>
      </div>
    )
  }

  const list = data as ArchivedList
  const disabled = busy || list.readOnly || !list.writable
  // 确认框里点名「仍装载在本次进程中」的目标：归档不会卸载会话，删除这类会话后
  // 如果客户端还持有它，之后的写盘可能报错或把日志重新建出来。
  const pendingIds = new Set(pending?.ids ?? [])
  const pendingLoadedCount = rows.filter(row => pendingIds.has(row.id) && row.loaded && !row.running).length

  return (
    <>
      <p className={css.intro}>{t('archivedIntro')}</p>
      {!list.mounted && <div className={css.error} role="alert">{t('archivedUnavailable')}</div>}
      {list.mounted && !list.writable && <div className={css.error} role="alert">{t('archivedNotWritable')}</div>}
      {list.readOnly && <div className={css.error} role="alert">{t('archivedReadOnly')}</div>}
      {list.listingFailed && <div className={css.error} role="alert">{t('archivedListingFailed')}</div>}

      <div className={css.toolbar}>
        <label className={css.checkRow}>
          <input
            type="checkbox"
            checked={allSelected}
            disabled={rows.length === 0}
            aria-label={t('archivedSelectAll')}
            onChange={toggleAll}
          />
          {t('archivedSelectAll')}
        </label>
        <span className={css.desc}>
          {t('archivedCount', { count: rows.length })}
          {' · '}
          {t('archivedTotalSize', { size: formatBytes(list.totalBytes) })}
          {selected.length > 0 && ` · ${t('archivedSelected', { count: selected.length })}`}
        </span>
        <button
          type="button"
          className={css.button}
          disabled={disabled || restorableSelected.length === 0}
          onClick={() => { setPending({ kind: 'restore', ids: restorableSelected }) }}
        >
          {t('archivedRestoreSelected')}
        </button>
        <button
          type="button"
          className={`${css.button} ${css.buttonDanger}`}
          disabled={disabled || !list.deleteEnabled || deletableSelected.length === 0}
          onClick={() => { setPending({ kind: 'delete', ids: deletableSelected }) }}
        >
          {t('archivedDeleteSelected')}
        </button>
        <button
          type="button"
          className={`${css.button} ${css.buttonDanger}`}
          disabled={disabled || !list.deleteEnabled || deletableAll.length === 0}
          onClick={() => { setPending({ kind: 'delete', ids: deletableAll }) }}
        >
          {t('archivedDeleteAll')}
        </button>
        <button type="button" className={css.button} disabled={busy} onClick={() => { load() }}>{t('refresh')}</button>
      </div>
      <div className={`${css.groupSub} ${css.mono}`}>{t('archivedRoot')}: {list.sessionsRoot}</div>

      {!list.deleteEnabled && <div className={css.note}>{t('archivedDeleteDisabled')}</div>}
      {notice !== null && <div className={css.pill}>{notice}</div>}
      {error !== null && <div className={css.error} role="alert">{error}</div>}

      {pending !== null && (
        <div
          className={pending.kind === 'delete' ? `${css.confirmBar} ${css.confirmBarDanger}` : css.confirmBar}
          role="alertdialog"
          aria-label={t('archivedConfirm')}
        >
          <span>
            {pending.kind === 'delete'
              ? t('archivedConfirmDelete', { count: pending.ids.length })
              : t('archivedConfirmRestore', { count: pending.ids.length })}
          </span>
          {pending.kind === 'delete' && <span className={css.note}>{t('archivedNote')}</span>}
          {pending.kind === 'delete' && pendingLoadedCount > 0 && (
            <span className={css.note}>{t('archivedLoadedWarning', { count: pendingLoadedCount })}</span>
          )}
          <div className={css.editorActions}>
            <button type="button" className={css.button} disabled={busy} onClick={() => { setPending(null) }}>
              {t('archivedCancel')}
            </button>
            <button
              type="button"
              className={`${css.button} ${pending.kind === 'delete' ? css.buttonDanger : css.buttonPrimary}`}
              disabled={busy}
              onClick={() => { run(pending) }}
            >
              {busy ? t('archivedWorking') : t('archivedConfirm')}
            </button>
          </div>
        </div>
      )}

      {rows.length === 0 && <div className={css.empty}>{t('archivedEmpty')}</div>}
      <div className={css.skillList}>
        {rows.map(row => (
          <ArchivedRowItem
            key={row.id}
            row={row}
            title={titles[row.id]}
            checked={selectedSet.has(row.id)}
            busy={busy}
            readOnly={list.readOnly || !list.writable}
            deleteEnabled={list.deleteEnabled}
            onToggle={() => { toggleOne(row.id) }}
            onRestore={() => { setPending({ kind: 'restore', ids: [row.id] }) }}
            onDelete={() => { setPending({ kind: 'delete', ids: [row.id] }) }}
          />
        ))}
      </div>
      {rows.length > 0 && <div className={css.note}>{t('archivedRefreshHint')}</div>}
    </>
  )
}

/** One archived-session row. */
function ArchivedRowItem(props: {
  row: ArchivedRow
  title: string | undefined
  checked: boolean
  busy: boolean
  readOnly: boolean
  deleteEnabled: boolean
  onToggle: () => void
  onRestore: () => void
  onDelete: () => void
}) {
  const { row, title, checked, busy, readOnly, deleteEnabled, onToggle, onRestore, onDelete } = props
  const facts: string[] = []
  if (row.createdAt !== undefined) facts.push(t('archivedCreatedAt', { time: formatTime(row.createdAt) }))
  if (row.sizeBytes !== undefined) facts.push(formatBytes(row.sizeBytes))
  if (row.eventCount !== undefined) facts.push(t('archivedEvents', { count: row.eventCount }))
  return (
    <div className={css.archivedRow}>
      <input
        type="checkbox"
        checked={checked}
        disabled={busy}
        aria-label={title ?? row.id}
        onChange={onToggle}
      />
      <div className={css.skillMain}>
        <span className={css.skillName}>{title ?? (row.id !== '' ? row.id : t('archivedUntitled'))}</span>
        <span className={`${css.desc} ${css.mono}`}>{row.id}</span>
        {row.cwd !== undefined && <span className={`${css.desc} ${css.mono}`}>{row.cwd}</span>}
        {facts.length > 0 && <span className={css.desc}>{facts.join(' · ')}</span>}
      </div>
      {row.running && <span className={css.badge} title={t('archivedRunningHint')}>{t('archivedRunning')}</span>}
      {!row.running && row.loaded && <span className={css.badge} title={t('archivedLoadedHint')}>{t('archivedLoaded')}</span>}
      {!row.stored && <span className={css.badge}>{t('archivedMissing')}</span>}
      <div className={css.rowActions}>
        <button
          type="button"
          className={css.button}
          disabled={busy || readOnly || !row.restorable}
          onClick={onRestore}
        >
          {t('archivedRestore')}
        </button>
        <button
          type="button"
          className={`${css.button} ${css.buttonDanger}`}
          disabled={busy || readOnly || !deleteEnabled || !row.deletable}
          onClick={onDelete}
        >
          {t('archivedDelete')}
        </button>
      </div>
    </div>
  )
}

/** Build the human-readable summary of one restore/delete result. */
function describeResult(kind: 'restore' | 'delete', result: ArchivedMutation): string {
  const parts: string[] = [
    kind === 'delete'
      ? t('archivedDeleted', { count: result.changed.length, size: formatBytes(result.freedBytes) })
      : t('archivedRestored', { count: result.changed.length }),
  ]
  if (result.skipped.length > 0) {
    const reasons = [...new Set(result.skipped.map(item => item.reason))].join('；')
    parts.push(t('archivedSkipped', { count: result.skipped.length, reasons }))
  }
  if (result.staleSnapshot) parts.push(t('archivedStaleSnapshot'))
  if (result.warning !== undefined) parts.push(result.warning)
  return parts.join(' · ')
}

/**
 * Run one mutation over every id, sliced to the host's batch cap, and merge the
 * per-batch results. Batches run sequentially so a failure reports the work
 * already done instead of interleaving writes.
 * @param ids - target session ids (already unique).
 * @param size - maximum ids per call.
 * @param call - the API method to invoke per batch.
 * @returns the merged result of every completed batch.
 */
async function runInBatches(
  ids: string[],
  size: number,
  call: (batch: string[]) => Promise<ArchivedMutation>,
): Promise<ArchivedMutation> {
  const merged: ArchivedMutation = {
    ok: true,
    changed: [],
    skipped: [],
    archivedIds: [],
    freedBytes: 0,
    staleSnapshot: false,
  }
  const warnings: string[] = []
  for (let index = 0; index < ids.length; index += size) {
    const batch = ids.slice(index, index + size)
    const result = await call(batch)
    merged.changed.push(...result.changed)
    merged.skipped.push(...result.skipped)
    merged.freedBytes += result.freedBytes
    merged.archivedIds = result.archivedIds
    merged.staleSnapshot = merged.staleSnapshot || result.staleSnapshot
    if (result.warning !== undefined) warnings.push(result.warning)
  }
  if (warnings.length > 0) merged.warning = [...new Set(warnings)].join('；')
  return merged
}
