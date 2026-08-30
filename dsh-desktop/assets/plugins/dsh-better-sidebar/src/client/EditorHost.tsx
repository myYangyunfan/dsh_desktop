/**
 * The editor tab host: the single FILES WINDOW. It resolves a file's
 * previewer through the sidebar registry (`matchFileViewer`), fetches bytes
 * per the matched viewer's fetch strategy, and renders its component — or
 * the shared download pane when nothing can render the file. A tab without
 * a path (the seeded "Files" home) renders an empty-state hint instead of
 * the viewer loading flow; that path-less window IS the file explorer.
 *
 * The chrome depends on the `editorExplorer` mode (read reactively so
 * toggling it re-renders without a reload):
 * - primary open (tree click / search result): preview in a SIDE SPLIT —
 *   a fresh tab in a rightward split of the current pane, in both modes;
 * - full-area open (the context menu's "预览" item and path-input Enter):
 *   merged mode switches the CURRENT tab in place (updateTab rewrites
 *   path/title; the tab keeps its id and meta, so treeOpen/treeWidth
 *   survive the switch); split mode opens through `openSidebarFile` (a
 *   per-path dedupe tab).
 * In split mode a PATH-LESS window is the standalone explorer — it renders
 * ONLY the tree panel (search + FileTree, full-window), no editor chrome.
 * Editor tabs (with a path) keep the full chrome in both modes. The tree's
 * context menu offers the explicit escapes: "预览" (full-area open) and
 * "在新 Tab 中打开" (per-path dedupe).
 *
 * The strategy dispatch is pure (planFirstMatch / planFsReadOutcome in
 * editor-load.ts); this component only wires it to the host APIs.
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { createElement } from 'react'
import clsx from 'clsx'
import { IconCheckOutline16, IconChevronLeftOutline14, IconFolderOpen16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { Context } from '../context-types.ts'
import { api, mediaUrl, SidebarApiError, type SessionScope } from './api.ts'
import { BinaryDownload } from './binary-download.tsx'
import { planFirstMatch, planFsReadOutcome, type EditorLoadAction } from './editor-load.ts'
import { nextDelayMs } from './chunk-availability.ts'
import { baseName } from './FileTree.tsx'
import { createFrameBatcher } from './frame-batcher.ts'
import { openSidebarFile } from './intercept.tsx'
import { openWithSshActive, openWithUrl, parseOpenWithConfig, resolveOpenWithTargets } from './open-with.ts'
import { updatePluginSettings } from './plugin-settings.ts'
import { TreePanel } from './TreePanel.tsx'
import { t } from './locales.ts'
import { relativeTo } from './paths.ts'
import { resolveSidebarPath } from './produced-files.ts'
import type { EditorToolbarControls, EditorToolbarState, FileViewerDescriptor } from './service.ts'
import { firstLeaf, insertLeafAt, leafWithTab, mintTabId, treeOf, type SidebarStore, type SidebarTab } from './state.ts'
import css from './sidebar.module.css'

type EditorLoad =
  | { status: 'loading' }
  | { status: 'error'; message: string; retryable?: boolean; autoAttempt?: number }
  | { status: 'ready'; viewer: FileViewerDescriptor; content?: string; truncated?: boolean; mediaUrl?: string; customData?: unknown }
  | { status: 'binary' }

/** The docked tree panel's width bounds (drag-resize clamps into them). */
const TREE_WIDTH_DEFAULT = 240
const TREE_WIDTH_MIN = 160
const TREE_WIDTH_MAX = 480

/** Stable empty blob for the editor pluginSettings read (a fresh `?? {}`
 *  would change identity every snapshot and loop useSyncExternalStore). */
const EMPTY_PLUGIN_BLOB: Record<string, unknown> = {}

/** The tab's persisted meta object (a malformed meta reads as empty). */
function metaOf(tab: SidebarTab): Record<string, unknown> {
  return tab.meta !== null && typeof tab.meta === 'object' && !Array.isArray(tab.meta)
    ? tab.meta as Record<string, unknown>
    : {}
}

