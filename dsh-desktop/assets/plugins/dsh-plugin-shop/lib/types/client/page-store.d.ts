/**
 * The shop page's state, held by the page rather than by the components that
 * show it (design 2026-10-16-shop-sidebar-page §5).
 *
 * dsh mounts the shop only while it is on screen — the main column renders
 * only the selected panel, as the Settings shell, the shop's home through
 * 0.8.7, rendered only the open section — so what a component held in its
 * own state went the moment the reader looked elsewhere: the search text,
 * the filters, an install's progress and its receipt, the restart offer
 * included (the shop design's §5.1, "Leaving the section"). This store keeps
 * them, and it owns the flows' polling (flow-registry.ts), so an install the
 * reader left still has its status folded and its receipt written.
 *
 * It sits on `globalThis` under a registry symbol for the reason
 * `restart-monitor.ts` does: the symbol is the one thing a hot-swapped module
 * instance shares with the one it replaced. Each `apply` still builds a new
 * store (index.ts), because a re-applied bundle is a new page.
 */
import type { InstallArgs, ShopInstallResult, ShopInstallStatusResult, ShopUninstallResult, ShopUpdateResult } from '../host/index.ts';
import { type FlowRegistry, type FlowRegistryOptions } from './flow-registry.ts';
import { type Category, type ShelfOrder } from './present.ts';
/** The reader's controls over the shelf, kept across leaving and returning. */
export interface ShelfView {
    readonly query: string;
    /** `installed` is a filter mode alongside the catalog categories: it selects
     * by installed state, not by `catalog.category`. */
    readonly category: Category | 'installed' | null;
    /** Design 2026-10-12-shelf-orders §4. In memory like every control here: a
     * page reload starts at the star order. */
    readonly order: ShelfOrder;
    /** Off by default: a filter nobody asked for must not hide listings on
     * first open. Independent of `category`, because it subtracts from
     * whatever the categories selected rather than competing with them. */
    readonly hideIncompatible: boolean;
    /** Off by default, for the same reason. Subtracts every card the reader has
     * not starred (design 2026-11-02-market-borrowings §7); a modifier, like
     * `hideIncompatible`, never a category. */
    readonly favoritesOnly: boolean;
    /** How far the shelf has grown, in §A1's batches. */
    readonly visibleCount: number;
}
/** What a switch owes before the page shows the truth (ShopTab's
 * `EnabledSwitch`). */
export type OwedNotice = 'reload' | 'restart';
/** Where a switch is drawn. An outdated plugin draws two, its card's and its
 * Updatable row's, and each owes only what was done to it. */
declare const SWITCH_SURFACES: readonly ["card", "row"];
export type SwitchSurface = (typeof SWITCH_SURFACES)[number];
/** The owed map's key for one switch: `<surface>:<identity>`. */
export declare function switchKey(surface: SwitchSurface, identity: string): string;
/** The card the reader is at: the first on the shelf whose bottom lies below
 * the page's top edge (design 2026-10-16-shop-sidebar-page §5.7). */
