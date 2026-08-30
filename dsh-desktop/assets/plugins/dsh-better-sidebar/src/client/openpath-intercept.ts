/**
 * Interception of the chat's file-open funnel. Two funnels exist across DSH
 * versions, and both are wrapped here so a single takeover policy reroutes
 * every chat-side file open (tool-row path links, the produced-files row,
 * and prose file mentions alike) into the sidebar editor instead of the Host
 * OS:
 *
 * - LEGACY: the client runtime's `ctx.workspaces.openPath` — the funnel in the
 *   older mobile snapshot (ui-conversation's apply.ts resolved the path and
 *   called it). Wrapped by {@link wrapOpenPath}.
 * - CURRENT: the typed remote `ctx.remote.session.openWorkspacePath({ path })`
 *   — the funnel DSH 0.1.x chat actually uses today (see
 *   `@deepseek-ai/dsh-client-ui-chat`'s conversation.view inject). Wrapped by
 *   {@link wrapRemoteOpenWorkspacePath}.
 *
 * The wrappers are dependency-free by design (no React / ui-primitives), so
 * the takeover logic is unit-testable and the file stays importable from the
 * test runtime.
 */

/** The one service method the wrapper replaces (mirror of the runtime IWorkspaces). */
export interface OpenPathService {
  openPath(path: string): Promise<void>
}

/** Per-call decisions the wrapper needs (wired to the store + ctx in the client half). */
export interface OpenPathInterceptDeps {
  /**
   * Whether to take over this call: the `interceptOpenPath` pref AND the
   * editor tab's own enable switch must both be on (an editor that cannot
   * open must not swallow opens — they fall through to the Host).
   */
  takeoverEnabled(): boolean
  /** The session whose scope the sidebar editor loads the file in (current session). */
  currentSessionId(): string | undefined
  /** Route the open into the sidebar editor (the established openSidebarFile). */
  openInSidebar(path: string, sessionId: string): void
}

/**
 * Wrap `workspaces.openPath`: intercepted calls open the file in the sidebar
 * editor instead of the Host OS and resolve as success (the original's
 * callers ignore the result); anything that declines falls through to the
 * original method untouched.
 * @param workspaces - the client workspaces service to wrap.
 * @param deps - per-call takeover decisions.
 * @returns the disposer restoring the original method (HMR-safe).
 */
export function wrapOpenPath(workspaces: OpenPathService, deps: OpenPathInterceptDeps): () => void {
  // The RAW method reference (never a bound copy): restore must put back the
  // exact original so a chain of wrappers (other plugins wrapping the same
  // method) keeps working across disposals in any order.
  const original = workspaces.openPath
  workspaces.openPath = (path: string): Promise<void> => {
    if (deps.takeoverEnabled()) {
      const sessionId = deps.currentSessionId()
      if (sessionId !== undefined) {
        deps.openInSidebar(path, sessionId)
        return Promise.resolve()
      }
    }
    return original.call(workspaces, path)
  }
  return () => {
    workspaces.openPath = original
  }
}

/** The typed remote `session.openWorkspacePath` face (mirror of the generated
 *  client method in @deepseek-ai/dsh-api-session-controller). The method
 *  resolves to the Typert `{ ok: true, value: { opened: true } }` envelope. */
export interface RemoteOpenWorkspacePathService {
  openWorkspacePath(request: { path: string }, signal?: unknown): Promise<{ ok: true; value: { opened: true } }>
}

/**
 * Wrap the CURRENT upstream chat file-open funnel: the typed remote
 * `ctx.remote.session.openWorkspacePath({ path })` (see the file header).
 * Intercepted calls open the file in the sidebar editor and resolve as
 * `{ ok: true, value: { opened: true } }` — the remote's success envelope, so
 * the chat's `openFile` resolves exactly like a real host open. Anything that
 * declines falls through to the original remote call untouched.
 *
 * The typed remote installs each method as an ACCESSOR returning a fresh
 * closure (see @deepseek-ai/dsh-api-gateway's RemoteNamespaceService.install),
 * so the wrapper replaces the accessor with a plain value and restores the
 * accessor verbatim on dispose (HMR-safe, like {@link wrapOpenPath}).
 *
 * @param service - the remote `session` namespace service (undefined before
 *   the api-remotes contribution mounts; a no-op in that case).
 * @param deps - per-call takeover decisions.
 * @returns the disposer restoring the original method (HMR-safe).
 */
export function wrapRemoteOpenWorkspacePath(
  service: RemoteOpenWorkspacePathService | null | undefined,
  deps: OpenPathInterceptDeps,
): () => void {
  if (service === null || service === undefined) return () => {}
  const descriptor = Object.getOwnPropertyDescriptor(service, 'openWorkspacePath')
  let original: ((...args: unknown[]) => Promise<unknown>) | undefined
  if (descriptor !== undefined && typeof descriptor.get === 'function') {
    // Accessor form: capture the closure the getter would return now (it
    // closes over the method's `direct`/`scoped` records, which are stable
    // for openWorkspacePath).
    original = descriptor.get.call(service) as ((...args: unknown[]) => Promise<unknown>) | undefined
  } else {
    original = (service as unknown as { openWorkspacePath?: (...args: unknown[]) => Promise<unknown> }).openWorkspacePath
  }
  if (typeof original !== 'function') return () => {}

  const wrapped = (request: unknown, signal?: unknown): Promise<unknown> => {
    if (deps.takeoverEnabled()) {
      const sessionId = deps.currentSessionId()
      const path = request !== null && typeof request === 'object'
        ? (request as { path?: unknown }).path
        : undefined
      if (sessionId !== undefined && typeof path === 'string' && path !== '') {
        deps.openInSidebar(path, sessionId)
        return Promise.resolve({ ok: true, value: { opened: true } })
      }
    }
    return original(request, signal)
  }

  if (descriptor !== undefined && typeof descriptor.get === 'function') {
    Object.defineProperty(service, 'openWorkspacePath', {
      configurable: true,
      enumerable: true,
      writable: true,
      value: wrapped,
    })
    return () => {
      Object.defineProperty(service, 'openWorkspacePath', descriptor)
    }
  }
  const holder = service as unknown as { openWorkspacePath: (...args: unknown[]) => Promise<unknown> }
  holder.openWorkspacePath = wrapped
  return () => {
    holder.openWorkspacePath = original as (...args: unknown[]) => Promise<unknown>
  }
}
