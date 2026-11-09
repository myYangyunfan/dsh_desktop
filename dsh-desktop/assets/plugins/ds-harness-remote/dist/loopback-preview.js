import { randomBytes, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { LOOPBACK_MAX_BODY_BYTES, LOOPBACK_MAX_WS_BYTES } from '@dsh-remote/protocol';
import { cleanHeaders, headerPairs } from './loopback-host.js';
import { RpcError } from './safe-error.js';
/** One unpredictable origin per upstream port. Only the local machine can reach this listener. */
export class LoopbackPreview {
    client;
    servers = new Map();
    sockets = new Set();
    lifetime = new AbortController();
    constructor(client) {
        this.client = client;
    }
    async open(port) {
        if (!Number.isInteger(port) || port < 1024 || port > 65535)
            throw new RpcError('INVALID_MESSAGE', 'Enter a port between 1024 and 65535.');
        this.lifetime.signal.throwIfAborted();
        const description = await this.client.rpc('loopback.call', { op: 'describe' }, this.lifetime.signal);
        if (!description.ports.includes(port))
            throw new RpcError('LOOPBACK_PORT_DENIED', 'Allow this port in the Host Remote settings (loopback.ports), then save the access settings. / 请在 Host Remote 设置中允许此端口，然后保存访问设置。');
        let pending = this.servers.get(port);
        if (pending === undefined) {
            if (this.servers.size >= 16)
                throw new RpcError('RATE_LIMITED', 'Too many preview origins.');
            pending = this.start(port);
            this.servers.set(port, pending);
            void pending.catch(() => { this.servers.delete(port); });
        }
        return { url: (await pending).url };
    }
    async close() {
        this.lifetime.abort();
        for (const socket of this.sockets)
            socket.destroy();
        for (const pending of this.servers.values()) {
            const running = await pending.catch(() => undefined);
            if (running === undefined)
                continue;
            for (const client of running.ws.clients)
                client.terminate();
            running.ws.close();
            running.server.closeAllConnections();
            await new Promise(resolve => running.server.close(() => resolve()));
        }
        this.servers.clear();
    }
    async start(port) {
        const hostname = `dsh-${randomBytes(24).toString('hex')}.localhost`;
        let authority = '';
        const accepted = (req) => req.headers.host === authority
            && (req.headers.origin === undefined || req.headers.origin === `http://${authority}`)
            && req.headers['service-worker'] === undefined;
        const server = createServer((req, res) => {
            if (!accepted(req)) {
                res.writeHead(403);
                res.end('Preview origin denied.');
                return;
            }
            void this.http(port, authority, req, res);
        });
        server.requestTimeout = 30_000;
        server.headersTimeout = 15_000;
        server.maxHeadersCount = 64;
        server.on('connection', socket => {
            if (this.sockets.size >= 64 || this.lifetime.signal.aborted) {
                socket.destroy();
                return;
            }
            this.sockets.add(socket);
            socket.on('close', () => this.sockets.delete(socket));
        });
        const selectedProtocols = new WeakMap();
        const ws = new WebSocketServer({ noServer: true, maxPayload: LOOPBACK_MAX_WS_BYTES, perMessageDeflate: false,
            handleProtocols: (_protocols, req) => selectedProtocols.get(req) || false });
        server.on('upgrade', (req, socket, head) => {
            if (!accepted(req)) {
                socket.destroy();
                return;
            }
            const id = randomUUID();
            const headers = this.headers(req, port);
            const protocols = (req.headers['sec-websocket-protocol'] ?? '').split(',').map(item => item.trim()).filter(Boolean);
            void this.client.rpc('loopback.call', { op: 'ws.open', id, port, path: req.url ?? '/', headers, protocols }, this.lifetime.signal)
                .then(result => {
                if (socket.destroyed || this.lifetime.signal.aborted) {
                    socket.destroy();
                    void this.release(id);
                    return;
                }
                selectedProtocols.set(req, result.protocol);
                ws.handleUpgrade(req, socket, head, local => this.websocket(id, local));
            }).catch(() => { socket.destroy(); void this.release(id); });
        });
        await new Promise((resolve, reject) => {
            server.once('error', reject);
            server.listen(0, '127.0.0.1', () => { server.off('error', reject); resolve(); });
        });
        const address = server.address();
        if (address === null || typeof address === 'string') {
            server.close();
            throw new Error('Preview listener unavailable');
        }
        authority = `${hostname}:${address.port}`;
        if (this.lifetime.signal.aborted) {
            server.close();
            ws.close();
            throw new Error('Preview closed');
        }
        return { server, ws, url: `http://${authority}/` };
    }
    headers(req, port) {
        return cleanHeaders(headerPairs(req.headers)).filter(([name]) => !['origin', 'referer'].includes(name.toLowerCase()))
            .concat(req.headers.origin === undefined ? [] : [['origin', `http://127.0.0.1:${port}`]]);
    }
    async http(port, authority, req, res) {
        const id = randomUUID();
        const controller = new AbortController();
        const abort = () => { controller.abort(); void this.release(id); };
        res.once('close', abort);
        const signal = AbortSignal.any([controller.signal, this.lifetime.signal]);
        try {
            const chunks = [];
            let length = 0;
            for await (const chunk of req) {
                length += chunk.length;
                if (length > LOOPBACK_MAX_BODY_BYTES)
                    throw new RpcError('PAYLOAD_TOO_LARGE', 'Preview request body is limited to 1 MiB.');
                chunks.push(chunk);
            }
            const head = await this.client.rpc('loopback.call', { op: 'http.open', id, port,
                path: req.url ?? '/', method: req.method ?? 'GET', headers: this.headers(req, port),
                ...(length === 0 ? {} : { body: Buffer.concat(chunks).toString('base64') }) }, signal);
            const headers = {};
            for (let [name, value] of cleanHeaders(head.headers)) {
                name = name.toLowerCase();
                if (name === 'location') {
                    const url = new URL(value, `http://127.0.0.1:${port}/`);
                    if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || Number(url.port || 80) !== port || url.protocol !== 'http:') {
                        throw new Error('Redirect is outside the authorized preview service');
                    }
                    value = `http://${authority}${url.pathname}${url.search}${url.hash}`;
                }
                if (name === 'set-cookie') {
                    // Each preview has a separate cookie host; never widen cookies to .localhost.
                    value = value.replace(/;\s*domain=[^;]*/ig, '');
                    const existing = headers[name];
                    headers[name] = [...(Array.isArray(existing) ? existing : []), value];
                }
                else if (!['service-worker-allowed', 'clear-site-data', 'alt-svc'].includes(name))
                    headers[name] = value;
            }
            headers['referrer-policy'] = 'no-referrer';
            res.writeHead(head.status, headers);
            while (!signal.aborted) {
                const chunk = await this.client.rpc('loopback.call', { op: 'http.read', id }, signal);
                if (chunk.data !== '' && !res.write(Buffer.from(chunk.data, 'base64'))) {
                    await new Promise((resolve, reject) => {
                        const ready = () => { cleanup(); resolve(); };
                        const closed = () => { cleanup(); reject(new Error('closed')); };
                        const cleanup = () => { res.off('drain', ready); res.off('close', closed); };
                        res.once('drain', ready);
                        res.once('close', closed);
                    });
                }
                if (chunk.done)
                    break;
            }
            res.end();
        }
        catch {
            if (!res.headersSent) {
                res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
                res.end('Remote preview unavailable. Check the Host service and connection, then reload.');
            }
            else
                res.destroy();
        }
        finally {
            res.off('close', abort);
            await this.release(id);
        }
    }
    websocket(id, socket) {
        let input = Promise.resolve();
        let queued = 0;
        let count = 0;
        const controller = new AbortController();
        const signal = AbortSignal.any([controller.signal, this.lifetime.signal]);
        const close = () => { controller.abort(); socket.terminate(); void this.release(id); };
        socket.on('error', close);
        socket.on('close', close);
        socket.on('message', (data, binary) => {
            const bytes = Buffer.from(data);
            queued += bytes.length;
            count += 1;
            if (queued > 1024 * 1024 || count > 256) {
                close();
                return;
            }
            input = input.then(async () => {
                await this.client.rpc('loopback.call', { op: 'ws.send', id, data: bytes.toString('base64'), binary }, signal);
                queued -= bytes.length;
                count -= 1;
            }).catch(close);
        });
        void (async () => {
            try {
                while (!signal.aborted) {
                    const result = await this.client.rpc('loopback.call', { op: 'ws.read', id }, signal);
                    for (const message of result.messages) {
                        if (socket.bufferedAmount > 1024 * 1024)
                            throw new Error('slow preview');
                        await new Promise((resolve, reject) => socket.send(Buffer.from(message.data, 'base64'), { binary: message.binary }, error => error ? reject(error) : resolve()));
                    }
                    if (result.closed)
                        break;
                }
            }
            catch { /* Closed channels must not reconnect or replay application messages. */ }
            finally {
                close();
            }
        })();
    }
    async release(id) {
        if (!this.lifetime.signal.aborted)
            await this.client.rpc('loopback.call', { op: 'close', id }).catch(() => undefined);
    }
}
//# sourceMappingURL=loopback-preview.js.map