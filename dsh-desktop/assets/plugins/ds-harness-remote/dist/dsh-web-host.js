import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { dshWebGrantSchema } from '@dsh-remote/protocol';
import { z } from 'zod';
import { Connection } from './hostc/connection.js';
import { TunnelError } from './hostc/api.js';
import { CLOSE_REPLACED, CLOSE_SHUTDOWN } from './hostc/protocol/index.js';
import { RpcError } from './safe-error.js';
import { ServerApiError } from './server-api.js';
import { openDshWebUpstream } from './dsh-web-upstream.js';
export { authorizeUpstream } from './dsh-web-upstream.js';
const allocationSchema = z.object({
    sessionId: z.string().regex(/^[pt][abcdefghijkmnpqrstuvwxyz23456789]{11}$/),
    url: z.url(),
    connectUrl: z.url(),
    connectToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    leaseExpiresAt: z.number().int().positive(),
}).strict();
export class DshWebPeer {
    api;
    peer;
    resolveRuntime;
    active;
    opening;
    openingStop;
    closing;
    lifetime = new AbortController();
    constructor(api, peer, resolveRuntime) {
        this.api = api;
        this.peer = peer;
        this.resolveRuntime = resolveRuntime;
    }
    available() {
        try {
            return this.resolveRuntime() !== undefined;
        }
        catch {
            return false;
        }
    }
    open() {
        if (this.opening && !this.openingStop?.signal.aborted)
            return this.opening;
        const priorOpening = this.opening;
        const priorClose = this.closing;
        const stop = new AbortController();
        this.openingStop = stop;
        const promise = (async () => {
            await priorClose;
            await priorOpening?.catch(() => undefined);
            if (stop.signal.aborted || this.lifetime.signal.aborted) {
                throw new RpcError('TUNNEL_UNAVAILABLE', 'The DSH Web tunnel could not be opened.', undefined, true);
            }
            return await this.start(stop.signal);
        })().finally(() => {
            if (this.opening === promise) {
                this.opening = undefined;
                this.openingStop = undefined;
            }
        });
        this.opening = promise;
        return promise;
    }
    close() {
        this.openingStop?.abort();
        const priorClose = this.closing;
        const opening = this.opening;
        const run = (async () => {
            await priorClose;
            await this.closeActive();
            await opening?.catch(() => undefined);
            await this.closeActive();
        })().finally(() => {
            if (this.closing === run)
                this.closing = undefined;
        });
        this.closing = run;
        return run;
    }
    async closeActive() {
        const active = this.active;
        this.active = undefined;
        if (active === undefined)
            return;
        active.stop.abort();
        active.connector?.close(CLOSE_SHUTDOWN, 'session closed');
        await this.api.closeDshWeb(active.id).catch(() => undefined);
    }
    async dispose() {
        this.lifetime.abort();
        await this.close();
    }
    async start(openingSignal) {
        await this.closeActive();
        const signal = AbortSignal.any([this.lifetime.signal, openingSignal, AbortSignal.timeout(21_000)]);
        const startedAt = Date.now();
        const input = { ...this.peer, requestId: randomUUID(), leaseExpiresAt: startedAt + 9 * 60_000 };
        // Old Servers ignore the opt-in and honor the legacy nine-minute request.
        const maxLeaseExpiresAt = startedAt + 120 * 60_000;
        try {
            signal.throwIfAborted();
            const upstream = await openDshWebUpstream(this.resolveRuntime, signal);
            const allocation = allocationSchema.parse(await this.api.dshWebRequest('allocate', { ...input, useServerLease: true }, signal));
            const publicUrl = new URL(allocation.url);
            const dial = new URL(allocation.connectUrl);
            const lease = { id: allocation.sessionId, stop: new AbortController(), request: { ...input, leaseExpiresAt: allocation.leaseExpiresAt } };
            this.active = lease;
            if (dial.protocol !== 'wss:' || dial.port || dial.href !== `wss://${dial.hostname}/api/tunnels/${lease.id}/connect`
                || publicUrl.href !== `https://${lease.id}.${dial.hostname}/`
                || lease.request.leaseExpiresAt <= Date.now() || lease.request.leaseExpiresAt > maxLeaseExpiresAt) {
                throw new RpcError('TUNNEL_UNAVAILABLE', 'The Server returned an invalid tunnel.');
            }
            const listenSignal = AbortSignal.any([signal, lease.stop.signal]);
            const connect = connectSignal => Connection.open({
                tunnel: { id: lease.id, url: publicUrl.href, connectUrl: dial.href, token: allocation.connectToken },
                target: upstream.target,
                authorize: request => {
                    if (lease.stop.signal.aborted || Date.now() >= lease.request.leaseExpiresAt)
                        return;
                    return upstream.authorize(request, publicUrl);
                },
                stripResponseHeaders: upstream.stripResponseHeaders,
                onRequest: () => undefined,
            }, connectSignal);
            await attachConnector(lease, connect, listenSignal);
            const result = dshWebGrantSchema.parse(await this.api.dshWebRequest('grant', lease.request, listenSignal));
            if (result.url !== publicUrl.href || result.expiresAt <= Date.now() || result.expiresAt > lease.request.leaseExpiresAt)
                throw new RpcError('TUNNEL_UNAVAILABLE', 'The Server returned an invalid browser grant.');
            listenSignal.throwIfAborted();
            void this.monitor(lease, connect);
            return result;
        }
        catch (error) {
            await this.closeActive();
            if (error instanceof RpcError)
                throw error;
            if (error instanceof ServerApiError && ['WEB_ENTITLEMENT_REQUIRED', 'MEMBERSHIP_REQUIRED', 'CONNECTION_NOT_FOUND'].includes(error.code))
                throw new RpcError(error.code, 'The Server did not authorize DSH Web access.');
            throw new RpcError('TUNNEL_UNAVAILABLE', 'The DSH Web tunnel could not be opened.', undefined, true);
        }
    }
    async monitor(lease, connect) {
        const timer = setTimeout(() => { if (this.active === lease)
            void this.closeActive(); }, Math.max(0, lease.request.leaseExpiresAt - Date.now()));
        timer.unref();
        try {
            while (this.active === lease && lease.connector) {
                const closed = await waitForCheck(lease.connector, lease.stop.signal);
                if (this.active !== lease)
                    return;
                if (closed?.code === CLOSE_REPLACED || closed?.code === CLOSE_SHUTDOWN)
                    break;
                await this.api.dshWebRequest('check', lease.request, lease.stop.signal, lease.id);
                if (closed) {
                    await attachConnector(lease, connect, lease.stop.signal);
                }
            }
        }
        catch { /* Authorization or reconnect failed. Close the lease. */ }
        finally {
            clearTimeout(timer);
            if (this.active === lease)
                await this.closeActive();
        }
    }
}
async function attachConnector(lease, dial, signal) {
    for (const retryDelay of [200, 500, undefined]) {
        signal.throwIfAborted();
        try {
            const connector = await dial(signal);
            if (signal.aborted) {
                connector.close(CLOSE_SHUTDOWN, 'session closed');
                signal.throwIfAborted();
            }
            lease.connector = connector;
            return;
        }
        catch (error) {
            signal.throwIfAborted();
            // Reuse the allocation. Authorization and protocol errors require a new open.
            if (retryDelay === undefined || !(error instanceof TunnelError) || error.code !== 'network_error')
                throw error;
            await sleep(retryDelay, undefined, { signal });
        }
    }
}
async function waitForCheck(connector, signal) {
    let timer;
    let onAbort;
    try {
        return await Promise.race([connector.closed, new Promise(resolve => {
                onAbort = () => resolve(undefined);
                signal.addEventListener('abort', onAbort, { once: true });
                timer = setTimeout(onAbort, 120_000);
                timer.unref();
            })]);
    }
    finally {
        clearTimeout(timer);
        if (onAbort)
            signal.removeEventListener('abort', onAbort);
    }
}
//# sourceMappingURL=dsh-web-host.js.map