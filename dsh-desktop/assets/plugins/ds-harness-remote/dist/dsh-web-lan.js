import { randomBytes, randomUUID } from 'node:crypto';
import { createServer, request } from 'node:http';
import { request as secureRequest } from 'node:https';
import { networkInterfaces } from 'node:os';
import { isIPv6 } from 'node:net';
import { dshWebLanOpenSchema, dshWebLanSessionSchema, isDshWebLanAddress } from '@dsh-remote/protocol';
import { openDshWebUpstream } from './dsh-web-upstream.js';
import { stripHopByHop } from './hostc/protocol/index.js';
import { fromRawHeaders, toLocalRequestHeaders, toPublicResponseHeaders } from './hostc/rewrite.js';
import { RpcError } from './safe-error.js';
const form = '<form method="post" action="/__remote/session"><input type="hidden" name="browserGrant"></form>';
const browserPage = form + `<script>
addEventListener('message', e => {
  if (!opener || e.source !== opener || e.data?.type !== 'dsh.web.grant' ||
      !/^[A-Za-z0-9_-]{43}$/.test(e.data.browserGrant)) return;
  document.forms[0].elements.browserGrant.value = e.data.browserGrant;
  window.opener = null;
  document.forms[0].submit();
});
opener?.postMessage('dsh.web.ready','*');
</script>`;
const pageHeaders = { 'cache-control': 'no-store', 'content-type': 'text/html; charset=utf-8',
    'referrer-policy': 'same-origin', 'content-security-policy': "default-src 'none'; script-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'" };
