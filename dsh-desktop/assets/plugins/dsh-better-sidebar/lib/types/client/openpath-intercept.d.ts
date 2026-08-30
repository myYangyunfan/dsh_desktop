/**
 * Interception of the chat's file-open funnel. The client runtime's
 * `ctx.workspaces.openPath` is the SINGLE door every chat-side file open goes
 * through — ui-conversation's apply.ts resolves the path against the session
 * cwd and calls it for tool-row path links, the produced-files row, and
 * prose file mentions alike (verified against the DSH source:
 * `packages/client/ui-conversation/src/client/apply.ts` is the only
 * production caller). Wrapping that one method reroutes those opens into the
 * sidebar editor instead of the Host OS — no DSH modification needed.
 *
 * The wrapper is dependency-free by design (no React / ui-primitives), so
 * the takeover logic is unit-testable and the file stays importable from the
 * test runtime.
 */
/** The one service method the wrapper replaces (mirror of the runtime IWorkspaces). */
export interface OpenPathService {
    openPath(path: string): Promise<void>;
}
/** Per-call decisions the wrapper needs (wired to the store + ctx in the client half). */
export interface OpenPathInterceptDeps {
    /**
     * Whether to take over this call: the `interceptOpenPath` pref AND the
     * editor tab's own enable switch must both be on (an editor that cannot
     * open must not swallow opens — they fall through to the Host).
     */
    takeoverEnabled(): boolean;
    /** The session whose scope the sidebar editor loads the file in (current session). */
    currentSessionId(): string | undefined;
    /** Route the open into the sidebar editor (the established openSidebarFile). */
    openInSidebar(path: string, sessionId: string): void;
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
export declare function wrapOpenPath(workspaces: OpenPathService, deps: OpenPathInterceptDeps): () => void;
/** The typed remote `session.openWorkspacePath` face (mirror of the generated client method in @deepseek-ai/dsh-api-session-controller). */
export interface RemoteOpenWorkspacePathService {
    openWorkspacePath(request: {
        path: string;
    }, signal?: unknown): Promise<{
        ok: true;
        value: {
            opened: true;
        };
    }>;
}
/**
 * Wrap the CURRENT upstream chat file-open funnel: the typed remote
 * `ctx.remote.session.openWorkspacePath({ path })`. Intercepted calls open
 * the file in the sidebar editor and resolve as `{ ok: true, value: { opened: true } }`; anything
 * declined falls through to the original remote call untouched.
 * @param service - the remote `session` namespace service (undefined before the api-remotes contribution mounts; a no-op in that case).
 * @param deps - per-call takeover decisions.
 * @returns the disposer restoring the original method (HMR-safe).
 */
export declare function wrapRemoteOpenWorkspacePath(service: RemoteOpenWorkspacePathService | null | undefined, deps: OpenPathInterceptDeps): () => void;
