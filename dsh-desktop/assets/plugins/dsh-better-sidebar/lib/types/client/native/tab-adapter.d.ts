import type { ComponentType, ReactNode } from 'react';
import type { Context } from '../../context-types.ts';
import type { SessionScope } from '../api.ts';
import type { BetterSidebarService } from '../service.ts';
import type { SidebarStore, SidebarTab } from '../state.ts';
/**
 * The plugin-side seed a native open carries in `navigation.params`.
 * JSON-shaped by convention (the native surface does not validate it).
 */
export interface NativeTabParams {
    /** Overrides the descriptor's title for this instance. */
    readonly title?: string;
    /** A file path (the editor window's content seed). */
    readonly path?: string;
    /** A URL the tab navigates to on mount (the browser tab's seed). */
    readonly url?: string;
    /** A diff reference (the diff tab's content seed). */
    readonly diff?: SidebarTab['diff'];
    /** JSON-serializable custom state carried on the synthetic record. */
    readonly meta?: unknown;
    /** A line to land on (file addresses carry it as a navigation parameter). */
    readonly line?: number;
}
/** The native tab information this adapter reads (structural mirror of `useTabInfo`). */
export interface NativeTabInfo {
    readonly tab: {
        readonly id: string;
        readonly kind: string;
        readonly title: string;
        readonly contentId: string;
        readonly visible: boolean;
        readonly navigation: {
            readonly address: string;
            readonly params: NativeTabParams | undefined;
            readonly revision: number;
        };
        readonly signal: AbortSignal;
    };
}
/** One native tab's plugin-side view state. */
interface View {
    tab: SidebarTab;
    scope: SessionScope;
    /**
     * A PROJECTION of the session's expansion set (never an authoritative copy):
     * refreshed from the store on every `ensure` and on every store change, so
     * every native tab of one session shows the same set and reopening a tab
     * cannot reset it. Cached only for referential stability — a fresh array on
     * each render would re-run the tree's load effect for nothing.
     */
    expanded: string[];
    /** The transient "show in folder" highlight: per tab by design. */
    revealed: string[];
    /** Bumped on every mutation; the components subscribe to it. */
    version: number;
}
/** The plugin-side record registry for native tabs. */
export interface NativeTabRecords {
    /**
     * The synthetic record for a native tab, minted on first sight and kept
     * across navigations (a navigation refreshes the seed fields, never the
     * identity or a plugin-side title/meta mutation).
     * @param input - the native record and the session it lives in.
     * @returns the current view state.
     */
    ensure(input: {
        id: string;
        kind: string;
        title: string;
        params: NativeTabParams | undefined;
        scope: SessionScope;
        /**
         * The descriptor's own factory, called ONCE for a record that arrives
         * without seed fields (a native guide open, which knows nothing about the
         * plugin's per-instance minting): it supplies the title and the meta a
         * view needs — the side chat's thread bootstrap, the terminal's name.
         */
        mint?: () => {
            title?: string;
            meta?: unknown;
        } | undefined;
    }): View;
    /** One record by native tab id. */
    get(id: string): View | undefined;
    /** Whether this id belongs to a native tab (vs the plugin's own layout). */
    has(id: string): boolean;
    /** Merge a patch into the synthetic record (the `updateTab` path). */
    update(id: string, patch: {
        title?: string;
        path?: string;
        meta?: unknown;
    }): void;
    /** Forget a record (the native tab closed). */
    drop(id: string): void;
    /**
     * Bind the plugin store — the per-session state is the AUTHORITY for every
     * view's expansion set. Idempotent; the first call also subscribes to store
     * changes so a toggle made anywhere (the workbench, another native tab, a
     * persisted restore) refreshes every native view.
     */
    attachStore(store: SidebarStore): void;
    /** Toggle one directory in a record's SESSION expansion set. */
    toggleExpanded(id: string, path: string): void;
    /** Mint the next instance number of a kind (titles like "Terminal 2"). */
    nextInstance(kind: string): number;
    /** A per-record version for `useSyncExternalStore`. */
    versionOf(id: string): number;
    /** Subscribe to record changes (title/path/meta/expanded). */
    subscribe(listener: () => void): () => void;
}
/** Create the record registry for one client activation. */
export declare function createNativeTabRecords(): NativeTabRecords;
/** What a body registration injects (the plugin's business face). */
export interface NativeBodyInjected {
    readonly sessionId: string;
    readonly ctx: Context;
    readonly store: SidebarStore;
    readonly service: BetterSidebarService;
    readonly records: NativeTabRecords;
    /** The descriptor id this body draws (one registration per descriptor). */
    readonly descriptorId: string;
    /**
     * Extra seed fields derived from the native record — a file address carries
     * its path there, not in `navigation.params`.
     */
    readonly paramsOf?: (info: NativeTabInfo) => NativeTabParams | undefined;
    /**
     * The session the body acts in, when the record names one (a
     * `session`-scoped file address names its own session); absent falls back to
     * the session the slot is scoped to.
     */
    readonly sessionIdOf?: (info: NativeTabInfo) => string | undefined;
}
/** The props the slot framework adds to every tab body and title. */
export interface NativeBodyFrameworkProps {
    readonly useTabInfo: () => NativeTabInfo;
}
/**
 * One plugin tab rendered inside the native right Sidebar: the descriptor's
 * own component with the plugin's props, over a synthetic record minted from
 * the native tab and dropped when the record ends.
 */
export declare function NativeTabBody(props: NativeBodyInjected & NativeBodyFrameworkProps): ReactNode;
/** What a title registration injects. */
export interface NativeTitleInjected {
    readonly records: NativeTabRecords;
    readonly service: BetterSidebarService;
    /** The descriptor id this title belongs to (one registration per descriptor). */
    readonly descriptorId: string;
}
/**
 * A live tab chip: the type's glyph followed by the synthetic record's title
 * (the editor rewrites it on an in-place file switch, the side chat on the
 * thread's first prompt). Without this registration the chip would keep the
 * title captured when the tab opened.
 *
 * The host's tab definition has no icon field — a chip is drawn from the
 * `title` text alone — but this slot IS the chip's content, so the glyph is
 * ours to add. Placement follows the plugin's own semantics: an editor tab
 * with a path shows that file's icon (the same glyph the tree row shows), and
 * every other tab shows its descriptor's icon. Both ride
 * `descriptor.icon`, so the workbench strip, the guide capsules and the chip
 * cannot drift apart.
 */
export declare function NativeTabTitle(props: NativeTitleInjected & NativeBodyFrameworkProps): ReactNode;
/** The component pair one descriptor contributes to the native surface. */
export interface NativeTabComponents {
    readonly body: ComponentType<NativeBodyInjected & NativeBodyFrameworkProps>;
    readonly title: ComponentType<NativeTitleInjected & NativeBodyFrameworkProps>;
}
export {};