export interface ScrollAnchor {
    /** Its identity (`identityKey`), since two listed entries can share a
     * name. */
    readonly key: string;
    /** Its top relative to the page's top edge, in px: zero or negative while
     * the card spans the edge, and at most the shelf's gap between cards while
     * the edge falls in that gap. A reader above the shelf has no card. */
    readonly offset: number;
}
export interface PageSnapshot {
    readonly view: ShelfView;
    /** A settle changed what the catalog's verdicts depend on, and no answer to
     * a page's request for them since has landed (design
     * 2026-09-01-harness-compatibility section 9.1;
     * 2026-10-16-shop-sidebar-page §5.4). */
    readonly reverdictPending: boolean;
    /** How many reverdicts the page has been asked for: bumped with
     * `reverdictPending` by every settle that raises one. A request carries the
     * count it was asked at, so its answer clears only the latest. */
    readonly reverdicts: number;
    /** Bumped by every settle that may have changed the profile and by dsh
     * restarting under the page: a mounted page re-reads the installed list. */
    readonly settled: number;
}
/** The RPCs the store's flows run on: the shop's injected face. */
export interface PageStoreDeps {
    install: (args: InstallArgs) => Promise<ShopInstallResult>;
    uninstall: (args: {
        name: string;
    }) => Promise<ShopUninstallResult>;
    updateStart: (args: {
        version: string;
    }) => Promise<ShopUpdateResult>;
    installStatus: (args: {
        installId: string;
    }) => Promise<ShopInstallStatusResult>;
    /** Tells the client half a package left the profile: index.ts's
     * page-removed set, which the module table must never override. */
    noteUninstalled?: (name: string) => void;
}
export interface ShopPageStore {
    /** The shape a successor may read
     * (design 2026-10-16-shop-sidebar-page §6). */
    readonly schema: 1;
    readonly installs: FlowRegistry<InstallArgs>;
    readonly uninstalls: FlowRegistry<{
        name: string;
    }>;
    readonly self: FlowRegistry<{
        version: string;
    }>;
    getSnapshot: () => PageSnapshot;
    subscribe: (listener: () => void) => () => void;
    /** Publish the view with `patch` applied, unless that changes nothing: a
     * pill pressed again, or a batch the shelf already shows. */
    setView: (patch: Partial<ShelfView>) => void;
    updateView: (update: (view: ShelfView) => Partial<ShelfView>) => void;
    /** Whether the card of one identity is expanded. A channel of its own,
     * apart from the page snapshot, as the owed notices below are: one card
     * opens, and the shelf re-renders whole whenever the snapshot is
     * replaced. */
    isExpanded: (key: string) => boolean;
    /** Be told when any card opens or closes. */
    subscribeExpanded: (listener: () => void) => () => void;
    /** Open the card if it is closed, close it if it is open. */
    toggleExpanded: (key: string) => void;
    /** Open the card, and leave it open if it is: a jump to one plugin opens
     * its card from outside it. */
    expand: (key: string) => void;
    /** Put one plugin on the shelf, as the Plugins page's "View in Plugin
     * shop" asks (design 2026-10-16-shop-sidebar-page §7): the search text
     * set to its name, every category, nothing subtracted, the first batch,
     * the top of the page, and the one card `card` names opened. Whatever
     * search the reader left is replaced: they asked to see this plugin. */
    focus: (name: string, card: string | null) => void;
    /** What one switch owes (`switchKey`), or undefined when it owes nothing.
     * A channel of its own, apart from the page snapshot: one switch renders a
     * notice, and the shelf, which re-renders whole whenever the snapshot is
     * replaced, has no use for it. */
    getOwed: (switchKey: string) => OwedNotice | undefined;
    /** Be told when any switch's notice changes. */
    subscribeOwed: (listener: () => void) => () => void;
    /** Read when a switch's toggle starts, and handed back with its answer
     * (`setOwed`): it counts the times this page saw an installation leave the
     * profile. */
    owedEpoch: () => number;
    /** Sticky, and a restart outranks a reload. `since` is the `owedEpoch` the
     * toggle started at. An answer that lands after its identity left the
     * profile, by an uninstall that landed or from the installed list a page
     * read, re-creates nothing: it describes the installation before, and a
     * reinstall draws fresh switches under the same keys. A restart under the
     * page leaves every answer standing: the page notes one only from the new
     * process's version answer, the old process sent its answers before it
     * exited, and an answer that lands after the restart is noted is the new
     * process's, whose restart is owed. */
    setOwed: (switchKey: string, owed: OwedNotice, since: number) => void;
    /** The identities the installed list a page read holds. Every switch of an
     * identity it no longer holds owes nothing: the plugin left the profile,
     * removed outside the shop (dsh's Plugins page, `dsh plugin remove`) when
     * no uninstall of this page settled for it. */
    noteInstalled: (identities: Iterable<string>) => void;
    /** The answer to a page's reverdict request landed, a failed one
     * included; `asked` is the `reverdicts` count it was asked at. An answer to
     * an earlier one clears nothing: a settle since raised another, which the
     * page has yet to ask for or to hear back about. */
    clearReverdict: (asked: number) => void;
    /** dsh restarted under the page (index.ts `onRestarted`). */
    noteRestarted: () => void;
    /** Where the page was scrolled to, and the card at its top edge (design
     * 2026-10-16-shop-sidebar-page §5.7). Written on every scroll without
     * telling anyone, since nothing renders from it; read once, when the page
     * comes back. A position written without a card has none. */
    recordScroll: (top: number, anchor?: ScrollAnchor | null) => void;
    readScroll: () => number;
    /** The card written with the position, or null. A view change that
     * refilters or reorders the shelf forgets it, as `focus` does: the card is
     * somewhere else on the new shelf, or gone, and no scroll event need follow
     * to write the card the reader sees now. */
    readAnchor: () => ScrollAnchor | null;
    /** ShopPage reports its own mount here. The page is the only surface that
     * knows it is on screen, and it knows it without asking dsh anything:
     * `main` mounts a key's panel only while it is selected. Not published
     * either: what reads it is the hot-swap hand-over record, which this
     * instance's `main` entry takes as it leaves and the next instance's
     * `apply` reads (index.ts; design 2026-10-16-shop-sidebar-page §6). */
    notePageMounted: (mounted: boolean) => void;
    /** As this instance's `main` entry leaves, record whether the page showed
     * (index.ts; design 2026-10-16-shop-sidebar-page §6). Reads the mount flag
     * above — NEVER dsh's layout service, whose selection observable is not
     * the same object on every leg (measured 2026-10-16,
     * design 2026-10-16-shop-sidebar-page §3.1; see index.ts's layout-face
     * comment). */
    recordTeardown: () => void;
    /** What a successor reads of this instance. */
    handover: () => Handover;
    /** Stop the flows' polling and drop every listener. A disposed store
     * publishes nothing and registers no listener again, so a hot swap's
     * window cannot change it. What it held stays readable, and the store
     * stays under its page key until the next `apply` replaces it: a successor
     * reads what this instance left from there (design
     * 2026-10-16-shop-sidebar-page §5.1, §6). */
    dispose: () => void;
}
/** The shelf a page opens on: the star order, every category, one batch. */
export declare const INITIAL_VIEW: ShelfView;
/**
 * @param deps read on every call, so the owner can hand over its latest
 *   functions without rebuilding the store.
 * @param options the page's own store polls unwatched; a store a tab builds
 *   for itself does not, and stops with the tab (ShopTab).
 */
