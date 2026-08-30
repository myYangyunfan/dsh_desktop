import type { Context } from '../context-types.ts';
import type { SidebarStore } from './state.ts';
/** Open a file in the sidebar's editor (used by the intercepted row and the explorer). */
export declare function openSidebarFile(ctx: Context, store: SidebarStore, sessionId: string, path: string): void;
/** The intercepted produced-files row (visual twin of the deliverables chips). */
export declare function SidebarProducedFiles(props: {
    matched: readonly string[];
    openInSidebar: (path: string) => void;
}): import("react").JSX.Element;
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
export declare function registerTurnTailInterception(ctx: Context, store: SidebarStore): () => void;
/**
 * Register the chat file-open interception: wraps `ctx.workspaces.openPath`
 * — the single funnel every chat-side file open goes through (tool-row path
 * links, the produced-files row, prose mentions) — so opens land in the
 * sidebar editor instead of the Host OS. Gated by BOTH the `interceptOpenPath`
 * pref and the editor tab's enable switch; declined opens fall through to
 * the original method. Returns the disposer restoring the original (HMR-safe).
 */
export declare function registerOpenPathInterception(ctx: Context, store: SidebarStore): () => void;
/**
 * Register the chat file-open interception for the CURRENT funnel: wraps
 * `ctx.remote.session.openWorkspacePath` (the method DSH 0.1.x chat routes
 * every file open through). The remote `session` namespace mounts
 * asynchronously, so the wrap retries briefly until the method appears.
 */
export declare function registerRemoteOpenPathInterception(ctx: Context, store: SidebarStore): () => void;
