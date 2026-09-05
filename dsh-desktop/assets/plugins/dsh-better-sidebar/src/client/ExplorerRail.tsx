/**
 * The persistent Explorer rail: the file tree column that lives to the LEFT of
 * the tabbed workbench (VSCode's sidebar), inside the panel body. Unlike the
 * old per-tab docked tree it is decoupled from any editor tab — it stays put
 * while files open as tabs beside it, and closing every tab never hides it.
 *
 * It owns only the column chrome (a slim header with a collapse affordance and
 * a right-edge drag handle) and wires the self-contained {@link TreePanel} to
 * the store. Every open gesture (single click, double click, the context
 * menu's "preview" / "open in new tab", search results) funnels through
 * {@link openSidebarFile}, which dedupes per path and lands the tab in the
 * active workbench pane — so a run of clicks accumulates distinct tabs and
 * NEVER replaces a previously opened one (the reported "预览会覆盖旧标签").
 *
 * The "open with" surface mirrors the editor host: it reads the same
 * pluginSettings['editor'] blob so a pin click or a settings edit re-renders
 * the menu immediately.
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import clsx from 'clsx'
import { IconChevronLeftOutline14, IconChevronRightOutline14, IconFolderOpen16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { Context } from '../context-types.ts'
import { api } from './api.ts'
import { createFrameBatcher } from './frame-batcher.ts'
import { openSidebarFile } from './intercept.tsx'
import { openWithSshActive, openWithUrl, parseOpenWithConfig, resolveOpenWithTargets } from './open-with.ts'
import { updatePluginSettings } from './plugin-settings.ts'
import { TreePanel } from './TreePanel.tsx'
import { t } from './locales.ts'
import { clampExplorerWidth, type SidebarStore } from './state.ts'
import css from './sidebar.module.css'

/** Stable empty blob for the editor pluginSettings read (a fresh `?? {}`
 *  would change identity every snapshot and loop useSyncExternalStore). */
const EMPTY_PLUGIN_BLOB: Record<string, unknown> = {}

