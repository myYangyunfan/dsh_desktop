import { randomUUID } from 'node:crypto';
import { compareVersions } from './version-compare.js';
/** npm package name the official plugin manager uses for this bundle. */
export const REMOTE_PLUGIN_PACKAGE = 'ds-harness-remote';
/**
 * Local Desktop upgrade through Harness `pluginManager.updateBundle`.
 *
 * The encrypted Remote channel must not call this: replacing this plugin from
 * a connected device is refused in the Host bridge. Only the loopback control
 * plane on this computer may start it, and only for the version the registry
 * check already published.
 */
export class LocalPluginUpgrade {
    checker;
    manager;
    subscribe;
    requestId;
    decidedVersion;
    ready = false;
    probeFlight;
    startFlight;
    constructor(checker, manager, subscribe, requestId = randomUUID) {
        this.checker = checker;
        this.manager = manager;
        this.subscribe = subscribe;
        this.requestId = requestId;
    }
    /** Registry snapshot, plus `upgrade: 'ready'` once this install is confirmed updatable. */
    snapshot() {
        const base = this.checker.snapshot();
        if (base === undefined)
            return undefined;
        if (compareVersions(base.currentVersion, base.latestVersion) < 0) {
            if (this.decidedVersion !== base.latestVersion)
                this.probe(base.latestVersion);
            if (this.ready && this.decidedVersion === base.latestVersion)
                return { ...base, upgrade: 'ready' };
        }
        return base;
    }
    /**
     * Replace this plugin with `version` when it is the checked latest and the
     * official manager marks the installed bundle updatable.
     */
    start(version) {
        const refused = this.refusal(version);
        if (refused !== undefined)
            return Promise.resolve(refused);
        this.startFlight ??= this.execute(version).finally(() => { this.startFlight = undefined; });
        return this.startFlight;
    }
    refusal(version) {
        const current = this.checker.snapshot();
        if (current === undefined
            || version !== current.latestVersion
            || compareVersions(current.currentVersion, version) >= 0)
            return { status: 'rejected' };
        return undefined;
    }
    probe(version) {
        if (this.probeFlight !== undefined)
            return;
        this.probeFlight = this.readReady()
            .then(ready => {
            this.ready = ready;
            this.decidedVersion = version;
        })
            .finally(() => { this.probeFlight = undefined; });
    }
    async readReady() {
        try {
            const manager = this.manager();
            if (manager === undefined)
                return false;
            return bundleUpdatable(await manager.listBundles(), REMOTE_PLUGIN_PACKAGE);
        }
        catch {
            return false;
        }
    }
    async execute(version) {
        const manager = this.manager();
        if (manager === undefined)
            return { status: 'manual' };
        let updatable = false;
        try {
            updatable = bundleUpdatable(await manager.listBundles(), REMOTE_PLUGIN_PACKAGE);
        }
        catch {
            return { status: 'manual' };
        }
        if (!updatable)
            return { status: 'manual' };
        const requestId = this.requestId();
        let dispose = () => { };
        const started = new Promise(resolve => {
            dispose = this.subscribe(event => {
                if (event.requestId !== requestId)
                    return;
                if (event.step === 'removing' || event.step === 'installing')
                    resolve({ status: 'started' });
            });
        });
        try {
            const settled = manager.updateBundle(REMOTE_PLUGIN_PACKAGE, version, { requestId })
                .then(result => classifyUpdateResult(result))
                .catch(() => ({ status: 'failed', message: 'update-failed' }));
            return await Promise.race([started, settled]);
        }
        finally {
            dispose();
        }
    }
}
/** Whether one `listBundles` row is this package and officially updatable. */
export function bundleUpdatable(listed, packageName) {
    if (!Array.isArray(listed))
        return false;
    return listed.some(row => isRecord(row) && row.name === packageName && row.updatable === true);
}
function classifyUpdateResult(result) {
    if (!isRecord(result) || !isRecord(result.result))
        return { status: 'failed', message: 'update-failed' };
    const application = result.result.application;
    if (application === 'applied' || application === 'restart-required')
        return { status: 'started' };
    return { status: 'failed', message: failureMessage(result.result.error) };
}
function failureMessage(error) {
    if (!isRecord(error))
        return 'update-failed';
    const code = typeof error.code === 'string' && error.code.length > 0 && error.code.length <= 80
        ? error.code
        : 'update-failed';
    const diagnostic = typeof error.diagnostic === 'string'
        ? error.diagnostic.replace(/\s+/g, ' ').trim().slice(0, 180)
        : '';
    return diagnostic === '' ? code : `${code}: ${diagnostic}`;
}
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
//# sourceMappingURL=plugin-self-update.js.map