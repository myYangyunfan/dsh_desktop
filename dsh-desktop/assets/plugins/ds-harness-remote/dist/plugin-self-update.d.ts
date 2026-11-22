import type { PluginUpdateSnapshot } from './update-check.js';
/** npm package name the official plugin manager uses for this bundle. */
export declare const REMOTE_PLUGIN_PACKAGE = "ds-harness-remote";
/**
 * Result of asking the local Host to replace this plugin.
 * `rejected` is a version the registry check did not publish.
 * `manual` means this install cannot use the official online update.
 * `started` means the manager passed its preflight and is replacing the bundle;
 * the caller must return before that replacement unloads this plugin.
 */
export type PluginSelfUpdateResult = {
    status: 'rejected';
} | {
    status: 'manual';
} | {
    status: 'started';
} | {
    status: 'failed';
    message: string;
};
/** Official plugin-manager face this plugin needs. Older hosts simply lack it. */
export interface PluginManagerUpdate {
    listBundles(): Promise<unknown>;
    updateBundle(name: string, version: string, options: {
        requestId: string;
    }): Promise<unknown>;
}
interface UpdateProgress {
    requestId?: unknown;
    step?: unknown;
}
interface UpdateChecker {
    snapshot(): PluginUpdateSnapshot | undefined;
}
/**
 * Local Desktop upgrade through Harness `pluginManager.updateBundle`.
 *
 * The encrypted Remote channel must not call this: replacing this plugin from
 * a connected device is refused in the Host bridge. Only the loopback control
 * plane on this computer may start it, and only for the version the registry
 * check already published.
 */
export declare class LocalPluginUpgrade {
    private readonly checker;
    private readonly manager;
    private readonly subscribe;
    private readonly requestId;
    private decidedVersion;
    private ready;
    private probeFlight;
    private startFlight;
    constructor(checker: UpdateChecker, manager: () => PluginManagerUpdate | undefined, subscribe: (listener: (event: UpdateProgress) => void) => () => void, requestId?: () => string);
    /** Registry snapshot, plus `upgrade: 'ready'` once this install is confirmed updatable. */
    snapshot(): PluginUpdateSnapshot | undefined;
    /**
     * Replace this plugin with `version` when it is the checked latest and the
     * official manager marks the installed bundle updatable.
     */
    start(version: string): Promise<PluginSelfUpdateResult>;
    private refusal;
    private probe;
    private readReady;
    private execute;
}
/** Whether one `listBundles` row is this package and officially updatable. */
export declare function bundleUpdatable(listed: unknown, packageName: string): boolean;
export {};
//# sourceMappingURL=plugin-self-update.d.ts.map