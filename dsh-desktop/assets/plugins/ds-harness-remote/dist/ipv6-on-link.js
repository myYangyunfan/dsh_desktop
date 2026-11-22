import { execFile } from 'node:child_process';
import { isIP } from 'node:net';
import { networkInterfaces } from 'node:os';
import { promisify } from 'node:util';
const run = promisify(execFile);
const reachableNeighborStates = new Set(['REACHABLE', 'STALE', 'DELAY', 'PROBE']);
export async function isIpv6OnLink(local, remote) {
    if (process.platform !== 'linux' || isIP(local) !== 6 || isIP(remote) !== 6)
        return false;
    try {
        const address = (value) => new URL(`http://[${value}]`).hostname;
        const localAddress = address(local);
        const remoteAddress = address(remote);
        if (localAddress === remoteAddress)
            return false;
        // Ask the kernel about the actual selected source and destination. A
        // matching prefix alone does not prove the route is gateway-free.
        const [route] = await ipJson('route', 'get', remote, 'from', local);
        if (typeof route?.dev !== 'string' || route.gateway !== undefined || route.via !== undefined
            || (route.type !== undefined && route.type !== 'unicast'))
            return false;
        if (!networkInterfaces()[route.dev]?.some(entry => entry.family === 'IPv6' && !entry.internal && address(entry.address) === localAddress))
            return false;
        const neighbors = await ipJson('neigh', 'show', 'to', remote, 'dev', route.dev);
        return neighbors.some(neighbor => typeof neighbor.dst === 'string' && isIP(neighbor.dst) === 6
            && address(neighbor.dst) === remoteAddress && typeof neighbor.lladdr === 'string'
            && Array.isArray(neighbor.state) && neighbor.state.some(state => reachableNeighborStates.has(state)));
    }
    catch {
        return false;
    }
}
async function ipJson(...args) {
    // Use the system binary and a bounded read-only lookup.
    const { stdout } = await run('/usr/sbin/ip', ['-j', '-6', ...args], { timeout: 250, maxBuffer: 16_384 });
    return JSON.parse(stdout);
}
//# sourceMappingURL=ipv6-on-link.js.map