import type { Context } from './context-types.ts';
import type { SidebarPrefs } from './prefs-shared.ts';
/** What the model asked to open. */
export type AgentOpenKind = 'file' | 'folder' | 'url';
/** One pending/broadcast open request (the wire face over the push socket). */
export interface AgentOpenRequest {
    /** Opaque id (host-generated; the client ignores it beyond dedupe/debug). */
    id: string;
    /** The session whose sidebar the open is targeted at. */
    sessionId: string;
    kind: AgentOpenKind;
    /** Absolute local path (file/folder) or http(s) URL. */
    target: string;
    /** Tab title the client should use (basename / hostname / caller-supplied). */
    title: string;
}
/** One subscribed sidebar view's sender. */
type Sender = (request: AgentOpenRequest) => void;
/**
 * Per-session queue of open requests plus the connected sidebar views.
 *
 * Lifecycle: `enqueue` adds a request and — when at least one view for the
 * session is attached — pushes it immediately and removes it from the queue
 * (consume-on-send: a reconnect must never replay an open the client already
 * applied, and the browser tab type has no per-URL dedupe, so replaying
 * would mint duplicate tabs). With no attached view the request stays queued
 * and `attach` replays it on connect. `drainAll` drops every queued request
 * (the feature was turned off); `dispose` also drops every subscriber.
 */
export declare class AgentOpenRegistry {
    private pending;
    private subscribers;
    /** Queue one open and deliver it immediately when a view is attached.
     * @returns the request id and whether a connected view received it now. */
    enqueue(sessionId: string, kind: AgentOpenKind, target: string, title: string): {
        id: string;
        delivered: boolean;
    };
    /** Attach one sidebar view (replays queued requests; consume-on-send).
     * @returns the disposer detaching the view. */
    attach(sessionId: string, send: Sender): () => void;
    /** Drop every queued request (the feature was turned off mid-session). */
    drainAll(): void;
    /** Drop the queue and every subscriber (plugin teardown). */
    dispose(): void;
}
/**
 * Register the `sidebar_open` tool against the host tool registry. The tool
 * is gated by the side-card setting `agentOpenTools` (the caller registers
 * and unregisters it); `readPrefs` supplies the live prefs so a disabled
 * target tab type (editor/browser) is reported to the model instead of
 * silently no-oping on the client. `resolveCwd` threads the calling
 * session's live cwd so relative paths resolve the same way the sidebar's
 * own routes do.
 * @param ctx - host plugin context (carries the tools service).
 * @param registry - the open-request registry (per-session queue + views).
 * @param resolveCwd - async cwd resolver for one session id. Resolves through
 *  the session header, the client-supplied cwd, and the persistence index
 *  before falling back to the host process cwd (production always provides
 *  persistence, so the fallback is reached only in tests / stripped-down hosts).
 * @param readPrefs - live resolved side card prefs (for tab enable gates).
 * @returns a disposer that unregisters the tool.
 */
export declare function registerOpenTool(ctx: Context, registry: AgentOpenRegistry, resolveCwd: (sessionId: string) => Promise<string>, readPrefs: () => SidebarPrefs): () => void;
export {};