/** Read the persisted tree-panel flag of one editor tab: an explicit
 *  boolean meta wins; otherwise path-less tabs (the seeded home) default
 *  open and file tabs default closed. */
function treeOpenOf(tab: SidebarTab): boolean {
  const treeOpen = metaOf(tab).treeOpen
  return typeof treeOpen === 'boolean' ? treeOpen : (tab.path === undefined || tab.path === '')
}

/** Read the persisted tree-panel width (clamped; default 240). */
function treeWidthOf(tab: SidebarTab): number {
  const width = metaOf(tab).treeWidth
  return typeof width === 'number' && Number.isFinite(width)
    ? Math.min(TREE_WIDTH_MAX, Math.max(TREE_WIDTH_MIN, Math.round(width)))
    : TREE_WIDTH_DEFAULT
}

/** Merge a patch into the tab's persisted meta (rides the layout). */
function patchMeta(ctx: Context, tab: SidebarTab, patch: Record<string, unknown>): void {
  ctx.betterSidebar?.updateTab(tab.id, { meta: { ...metaOf(tab), ...patch } })
}

/** Clamp one dock width into the contract range. */
function clampTreeWidth(value: number): number {
  return Math.min(TREE_WIDTH_MAX, Math.max(TREE_WIDTH_MIN, Math.round(value)))
}

