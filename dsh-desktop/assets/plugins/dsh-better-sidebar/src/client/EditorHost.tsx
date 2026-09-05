/**
 * The editor tab host: the FILE VIEWER for one path. It resolves the file's
 * previewer through the sidebar registry (`matchFileViewer`), fetches bytes
 * per the matched viewer's fetch strategy, and renders its component — or the
 * shared download pane when nothing can render the file.
 *
 * The file tree is no longer hosted here: it is the persistent Explorer rail
 * that lives to the LEFT of the workbench (see ExplorerRail.tsx), decoupled
 * from any tab. So every editor tab carries a real path and renders only the
 * viewer chrome (a path-less tab — a leftover from an older layout the store
 * drops on load — still degrades to the empty-state hint instead of the load
 * flow, so a stale frame never crashes).
 *
 * The path input's Enter routes through `openSidebarFile`, the SAME per-path
 * dedupe open the rail uses: a run of opens accumulates distinct tabs and
 * never replaces one already open (no transient preview slot).
 *
 * The strategy dispatch is pure (planFirstMatch / planFsReadOutcome in
 * editor-load.ts); this component only wires it to the host APIs.
 */
import { createElement, useCallback, useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { IconCheckOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { Context } from '../context-types.ts'
import { api, mediaUrl, SidebarApiError, type SessionScope } from './api.ts'
import { BinaryDownload } from './binary-download.tsx'
import { planFirstMatch, planFsReadOutcome, type EditorLoadAction } from './editor-load.ts'
import { nextDelayMs } from './chunk-availability.ts'
import { openSidebarFile } from './intercept.tsx'
import { t } from './locales.ts'
import { relativeTo } from './paths.ts'
import { resolveSidebarPath } from './produced-files.ts'
import type { EditorToolbarControls, EditorToolbarState, FileViewerDescriptor } from './service.ts'
import type { SidebarStore, SidebarTab } from './state.ts'
import css from './sidebar.module.css'

type EditorLoad =
  | { status: 'loading' }
  | { status: 'error'; message: string; retryable?: boolean; autoAttempt?: number }
  | { status: 'ready'; viewer: FileViewerDescriptor; content?: string; truncated?: boolean; mediaUrl?: string; customData?: unknown }
  | { status: 'binary' }

export function EditorHost(props: {
  ctx: Context
  store: SidebarStore
  scope: SessionScope
  tab: SidebarTab
  expanded?: string[]
  onToggleDir?: (path: string) => void
  onReferenceFile?: (path: string) => void
  visible?: boolean
}) {
  const { ctx, store, scope, tab } = props
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

  // A path-less tab (a leftover home window the store drops on load) shows the
  // empty-state hint instead of running the viewer load flow. In the new model
  // every editor tab has a path, so this is a graceful-degradation guard only.
  const showEmpty = path === ''

  /** The header path input's Enter open: the SAME per-path dedupe tab the tree
   *  rail uses, so it focuses an existing tab or appends a new one — never a
   *  preview replacement. */
  const openFile = (absolute: string): void => {
    openSidebarFile(ctx, store, scope.sessionId, absolute)
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
    // The path-less window (no path) never loads a viewer — the empty-state
    // hint renders until the user picks a file from the Explorer rail.
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

  const saveLabel = toolbar === null ? ''
    : toolbar.saveState === 'saving' ? t('loading')
      : toolbar.saveState === 'saved' ? t('saved')
        : toolbar.saveState === 'failed' ? t('saveFailed') : ''

  return (
    <div className={css.editor}>
      <div className={css.editorHeader}>
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
      </div>
      <div className={css.editorBody}>
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
 * and opens it through the parent's per-path dedupe open. Escape/blur
 * restores the current value. The parent keys it by `path` so a re-open of
 * the same file remounts and reseeds the draft.
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
    // The open lands in a NEW/deduped editor tab — THIS tab's path stays, so
    // the input falls back to its own display value.
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
