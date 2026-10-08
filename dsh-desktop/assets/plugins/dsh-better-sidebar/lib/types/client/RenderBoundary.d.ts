/**
 * The generic render error boundary for the sidebar tree: a render error in
 * the wrapped subtree shows a dismissible error strip (retry re-renders the
 * children) instead of blanking the shell. Used at two scopes:
 *
 * - ROOT (index.tsx, `css.boundaryError`): last-resort containment for
 *   errors in the sidebar shell itself (Workbench, drag layout, …) — a full
 *   swap keeps the page alive.
 * - PER-TAB (Sidebar.tsx TabContent, `css.tabBoundaryError`): a crashing
 *   viewer/editor shows a strip inside ITS OWN pane; the workbench shell, the
 *   other tabs, and the panel itself stay alive (issue #31 — a tab crash
 *   must never take down the whole sidebar).
 *
 * The className prop selects the strip's geometry: the root's full-height
 * fixed rail vs. the tab's pane-filling block.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';
export declare class RenderBoundary extends Component<{
    children?: ReactNode;
    className?: string;
}, {
    error: string | null;
}> {
    state: {
        error: string | null;
    };
    static getDerivedStateFromError(error: unknown): {
        error: string;
    };
    componentDidCatch(error: Error, info: ErrorInfo): void;
    render(): ReactNode;
}
