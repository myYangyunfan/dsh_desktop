/**
 * The persistent Explorer rail: the file-tree column that lives at the LEFT
 * edge of every editor window (VSCode's sidebar), migrated from the PACK
 * 0.15.x line. Unlike the old per-tab docked tree it is decoupled from any
 * editor tab — it stays put while files open as tabs beside it, and closing
 * every tab never hides it (the host's right Sidebar owns the tab strip, so
 * the rail is rendered inside each editor body over the SAME per-session
 * state — see EditorHost).
 *
 * It owns only the column chrome (a slim header with a collapse affordance
 * and a right-edge drag handle) and wires the self-contained {@link TreePanel}
 * to the props its host passes down. Every open gesture funnels through the
 * host's per-path dedupe `openFile` (see EditorHost), so a run of tree clicks
 * accumulates distinct tabs and NEVER replaces a previously opened one.
 */
import { useEffect, useRef, useState } from 'react'
import {
  IconChevronLeftOutlineRegular,
  IconChevronRightOutlineRegular,
  IconFolderOpenRegular,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { createFrameBatcher } from './frame-batcher.ts'
import type { OpenInApp } from './open-in-app.ts'
import type { OpenWithTarget } from './open-with.ts'
import type { BetterSidebarService } from './service.ts'
import { TreePanel } from './TreePanel.tsx'
import { t } from './locales.ts'
import { clampExplorerWidth } from './state.ts'
import css from './sidebar.module.css'

export function ExplorerRail(props: {
  sessionId: string
  cwd: string | undefined
  expanded: string[]
  revealed: string[]
  /** Whether the owning editor tab is on screen: a parked tab's tree pauses
   *  its git polling (the shared status store pauses when nothing visible
   *  wants it). */
  visible: boolean
  onToggleDir: (path: string) => void
  onOpenFile: (path: string) => void
  onOpenFileNewTab: (path: string) => void
  onOpenFileSide: (path: string) => void
  openInApp: OpenInApp
  openWithTargets: OpenWithTarget[]
  openWithPinned: string[]
  openWithSsh: boolean
  openWithShowPluginTargets: boolean
  onOpenWith: (targetId: string, path: string) => void
  onToggleOpenWithPin: (targetId: string) => void
  onReferenceFile: (path: string, isDir: boolean) => void
  onPathRenamed: (oldPath: string, newPath: string) => void
  onPathDeleted: (path: string) => void
  service: BetterSidebarService | undefined
  /** The persisted rail width (state.explorerWidth). */
  width: number
  /** Commit a drag-resized width into the store (clamped reducer). */
  onResize: (width: number) => void
  /** Collapse the rail (the session-level toggleExplorer). */
  onCollapse: () => void
}) {
  const {
    sessionId, cwd, expanded, revealed, visible, onToggleDir, onOpenFile, onOpenFileNewTab,
    onOpenFileSide, openInApp, openWithTargets, openWithPinned, openWithSsh,
    openWithShowPluginTargets, onOpenWith, onToggleOpenWithPin, onReferenceFile,
    onPathRenamed, onPathDeleted, service, width, onResize, onCollapse,
  } = props

  // The right-edge drag-resize: pointer capture on the handle (no window
  // listeners — the captured pointer keeps tracking even off the handle). The
  // rail docks LEFT of the editor column, so dragging RIGHT widens it. Moves
  // are BATCHED per frame (createFrameBatcher) so a fast drag re-renders the
  // tree at most once per frame instead of once per pointermove; release
  // flushes and commits the final width into the store.
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
        <IconFolderOpenRegular size={14} />
        <span className={css.explorerRailTitle}>{t('explorer')}</span>
        <button
          type="button"
          className={css.iconButton}
          aria-label={t('explorerCollapse')}
          title={t('explorerCollapse')}
          onClick={onCollapse}
        >
          <IconChevronLeftOutlineRegular size={14} />
        </button>
      </div>
      <TreePanel
        full
        visible={visible}
        sessionId={sessionId}
        cwd={cwd}
        expanded={expanded}
        revealed={revealed}
        onToggle={onToggleDir}
        onOpenFile={onOpenFile}
        onOpenFileNewTab={onOpenFileNewTab}
        onOpenFileSide={onOpenFileSide}
        openInApp={openInApp}
        openWithShowPluginTargets={openWithShowPluginTargets}
        openWithTargets={openWithTargets}
        openWithPinned={openWithPinned}
        openWithSsh={openWithSsh}
        onOpenWith={onOpenWith}
        onToggleOpenWithPin={onToggleOpenWithPin}
        onReferenceFile={onReferenceFile}
        onPathRenamed={onPathRenamed}
        onPathDeleted={onPathDeleted}
        service={service}
      />
      <div
        className={css.explorerRailResize}
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
 *  file tree back. Kept beside the editor column so collapse never reflows the
 *  viewer's right edge and the reopen control is always in the same place. */
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
        <IconChevronRightOutlineRegular size={14} />
      </button>
    </div>
  )
}
