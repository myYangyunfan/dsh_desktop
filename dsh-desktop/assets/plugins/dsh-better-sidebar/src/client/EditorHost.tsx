/**
 * The editor tab host: the FILE VIEWER for one path, framed by the
 * persistent Explorer rail (the file-tree column at its LEFT edge — see
 * ExplorerRail.tsx; migrated from the PACK 0.15.x line). It resolves the
 * file's previewer through the sidebar registry (`matchFileViewer`), fetches
 * bytes per the matched viewer's fetch strategy, and renders its component —
 * or the shared download pane when nothing can render the file.
 *
 * The unified (PACK/VSCode) model: every open — rail click, search row,
 * path-input Enter — goes through `openSidebarFile`, a per-path dedupe tab;
 * an open focuses an existing tab or appends a new one and NEVER replaces
 * the current window in place (the retired merged mode's in-place switch).
 * The rail's open flag and width are session-level (state.explorerOpen /
 * explorerWidth, read through {@link useExplorerLayout}), so the column stays
 * put while files open as tabs beside it — every editor tab of a session
 * renders the same rail. A tab without a path (the seeded "Files" home)
 * renders the empty-state hint beside the rail; a folder window (meta.dir)
 * keeps its full-window tree rooted at the folder instead.
 *
 * The tree's context menu offers the explicit escapes: open in a new tab
 * (the same per-path dedupe) or to the side (a fresh tab in a fresh rightward
 * split of the current pane, or the host's second pane on the native
 * surface).
 *
 * The strategy dispatch is pure (planFirstMatch / planFsReadOutcome in
 * editor-load.ts); this component only wires it to the host APIs.
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { createElement } from 'react'
import clsx from 'clsx'
import { IconCheckOutlineRegular, IconRefreshOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { Context } from '../context-types.ts'
import { api, mediaUrl, SidebarApiError, type SessionScope } from './api.ts'
import { BinaryDownload } from './binary-download.tsx'
import { nextDelayMs } from './chunk-availability.ts'
import { planFirstMatch, planFsReadOutcome, type EditorLoadAction } from './editor-load.ts'
import { baseName } from './FileTree.tsx'
import { ExplorerRail, ExplorerRailCollapsed } from './ExplorerRail.tsx'
import { openSidebarFile } from './sidebar-file.ts'
import { openWithSshActive, openWithUrl, parseOpenWithConfig, resolveOpenWithTargets } from './open-with.ts'
import { updatePluginSettings } from './plugin-settings.ts'
import { createOpenInApp } from './open-in-app.ts'
import { TreePanel } from './TreePanel.tsx'
import { t } from './locales.ts'
import { relativeTo } from './paths.ts'
import { resolveSidebarPath } from './paths.ts'
import { closePathTabs, retargetPathTabs } from './tree-mutations.ts'
import type { EditorToolbarControls, EditorToolbarState, FileViewerDescriptor } from './service.ts'
import {
  EXPLORER_WIDTH_DEFAULT, firstLeaf, insertLeafAt, leafWithTab, mintTabId, setExplorerWidth, toggleExplorer,
  type SidebarState, type SidebarStore, type SidebarTab,
} from './state.ts'
import css from './sidebar.module.css'

type EditorLoad =
  | { status: 'loading' }
  | { status: 'error'; message: string; retryable?: boolean; autoAttempt?: number }
  | { status: 'ready'; viewer: FileViewerDescriptor; content?: string; truncated?: boolean; mediaUrl?: string; customData?: unknown }
  | { status: 'binary' }

/** Stable empty blob for the editor pluginSettings read (a fresh `?? {}`
 *  would change identity every snapshot and loop useSyncExternalStore). */
const EMPTY_PLUGIN_BLOB: Record<string, unknown> = {}

/** The tab's persisted meta object (a malformed meta reads as empty). */
function metaOf(tab: SidebarTab): Record<string, unknown> {
  return tab.meta !== null && typeof tab.meta === 'object' && !Array.isArray(tab.meta)
    ? tab.meta as Record<string, unknown>
    : {}
}

/** The session's Explorer layout (rail open flag + width), live from the
 *  store. Reads through `getSessionStates` so a tab rendered for a session
 *  other than the store's active one still sees ITS own layout; mutations
 *  route through `reduce` for the active session (which notifies every
 *  subscriber) and `reduceFor` for a background one — that path is silent by
 *  contract, so the local version bump re-reads the snapshot and the click /
 *  drag still lands optically. */
