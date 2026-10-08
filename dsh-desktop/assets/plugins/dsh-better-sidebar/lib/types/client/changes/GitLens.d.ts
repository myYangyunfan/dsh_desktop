import type { Context } from '../../context-types.ts';
import type { SessionScope } from '../api.ts';
import type { SidebarDiffRef, SidebarStore } from '../state.ts';
export interface GitLensProps {
    scope: SessionScope;
    /** @deprecated The sidebar store is no longer read here (the fence guard it
     *  fed is gone); the prop stays for the caller's shape. */
    store: SidebarStore;
    onOpenFile: (path: string) => void;
    /** Preview one change in the shared bottom pane (worktree or commit ref). */
    onPreview: (ref: SidebarDiffRef) => void;
    /** The ref currently previewed (row highlight); null when the pane is closed. */
    selectedRef: SidebarDiffRef | null;
    /** Poll the inventory only while the tab is actually visible. */
    visible: boolean;
    /** Bumped by the tab header's refresh action (0 = never asked). */
    refreshTick?: number;
    /** The tab's context, for the registered file/folder icon chain (absent →
     *  the host's built-in artwork, exactly like the file tree falls back). */
    ctx?: Context;
}
export declare function GitLens(props: GitLensProps): import("react").JSX.Element;
