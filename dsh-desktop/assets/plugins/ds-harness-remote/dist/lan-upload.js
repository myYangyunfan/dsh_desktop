import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { WebSocket, WebSocketServer } from 'ws';
import { NoiseIkSession } from '@dsh-remote/crypto';
import { LAN_UPLOAD_TICKET_MS, BINARY_UPLOAD_CHUNK_BYTES, SecureMessageCodec, createLanUploadPrologue, createRpcError, createRpcResponse, decodeMessage, encodeMessage, isLanUploadAddress, lanUploadRequestSchema, } from '@dsh-remote/protocol';
import { RpcError, safeErrorCode } from './safe-error.js';
/** One authenticated control connection owns every listener, ticket and upload below. */
export class LanUploadHost {
    upload;
    owner;
    localAddresses;
    closed = false;
    entries = new Set();
    constructor(upload, owner, localAddresses = () => Object.values(networkInterfaces()).flatMap(list => list ?? []).filter(a => a.family === 'IPv4' && !a.internal).map(a => a.address)) {
        this.upload = upload;
        this.owner = owner;
        this.localAddresses = localAddresses;
    }
    async open(input) {
        const p = lanUploadRequestSchema.parse(input);
        if (!this.live() || !isLanUploadAddress(p.address) || !this.localAddresses().includes(p.address)
            || this.entries.size >= 2)
            throw unavailable();
        if ([...this.entries].some(e => e.uploadId === p.uploadId))
            throw unavailable();
        const server = createServer((_request, response) => { response.writeHead(404).end(); });
        server.maxConnections = 4;
        server.headersTimeout = 5_000;
        server.requestTimeout = 5_000;
        server.keepAliveTimeout = 1_000;
        // Neither HTTP nor WebSocket compression is used. Only small Noise ciphertexts cross this socket.
        const wss = new WebSocketServer({ noServer: true, maxPayload: 65535, perMessageDeflate: false });
        const entry = { server, wss, sessionId: p.sessionId, uploadId: p.uploadId, used: false, opened: false, committed: false, disposed: false, queuedBytes: 0, requests: 0 };
        this.entries.add(entry);
        try {
            await new Promise((resolve, reject) => {
                entry.rejectBinding = () => reject(unavailable());
                server.once('error', reject);
                server.listen(0, p.address, () => { server.off('error', reject); entry.rejectBinding = undefined; if (entry.disposed) {
                    server.close();
                    reject(unavailable());
                }
                else
                    resolve(); });
            });
            if (!this.live() || entry.disposed)
                throw unavailable();
            const address = server.address();
            if (!address || typeof address === 'string')
                throw unavailable();
            const token = randomBytes(32).toString('base64url');
            const path = `/ds-harness-remote/upload/${token}`;
            const offer = { sessionId: p.sessionId, uploadId: p.uploadId, connectionId: this.owner.connectionId,
                url: `ws://${p.address}:${address.port}${path}`, expiresInMs: LAN_UPLOAD_TICKET_MS };
            entry.timer = setTimeout(() => { void this.dispose(entry); }, LAN_UPLOAD_TICKET_MS);
            entry.timer.unref();
            server.on('error', () => { void this.dispose(entry); });
            server.on('upgrade', (request, socket, head) => {
                if (!this.live() || entry.disposed || entry.used || request.url !== path) {
                    socket.destroy();
                    return;
                }
                entry.used = true;
                clearTimeout(entry.timer);
                // Consume once at upgrade. A stolen ticket cannot authenticate as the bound peer.
                try {
                    wss.handleUpgrade(request, socket, head, ws => this.attach(entry, offer, ws));
                }
                catch {
                    socket.destroy();
                    void this.dispose(entry);
                }
            });
            return offer;
        }
        catch (error) {
            await this.dispose(entry);
            throw error instanceof RpcError ? error : unavailable();
        }
    }
    async closeAll() {
        this.closed = true;
        await Promise.all([...this.entries].map(entry => this.dispose(entry)));
    }
    live() { return !this.closed && this.owner.mode() === 'LAN'; }
    attach(entry, offer, socket) {
        if (!this.live() || entry.disposed) {
            socket.terminate();
            return;
        }
        entry.socket = socket;
        socket.on('error', () => { void this.dispose(entry); });
        socket.on('close', () => { void this.dispose(entry); });
        const identity = this.owner.identity();
        const noise = new NoiseIkSession({ role: 'responder', localPrivateKey: identity.privateKey, localPublicKey: identity.publicKey,
            remotePublicKey: this.owner.peerIdentityKey, prologue: createLanUploadPrologue(offer) });
        entry.noise = noise;
        const incoming = new SecureMessageCodec(), outgoing = new SecureMessageCodec();
        let tail = Promise.resolve();
        const send = async (message) => {
            for (const frame of outgoing.encode(encodeMessage(message))) {
                if (!this.live() || entry.disposed || socket.readyState !== WebSocket.OPEN)
                    throw unavailable();
                await new Promise((resolve, reject) => socket.send(noise.encrypt(frame), { binary: true }, error => error ? reject(error) : resolve()));
            }
        };
        const touch = () => {
            clearTimeout(entry.timer);
            entry.timer = setTimeout(() => { void this.dispose(entry); }, 120_000);
            entry.timer.unref();
        };
        entry.handshakeTimer = setTimeout(() => { void this.dispose(entry); }, 5_000);
        entry.handshakeTimer.unref();
        socket.on('message', (raw, binary) => {
            try {
                if (!binary || !this.live() || entry.disposed)
                    throw unavailable();
                const bytes = raw instanceof Buffer ? raw : Buffer.from(raw);
                if (!noise.complete) {
                    noise.readHandshake(bytes);
                    socket.send(noise.writeHandshake(), { binary: true });
                    clearTimeout(entry.handshakeTimer);
                    touch();
                    return;
                }
                const data = incoming.decode(noise.decrypt(bytes));
                if (!data)
                    return;
                if (data.byteLength > BINARY_UPLOAD_CHUNK_BYTES + 8192 || entry.queuedBytes + data.byteLength > 2 * 1024 * 1024 || entry.requests >= 8)
                    throw unavailable();
                const message = decodeMessage(data);
                const payload = message.payload;
                const params = payload?.params;
                if (message.type !== 'rpc.request' || !params || params.sessionId !== entry.sessionId || params.uploadId !== entry.uploadId
                    || !['workspace.upload.open', 'workspace.upload.chunk.binary', 'workspace.upload.commit', 'workspace.upload.abort'].includes(String(payload.method)))
                    throw unavailable();
                entry.queuedBytes += data.byteLength;
                entry.requests++;
                touch();
                tail = tail.then(async () => {
                    if (!this.live() || entry.disposed)
                        return;
                    const method = payload.method;
                    try {
                        if (entry.committed || (method === 'workspace.upload.open' ? entry.opened || params.encoding !== 'binary-v1' : !entry.opened))
                            throw unavailable();
                        // Mark before awaiting: disconnect must clean an open whose reply never arrived.
                        if (method === 'workspace.upload.open')
                            entry.opened = true;
                        const result = await this.upload.call(method, params);
                        if (method === 'workspace.upload.commit')
                            entry.committed = true;
                        await send(createRpcResponse(message.id, result));
                    }
                    catch (error) {
                        await send(createRpcError(message.id, safeErrorCode(error), 'The LAN upload could not be completed.')).catch(() => undefined);
                        await this.dispose(entry);
                    }
                    finally {
                        entry.queuedBytes -= data.byteLength;
                        entry.requests--;
                    }
                }).catch(() => { void this.dispose(entry); });
            }
            catch {
                void this.dispose(entry);
            }
        });
    }
    async dispose(entry) {
        if (entry.disposed)
            return;
        entry.disposed = true;
        entry.rejectBinding?.();
        entry.rejectBinding = undefined;
        this.entries.delete(entry);
        clearTimeout(entry.timer);
        clearTimeout(entry.handshakeTimer);
        entry.socket?.terminate();
        entry.noise?.destroy();
        for (const socket of entry.wss.clients)
            socket.terminate();
        entry.wss.close();
        entry.server.closeAllConnections();
        entry.server.close();
        // Publication is final even if the commit acknowledgement was lost.
        if (entry.opened && !entry.committed)
            await this.upload.call('workspace.upload.abort', { sessionId: entry.sessionId, uploadId: entry.uploadId }).catch(() => undefined);
    }
}
function unavailable() { return new RpcError('FEATURE_NOT_SUPPORTED', 'LAN upload is unavailable on this connection.'); }
//# sourceMappingURL=lan-upload.js.map