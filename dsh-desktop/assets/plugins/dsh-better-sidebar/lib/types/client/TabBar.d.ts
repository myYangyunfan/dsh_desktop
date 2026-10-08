/**
 * The tab strip of one pane: tabs capped at TAB_MAX_WIDTH (ellipsized),
 * overflow scrolls horizontally, a close button per tab, a four-way split
 * button cluster, and the + menu that opens new tabs (explorer / git). Tabs
 * are draggable; dropping onto another tab inserts before it, dropping on the
 * strip background appends to this pane. Right-clicking a tab opens the tab
 * context menu (close / close others / close to the left / close to the
 * right, the close ones scoped to this pane).
 */
import { type ReactNode } from 'react';
import type { SidebarTab } from './state.ts';
/** One + menu option. */
export interface NewTabOption {
    id: string;
    label: string;
    disabled?: boolean;
    /** Leading icon (Menu row). */
    icon?: ReactNode;
}
/** Drag payload for tab moves (HTML5 DnD dataTransfer). */
export declare const TAB_DRAG_TYPE = "application/x-dsh-tab";
export interface TabDragPayload {
    tabId: string;
    paneId: string;
}
export declare function serializeDrag(payload: TabDragPayload): string;
export declare function parseDrag(raw: string): TabDragPayload | null;
export declare function TabBar(props: {
    paneId: string;
    tabs: SidebarTab[];
    active: string | null;
    onActivate: (tabId: string) => void;
    onClose: (tabId: string) => void;
    onNewTab: (optionId: string) => void;
    newTabOptions: NewTabOption[];
    /** Drop of a tab from any pane: (payload, insertBeforeTabId | null). */
    onDropTab: (payload: TabDragPayload, before: string | null) => void;
    /** Icon resolver for tab labels (reads from the tab descriptor registry). */
    getTabIcon?: (tab: SidebarTab) => ReactNode;
    /** Badge resolver for tab labels (reads the descriptor's `badge`; the
     *  resolver returns the rendered pill or null). */
    getTabBadge?: (tab: SidebarTab) => ReactNode;
}): import("react").JSX.Element;