export declare function createPageStore(deps: () => PageStoreDeps, options: FlowRegistryOptions): ShopPageStore;
/** What sits at the page key. A later shop's store, met after a downgrade,
 * need not share this one's shape, so only an object that says it is of
 * this `schema` is handed out as this store; anything else is reported as
 * another schema's and goes no further (design 2026-10-16-shop-sidebar-page
 * §5.1). */
export type PageKeyOccupant = {
    readonly kind: 'none';
} | {
    readonly kind: 'store';
    readonly store: ShopPageStore;
} | {
    readonly kind: 'other';
    readonly occupant: unknown;
};
/** What a shop applied earlier left on this page: nothing, a store of this
 * schema, or another schema's object. */
export declare function readPageStore(): PageKeyOccupant;
/** Make `store` the page's. Returns what it replaces. */
export declare function installPageStore(store: ShopPageStore): PageKeyOccupant;
/** What a successor reads of the instance it replaces
 * (design 2026-10-16-shop-sidebar-page §6). */
export interface Handover {
    /** Whether the shop page was showing when the instance's teardown began. */
    readonly showing: boolean;
}
/** What applied on this page before the instance reading it
 * (design 2026-10-16-shop-sidebar-page §6). */
export type Predecessor = {
    readonly kind: 'none';
}
/** A shop that still lived in Settings: a 0.8.4–0.8.7 shop, which left the
 * restart monitor's store and no page store, or a build with the page store
 * but not yet the page, whose schema-1 store cannot hand over. */
 | {
    readonly kind: 'section';
}
/** A 0.9.0-or-later shop, and whether its page showed as it was torn down.
 * A later shop's store of another schema reads as not showing: its
 * hand-over cannot be read. */
 | {
    readonly kind: 'page';
    readonly showing: boolean;
};
/** Read at the very start of `apply`, before this instance puts its own
 * stores on the page. */
export declare function readPredecessor(): Predecessor;
/** Stop what the page key held, through the `dispose` it has and no other:
 * an object that claims this schema and lacks one is stopped no more than a
 * schema-2 object is, and neither can throw the shop off the page. */
export declare function disposeOccupant(occupant: PageKeyOccupant): void;
/** Test-only: dispose the page's store and forget it, as a reload does, a
 * store of another shape included (`disposeOccupant`): a case that left one
 * must not have its cleanup throw over its own failure. */
export declare function resetPageStore(): void;
export {};
