import type { FetchImplementation } from './server-api.js';
import type { SafeLogger } from './logging.js';
/**
 * Update state published through the control-plane `status` payload. It is
 * kept after every successful registry check, even when the local version is
 * current, because the client also marks remote Hosts running an older
 * plugin than the registry's `latest`.
 */
export interface PluginUpdateSnapshot {
    currentVersion: string;
    latestVersion: string;
    checkedAt: number;
}
/**
 * Startup and daily lookup of the plugin's latest published version against
 * the npm registry. The check is fire-and-forget: failures are logged at
 * debug level and never surface to the user or block plugin startup.
 */
export declare class PluginUpdateChecker {
    private readonly logger;
    private readonly fetchImplementation;
    private state?;
    private timer;
    private flight?;
    private stopped;
    constructor(logger: SafeLogger, fetchImplementation?: FetchImplementation);
    /** Latest successful registry check, or `undefined` before the first one. */
    snapshot(): PluginUpdateSnapshot | undefined;
    /** Run the first check and re-check daily. Safe to call more than once. */
    start(): void;
    stop(): void;
    /** One registry check; concurrent callers share the in-flight request. */
    check(): Promise<void>;
    private run;
    /**
     * Race every dist-tags endpoint in parallel: the first valid answer wins, so
     * a network that stalls the official registry does not wait out its timeout
     * before the mirror is consulted.
     */
    private fetchLatestVersion;
    private fetchDistTags;
}
//# sourceMappingURL=update-check.d.ts.map