export function EditorHost(props: {
  ctx: Context
  store: SidebarStore
  scope: SessionScope
  tab: SidebarTab
  expanded: string[]
  onToggleDir: (path: string) => void
  onReferenceFile: (path: string) => void
  visible?: boolean
}) {
  const { ctx, store, scope, tab, expanded, onToggleDir, onReferenceFile } = props
  const path = tab.path ?? ''
  const title = tab.title
  const [load, setLoad] = useState<EditorLoad>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const failCountRef = useRef(0)
  const failKeyRef = useRef('')
  const loadRef = useRef(load)
  loadRef.current = load
  const visible = props.visible !== false
  const prevVisibleRef = useRef(visible)
  useEffect(() => {
    // Re-activating a tab whose load ended in an error re-triggers the fetch
    // (a re-click on the same file must never stay stuck on a dead error).
    if (!prevVisibleRef.current && visible && loadRef.current.status === 'error') {
      setAttempt(a => a + 1)
    }
    prevVisibleRef.current = visible
  }, [visible])

  // Reactive prefs read: flipping editorExplorer re-renders this tab with no
  // reload. The snapshot is the bare boolean so unrelated store churn never
  // re-renders the editor.
  const inPlace = useSyncExternalStore(
    useCallback((callback: () => void) => store.subscribe(callback), [store]),
    useCallback(() => store.getSnapshot().prefs.editorExplorer, [store]),
  )

  /** 返回上级：merged mode reverts the window to the files home (the docked
   *  explorer, tree panel re-opened); split mode closes this file-preview
   *  tab, revealing the standalone explorer behind it. */
  const goBack = (): void => {
    const service = ctx.betterSidebar
    if (service === undefined) return
    if (inPlace) {
      service.updateTab(tab.id, { path: '', title: t('files'), meta: { ...metaOf(tab), treeOpen: true } })
    } else {
      service.closeTab(tab.id, scope)
    }
  }
  // The file tree's "open with" configuration (pluginSettings['editor']): a
  // blob subscription, so a pin click or a settings-page edit re-renders the
  // menu immediately. The parsed config also drives which targets are shown
  // (SSH mode hides the host-local ones).
  const editorBlob = useSyncExternalStore(
    useCallback((callback: () => void) => store.subscribe(callback), [store]),
    useCallback(() => store.getSnapshot().prefs.pluginSettings['editor'] ?? EMPTY_PLUGIN_BLOB, [store]),
  )
  const openWithConfig = useMemo(() => parseOpenWithConfig(editorBlob.openWith), [editorBlob])
  const openWithTargets = useMemo(() => resolveOpenWithTargets(openWithConfig), [openWithConfig])
  // A path-less tab shows the empty-state hint in merged mode — and in split
  // mode it is the standalone explorer (tree-only, see the render below).
  const showEmpty = path === ''
  const treeOnly = showEmpty && !inPlace

  /**
   * The full-area open (the context menu's "预览" item and the path-input
   * Enter): merged mode switches this tab in place (stable id, meta
   * survives); split mode opens a per-path dedupe tab through
   * openSidebarFile. Opening a file from the explorer home closes the
   * docked tree so the preview gets the full width (file tabs default
   * closed, per `treeOpenOf`); a user-opened tree survives file→file
   * switches.
   */
  const openFile = (absolute: string): void => {
    if (inPlace) {
      const fromHome = tab.path === undefined || tab.path === ''
      ctx.betterSidebar?.updateTab(tab.id, {
        path: absolute,
        title: baseName(absolute),
        ...(fromHome ? { meta: { ...metaOf(tab), treeOpen: false } } : {}),
      })
    } else {
      openSidebarFile(ctx, store, scope.sessionId, absolute)
    }
  }

  /** The context menu's explicit "new tab" escape (per-path dedupe). */
  const openFileNewTab = (absolute: string): void => {
    openSidebarFile(ctx, store, scope.sessionId, absolute)
  }

  /**
   * The PRIMARY open (tree click / Enter / search result): a side-split
   * preview — a fresh editor tab (uid id — the `'editor:' + path`
   * convention would clash with the id safety net on a second side-open of
   * the same file) in a rightward split of THIS pane.
   */
  const openFileSide = (absolute: string): void => {
    store.reduce((state) => {
      const key = treeOf(state, tab.id)
      const pane = leafWithTab(state[key], tab.id) ?? firstLeaf(state[key])
      const fresh: SidebarTab = {
        id: mintTabId(),
        type: 'editor',
        title: baseName(absolute),
        path: absolute,
        meta: { treeOpen: false },
      }
      const { node, leafId } = insertLeafAt(state[key], pane.id, 'row', fresh, false)
      return { ...state, [key]: node, activePane: leafId }
    })
  }

  /** The context menu's "open with" action: reveal the path in the OS file
   *  manager, or hand the target's URL (a local `file` URL, or the SSH-remote
   *  form for VSCode-family editors in remote mode) to the host's external
   *  opener. Failures are logged only — a missing handler is the OS's
   *  dialog, not a sidebar error. */
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

  /** Toggle one target's pinned state. The write is serialized (see
   *  plugin-settings.ts) and the menu re-renders when the store prefs land. */
  const toggleOpenWithPin = (targetId: string): void => {
    updatePluginSettings(store, 'editor', (blob) => {
      const config = parseOpenWithConfig(blob.openWith)
      const pinned = config.pinned.includes(targetId)
        ? config.pinned.filter(id => id !== targetId)
        : [...config.pinned, targetId]
      return { ...blob, openWith: { ...config, pinned } }
    })
  }

  // The viewer's toolbar, hoisted into THIS header: the text editor reports
  // its state and registers its commands (both null/absent for viewers
  // without a toolbar — image, pdf, binary download).
  const [toolbar, setToolbar] = useState<EditorToolbarState | null>(null)
  const controlsRef = useRef<EditorToolbarControls | null>(null)
  const onToolbarState = useCallback((next: EditorToolbarState) => {
    setToolbar(prev => prev !== null && JSON.stringify(prev) === JSON.stringify(next) ? prev : next)
  }, [])
  const onToolbarControls = useCallback((controls: EditorToolbarControls | null) => {
    controlsRef.current = controls
  }, [])

  // The docked panel's drag-resize: pointer capture on the handle itself
  // (no window listeners — the captured pointer keeps tracking even off the
  // handle). Local width while dragging, persisted into meta.treeWidth on
  // release. The panel docks left, so dragging RIGHT widens it.
  // Moves are BATCHED per frame (createFrameBatcher): applying every
  // pointermove is a setState that re-renders this host AND the editor
  // viewer below it (CodeMirror re-lays out on the width change) at event
  // cadence — the visible drag lag on slower CPUs (#315). The batch applies
  // the latest width once per frame; release flushes it and commits.
  const [dragWidth, setDragWidth] = useState<number | null>(null)
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null)
  const pendingWidthRef = useRef(0)
  const dragBatcher = useRef(createFrameBatcher()).current
  useEffect(() => () => dragBatcher.dispose(), [dragBatcher])
  const treeWidth = dragWidth ?? treeWidthOf(tab)

  const onResizeStart = (event: React.PointerEvent): void => {
    event.preventDefault()
    // jsdom lacks setPointerCapture — the tests dispatch plain MouseEvents.
    event.currentTarget.setPointerCapture?.(event.pointerId)
    dragRef.current = { startX: event.clientX, startWidth: treeWidth }
  }
  const onResizeMove = (event: React.PointerEvent): void => {
    const drag = dragRef.current
    if (drag === null) return
    pendingWidthRef.current = clampTreeWidth(drag.startWidth + (event.clientX - drag.startX))
    dragBatcher.schedule(() => setDragWidth(pendingWidthRef.current))
  }
  const onResizeEnd = (event: React.PointerEvent): void => {
    const drag = dragRef.current
    if (drag === null) return
    // Flush the last pending frame (a release can land with the final move
    // still queued; without the flush a stray frame would re-apply the
    // drag width AFTER the null below). Both setStates batch into this same
    // event, so the committed treeWidth wins visually.
    dragBatcher.flushNow()
    dragRef.current = null
    setDragWidth(null)
    const finalWidth = clampTreeWidth(drag.startWidth + (event.clientX - drag.startX))
    if (finalWidth !== treeWidthOf(tab)) patchMeta(ctx, tab, { treeWidth: finalWidth })
  }

  useEffect(() => {
    // A (re)load or a path-less tab clears any hoisted toolbar state — the
    // fresh viewer re-registers its own.
    setToolbar(null)
    // The seeded home tab (no path) never loads a viewer — the empty-state
    // hint renders until the user picks a file.
    if (showEmpty) return
    let cancelled = false
    let retryTimer: number | undefined
    // Aborts the matched viewer's `load` when the editor tears down (tab
    // closed, path changed, session switched) or re-matches the viewer.
    const controller = new AbortController()
    setLoad({ status: 'loading' })
    const succeed = (): void => { failCountRef.current = 0 }
    const fail = (error: unknown): void => {
      if (cancelled) return
      const retryable = error instanceof SidebarApiError && (error.code === 'network' || error.code === 'http')
      const key = `${scope.sessionId}|${path}`
      if (failKeyRef.current !== key) {
        failKeyRef.current = key
        failCountRef.current = 0
      }
      setLoad({
        status: 'error',
        message: error instanceof Error ? error.message : String(error),
        retryable,
        autoAttempt: retryable ? failCountRef.current + 1 : undefined,
      })
      if (retryable) {
        // Network-class failures (kernel boot/restart windows) retry with the
        // same exponential backoff the chunk loader uses, until the read lands.
        failCountRef.current += 1
        retryTimer = window.setTimeout(() => {
          if (!cancelled) setAttempt(a => a + 1)
        }, nextDelayMs(failCountRef.current))
      }
    }
    const mediaUrlOf = (): string => mediaUrl(scope, path)
    const apply = (action: EditorLoadAction): void => {
      if (cancelled) return
      switch (action.kind) {
        case 'binary':
          succeed()
          setLoad({ status: 'binary' })
          return
        case 'render':
          succeed()
          setLoad({
            status: 'ready',
            viewer: action.viewer,
            content: action.content,
            truncated: action.truncated,
            mediaUrl: action.mediaUrl,
            customData: action.customData,
          })
          return
        case 'customLoad':
          void action.viewer.load?.(path, scope, controller.signal).then((data) => {
            if (cancelled) return
            succeed()
            setLoad({ status: 'ready', viewer: action.viewer, customData: data })
          }).catch((error: unknown) => {
            if (cancelled) return
            fail(error)
          })
          return
        case 'fetchFsRead':
          api.fsRead(scope, path).then((result) => {
            if (cancelled) return
            succeed()
            // Binary reads carry the head bytes for the detect re-match.
            const outcome = planFsReadOutcome(action.viewer, {
              binary: result.kind === 'binary',
              content: result.kind === 'text' ? result.content : '',
              truncated: result.truncated,
              head: result.kind === 'binary' ? result.head : undefined,
            }, (head) => ctx.betterSidebar?.matchFileViewer(path, head), mediaUrlOf)
            apply(outcome)
          }).catch((error: unknown) => {
            if (cancelled) return
            fail(error)
          })
          return
      }
    }
    apply(planFirstMatch(ctx.betterSidebar?.matchFileViewer(path), mediaUrlOf))
    return () => {
      cancelled = true
      if (retryTimer !== undefined) window.clearTimeout(retryTimer)
      controller.abort()
    }
  }, [scope.sessionId, scope.cwd, path, ctx, showEmpty, attempt])

  const treeOpen = treeOpenOf(tab)
  /** Persist the panel flag on the tab (survives reloads with the layout). */
  const toggleTree = (): void => { patchMeta(ctx, tab, { treeOpen: !treeOpen }) }
  const saveLabel = toolbar === null ? ''
    : toolbar.saveState === 'saving' ? t('loading')
      : toolbar.saveState === 'saved' ? t('saved')
        : toolbar.saveState === 'failed' ? t('saveFailed') : ''

  // Split mode: the path-less window IS the standalone explorer — the tree
  // panel fills the whole tab (search + FileTree, full form), no editor
  // chrome. File opens land in new per-path tabs through openFile above.
  if (treeOnly) {
    return (
      <div className={css.editor}>
        <TreePanel
          full
          sessionId={scope.sessionId}
          cwd={scope.cwd}
          expanded={expanded}
          onToggle={onToggleDir}
          onOpenFile={openFileSide}
          onOpenFileNewTab={openFileNewTab}
          onPreviewFile={openFile}
          openWithTargets={openWithTargets}
          openWithPinned={openWithConfig.pinned}
          openWithSsh={openWithSshActive(openWithConfig)}
          onOpenWith={openWith}
          onToggleOpenWithPin={toggleOpenWithPin}
          onReferenceFile={onReferenceFile}
        />
      </div>
    )
  }

  return (
    <div className={css.editor}>
      <div className={css.editorHeader}>
        {!showEmpty && (
          <button
            type="button"
            className={css.editorBack}
            title={t('editorBack')}
            aria-label={t('editorBack')}
            onClick={goBack}
          >
            <IconChevronLeftOutline14 />
          </button>
        )}
        <EditorPathInput key={path} path={path} cwd={scope.cwd} onOpen={openFile} />
        {toolbar?.modes === true && (
          <div className={css.editorModeToggle}>
            <button
              type="button"
              className={clsx(css.editorModeButton, toolbar.mode === 'preview' && css.editorModeActive)}
              onClick={() => { controlsRef.current?.setMode('preview') }}
            >
              {t('preview')}
            </button>
            <button
              type="button"
              className={clsx(css.editorModeButton, toolbar.mode === 'edit' && css.editorModeActive)}
              onClick={() => { controlsRef.current?.setMode('edit') }}
            >
              {t('edit')}
            </button>
          </div>
        )}
        {toolbar?.dirty === true && <span className={css.dirtyDot} title={t('unsaved')} />}
        {toolbar?.editable === true && (
          <button
            type="button"
            className={css.iconButton}
            aria-label={t('save')}
            title={`${t('save')} (Ctrl/Cmd+S)`}
            onClick={() => { controlsRef.current?.save() }}
          >
            <IconCheckOutline16 size={14} />
          </button>
        )}
        {saveLabel !== '' && (
          <span className={clsx(css.editorStatus, toolbar?.saveState === 'failed' && css.editorStatusError)}>{saveLabel}</span>
        )}
        <button
          type="button"
          className={clsx(css.iconButton, treeOpen && css.editorTreeToggleActive)}
          aria-label={t('editorTreeToggle')}
          title={t('editorTreeToggle')}
          aria-pressed={treeOpen}
          onClick={toggleTree}
        >
          <IconFolderOpen16 size={14} />
        </button>
      </div>
      <div className={css.editorBody}>
        {treeOpen && (
          <div className={css.editorTreeDock} style={{ width: treeWidth }}>
            <div
              className={css.editorTreeResize}
              role="separator"
              aria-orientation="vertical"
              aria-label={t('editorTreeToggle')}
              onPointerDown={onResizeStart}
              onPointerMove={onResizeMove}
              onPointerUp={onResizeEnd}
              onPointerCancel={onResizeEnd}
            />
            <TreePanel
              sessionId={scope.sessionId}
              cwd={scope.cwd}
              expanded={expanded}
              onToggle={onToggleDir}
              onOpenFile={openFileSide}
              onOpenFileNewTab={openFileNewTab}
              onPreviewFile={openFile}
              openWithTargets={openWithTargets}
              openWithPinned={openWithConfig.pinned}
              openWithSsh={openWithSshActive(openWithConfig)}
              onOpenWith={openWith}
              onToggleOpenWithPin={toggleOpenWithPin}
              onReferenceFile={onReferenceFile}
            />
          </div>
        )}
        <div className={css.editorMain}>
          {showEmpty && <div className={css.editorPlaceholder}>{t('editorEmptyHint')}</div>}
          {!showEmpty && load.status === 'loading' && <div className={css.editorPlaceholder}>{t('loading')}</div>}
          {!showEmpty && load.status === 'error' && (
            <div className={css.editorError}>
              <span>{load.message}</span>
              {load.autoAttempt !== undefined && <span>{t('fsReadRetryWaiting', { n: load.autoAttempt })}</span>}
              <button type="button" className={css.terminalRetry} onClick={() => { setAttempt(a => a + 1) }}>
                {t('terminalRetry')}
              </button>
            </div>
          )}
          {!showEmpty && load.status === 'binary' && <BinaryDownload scope={scope} path={path} />}
          {!showEmpty && load.status === 'ready' && createElement(load.viewer.component, {
            ctx, store, scope, path, title,
            viewerId: load.viewer.id,
            content: load.content,
            truncated: load.truncated,
            mediaUrl: load.mediaUrl,
            customData: load.customData,
            // The viewer's toolbar always hoists into this host's header.
            toolbar: 'host',
            onToolbarState,
            onToolbarControls,
          })}
        </div>
      </div>
    </div>
  )
}

