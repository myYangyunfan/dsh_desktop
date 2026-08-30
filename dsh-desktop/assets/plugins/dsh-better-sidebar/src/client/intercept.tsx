/**
 * Interception of the chat's produced-files row: the turn-tail chain entry
 * that replaces ui-deliverables' row when the closing turn produced files.
 * The takeover looks identical (same chip row); the chips open the file in
 * the sidebar instead of the host OS. Priority -1 runs before the default-0
 * deliverables entry; when nothing was produced the selector returns null
 * and the original row renders unchanged.
 */
import { IconCodeOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { Context } from '../context-types.ts'
import type { SidebarStore } from './state.ts'
import { t } from './locales.ts'
import { resolveSidebarPath, selectProducedFiles } from './produced-files.ts'
import { wrapOpenPath, wrapRemoteOpenWorkspacePath, type OpenPathInterceptDeps, type RemoteOpenWorkspacePathService } from './openpath-intercept.ts'
import css from './sidebar.module.css'

/** Open a file in the sidebar's editor (used by the intercepted row and the explorer). */
export function openSidebarFile(ctx: Context, store: SidebarStore, sessionId: string, path: string): void {
  const summary = ctx.sessions.list.getSnapshot().byId[sessionId]
  const absolute = resolveSidebarPath(summary?.cwd, path)
  const at = Math.max(absolute.lastIndexOf('/'), absolute.lastIndexOf('\\'))
  const title = at === -1 ? absolute : absolute.slice(at + 1)
  // Route through the sidebar service so the editor descriptor's dedupeKey
  // (per-path) applies; the id is path-derived so multiple editors coexist.
  ctx.betterSidebar?.openTab({ type: 'editor', title, path: absolute, id: `editor:${absolute}` })
}

/** The intercepted produced-files row (visual twin of the deliverables chips). */
export function SidebarProducedFiles(props: {
  matched: readonly string[]
  openInSidebar: (path: string) => void
}) {
  const { matched, openInSidebar } = props
  const shown = matched.slice(0, 6)
  const hidden = matched.length - shown.length
  return (
    <div className={css.producedRow}>
      <span className={css.producedLabel}>{t('produced')}</span>
      {shown.map(path => {
        const at = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
        const name = at === -1 ? path : path.slice(at + 1)
        return (
          <button
            key={path}
            type="button"
            className={css.producedChip}
            title={path}
            onClick={() => { openInSidebar(path) }}
          >
            <IconCodeOutline16 size={12} />
            <span>{name}</span>
          </button>
        )
      })}
      {hidden > 0 && <span className={css.producedMore}>+{hidden}</span>}
    </div>
  )
}

/**
 * Register the turn-tail interception (returns the disposer).
 *
 * The slot is a CHILD slot the host's ui-conversation declares in its
 * `conversation.chat.node` children table (kind: chain, scope: session).
 * Registering it directly races the declaration — the ui-slots core's
 * load-time validation throws "not declared (a parent entry's children
 * table must declare it)" when the parent entry is not on the ledger yet.
 * slots.inject waits for the declaration: the callback runs synchronously
 * when the slot is already declared, otherwise it runs inside the declaring
 * register() call once the declaration commits; declaration collapse
 * disposes the entry and a later declaration re-registers it. This mirrors
 * @deepseek-ai/dsh-client-ui-deliverables' registration of the same slot.
 */
export function registerTurnTailInterception(ctx: Context, store: SidebarStore): () => void {
  return ctx.slots.inject('conversation.chat.turnTail', () => ctx.slots.register({
    name: 'conversation.chat.turnTail',
    // Decline the takeover while the editor tab type is disabled in the side
    // card settings: the produced-files row falls back to the default
    // deliverables behavior instead of offering chips that cannot open. Also
    // while the sidebar is externally disabled (aionui-panel chosen).
    select: (owner) => {
      if (store.getSuspended()) return null
      if (store.getPrefs().tabsEnabled['editor'] === false) return null
      return selectProducedFiles(owner)
    },
    priority: -1,
    registrant: 'dsh-better-sidebar',
    inject: (sessionId: string) => ({
      openInSidebar: (path: string) => { openSidebarFile(ctx, store, sessionId, path) },
    }),
  }, SidebarProducedFiles))
}

/**
 * Register the chat file-open interception for the LEGACY funnel: wraps
 * `ctx.workspaces.openPath` (the older snapshot's single door). Gated by BOTH
 * the `interceptOpenPath` pref and the editor tab's enable switch; declined
 * opens fall through to the original method. Returns the disposer restoring
 * the original (HMR-safe).
 */
export function registerOpenPathInterception(ctx: Context, store: SidebarStore): () => void {
  return wrapOpenPath(ctx.workspaces, openPathDeps(ctx, store))
}

/** Shared per-call takeover decisions for both file-open funnels. */
function openPathDeps(ctx: Context, store: SidebarStore): OpenPathInterceptDeps {
  return {
    takeoverEnabled: () => !store.getSuspended()
      && store.getPrefs().interceptOpenPath !== false
      && store.getPrefs().tabsEnabled['editor'] !== false,
    currentSessionId: () => ctx.sessions.list.getSnapshot().current,
    openInSidebar: (path, sessionId) => { openSidebarFile(ctx, store, sessionId, path) },
  }
}

/** Resolve the remote `session` namespace service (undefined before the
 *  api-remotes contribution mounts, or when the runtime lacks the typed
 *  remote entirely). The namespace is a DISTINCT cordis service key
 *  (`remote.session`) — not a `.session` property on the `remote` service —
 *  so resolve it directly. */
function remoteSessionOf(ctx: Context): RemoteOpenWorkspacePathService | undefined {
  try {
    const session = ctx.get('remote.session') as RemoteOpenWorkspacePathService | undefined
    if (session !== undefined && typeof session.openWorkspacePath === 'function') return session
  } catch {
    // Not mounted yet (or the runtime lacks the typed remote): fall through.
  }
  try {
    const remote = ctx.get('remote') as { session?: RemoteOpenWorkspacePathService } | undefined
    const session = remote?.session
    if (session !== undefined && typeof session.openWorkspacePath === 'function') return session
  } catch {
    // Same as above.
  }
  return undefined
}

/**
 * Register the chat file-open interception for the CURRENT funnel: wraps
 * `ctx.remote.session.openWorkspacePath` — the method DSH 0.1.x chat routes
 * every file open through (ui-chat's conversation.view `openFile`). The
 * remote `session` namespace is mounted asynchronously by the api-remotes
 * contribution, so the wrap retries briefly until the method appears and
 * gives up silently if the runtime never exposes it (the legacy wrap is the
 * fallback). Gated by the same prefs as the legacy funnel. Returns the
 * disposer cancelling the retry and restoring the original (HMR-safe).
 */
export function registerRemoteOpenPathInterception(ctx: Context, store: SidebarStore): () => void {
  let disposed = false
  let disposer: (() => void) | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let attempts = 0

  const tryWrap = (): void => {
    if (disposed) return
    const session = remoteSessionOf(ctx)
    if (session === undefined || typeof session.openWorkspacePath !== 'function') {
      attempts += 1
      if (attempts < 50) timer = setTimeout(tryWrap, 100)
      return
    }
    disposer = wrapRemoteOpenWorkspacePath(session, openPathDeps(ctx, store))
  }

  tryWrap()
  return () => {
    disposed = true
    if (timer !== undefined) clearTimeout(timer)
    disposer?.()
  }
}
