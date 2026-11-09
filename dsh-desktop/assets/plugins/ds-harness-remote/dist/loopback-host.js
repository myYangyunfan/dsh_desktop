import { request as httpRequest } from 'node:http';
import { WebSocket } from 'ws';
import { loopbackRequestSchema, LOOPBACK_CHUNK_BYTES, LOOPBACK_MAX_BODY_BYTES, LOOPBACK_MAX_WS_BYTES, LOOPBACK_MAX_CONNECTIONS } from '@dsh-remote/protocol';
import { RpcError } from './safe-error.js';
const HOP_HEADERS = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer',
    'transfer-encoding', 'upgrade', 'host', 'content-length', 'forwarded', 'x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto']);
/** Strip hop headers including names nominated by Connection. Never log header/body contents. */
export function cleanHeaders(headers) {
    const removed = new Set(HOP_HEADERS);
    for (const [name, value] of headers)
        if (name.toLowerCase() === 'connection') {
            for (const token of value.split(','))
                removed.add(token.trim().toLowerCase());
        }
    return headers.filter(([name]) => !removed.has(name.toLowerCase()) && !name.toLowerCase().startsWith('sec-websocket-'));
}
export function headerPairs(headers) {
    return Object.entries(headers).flatMap(([name, value]) => value === undefined ? []
        : (Array.isArray(value) ? value : [value]).map(item => [name, item]));
}
/** Per-peer HTTP/WS proxy to explicit IPv4 loopback ports; never a general TCP tunnel. */
export class LoopbackHost {
    onClose;
    handles = new Map();
    ports;
    closed = false;
    timer;
    constructor(getPorts, onClose) {
        this.onClose = onClose;
        this.ports = [...getPorts()];
        this.timer = setInterval(() => {
            for (const [id, handle] of this.handles)
                if (Date.now() - handle.touched > 60_000)
                    this.close(id);
        }, 10_000);
        this.timer.unref();
    }
    setPorts(ports) {
        this.ports = [...ports];
        const allowed = new Set(ports);
        for (const [id, handle] of this.handles)
            if (!allowed.has(handle.port))
                this.close(id);
    }
    async call(input) {
        if (this.closed)
            throw new RpcError('TRANSPORT_CLOSED', 'Preview connection closed.');
        const value = loopbackRequestSchema.parse(input);
        if (value.op === 'describe')
            return { ports: [...this.ports] };
        if (value.op === 'close') {
            this.close(value.id);
            return { closed: true };
        }
        if (value.op === 'http.open' || value.op === 'ws.open') {
            if (!this.ports.includes(value.port))
                throw new RpcError('LOOPBACK_PORT_DENIED', 'This preview port is not allowed. Add it to loopback.ports in the Host Remote settings and save the access settings. / 请在 Host Remote 设置中允许此预览端口并保存访问设置。');
            if (this.handles.has(value.id))
                throw new RpcError('REQUEST_CONFLICT', 'Preview handle is already in use.');
            if (this.handles.size >= LOOPBACK_MAX_CONNECTIONS)
                throw new RpcError('RATE_LIMITED', 'Too many active preview requests.');
            let openedHandle;
            try {
                const opening = value.op === 'http.open' ? this.openHttp(value) : this.openWs(value);
                openedHandle = this.handles.get(value.id);
                return await opening;
            }
            catch {
                this.close(value.id, openedHandle);
                throw new RpcError('LOOPBACK_UNAVAILABLE', 'The allowed loopback service did not respond. Check that it is running on the Host.');
            }
        }
        const handle = this.handles.get(value.id);
        if (handle === undefined)
            throw new RpcError('LOOPBACK_CLOSED', 'Preview request closed; reload the preview.');
        handle.touched = Date.now();
        if (value.op === 'http.read' && handle.kind === 'http') {
            if (handle.reading)
                throw new RpcError('REQUEST_CONFLICT', 'Only one preview read may be pending.');
            handle.reading = true;
            try {
                const response = handle.response;
                let chunk = response.read(Math.min(response.readableLength || LOOPBACK_CHUNK_BYTES, LOOPBACK_CHUNK_BYTES));
                if (chunk === null && !response.readableEnded && !response.destroyed) {
                    await new Promise((resolve, reject) => {
                        const timer = setTimeout(() => finish(new Error('timeout')), 20_000);
                        const ready = () => finish();
                        const fail = () => finish(new Error('closed'));
                        const finish = (error) => {
                            clearTimeout(timer);
                            response.off('readable', ready);
                            response.off('end', ready);
                            response.off('close', ready);
                            response.off('error', fail);
                            error === undefined ? resolve() : reject(error);
                        };
                        response.once('readable', ready);
                        response.once('end', ready);
                        response.once('close', ready);
                        response.once('error', fail);
                    });
                    if (this.handles.get(value.id) !== handle)
                        throw new Error('closed');
                    chunk = response.read(Math.min(response.readableLength || LOOPBACK_CHUNK_BYTES, LOOPBACK_CHUNK_BYTES));
                    // A short final chunk can be smaller than the requested read size.
                    if (chunk === null && response.readableLength > 0)
                        chunk = response.read(Math.min(response.readableLength, LOOPBACK_CHUNK_BYTES));
                }
                const done = chunk === null && (response.readableEnded || response.destroyed);
                if (done && !response.complete)
                    throw new Error('truncated');
                handle.total += chunk?.length ?? 0;
                if (handle.total > 64 * 1024 * 1024)
                    throw new Error('size');
                if (done)
                    this.close(value.id, handle);
                return { data: chunk?.toString('base64') ?? '', done };
            }
            catch {
                this.close(value.id, handle);
                throw new RpcError('LOOPBACK_READ_FAILED', 'Preview response ended or exceeded its limit; reload to retry.');
            }
            finally {
                handle.reading = false;
            }
        }
        if (handle.kind === 'ws') {
            if (value.op === 'ws.send') {
                const data = Buffer.from(value.data, 'base64');
                if (data.length > LOOPBACK_MAX_WS_BYTES || handle.socket.bufferedAmount > 1024 * 1024) {
                    this.close(value.id);
                    throw new RpcError('RATE_LIMITED', 'Preview WebSocket buffer exceeded its limit.');
                }
                await new Promise((resolve, reject) => handle.socket.send(data, { binary: value.binary }, error => error ? reject(new RpcError('LOOPBACK_CLOSED', 'Preview socket closed.')) : resolve()));
                return { sent: true };
            }
            if (value.op === 'ws.read') {
                if (handle.reading)
                    throw new RpcError('REQUEST_CONFLICT', 'Only one preview read may be pending.');
                handle.reading = true;
                try {
                    if (handle.messages.length === 0 && !handle.closed)
                        await new Promise(resolve => {
                            const timer = setTimeout(() => { handle.wake = undefined; resolve(); }, 20_000);
                            handle.wake = () => { clearTimeout(timer); handle.wake = undefined; resolve(); };
                        });
                    let bytes = 0;
                    const messages = [];
                    while (handle.messages.length > 0 && bytes < LOOPBACK_MAX_WS_BYTES) {
                        const message = handle.messages.shift();
                        bytes += message.data.length;
                        messages.push(message);
                    }
                    handle.bytes -= bytes;
                    const closed = handle.closed && handle.messages.length === 0;
                    if (closed)
                        this.close(value.id, handle);
                    return { messages, closed };
                }
                finally {
                    handle.reading = false;
                }
            }
        }
        throw new RpcError('INVALID_MESSAGE', 'Preview handle kind does not match the operation.');
    }
    closeAll() {
        if (this.closed)
            return;
        this.closed = true;
        clearInterval(this.timer);
        for (const id of this.handles.keys())
            this.close(id);
        this.onClose?.();
    }
    close(id, expected) {
        const handle = this.handles.get(id);
        // A cancelled operation may settle after this id has been reused.
        if (expected !== undefined && handle !== expected)
            return;
        this.handles.delete(id);
        if (handle?.kind === 'http') {
            handle.response?.destroy();
            handle.request.destroy();
        }
        if (handle?.kind === 'ws') {
            handle.closed = true;
            handle.messages = [];
            handle.bytes = 0;
            handle.wake?.();
            handle.socket.terminate();
        }
    }
    openHttp(value) {
        const body = value.body === undefined ? undefined : Buffer.from(value.body, 'base64');
        if ((body?.length ?? 0) > LOOPBACK_MAX_BODY_BYTES)
            throw new Error('body limit');
        return new Promise((resolve, reject) => {
            const headers = Object.fromEntries(cleanHeaders(value.headers));
            let handle;
            const request = httpRequest({ hostname: '127.0.0.1', port: value.port, method: value.method, path: value.path, headers,
                agent: false, maxHeaderSize: 32 * 1024 }, response => {
                if (this.handles.get(value.id) !== handle) {
                    response.destroy();
                    return;
                }
                handle.response = response;
                response.on('error', () => undefined);
                clearTimeout(timer);
                resolve({ status: response.statusCode ?? 502, headers: cleanHeaders(headerPairs(response.headers)) });
            });
            const timer = setTimeout(() => { request.destroy(); reject(new Error('timeout')); }, 20_000);
            request.on('error', () => { clearTimeout(timer); reject(new Error('upstream')); });
            handle = { kind: 'http', port: value.port, request, reading: false, total: 0, touched: Date.now() };
            this.handles.set(value.id, handle);
            request.end(body);
        });
    }
    openWs(value) {
        return new Promise((resolve, reject) => {
            const socket = new WebSocket(`ws://127.0.0.1:${value.port}${value.path}`, value.protocols, {
                headers: Object.fromEntries(cleanHeaders(value.headers)), followRedirects: false,
                handshakeTimeout: 15_000, maxPayload: LOOPBACK_MAX_WS_BYTES, perMessageDeflate: false,
            });
            const handle = { kind: 'ws', port: value.port, socket, messages: [], bytes: 0, reading: false, closed: false, touched: Date.now() };
            this.handles.set(value.id, handle);
            socket.once('open', () => resolve({ protocol: socket.protocol }));
            socket.on('message', (data, binary) => {
                if (handle.closed)
                    return;
                const message = { data: Buffer.from(data).toString('base64'), binary };
                if (handle.bytes + message.data.length > 1024 * 1024 || handle.messages.length >= 256) {
                    this.close(value.id, handle);
                    return;
                }
                handle.messages.push(message);
                handle.bytes += message.data.length;
                handle.wake?.();
            });
            socket.on('close', () => { handle.closed = true; handle.wake?.(); reject(new Error('closed')); });
            socket.on('error', () => { handle.closed = true; handle.wake?.(); reject(new Error('upstream')); });
        });
    }
}
//# sourceMappingURL=loopback-host.js.map