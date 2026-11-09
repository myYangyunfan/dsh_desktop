/**
 * One keyed registry of install-shaped flows: start, poll to terminal, reset.
 *
 * Framework-free, so a flow can belong to the page rather than to a component
 * (design 2026-10-16-shop-sidebar-page §5). dsh mounts the shop only while it
 * is on screen, and a flow held in a component's state — the poll loop an
 * effect of that component — stopped the moment the reader looked elsewhere:
 * the install ran on in the host, and nothing was left to fold its status or
 * write its receipt. The page store (page-store.ts) owns three that outlive
 * every component showing them, and `useRegistryFlows` (useFlows.ts) renders
 * one for React.
 *
 * Install and uninstall are the same machine, and so is the shop's own
 * update: they differ only in what the STARTING RPC's answer means, which is
 * the three `begin*` mappings at the foot of this file.
 */
import type { InstallArgs, ShopInstallResult, ShopInstallStatusResult, ShopUninstallResult, ShopUpdateResult } from '../host/index.ts';
import { type InstallView } from './present.ts';
/** The one idle view, so a key the registry holds no flow for and a key it
 * reset to idle hand a memoized consumer the same object. */
export declare const IDLE_VIEW: InstallView;
/** `map` without every entry `drop` selects, or null when it selects none.
 * The copy is made at the first match, so a prune that matches nothing
 * copies nothing, and its caller, handed null, publishes nothing. The
 * registry's `resetWhere` and the page store's owed notices share this
 * contract, so a fourth prune cannot return an empty map instead. */
export declare function pruned<K, V>(map: ReadonlyMap<K, V>, drop: (value: V, key: K) => boolean): Map<K, V> | null;
/** What a registry holds at one moment. Replaced whole on every change, so a
 * consumer can tell "changed" from "same" by identity. */
export interface FlowSnapshot {
    readonly views: ReadonlyMap<string, InstallView>;
    /** Identities whose start is in flight and unanswered. */
    readonly starting: ReadonlySet<string>;
}
export interface FlowRegistryDeps<TArgs> {
    /** The starting RPC with its answer mapped to the first view. Never
     * rejects: the mapping folds a transport throw into a view. */
    begin: (args: TArgs) => Promise<InstallView>;
    installStatus: (args: {
        installId: string;
    }) => Promise<ShopInstallStatusResult>;
    /** Once per identity that reaches a terminal state: which one, and the
     * arguments its flow was started with. The outcome is load-bearing: a
     * failed flow changed nothing on the server. */
    onSettled?: (key: string, outcome: 'done' | 'failed', args: TArgs) => void;
}
export interface FlowRegistryOptions {
    /** Keep polling while nothing subscribes. The page store's registries do,
     * so an install the reader left finishes its receipt with no page showing
     * it; a component's own registry does not, so its polling stops when the
     * component unmounts and resumes if it mounts again. */
    pollUnwatched: boolean;
}
export interface FlowRegistry<TArgs> {
    getSnapshot: () => FlowSnapshot;
    subscribe: (listener: () => void) => () => void;
    /** Start `key`'s flow. A second start while the first is unanswered is
     * ignored: the host does not dedupe, so a second RPC would download and
     * install the same thing twice. */
    start: (key: string, args: TArgs) => Promise<void>;
    reset: (key: string) => void;
    /** Reset every identity whose view `predicate` selects. It is handed the
     * identity too, so a caller can select one identity's view by its kind. */
    resetWhere: (predicate: (view: InstallView, key: string) => boolean) => void;
    /** Stop for good: no more polling, starts, changes or listeners, a start
     * still unanswered included. The snapshot stays readable. */
    dispose: () => void;
}
/**
 * @param deps read on every call, so an owner can hand over its latest
 *   functions without rebuilding the registry.
 */
export declare function createFlowRegistry<TArgs>(deps: () => FlowRegistryDeps<TArgs>, options: FlowRegistryOptions): FlowRegistry<TArgs>;
/** An install's start: the host's business union mapped to the first view. */
export declare function beginInstall(install: (args: InstallArgs) => Promise<ShopInstallResult>): (args: InstallArgs) => Promise<InstallView>;
/** An uninstall's start. Its refusals: not in the catalog, not installed.
 * The host reports no phase for an uninstall, which opens on `installing`. */
export declare function beginUninstall(uninstall: (args: {
    name: string;
}) => Promise<ShopUninstallResult>): (args: {
    name: string;
}) => Promise<InstallView>;
/** The shop's own update's start. Its refusals: a version that is not plain
 * semver, and the desktop profile, whose update belongs to dsh's Plugins
 * page. The flow shows the host's own detail for either and never needs
 * `code`: the version row does not offer this start on that profile. */
export declare function beginUpdate(updateStart: (args: {
    version: string;
}) => Promise<ShopUpdateResult>): (args: {
    version: string;
}) => Promise<InstallView>;