export class DshWebLanPeer {
    runtime;
    mode;
    address;
    lease;
    disposed = false;
    constructor(runtime, mode, address) {
        this.runtime = runtime;
        this.mode = mode;
        this.address = address;
    }
    available() { return !this.disposed && !!this.runtime(); }
    async listenAddress(pair) {
        const address = await this.address(pair).catch(() => undefined);
        if (!address || (pair ? address !== pair.hostAddress : this.mode() !== 'LAN' || !isDshWebLanAddress(address)))
            return;
        return Object.values(networkInterfaces()).flat().some(iface => iface?.address === address && (!iface.internal || address === '127.0.0.1')) ? address : undefined;
    }
    async onLan() { return this.available() && await this.listenAddress() !== undefined; }
    async open(params) {
        const { sameLinkIpv6Pair } = dshWebLanOpenSchema.parse(params);
        if (!this.available())
            throw new RpcError('FEATURE_NOT_SUPPORTED', 'LAN Web is unavailable.');
        this.lease?.abort.abort();
        const lease = { id: randomUUID(), abort: new AbortController() };
        this.lease = lease;
        const signal = lease.abort.signal;
        try {
            const address = await this.listenAddress(sameLinkIpv6Pair);
            signal.throwIfAborted();
            if (!address)
                throw new RpcError('FEATURE_NOT_SUPPORTED', 'LAN Web is unavailable.');
            const peerHostname = sameLinkIpv6Pair && new URL(`http://[${sameLinkIpv6Pair.peerAddress}]`).hostname;
            const upstream = await openDshWebUpstream(this.runtime, AbortSignal.any([signal, AbortSignal.timeout(5000)]));
            signal.throwIfAborted();
            let ticket = randomBytes(32).toString('base64url');
            const expiresAt = Date.now() + 30_000;
            const cookie = 'dsh_lan_' + lease.id.replaceAll('-', '') + '=' + randomBytes(32).toString('base64url');
            let redeemed = false;
            let origin;
            const live = () => {
                try {
                    return !signal.aborted && (sameLinkIpv6Pair ? ['LAN', 'P2P'].includes(String(this.mode())) : this.mode() === 'LAN') &&
                        upstream.isCurrent() &&
                        Date.now() < (redeemed ? expiresAt + 30 * 60_000 : expiresAt);
                }
                catch {
                    return false;
                }
            };
            const owns = (req) => {
                if (!live() || req.headers.host !== origin.host)
                    return false;
                if (!peerHostname)
                    return true;
                const peer = req.socket.remoteAddress;
                return peer !== undefined && isIPv6(peer) && new URL(`http://[${peer}]`).hostname === peerHostname;
            };
            const authorized = (req) => owns(req) && redeemed &&
                req.headers.cookie?.split(';').some(part => part.trim() === cookie);
            const sockets = new Set();
            function track(socket) {
                sockets.add(socket);
                socket.once('close', () => sockets.delete(socket));
                socket.on('error', () => socket.destroy());
            }
            function proxy(req, res, socket, head) {
                const candidate = upstream.authorize({ path: req.url ?? '', method: req.method ?? '',
                    headers: fromRawHeaders(req.rawHeaders), body: true }, origin);
                if (!candidate || ((socket || !['GET', 'HEAD', 'OPTIONS'].includes(candidate.method)) && req.headers.origin !== origin.origin)) {
                    if (res)
                        res.writeHead(403).end();
                    else
                        socket?.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
                    return;
                }
                const target = upstream.target;
                const headers = toLocalRequestHeaders(stripHopByHop(candidate.headers, ['x-dsh-web-grant']), origin.origin, target);
                if (socket)
                    headers.push(['connection', 'Upgrade'], ['upgrade', 'websocket']);
                const outgoing = (target.protocol === 'https:' ? secureRequest : request)(target, {
                    path: candidate.path, method: candidate.method, headers: headers.flat(), signal, agent: false,
                });
                const cancel = () => outgoing.destroy();
                res?.once('close', cancel);
                socket?.once('close', cancel);
                outgoing.on('error', () => {
                    if (res && !res.headersSent)
                        res.writeHead(502).end();
                    else
                        res?.destroy();
                    socket?.destroy();
                });
                outgoing.on('response', response => {
                    if (!res) {
                        response.destroy();
                        socket?.end('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n');
                        return;
                    }
                    const headers = toPublicResponseHeaders(upstream.stripResponseHeaders(stripHopByHop(fromRawHeaders(response.rawHeaders), ['cache-control'])), origin.origin, target);
                    res.writeHead(response.statusCode ?? 502, [...headers.flat(), 'cache-control', 'no-store']);
                    response.on('error', () => res.destroy()).pipe(res);
                });
                outgoing.on('upgrade', (response, remote, first) => {
                    if (!socket || socket.destroyed || !live()) {
                        remote.destroy();
                        socket?.destroy();
                        return;
                    }
                    track(remote);
                    const headers = upstream.stripResponseHeaders(stripHopByHop(fromRawHeaders(response.rawHeaders)));
                    socket.write('HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n' +
                        headers.map(([k, v]) => k + ': ' + v + '\r\n').join('') + '\r\n');
                    if (first.length)
                        socket.write(first);
                    if (head?.length)
                        remote.write(head);
                    remote.once('close', () => socket.destroy());
                    socket.once('close', () => remote.destroy());
                    remote.pipe(socket).pipe(remote);
                });
                if (socket)
                    outgoing.end();
                else
                    req.pipe(outgoing);
            }
            const handleRequest = async (req, res) => {
                const deny = () => res.writeHead(401, pageHeaders).end();
                if (!owns(req)) {
                    deny();
                    return;
                }
                if (req.method === 'GET' && req.url === '/__remote/lan-status') {
                    if (!authorized(req)) {
                        deny();
                        return;
                    }
                    res.writeHead(204, { 'cache-control': 'no-store', 'x-dsh-web-lan': '1' }).end();
                    return;
                }
                if (req.method === 'GET' && (req.url === '/__remote/browser' || req.url === '/__remote/launch')) {
                    res.writeHead(401, pageHeaders).end(req.url.endsWith('browser') ? browserPage : form);
                    return;
                }
                const bootstrap = req.method === 'GET' && req.url === '/__remote/session-bootstrap';
                if (bootstrap || (req.method === 'POST' && req.url === '/__remote/session')) {
                    let input = req.headers['x-dsh-web-grant'];
                    if (!bootstrap) {
                        if (req.headers.origin !== origin.origin || req.headers['content-type']?.split(';')[0] !== 'application/x-www-form-urlencoded') {
                            deny();
                            return;
                        }
                        let body = '';
                        try {
                            for await (const part of req) {
                                if (body.length + part.length > 256) {
                                    deny();
                                    return;
                                }
                                body += part.toString();
                            }
                        }
                        catch {
                            res.destroy();
                            return;
                        }
                        input = new URLSearchParams(body).get('browserGrant') ?? '';
                    }
                    if (!owns(req) || redeemed || Date.now() >= expiresAt || !ticket || input !== ticket) {
                        deny();
                        return;
                    }
                    redeemed = true;
                    ticket = '';
                    res.writeHead(303, { ...pageHeaders, location: '/', 'set-cookie': cookie + '; Path=/; Max-Age=1800; HttpOnly; SameSite=Strict' }).end();
                    return;
                }
                if (!authorized(req)) {
                    deny();
                    return;
                }
                proxy(req, res);
            };
            const server = createServer((req, res) => {
                void handleRequest(req, res).catch(() => { if (!res.destroyed)
                    res.destroy(); });
            });
            server.maxConnections = 64;
            server.requestTimeout = 30_000;
            server.on('connection', track);
            server.on('upgrade', (req, socket, head) => {
                if (!authorized(req)) {
                    socket.end('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
                    return;
                }
                if (req.headers.upgrade?.toLowerCase() !== 'websocket') {
                    socket.destroy();
                    return;
                }
                proxy(req, undefined, socket, head);
            });
            let checkingPath = false;
            const timer = setInterval(() => {
                if (!live()) {
                    lease.abort.abort();
                    return;
                }
                if (checkingPath)
                    return;
                checkingPath = true;
                void this.address(sameLinkIpv6Pair).then(current => {
                    if (current !== address)
                        lease.abort.abort();
                }, () => lease.abort.abort()).finally(() => { checkingPath = false; });
            }, 1000).unref();
            signal.addEventListener('abort', () => {
                clearInterval(timer);
                server.close();
                for (const socket of sockets)
                    socket.destroy();
            }, { once: true });
            await new Promise((resolve, reject) => {
                const cancelled = () => reject(new Error('LAN Web closed'));
                signal.addEventListener('abort', cancelled, { once: true });
                server.once('error', (error) => {
                    // The selected interface can disappear between ICE validation and bind.
                    reject(error.code === 'EADDRNOTAVAIL' ? new RpcError('FEATURE_NOT_SUPPORTED', 'LAN Web is unavailable.') : error);
                });
                server.listen({ host: address, port: 0, signal }, () => {
                    signal.removeEventListener('abort', cancelled);
                    resolve();
                });
            });
            const bound = server.address();
            if (!live() || !bound || typeof bound === 'string')
                throw new Error('LAN Web unavailable');
            origin = new URL(`http://${sameLinkIpv6Pair ? `[${address}]` : address}:${bound.port}`);
            return { sessionId: lease.id, url: origin.href, browserGrant: ticket, expiresAt };
        }
        catch (error) {
            lease.abort.abort();
            if (error instanceof RpcError && error.code === 'FEATURE_NOT_SUPPORTED')
                throw error;
            throw new RpcError('DSH_WEB_NOT_READY', 'LAN Web is unavailable.');
        }
    }
    close(params) {
        if (dshWebLanSessionSchema.parse(params).sessionId === this.lease?.id)
            this.lease.abort.abort();
        return { closed: true };
    }
    dispose() { this.disposed = true; this.lease?.abort.abort(); }
}
//# sourceMappingURL=dsh-web-lan.js.map