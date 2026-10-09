import type { OpenInApp } from './open-in-app.ts';
import type { OpenWithTarget } from './open-with.ts';
import type { BetterSidebarService } from './service.ts';
export declare function ExplorerRail(props: {
    sessionId: string;
    cwd: string | undefined;
    expanded: string[];
    revealed: string[];
    /** Whether the owning editor tab is on screen: a parked tab's tree pauses
     *  its git polling (the shared status store pauses when nothing visible
     *  wants it). */
    visible: boolean;
    onToggleDir: (path: string) => void;
    onOpenFile: (path: string) => void;
    onOpenFileNewTab: (path: string) => void;
    onOpenFileSide: (path: string) => void;
    openInApp: OpenInApp;
    openWithTargets: OpenWithTarget[];
    openWithPinned: string[];
    openWithSsh: boolean;
    openWithShowPluginTargets: boolean;
    onOpenWith: (targetId: string, path: string) => void;
    onToggleOpenWithPin: (targetId: string) => void;
    onReferenceFile: (path: string, isDir: boolean) => void;
    onPathRenamed: (oldPath: string, newPath: string) => void;
    onPathDeleted: (path: string) => void;
    service: BetterSidebarService | undefined;
    /** The persisted rail width (state.explorerWidth). */
    width: number;
    /** Commit a drag-resized width into the store (clamped reducer). */
    onResize: (width: number) => void;
    /** Collapse the rail (the session-level toggleExplorer). */
    onCollapse: () => void;
}): import("react").JSX.Element;
/** The collapsed rail: a thin strip offering a single affordance to bring the
 *  file tree back. Kept beside the editor column so collapse never reflows the
 *  viewer's right edge and the reopen control is always in the same place. */
export declare function ExplorerRailCollapsed(props: {
    onExpand: () => void;
}): import("react").JSX.Element;
