/**
 * Client-safe `x.y.z[-prerelease]` comparison shared by the Host update check
 * and the injected client UI (no Node imports; both esbuild bundles include it).
 */
const VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;
function parseVersion(value) {
    const match = VERSION_PATTERN.exec(value.trim().replace(/^v/, ''));
    if (match === null)
        return undefined;
    return {
        core: [Number(match[1]), Number(match[2]), Number(match[3])],
        prerelease: match[4] === undefined ? [] : match[4].split('.'),
    };
}
function comparePrerelease(left, right) {
    // A release outranks every prerelease of the same core version.
    if (left.length === 0 && right.length === 0)
        return 0;
    if (left.length === 0)
        return 1;
    if (right.length === 0)
        return -1;
    for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
        const part = left[index];
        const other = right[index];
        // A shorter prerelease list with equal prefix ranks lower.
        if (part === undefined)
            return -1;
        if (other === undefined)
            return 1;
        if (part === other)
            continue;
        const partNumeric = /^\d+$/.test(part);
        const otherNumeric = /^\d+$/.test(other);
        if (partNumeric && otherNumeric)
            return Math.sign(Number(part) - Number(other));
        // Numeric identifiers rank below alphanumeric ones.
        if (partNumeric)
            return -1;
        if (otherNumeric)
            return 1;
        return part < other ? -1 : 1;
    }
    return 0;
}
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
export function compareVersions(left, right) {
    const parsedLeft = parseVersion(left);
    const parsedRight = parseVersion(right);
    if (parsedLeft === undefined || parsedRight === undefined)
        return 0;
    for (let index = 0; index < 3; index += 1) {
        if (parsedLeft.core[index] !== parsedRight.core[index]) {
            return Math.sign(parsedLeft.core[index] - parsedRight.core[index]);
        }
    }
    return comparePrerelease(parsedLeft.prerelease, parsedRight.prerelease);
}
//# sourceMappingURL=version-compare.js.map