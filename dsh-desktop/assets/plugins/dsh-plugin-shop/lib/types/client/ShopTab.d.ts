/** The shop tab: browse the catalog, detail an entry, install on one click,
 * poll the install to its terminal state (§7.2).
 * Everything the tab renders is text — summaries, capabilities, log lines,
 * details — never markup, so hostile npm descriptions cannot inject (spec
 * §11.3.4): no render path here may ever use dangerouslySetInnerHTML. */
import { type ReactNode } from 'react';
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { InstallArgs, ShopCatalogResult, ShopInstalledEntry, ShopInstallResult, ShopInstallStatusResult, ShopRestartResult, ShopSetEnabledResult, ShopStateResult, ShopUninstallResult, ShopUpdateResult, ShopVersionResult } from '../host/index.ts';
import { type ShopPageStore } from './page-store.ts';
/** The tab's Remote face: the Host result types, already unwrapped from the
 * wire envelope by `index.ts`; `catalog` throws on a wire error so the tab's
 * error state renders. */
export interface ShopTabInjected {
    /** `reverdict: true` means "judge again against the installation as it
     * stands now" — the host's own snapshot and freshness window, asked with
     * the same plain call as a stash-expired open, never a network refresh. A
     * plain open can still serve the stash; a reverdict always bypasses it (the
     * install or uninstall that triggered it predates whatever the stash
     * holds). It is a client-only instruction: `index.ts` never lets it reach
     * the host RPC, which accepts only `{ refresh?: boolean }`. */
    catalog: (args?: {
        refresh?: boolean;
        reverdict?: boolean;
    }) => Promise<ShopCatalogResult>;
    install: (args: InstallArgs) => Promise<ShopInstallResult>;
    installStatus: (args: {
        installId: string;
    }) => Promise<ShopInstallStatusResult>;
    setEnabled: (args: {
        name: string;
        enabled: boolean;
    }) => Promise<ShopSetEnabledResult>;
    installed: () => Promise<ShopInstalledEntry[]>;
    /** The profile manifest's dependency specs — the install gate's own input,
     * so the card's verdict and the host's are one rule. `null` is "cannot
     * say", never "nothing is installed". */
    installedSpecs: () => Promise<Record<string, string> | null>;
    uninstall: (args: {
        name: string;
    }) => Promise<ShopUninstallResult>;
    /** Tells the client half that this page uninstalled `name`, so the module
     * table's refinement never vouches for it again (the page-removed set,
     * design 2026-09-01-harness-compatibility section 9.1): a graph row or a
     * `loadCache` record can outlive a restart-free uninstall, and would
     * otherwise clear a badge the host is still right to show. Optional — a
     * stub or an old host face may not offer it — and installs need no
     * counterpart, since a reinstalled package resolves on the host again. */
    noteUninstalled?: (name: string) => void;
    restart: () => Promise<ShopRestartResult>;
    version: () => Promise<ShopVersionResult>;
    /** Be told when the version answers start coming from another dsh process
     * — dsh restarted under the page, which nothing reloads — with the first
     * answer from it; returns the unsubscribe. The receipts a restart settles
     * are the page store's to clear (`noteRestarted`), which index.ts calls on
     * every restart under the page, tab or no tab; the tab clears them itself
     * only for the store it builds when none is handed over (design §8,
     * 2026-10-06 amendment, and design 2026-10-16-shop-sidebar-page §5.5).
     * Optional: a stub may not offer it. */
    onRestarted?: (listener: (fresh: ShopVersionResult) => void) => () => void;
    updateStart: (args: {
        version: string;
    }) => Promise<ShopUpdateResult>;
    /** Favorites and rollback records (design 2026-11-02-market-borrowings
     * §6–§7). Optional like `reload`: a stub written before these existed keeps
     * working, and the tab then draws no stars and offers no rollback. */
    state?: () => Promise<ShopStateResult>;
    setFavorite?: (args: {
        key: string;
        favorite: boolean;
    }) => Promise<{
        ok: boolean;
        detail?: string;
    }>;
    rollback?: (args: {
        key: string;
    }) => Promise<ShopInstallResult>;
    /** Open the shop's own page inside dsh's plugin manager. There a
     * self-update of the shop runs when the host reports `selfUpdate:
     * 'dsh-page'` (the desktop profile): dsh's page has the remove → install →
     * restore operation the shop cannot run on itself. Optional like the rest
     * — a host or stub without the navigation service offers no move, and the
     * button is disabled. */
    openUpdatePage?: () => void;
    /** The §4 reload trigger, defaulted once at the tab root to a real page
     * reload. Injected so a test can observe it without touching jsdom's
     * non-writable `location.reload`. */
    reload?: () => void;
    /** The page's store (page-store.ts): the reader's place on the shelf and
     * every flow, kept across leaving and returning (design
     * 2026-10-16-shop-sidebar-page §5). Optional: without it the tab builds a
     * store of its own, which lives and dies with the tab — how the tab
     * behaved before the store existed, and what a stub gets. */
    page?: ShopPageStore;
}
/** What only the page frame hands the body (ShopPage.tsx). */
export interface ShopTabOwnProps {
    /** Called once per mount, on the first commit with the shelf on screen
     * and an answer from the installed list, rows or none or a failure: the
     * frame restores its scroll position then (design
     * 2026-10-16-shop-sidebar-page §5.7). */
    onShelfReady?: () => void;
}
/** The page's props as the main-column renderer assembles them (no owner
 * props), plus what only the page frame hands the body. */
export type ShopTabProps = PropsRuntime<'main'> & PropsLocale<'settings.shop'> & InjectFace<ShopTabInjected> & ShopTabOwnProps;
/** The shop body inside its own error boundary, as `ShopPage` renders it
 * below the page's head (index.ts registers `ShopPage` in the main column).
 * Exported under the name the body used to carry, so nothing can render the
 * body without the boundary. */
export declare function ShopTab(props: ShopTabProps): ReactNode;
