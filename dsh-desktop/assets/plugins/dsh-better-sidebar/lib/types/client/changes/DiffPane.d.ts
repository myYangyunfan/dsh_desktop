import type { SessionScope } from '../api.ts';
import type { SidebarDiffRef, SidebarTab } from '../state.ts';
import { type FileOp } from './ops.ts';
/**
 * Clamp one pane height to the pane's own bounds: never below the content
 * minimum, never above 70% of the window. Both the drag handler and the
 * RESTORE path (a height persisted under a taller window) run through this,
 * so a saved value can never open the pane taller than the viewport allows.
 */
export declare function clampPaneHeight(value: number): number;
/** What the pane is showing right now. */
export type ChangesPreview = {
    kind: 'git';
    ref: SidebarDiffRef;
} | {
    kind: 'op';
    path: string;
    op: FileOp;
    prior?: string;
};
/** The render view of one html op target: the route-src iframe. Extracted
 *  (and exported) so the always-sandboxed contract is pinned directly by the
 *  sandbox spec — this surface has NO no-sandbox escape hatch. */
export declare function HtmlRenderPreview(props: {
    src: string;
    title: string;
}): import("react").JSX.Element;
/** The diff tab a git preview expands into (the shell owns placement). */
export declare function diffTabOf(ref: SidebarDiffRef): SidebarTab;
export interface DiffPaneProps {
    target: ChangesPreview;
    scope: SessionScope;
    /** The persisted pane height (px); drag commits a new one upwards. */
    height: number;
    onHeightCommit: (height: number) => void;
    onClose: () => void;
    /** Expand the current git target into a dedicated diff tab. */
    onExpand: () => void;
}
export declare function DiffPane({ target, scope, height, onHeightCommit, onClose, onExpand }: DiffPaneProps): import("react").JSX.Element;
