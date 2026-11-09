/**
 * Client-safe `x.y.z[-prerelease]` comparison shared by the Host update check
 * and the injected client UI (no Node imports; both esbuild bundles include it).
 */
/**
 * Compare two `x.y.z[-prerelease]` versions: negative when `left` is older,
 * `0` when equal (including both unparseable), positive when `left` is newer.
 * A value that fails to parse compares as equal to everything, so a malformed
 * registry tag can never force or suppress an update hint on its own.
 *
 * @param left First version string.
 * @param right Second version string.
 * @returns Negative, zero, or positive as `left` is older, equal, or newer.
 */
export declare function compareVersions(left: string, right: string): number;
//# sourceMappingURL=version-compare.d.ts.map