import type { Context } from '../context-types.ts';
import { type SessionScope } from './api.ts';
import { type SidebarStore, type SidebarTab } from './state.ts';
export declare function EditorHost(props: {
    ctx: Context;
    store: SidebarStore;
    scope: SessionScope;
    tab: SidebarTab;
    /** Whether this tab is the active one with its panel open: a parked tab
     *  must not keep polling (the workbench keeps every tab body mounted). */
    visible?: boolean;
    expanded: string[];
    revealed: string[];
    onToggleDir: (path: string) => void;
    onReferenceFile: (path: string, isDir: boolean) => void;
}): import("react").JSX.Element;
