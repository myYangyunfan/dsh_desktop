import { compareVersions } from '../version-compare.js';
const DEFAULTS = {
    intervalMs: 1_000,
    unreachableDeadlineMs: 60_000,
    stalledReads: 3,
};
/**
 * A lost `plugin.update` response is ambiguous: the manager unloads this
 * plugin once installation begins (the response dies with it), but a plain
 * network error before the request reached the Host looks identical. Resolve
 * it from the Host's own status instead of from the error text.
 *
 * - Version at or above `latest`: the upgrade happened.
 * - Control route unreachable: keep waiting, the plugin may be reinstalling,
 *   until the deadline.
 * - Live Host still on the old version for `stalledReads` reads in a row: the
 *   request never started an upgrade.
 */
export async function settleLostUpgrade(readStatus, latest, options = {}) {
    const intervalMs = options.intervalMs ?? DEFAULTS.intervalMs;
    const deadlineMs = options.unreachableDeadlineMs ?? DEFAULTS.unreachableDeadlineMs;
    const stalledReads = options.stalledReads ?? DEFAULTS.stalledReads;
    // `Promise.withResolvers` is not in this package's tsconfig `lib`.
    const sleep = options.sleep ?? ((ms) => new Promise(resolve => setTimeout(resolve, ms)));
    let waited = 0;
    let stalled = 0;
    while (waited <= deadlineMs) {
        let status;
        try {
            status = await readStatus();
        }
        catch {
            status = undefined;
        }
        const current = status !== undefined && status.controlUnavailable !== true
            ? status.update?.currentVersion
            : undefined;
        if (current !== undefined) {
            if (compareVersions(current, latest) >= 0)
                return 'upgraded';
            stalled += 1;
            if (stalled >= stalledReads)
                return 'unknown';
        }
        else {
            // Unreachable, or a freshly loaded plugin that has not finished its
            // registry check: neither proves anything about the upgrade.
            stalled = 0;
        }
        await sleep(intervalMs);
        waited += intervalMs;
    }
    return 'unknown';
}
//# sourceMappingURL=plugin-upgrade.js.map