export function ExplorerRail(props: {
  ctx: Context
  store: SidebarStore
  sessionId: string | undefined
  cwd: string | undefined
  expanded: string[]
  onToggleDir: (path: string) => void
  onReferenceFile: (path: string) => void
  /** The persisted rail width (state.explorerWidth). */
  width: number
  /** Commit a drag-resized width into the store (clamped reducer). */
  onResize: (width: number) => void
  /** Collapse the rail (toggleExplorer). */
  onCollapse: () => void
}) {
  const { ctx, store, sessionId, cwd, expanded, onToggleDir, onReferenceFile, width, onResize, onCollapse } = props

  // The tree's "open with" configuration (pluginSettings['editor']): a blob
  // subscription, so a pin click or a settings-page edit re-renders the menu
  // immediately (identical to the editor host's read).
  const editorBlob = useSyncExternalStore(
    useCallback((callback: () => void) => store.subscribe(callback), [store]),
    useCallback(() => store.getSnapshot().prefs.pluginSettings['editor'] ?? EMPTY_PLUGIN_BLOB, [store]),
  )
  const openWithConfig = useMemo(() => parseOpenWithConfig(editorBlob.openWith), [editorBlob])
  const openWithTargets = useMemo(() => resolveOpenWithTargets(openWithConfig), [openWithConfig])

  // Every open gesture is a fixed, per-path-deduped tab in the workbench. No
  // transient preview slot, so nothing a single click opens can be replaced by
  // the next one. A session-less rail cannot resolve a workspace path — no-op.
  const openFile = useCallback((absolute: string): void => {
    if (sessionId === undefined) return
    openSidebarFile(ctx, store, sessionId, absolute)
  }, [ctx, store, sessionId])

  const openWith = (targetId: string, absolute: string): void => {
    const target = openWithTargets.find(item => item.id === targetId)
    if (target === undefined) return
    if (target.kind === 'reveal') {
      void api.openExternal({ action: 'reveal', path: absolute }).catch(
        (error: unknown) => { console.error('open external failed', error) },
      )
      return
    }
    const url = openWithUrl(target, absolute, openWithConfig)
    if (url === undefined) return
    void api.openExternal({ action: 'url', url }).catch(
      (error: unknown) => { console.error('open external failed', error) },
    )
  }

  // Toggle one target's pinned state. The write is serialized (see
  // plugin-settings.ts) and the menu re-renders when the store prefs land.
  const toggleOpenWithPin = (targetId: string): void => {
    updatePluginSettings(store, 'editor', (blob) => {
      const config = parseOpenWithConfig(blob.openWith)
      const pinned = config.pinned.includes(targetId)
        ? config.pinned.filter(id => id !== targetId)
        : [...config.pinned, targetId]
      return { ...blob, openWith: { ...config, pinned } }
    })
  }

  // The right-edge drag-resize: pointer capture on the handle (no window
  // listeners — the captured pointer keeps tracking even off the handle). The
  // rail docks LEFT of the workbench, so dragging RIGHT widens it. Moves are
  // BATCHED per frame (createFrameBatcher) so a fast drag re-renders the tree
  // at most once per frame instead of once per pointermove; release flushes and
  // commits the final width into the store.
  const [dragWidth, setDragWidth] = useState<number | null>(null)
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null)
  const pendingWidthRef = useRef(0)
  const dragBatcher = useRef(createFrameBatcher()).current
  useEffect(() => () => dragBatcher.dispose(), [dragBatcher])
  const liveWidth = dragWidth ?? width

  const onResizeStart = (event: React.PointerEvent): void => {
    event.preventDefault()
    // jsdom lacks setPointerCapture — the tests dispatch plain MouseEvents.
    event.currentTarget.setPointerCapture?.(event.pointerId)
    dragRef.current = { startX: event.clientX, startWidth: liveWidth }
  }
  const onResizeMove = (event: React.PointerEvent): void => {
    const drag = dragRef.current
    if (drag === null) return
    pendingWidthRef.current = clampExplorerWidth(drag.startWidth + (event.clientX - drag.startX))
    dragBatcher.schedule(() => setDragWidth(pendingWidthRef.current))
  }
  const onResizeEnd = (event: React.PointerEvent): void => {
    const drag = dragRef.current
    if (drag === null) return
    // Flush the last pending frame (a release can land with the final move
    // still queued), then commit the pointer's FINAL position.
    dragBatcher.flushNow()
    dragRef.current = null
    setDragWidth(null)
    onResize(clampExplorerWidth(drag.startWidth + (event.clientX - drag.startX)))
  }

  return (
    <div className={css.explorerRail} style={{ width: liveWidth }}>
      <div className={css.explorerRailHeader}>
        <IconFolderOpen16 size={14} />
        <span className={css.explorerRailTitle}>{t('explorer')}</span>
        <button
          type="button"
          className={css.iconButton}
          aria-label={t('explorerCollapse')}
          title={t('explorerCollapse')}
          onClick={onCollapse}
        >
          <IconChevronLeftOutline14 size={14} />
        </button>
      </div>
      {sessionId !== undefined && (
        <TreePanel
          full
          sessionId={sessionId}
          cwd={cwd}
          expanded={expanded}
          onToggle={onToggleDir}
          onOpenFile={openFile}
          onOpenFilePermanent={openFile}
          onOpenFileNewTab={openFile}
          onPreviewFile={openFile}
          openWithTargets={openWithTargets}
          openWithPinned={openWithConfig.pinned}
          openWithSsh={openWithSshActive(openWithConfig)}
          onOpenWith={openWith}
          onToggleOpenWithPin={toggleOpenWithPin}
          onReferenceFile={onReferenceFile}
        />
      )}
      <div
        className={css.editorTreeResize}
        role="separator"
        aria-orientation="vertical"
        aria-label={t('explorer')}
        onPointerDown={onResizeStart}
        onPointerMove={onResizeMove}
        onPointerUp={onResizeEnd}
        onPointerCancel={onResizeEnd}
      />
    </div>
  )
}

/** The collapsed rail: a thin strip offering a single affordance to bring the
 *  file tree back. Kept beside the workbench so collapse never reflows the tab
 *  area's right edge and the reopen control is always in the same place. */
export function ExplorerRailCollapsed(props: { onExpand: () => void }) {
  return (
    <div className={css.explorerRailCollapsed}>
      <button
        type="button"
        className={css.iconButton}
        aria-label={t('explorerExpand')}
        title={t('explorerExpand')}
        onClick={props.onExpand}
      >
        <IconChevronRightOutline14 size={14} />
      </button>
    </div>
  )
}
