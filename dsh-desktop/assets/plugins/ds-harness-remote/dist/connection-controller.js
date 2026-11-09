import { MAX_SECURE_MESSAGE_BYTES, createRpcError, encodeMessage, } from '@dsh-remote/protocol';
export class ConnectionController {
    identities;
    createRouter;
    logger;
    active = new Map();
    acceptQueue = Promise.resolve();
    constructor(identities, createRouter, logger) {
        this.identities = identities;
        this.createRouter = createRouter;
        this.logger = logger;
    }
    accept(channel) {
        const operation = this.acceptQueue.then(() => this.acceptOne(channel));
        this.acceptQueue = operation.catch(() => undefined);
        return operation;
    }
    async acceptOne(channel) {
        if (channel.security?.protocol !== 'Noise_IK_25519_ChaChaPoly_SHA256'
            || channel.security.connectionId === ''
            || channel.security.membershipId === '') {
            await channel.close('SECURE_CHANNEL_FAILED');
            throw new ConnectionRejectedError('SECURE_CHANNEL_FAILED', 'The channel is missing its authenticated Noise or membership context.');
        }
        if (!this.identities.isTrusted(channel.peerDeviceId, channel.peerIdentityKey)) {
            await channel.close('PEER_IDENTITY_MISMATCH');
            throw new ConnectionRejectedError('PEER_IDENTITY_MISMATCH', 'The peer identity does not match local trust.');
        }
        const connectionId = channel.security.connectionId;
        const connectionConflict = this.active.get(connectionId);
        if (connectionConflict !== undefined && connectionConflict.channel.peerDeviceId !== channel.peerDeviceId) {
            await channel.close('SECURE_CHANNEL_FAILED');
            throw new ConnectionRejectedError('SECURE_CHANNEL_FAILED', 'The connection id is already bound to another peer.');
        }
        const replaced = [...this.active.values()].filter(connection => (connection.channel.peerDeviceId === channel.peerDeviceId
            || connection.channel.security.connectionId === connectionId));
        if (replaced.length > 0) {
            this.logger?.warn('replacing active peer connection', {
                peerDeviceId: shortId(channel.peerDeviceId),
                replacedCount: replaced.length,
                replacedPeerDeviceIds: replaced.map(connection => shortId(connection.channel.peerDeviceId)),
            });
        }
        await Promise.all(replaced.map(connection => this.disconnect(connection, 'CONNECTION_REPLACED')));
        const router = this.createRouter({ connectionId, peerDeviceId: channel.peerDeviceId }, message => this.sendTo(connectionId, channel, message));
        const connection = {
            channel,
            router,
            unsubscribe: () => undefined,
        };
        this.active.set(connectionId, connection);
        try {
            connection.unsubscribe = channel.onMessage(message => { void this.handle(connection, message); });
        }
        catch (error) {
            await this.disconnect(connection);
            throw error;
        }
        this.logger?.info('peer connection accepted', {
            peerDeviceId: shortId(channel.peerDeviceId),
            connectionId: shortId(connectionId),
            mode: channel.mode,
        });
    }
    isOnline() { return this.active.size > 0; }
    connectionCount() { return this.active.size; }
    peerDeviceIds() {
        return this.connectedPeers().map(peer => peer.deviceId);
    }
    connectedPeers() {
        const peers = [];
        const seen = new Set();
        for (const connection of this.active.values()) {
            const deviceId = connection.channel.peerDeviceId;
            if (seen.has(deviceId))
                continue;
            seen.add(deviceId);
            peers.push({
                deviceId,
                ...(connection.channel.mode === undefined ? {} : { mode: connection.channel.mode }),
            });
        }
        return peers;
    }
    peerDeviceId() {
        const peers = this.peerDeviceIds();
        return peers.length === 1 ? peers[0] : undefined;
    }
    connectionMode() {
        const connection = this.active.values().next().value;
        return connection?.channel.mode ?? (connection === undefined ? 'Disconnected' : 'Relay');
    }
    async send(message) {
        await Promise.all([...this.active.values()].map(connection => this.sendConnection(connection, message)));
    }
    async revoke(deviceId) {
        const revoked = [...this.active.values()].filter(connection => connection.channel.peerDeviceId === deviceId);
        await Promise.all(revoked.map(connection => this.disconnect(connection, 'DEVICE_REVOKED')));
    }
    async closeConnection(connectionId, code, detail) {
        const connection = this.active.get(connectionId);
        if (connection === undefined)
            return false;
        await this.disconnect(connection, code, detail);
        return true;
    }
    async close() {
        await this.acceptQueue;
        await Promise.all([...this.active.values()].map(connection => this.disconnect(connection)));
    }
    async handle(connection, message) {
        if (!this.isActive(connection))
            return;
        try {
            const response = await connection.router.handle(message);
            if (!this.isActive(connection))
                return;
            const outbound = encodeMessage(response).byteLength <= MAX_SECURE_MESSAGE_BYTES
                ? response
                : createRpcError(message.id, 'RESPONSE_TOO_LARGE', 'The Host response is too large for the secure Remote channel. Request a smaller page.', { maxBytes: MAX_SECURE_MESSAGE_BYTES }, true);
            await connection.channel.send(outbound);
        }
        catch (error) {
            this.logger?.warn('peer message handling failed; disconnecting', {
                peerDeviceId: shortId(connection.channel.peerDeviceId),
                reason: diagnosticReason(error),
            });
            await this.disconnect(connection);
        }
    }
    async sendTo(connectionId, channel, message) {
        const connection = this.active.get(connectionId);
        if (connection === undefined || connection.channel !== channel) {
            throw new Error('peer channel is not active');
        }
        await this.sendConnection(connection, message);
    }
    async sendConnection(connection, message) {
        if (!this.isActive(connection)) {
            throw new Error('peer channel is not active');
        }
        try {
            await connection.channel.send(message);
        }
        catch (error) {
            this.logger?.warn('peer send failed; disconnecting', {
                peerDeviceId: shortId(connection.channel.peerDeviceId),
                messageType: message.type,
                reason: diagnosticReason(error),
            });
            await this.disconnect(connection);
            throw error instanceof Error ? error : new Error('peer send failed', { cause: error });
        }
    }
    async disconnect(connection, code, detail) {
        if (!this.isActive(connection))
            return;
        this.active.delete(connection.channel.security.connectionId);
        connection.unsubscribe();
        try {
            await connection.router.closePeerStreams();
        }
        finally {
            await connection.channel.close(code);
        }
        this.logger?.info('peer connection disconnected', {
            peerDeviceId: shortId(connection.channel.peerDeviceId),
            connectionId: shortId(connection.channel.security.connectionId),
            code: code ?? 'closed',
            closedBy: detail?.closedBy ?? 'host',
            ...(detail?.retryable === undefined ? {} : { retryable: detail.retryable }),
        });
    }
    isActive(connection) {
        return this.active.get(connection.channel.security.connectionId) === connection;
    }
}
export class ConnectionRejectedError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
    }
}
function diagnosticReason(error) {
    const message = error instanceof Error ? error.message : String(error);
    return message.replace(/[\r\n]+/g, ' ').slice(0, 160) || 'Unknown peer connection failure.';
}
function shortId(value) { return value.length <= 12 ? value : `${value.slice(0, 8)}…${value.slice(-4)}`; }
//# sourceMappingURL=connection-controller.js.map