/**
 * The header's path input: shows the current file relative to the session
 * cwd (absolute when outside it). Enter resolves the typed path (relative
 * input joins onto the cwd — the same resolution `openSidebarFile` uses)
 * and opens it through the parent's mode-aware open (in-place switch or a
 * per-path dedupe tab); Escape/blur restores the current value. The parent
 * keys it by `path` so an in-place switch remounts and reseeds the draft.
 */
function EditorPathInput(props: { path: string; cwd: string | undefined; onOpen: (path: string) => void }) {
  const { path, cwd, onOpen } = props
  const display = path === '' ? '' : relativeTo(cwd ?? '', path)
  const [value, setValue] = useState(display)

  const commit = (): void => {
    const input = value.trim()
    if (input === '' || input === display) {
      setValue(display)
      return
    }
    onOpen(resolveSidebarPath(cwd, input))
    // Split mode: the open lands in a NEW/deduped editor tab — THIS tab's
    // path stays, so the input falls back to its own display value. (Merged
    // mode remounts this input on the new path; the reset is harmless.)
    setValue(display)
  }

  return (
    <input
      className={css.editorPathInput}
      value={value}
      placeholder={t('editorPathPlaceholder')}
      title={path}
      spellCheck={false}
      onChange={(event) => { setValue(event.target.value) }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          commit()
        } else if (event.key === 'Escape') {
          setValue(display)
        }
      }}
      onBlur={() => { setValue(display) }}
    />
  )
}