function useExplorerLayout(store: SidebarStore, sessionId: string): {
  explorerOpen: boolean
  explorerWidth: number
  toggle: () => void
  setWidth: (width: number) => void
} {
  const [, setVersion] = useState(0)
  const state = useSyncExternalStore(
    useCallback((callback: () => void) => store.subscribe(callback), [store]),
    useCallback(() => store.getSessionStates().get(sessionId), [store, sessionId]),
  )
  const mutate = useCallback((reducer: (state: SidebarState) => SidebarState): void => {
    if (store.getSnapshot().sessionId === sessionId) {
      store.reduce(reducer)
      return
    }
    store.reduceFor(sessionId, reducer)
    setVersion(version => version + 1)
  }, [store, sessionId])
  const toggle = useCallback((): void => { mutate(toggleExplorer) }, [mutate])
  const setWidth = useCallback((width: number): void => {
    mutate(state => setExplorerWidth(state, width))
  }, [mutate])
  return {
    // A session the store has never loaded (a background tab before its
    // first write) renders the defaults; the first mutation loads it.
    explorerOpen: state?.explorerOpen ?? true,
    explorerWidth: state?.explorerWidth ?? EXPLORER_WIDTH_DEFAULT,
    toggle,
    setWidth,
  }
}

export function EditorHost(props: {
  ctx: Context
  store: SidebarStore
  scope: SessionScope
  tab: SidebarTab
  /** Whether this tab is the active one with its panel open: a parked tab
   *  must not keep polling (the workbench keeps every tab body mounted). */
  visible?: boolean
  expanded: string[]
  revealed: string[]
  onToggleDir: (path: string) => void
  onReferenceFile: (path: string, isDir: boolean) => void
}) {
  const { ctx, store, scope, tab, expanded, revealed, onToggleDir, onReferenceFile } = props
  const visible = props.visible !== false
  const path = tab.path ?? ''
  const title = tab.title
  // A folder window: the model's `sidebar_open` (or any caller) opens a
  // directory as an editor tab carrying `meta.dir: true` with the directory
  // as its path. It renders the file tree rooted at that folder instead of
  // the viewer loading flow (a directory is not a file).
  const isDir = metaOf(tab).dir === true
  const [load, setLoad] = useState<EditorLoad>({ status: 'loading' })
  // Manual refresh (issue #167): bumping the sequence re-runs the load effect
  // with the same path/scope — the only reload entry besides open/close.
  const [reloadSeq, setReloadSeq] = useState(0)
  // Issue #171 (F1-1/F1-2): network-class read failures retry on the chunk
  // loader's backoff curve, and an error-state tab that becomes visible again
  // re-pulls — a file must never stay stuck on a dead error banner.
  const failCountRef = useRef(0)
  const failKeyRef = useRef('')
  const loadRef = useRef(load)
  loadRef.current = load
  const prevVisibleRef = useRef(visible)
  useEffect(() => {
    if (!prevVisibleRef.current && visible && loadRef.current.status === 'error') {
      setReloadSeq(sequence => sequence + 1)
    }
    prevVisibleRef.current = visible
  }, [visible])

  // Manual refresh (issue #167 + PR #228): a dirty draft is dropped by the
  // reload (the editor instance remounts), so confirm before discarding it.
  const refreshFile = (): void => {
    if (toolbar?.dirty === true) {
      const confirmed = typeof window.confirm === 'function'
        ? window.confirm(t('refreshUnsavedConfirm'))
        : false
      if (!confirmed) return
    }
    setReloadSeq(sequence => sequence + 1)
  }

  // The session-level Explorer rail layout: shared by every editor tab of
  // this session, so opening/closing files never resets the column.
  const explorer = useExplorerLayout(store, scope.sessionId)
  // The DSH-native "open with" capability (host open-in-app): one adapter per
  // window, shared by every row menu below. The plugin no longer owns a
  // target list, a URL vocabulary or a spawn route — the host reports which
  // applications are actually installed for THIS path.
  const openInApp = useMemo(() => createOpenInApp(ctx), [ctx])
  // The plugin's own service (native-tab opens, "open to the side"): absent in
  // stripped-down hosts, where every flow degrades to the bottom workbench.
  const service = ctx.get('betterSidebar')
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
  // The declarative "always show the plugin's own targets" switch (the editor
  // card's pluginToggles row): a plain boolean on the SAME blob, so both the
  // settings page and the tree's menu see one value. Absent/false keeps the
  // host-first behavior (the tree decides what to hide).
  const openWithShowPluginTargets = editorBlob.openWithPluginTargets === true
  // A path-less tab shows the empty-state hint beside the rail (a leftover
  // home window from an older layout). A folder tab is a folder window: the
  // tree rooted at the folder, no editor chrome.
  const showEmpty = path === ''
  const folderRoot = isDir ? path : undefined

  /**
   * Open a file from THIS window (rail click / search row / path input):
   * the per-path dedupe tab — an already-open file focuses, a new one
   * appends. Nothing replaces the current window in place.
   */
  const openFile = (absolute: string): void => {
    openSidebarFile(ctx, scope.sessionId, absolute)
  }

  /** The context menu's explicit "new tab" escape — the same per-path dedupe
   *  (kept as its own prop so the menu's promise never changes meaning). */
  const openFileNewTab = (absolute: string): void => {
    openSidebarFile(ctx, scope.sessionId, absolute)
  }

  /**
   * The context menu's "open to the side": a fresh editor tab (uid id — the
   * `'editor:' + path` convention would clash with the id safety net on a
   * second side-open of the same file) in a rightward split of THIS pane.
   *
   * Native right-Sidebar tabs do NOT live in `bottomSplits`, so the bottom
   * branch would fall through to `firstLeaf` — a pane the user has not
   * expanded, i.e. "nothing happened". Those tabs instead ask the host for a
   * second pane through the service (`target: 'side'` → the host's
   * `preferNewPane`), which is the same gesture in the surface the user is
   * actually looking at.
   */
  const openFileSide = (absolute: string): void => {
    // `store.tabOpen` answers from THIS session's own state map — the bottom
    // workbench's splits. A natively-hosted tab (right Sidebar) is absent
    // from them even while it is on screen.
    if (service !== undefined && !store.tabOpen(scope.sessionId, tab.id)) {
      service.openTab({ type: 'editor', path: absolute, target: 'side' }, scope)
      return
    }
    store.reduce((state) => {
      const pane = leafWithTab(state.bottomSplits, tab.id) ?? firstLeaf(state.bottomSplits)
      const fresh: SidebarTab = {
        id: mintTabId(),
        type: 'editor',
        title: baseName(absolute),
        path: absolute,
      }
      const { node, leafId } = insertLeafAt(state.bottomSplits, pane.id, 'row', fresh, false)
      return { ...state, bottomSplits: node, activePane: leafId }
    })
  }

  /** The context menu's "open with" action: reveal the path in the OS file
   *  manager, or hand the target's URL to its opener — local `file` URLs go
   *  to the host's external opener, while the SSH-remote form for
   *  VSCode-family editors launches on the browser/client machine (see
   *  api.openExternal). Failures are logged only — a missing handler is the
   *  OS's/browser's dialog, not a sidebar error. */
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

  // Tree mutations reconcile the OPEN tabs (both split trees, the bottom
  // panel, free windows): a rename retargets its tab to the new path; a
  // delete closes tabs at or under the removed path. See tree-mutations.ts.
  const onPathRenamed = (oldPath: string, newPath: string): void => {
    retargetPathTabs(ctx, store, oldPath, newPath)
  }
  const onPathDeleted = (path: string): void => {
    closePathTabs(ctx, store, path)
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

  useEffect(() => {
    // A (re)load or a path-less tab clears any hoisted toolbar state — the
    // fresh viewer re-registers its own.
    setToolbar(null)
    // The seeded home tab (no path) never loads a viewer — the empty-state
    // hint renders until the user picks a file. A folder tab never loads a
    // viewer either — its tree is rooted at the folder.
    if (showEmpty || isDir) return
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
          if (!cancelled) setReloadSeq(sequence => sequence + 1)
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
            }, (head) => ctx.get('betterSidebar')?.matchFileViewer(path, head), mediaUrlOf)
            apply(outcome)
          }).catch((error: unknown) => {
            if (cancelled) return
            fail(error)
          })
          return
      }
    }
    apply(planFirstMatch(ctx.get('betterSidebar')?.matchFileViewer(path), mediaUrlOf))
    return () => {
      cancelled = true
      if (retryTimer !== undefined) window.clearTimeout(retryTimer)
      controller.abort()
    }
    // The deps are deliberately granular: the scope object's identity churns,
    // only its sessionId / cwd fields gate the (re)fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope.sessionId, scope.cwd, path, ctx, showEmpty, isDir, reloadSeq])

  // Save-then-refresh in preview mode (issue #167 part C): the edge into
  // 'saved' (never a lingering 'saved' state) triggers exactly one reload, so
  // a preview-mode Ctrl+S shows the fresh content immediately. Edit mode is
  // left alone — reloading would remount the editor and drop the caret.
  const prevSaveState = useRef<EditorToolbarState['saveState'] | undefined>(undefined)
  useEffect(() => {
    const current = toolbar?.saveState
    if (prevSaveState.current !== 'saved' && current === 'saved' && toolbar?.mode === 'preview') {
      setReloadSeq(sequence => sequence + 1)
    }
    prevSaveState.current = current
  }, [toolbar?.saveState, toolbar?.mode])

  const saveLabel = toolbar === null ? ''
    : toolbar.saveState === 'saving' ? t('loading')
      : toolbar.saveState === 'saved' ? t('saved')
        : toolbar.saveState === 'failed' ? t('saveFailed') : ''

  // A folder window (meta.dir): the tree rooted AT the folder fills the tab
  // — no editor chrome, no rail (the folder itself is the root).
  if (folderRoot !== undefined) {
    return (
      <div className={css.editor}>
        <TreePanel
          full
          visible={visible}
          sessionId={scope.sessionId}
          cwd={folderRoot}
          expanded={expanded}
          revealed={revealed}
          onToggle={onToggleDir}
          onOpenFile={openFile}
          onOpenFileNewTab={openFileNewTab}
          onOpenFileSide={openFileSide}
          openInApp={openInApp}
          openWithShowPluginTargets={openWithShowPluginTargets}
          openWithTargets={openWithTargets}
          openWithPinned={openWithConfig.pinned}
          openWithSsh={openWithSshActive(openWithConfig)}
          onOpenWith={openWith}
          onToggleOpenWithPin={toggleOpenWithPin}
          onReferenceFile={onReferenceFile}
          onPathRenamed={onPathRenamed}
          onPathDeleted={onPathDeleted}
          service={ctx.get('betterSidebar')}
        />
      </div>
    )
  }

  return (
    <div className={css.editor}>
      <div className={css.editorHeader}>
        <EditorPathInput key={path} path={path} cwd={scope.cwd} onOpen={openFile} />
        {toolbar?.modes === true && (
          <div className={css.editorModeToggle}>
            <button
              type="button"
              className={clsx(css.editorModeButton, toolbar.mode === 'preview' && css.editorModeActive)}
              onClick={() => {
                // Issue #167 part B: returning from edit to preview reloads so
                // the preview renders the just-saved content. A dirty draft
                // (or a failed save) suppresses the reload — the draft only
                // lives in the editor instance and a remount would drop it.
                if (toolbar.mode === 'edit' && toolbar.dirty !== true && toolbar.saveState !== 'failed') {
                  setReloadSeq(sequence => sequence + 1)
                }
                controlsRef.current?.setMode('preview')
              }}
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
            <IconCheckOutlineRegular size={14} />
          </button>
        )}
        {saveLabel !== '' && (
          <span className={clsx(css.editorStatus, toolbar?.saveState === 'failed' && css.editorStatusError)}>{saveLabel}</span>
        )}
        {toolbar !== null && (
          <button
            type="button"
            className={css.iconButton}
            aria-label={t('refresh')}
            title={t('refresh')}
            onClick={refreshFile}
          >
            <IconRefreshOutlineRegular size={14} />
          </button>
        )}
      </div>
      <div className={css.editorBody}>
        {explorer.explorerOpen
          ? (
            <ExplorerRail
              sessionId={scope.sessionId}
              cwd={scope.cwd}
              expanded={expanded}
              revealed={revealed}
              visible={visible}
              onToggleDir={onToggleDir}
              onOpenFile={openFile}
              onOpenFileNewTab={openFileNewTab}
              onOpenFileSide={openFileSide}
              openInApp={openInApp}
              openWithTargets={openWithTargets}
              openWithPinned={openWithConfig.pinned}
              openWithSsh={openWithSshActive(openWithConfig)}
              openWithShowPluginTargets={openWithShowPluginTargets}
              onOpenWith={openWith}
              onToggleOpenWithPin={toggleOpenWithPin}
              onReferenceFile={onReferenceFile}
              onPathRenamed={onPathRenamed}
              onPathDeleted={onPathDeleted}
              service={service}
              width={explorer.explorerWidth}
              onResize={explorer.setWidth}
              onCollapse={explorer.toggle}
            />
          )
          : <ExplorerRailCollapsed onExpand={explorer.toggle} />}
        <div className={css.editorMain}>
          {showEmpty && <div className={css.editorPlaceholder}>{t('editorEmptyHint')}</div>}
          {!showEmpty && load.status === 'loading' && <div className={css.editorPlaceholder}>{t('loading')}</div>}
          {!showEmpty && load.status === 'error' && (
            <div className={css.editorError}>
              <span>{load.message}</span>
              {load.autoAttempt !== undefined && (
                <span>{t('fsReadRetryWaiting', { n: load.autoAttempt })}</span>
              )}
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
 * and opens it as a per-path dedupe tab — the SAME open every tree gesture
 * uses, so it focuses an existing tab or appends a new one and never
 * replaces this window in place. Escape/blur restores the current value.
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
    // The open lands in a NEW/deduped editor tab — THIS tab's path stays,
    // so the input falls back to its own display value.
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
