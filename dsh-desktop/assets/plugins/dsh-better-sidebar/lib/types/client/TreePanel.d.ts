import type { OpenWithTarget } from './open-with.ts';
export declare function TreePanel(props: {
    sessionId: string;
    cwd: string | undefined;
    expanded: string[];
    onToggle: (path: string) => void;
    /** Primary open (click / search result): preview in a side split. */
    onOpenFile: (path: string) => void;
    /** File context-menu "preview" — full-area open (passed through to FileTree). */
    onPreviewFile?: (path: string) => void;
    /** File context-menu "open in a new tab" (passed through to FileTree). */
    onOpenFileNewTab?: (path: string) => void;
    /** The "open with" menu surface (passed through to FileTree; absent →
     *  the whole section is hidden). */
    openWithTargets?: OpenWithTarget[];
    openWithPinned?: string[];
    openWithSsh?: boolean;
    onOpenWith?: (targetId: string, path: string) => void;
    onToggleOpenWithPin?: (targetId: string) => void;
    onReferenceFile: (path: string) => void;
    /** Full-window presentation: the panel fills its host instead of docking
     *  at a fixed width. */
    full?: boolean;
}): import("react").JSX.Element;
