import type { Context } from '../context-types.ts';
import { type SidebarStore } from './state.ts';
export declare function Sidebar(props: {
    ctx: Context;
    store: SidebarStore;
}): import("react").JSX.Element;
/** The header control that expands/collapses the bottom workbench (see
 *  sidebar/bottom-toggle.tsx — registered into DSH's session header). */
export declare function BottomDockToggle(props: {
    store: SidebarStore;
}): import("react").JSX.Element;
