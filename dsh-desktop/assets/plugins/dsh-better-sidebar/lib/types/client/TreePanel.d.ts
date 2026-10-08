import type { BetterSidebarService } from './service.ts';
import type { OpenInApp } from './open-in-app.ts';
import type { OpenWithTarget } from './open-with.ts';
export declare function TreePanel(props: {
    sessionId: string;
    cwd: string | undefined;
    expanded: string[];
    revealed: string[];
    onToggle: (path: string) => void;
    onOpenFile: (path: string) => void;
    /** File context-menu "open in a new tab" (passed through to FileTree). */
    onOpenFileNewTab?: (path: string) => void;
    /** File context-menu "open to the side" (passed through to FileTree). */
    onOpenFileSide?: (path: string) => void;
    /** The host's open-in-app handle (passed through to FileTree; absent →
     *  the HOST half of the "打开方式" section is hidden). */
    openInApp?: OpenInApp;
    /** The plugin's own open-with targets (passed through to FileTree; coexists
     *  with `openInApp`; absent → no plugin half). */
    openWithTargets?: OpenWithTarget[];
    openWithPinned?: string[];
    openWithSsh?: boolean;
    onOpenWith?: (targetId: string, path: string) => void;
    onToggleOpenWithPin?: (targetId: string) => void;
    /** Show the plugin's own open-with targets even when the host lists local
     *  applications for the path (the `openWithPluginTargets` setting; passed
     *  through to FileTree). */
    openWithShowPluginTargets?: boolean;
    onReferenceFile: (path: string, isDir: boolean) => void;
    /** A tree rename landed (passed through to FileTree for tab retargeting). */
    onPathRenamed?: (oldPath: string, newPath: string) => void;
    /** A tree delete landed (passed through to FileTree for tab closing). */
    onPathDeleted?: (path: string, isDir: boolean) => void;
    /** Whether the owning tab is on screen: a parked tab stops the tree's git
     *  polling (the shared status store pauses when nothing visible wants it). */
    visible?: boolean;
    /** Full-window presentation: the panel fills its host instead of docking
     *  at a fixed width. */
    full?: boolean;
    /** The sidebar registry service (file-icon registrations; passed through to FileTree). */
    service?: BetterSidebarService;
}): import("react").JSX.Element;
