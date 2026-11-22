import type { RemoteStatus } from './types.js';
/**
 * What the Desktop popup can conclude after `plugin.update` died without a
 * response. `upgraded`: the Host reports the target version. `unknown`: no
 * proof the upgrade ran; the caller must re-enable the button.
 */
export type LostUpgradeOutcome = 'upgraded' | 'unknown';
export interface LostUpgradeOptions {
    intervalMs?: number;
    /** Total wait while the Host control route is unreachable (plugin being replaced). */
    unreachableDeadlineMs?: number;
    /** Consecutive reads of the old version from a live Host that prove nothing started. */
    stalledReads?: number;
    sleep?: (ms: number) => Promise<void>;
}
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
export declare function settleLostUpgrade(readStatus: () => Promise<RemoteStatus>, latest: string, options?: LostUpgradeOptions): Promise<LostUpgradeOutcome>;
//# sourceMappingURL=plugin-upgrade.d.ts.map