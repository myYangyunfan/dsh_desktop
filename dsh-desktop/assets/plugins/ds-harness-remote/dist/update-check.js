import { PLUGIN_VERSION } from './version.js';
/** dist-tags endpoints raced in parallel; the mirror backs up the official registry. */
const DIST_TAG_URLS = [
    'https://registry.npmjs.org/-/package/ds-harness-remote/dist-tags',
    'https://registry.npmmirror.com/-/package/ds-harness-remote/dist-tags',
];
const FETCH_TIMEOUT_MS = 10_000;
const RECHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const SEMVER_PATTERN = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;
/**
 * Startup and daily lookup of the plugin's latest published version against
 * the npm registry. The check is fire-and-forget: failures are logged at
 * debug level and never surface to the user or block plugin startup.
 */
export class PluginUpdateChecker {
    logger;
    fetchImplementation;
    state;
    timer;
    flight;
    stopped = false;
    constructor(logger, fetchImplementation = fetch) {
        this.logger = logger;
        this.fetchImplementation = fetchImplementation;
    }
    /** Latest successful registry check, or `undefined` before the first one. */
    snapshot() {
        return this.state;
    }
    /** Run the first check and re-check daily. Safe to call more than once. */
    start() {
        if (this.stopped || this.timer !== undefined)
            return;
        void this.check().catch(() => undefined);
        this.timer = setInterval(() => { void this.check().catch(() => undefined); }, RECHECK_INTERVAL_MS);
        this.timer.unref?.();
    }
    stop() {
        this.stopped = true;
        if (this.timer !== undefined) {
            clearInterval(this.timer);
            this.timer = undefined;
        }
    }
    /** One registry check; concurrent callers share the in-flight request. */
    check() {
        if (this.stopped)
            return Promise.resolve();
        this.flight ??= this.run().finally(() => { this.flight = undefined; });
        return this.flight;
    }
    async run() {
        try {
            const latest = await this.fetchLatestVersion();
            if (latest === undefined)
                return;
            this.state = { currentVersion: PLUGIN_VERSION, latestVersion: latest, checkedAt: Date.now() };
            this.logger.debug('plugin update check complete', { current: PLUGIN_VERSION, latest });
        }
        catch {
            // Registry reachability varies by network; a failed check must stay invisible.
            this.logger.debug('plugin update check failed', { code: 'UPDATE_CHECK_FAILED' });
        }
    }
    /**
     * Race every dist-tags endpoint in parallel: the first valid answer wins, so
     * a network that stalls the official registry does not wait out its timeout
     * before the mirror is consulted.
     */
    fetchLatestVersion() {
        return new Promise(resolve => {
            let pending = DIST_TAG_URLS.length;
            let settled = false;
            const settle = (latest) => {
                if (settled)
                    return;
                if (latest !== undefined) {
                    settled = true;
                    resolve(latest);
                    return;
                }
                pending -= 1;
                if (pending === 0)
                    resolve(undefined);
            };
            // An empty source list must still resolve, or the shared in-flight
            // promise would hang and block every later check.
            if (pending === 0) {
                settle(undefined);
                return;
            }
            for (const url of DIST_TAG_URLS) {
                this.fetchDistTags(url).then(settle, () => settle(undefined));
            }
        });
    }
    async fetchDistTags(url) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
        timeout.unref?.();
        try {
            const response = await this.fetchImplementation(url, {
                signal: controller.signal,
                headers: { accept: 'application/json' },
            });
            if (!response.ok)
                throw new Error(`dist-tags responded ${response.status}`);
            const tags = await response.json();
            if (typeof tags.latest !== 'string' || !SEMVER_PATTERN.test(tags.latest))
                return undefined;
            return tags.latest;
        }
        finally {
            clearTimeout(timeout);
        }
    }
}
//# sourceMappingURL=update-check.js.map