import type { OpenInApp } from './open-in-app.ts';
import type { OpenWithTarget } from './open-with.ts';
import type { BetterSidebarService } from './service.ts';
import { type UploadItem } from './upload.ts';
/** Root label: the last path segment (mirror of the host rootLabel). */
export declare function baseName(path: string): string;
export declare function FileTree(props: {
    sessionId: string;
    cwd: string | undefined;
    expanded: string[];
    /** Files highlighted by a "Show in folder" reveal (absolute paths). */
    revealed: string[];
    onToggle: (path: string) => void;
    onOpenFile: (path: string) => void;
    /** Context-menu "open in a new tab" (file rows; absent → no entry). */
    onOpenFileNewTab?: (path: string) => void;
    /** Context-menu "open to the side" (file rows; absent → no entry). */
    onOpenFileSide?: (path: string) => void;
    /**
     * The host's open-in-app handle (EditorHost builds it and injects it).
     * Absent, or reporting the host cannot hand paths to the desktop, hides the
     * HOST half of the "打开方式" section (the plugin's own targets stay).
     */
    openInApp?: OpenInApp;
    /**
     * The PLUGIN's own "open with" menu: resolved external targets (already
     * SSH-filtered and in menu order). Absent → no plugin half. Coexists with
     * {@link openInApp} — the section lists both.
     */
    openWithTargets?: OpenWithTarget[];
    /** Ids of targets pinned to the menu's top level (subset of the ids). */
    openWithPinned?: string[];
    /** Whether the workspace is remote (appends the SSH hint to target labels). */
    openWithSsh?: boolean;
    /** Open one plugin target externally (reveal or URL — the caller decides). */
    onOpenWith?: (targetId: string, path: string) => void;
    /** Toggle one plugin target's pinned state (the submenu row's pushpin). */
    onToggleOpenWithPin?: (targetId: string) => void;
    /** Insert `@<relative path>` into the composer draft (file vs directory). */
    onReferenceFile: (path: string, isDir: boolean) => void;
    /** A rename landed (old row path → new path): the caller retargets open tabs. */
    onPathRenamed?: (oldPath: string, newPath: string) => void;
    /** A delete landed: the caller closes tabs at or under the removed path. */
    onPathDeleted?: (path: string, isDir: boolean) => void;
    /** Bump to wipe the level cache and reload the visible set. */
    refreshTick: number;
    /** Upload into `dir` (absolute, inside the workspace); runs in the caller. */
    onUploadRequest: (dir: string, items: UploadItem[]) => void;
    /** True while an upload is in flight (drops are ignored). */
    busy: boolean;
    /**
     * Park the tree out of the layout WITHOUT unmounting it: the search results
     * panel takes the surface while the level cache (and the live watcher) stays
     * warm, so clearing the query is free.
     */
    hidden?: boolean;
    /**
     * Whether the owning tab is on screen. Defaults to true; a parked tab
     * passes false so the shared git-status store stops polling for rows
     * nobody can see (the workbench keeps every tab body mounted).
     */
    visible?: boolean;
    /**
     * Keep the plugin's own open-with targets in the "打开方式" submenu even when
     * the host reports local applications for the path. Default (false): the
     * host's own list wins, and the plugin's fixed targets (file manager /
     * VS Code / Cursor / Zed / custom editors) show only when the host cannot
     * offer any — so the menu is not two near-identical lists. The caller reads
     * the `openWithPluginTargets` plugin setting and passes it down.
     */
    openWithShowPluginTargets?: boolean;
    /**
     * The sidebar registry service: when present, externally registered file
     * icons (`registerFileIcon`) outrank the host's file-type artwork on file rows.
     * Absent → the built-ins alone (the host always passes it today).
     */
    service?: BetterSidebarService;
}): import("react").JSX.Element;
