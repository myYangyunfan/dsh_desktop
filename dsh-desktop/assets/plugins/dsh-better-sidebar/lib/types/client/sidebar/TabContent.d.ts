import type { Context } from '../../context-types.ts';
import type { SidebarState, SidebarStore, SidebarTab } from '../state.ts';
import type { SessionScope } from '../api.ts';
import { type TabContentMemoKey } from '../tab-content-memo.ts';
import type { NewTabOption } from '../TabBar.tsx';
/** Props of one tab's content cell = the memo key (tab-content-memo.ts) plus
 *  the runtime objects/callbacks the cell renders with. The memo comparator
 *  is the pure `tabContentCompare`; anything in the key decides a re-render
 *  must propagate, anything outside it must be a stable object (ctx/store)
 *  or covered by a compared field (paneId covers onOpenDiff's captured
 *  pane; sessionId/cwd cover onReferenceFile). */
interface TabContentProps extends TabContentMemoKey {
    onToggleDir: (path: string) => void;
    onReferenceFile: (path: string, isDir: boolean) => void;
    ctx: Context;
    store: SidebarStore;
    /** Fired before a topology node jumps to its child session (see Sidebar). */
    onSubagentJump: (childSessionId: string) => void;
    /** Open a diff tab from the git panel (placement handled by the store). */
    onOpenDiff: (tab: SidebarTab) => void;
}
/** Render the content of one tab (dispatched by type). */
export declare const TabContent: import("react").NamedExoticComponent<TabContentProps>;
/** The + menu options for the current state, driven by the tab registry.
 * Hidden tabs (editor/diff) never show; `available` returning false shows
 * a disabled row instead of hiding the option.
 * Tabs the user disabled in the side card settings are filtered out
 * entirely — re-enabling them is the settings page's job. */
export declare function buildNewTabOptions(state: SidebarState, ctx: Context, scope: SessionScope): NewTabOption[];
export {};
