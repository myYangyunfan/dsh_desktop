import { waitForRelayCapacity, SerialSend, ControlLease } from '@dsh-remote/webrtc';
import { NoiseIkSession, createNoisePrologue, fromBase64Url, toBase64Url, } from '@dsh-remote/crypto';
import { DEFAULT_HEARTBEAT_INTERVAL_MS, PROTOCOL_VERSION, WEBRTC_RESUME_CAPABILITY, RELAY_RESUME_CAPABILITY, classifyControlClose, SecureMessageCodec, acceptNegotiatedCapabilities, createControlFrame, createRelayDataFrame, decodeControlFrame, decodeRelayDataFrame, decodeMessage, encodeControlFrame, encodeMessage, encodeRelayDataFrame, } from '@dsh-remote/protocol';
import { RtcDataChannelTransport, stunOnlyIceServers, } from '@dsh-remote/webrtc';
import { ServerApiError } from './server-api.js';
import { PLUGIN_VERSION } from './version.js';
const DEFAULT_WEBRTC_NEGOTIATE_TIMEOUT_MS = 12_000;
export class HostServerConnection {
    config;
    identity;
    identities;
    api;
    connections;
    logger;
    createWebSocket;
    rtcFactoryProvider;
    hostCapabilities;
    harnessVersion;
    socket;
    forceCloseSocket;
    running;
    stopped = true;
    online = false;
    retryWake;
    tunnels = new Map();
    terminalError;
    lastActiveAt;
    reconnectRequested = false;
    resumeQueued = false;
    authRecoveryAttempted = false;
    rtcFactory;
    negotiatedCapabilities = ['transport.relay'];
    controlFrameLimits = {};
    heartbeatIntervalMs = DEFAULT_HEARTBEAT_INTERVAL_MS;
    webRtcNegotiateTimeoutMs = DEFAULT_WEBRTC_NEGOTIATE_TIMEOUT_MS;
    constructor(config, identity, identities, api, connections, logger, createWebSocket = url => new WebSocket(url), rtcFactoryProvider, hostCapabilities = () => [], harnessVersion) {
        this.config = config;
        this.identity = identity;
        this.identities = identities;
        this.api = api;
        this.connections = connections;
        this.logger = logger;
        this.createWebSocket = createWebSocket;
        this.rtcFactoryProvider = rtcFactoryProvider;
        this.hostCapabilities = hostCapabilities;
        this.harnessVersion = harnessVersion;
    }
    start() {
        if (this.running !== undefined)
            return;
        this.stopped = false;
        this.running = this.run().finally(() => { this.running = undefined; });
    }
    resume() {
        this.terminalError = undefined;
        this.stopped = false;
        if (this.running === undefined) {
            this.start();
            return;
        }
        if (this.resumeQueued)
            return;
        this.resumeQueued = true;
        void this.running.finally(() => {
            this.resumeQueued = false;
            if (!this.stopped)
                this.start();
        });
    }
    async stop() {
        this.stopped = true;
        this.reconnectRequested = false;
        this.retryWake?.();
        this.retryWake = undefined;
        for (const tunnel of this.tunnels.values())
            this.notifyTunnelClosed(tunnel);
        if (this.forceCloseSocket)
            this.forceCloseSocket(1000, 'plugin stopped');
        else
            this.socket?.close(1000, 'plugin stopped');
        await this.running;
        await this.dropTunnels();
    }
    isOnline() { return this.online; }
    recoveryExpiresAt() {
        const remaining = [...this.tunnels.values()].flatMap(tunnel => {
            const ms = tunnel.lease?.remainingMs();
            return ms === undefined ? [] : [ms];
        });
        return remaining.length ? Date.now() + Math.min(...remaining) : undefined;
    }
    lastError() { return this.terminalError; }
    lastActivity() { return this.lastActiveAt; }
    isReconnecting() { return !this.online && !this.stopped && this.running !== undefined; }
    reconnect() {
        this.terminalError = undefined;
        this.stopped = false;
        if (this.running === undefined) {
            this.start();
            return;
        }
        this.reconnectRequested = true;
        this.retryWake?.();
        if (this.forceCloseSocket)
            this.forceCloseSocket(4000, 'manual reconnect');
        else
            this.socket?.close(4000, 'manual reconnect');
        void this.running.finally(() => {
            if (!this.reconnectRequested || this.stopped)
                return;
            this.reconnectRequested = false;
            this.start();
        });
    }
    async run() {
        this.authRecoveryAttempted = false;
        while (!this.stopped) {
            try {
                await this.connectOnce();
            }
            catch (error) {
                if (this.stopped)
                    return;
                const code = errorCode(error);
                if (code === 'CREDENTIALS_REFRESHED')
                    continue;
                this.terminalError = code;
                this.logger.warn('server control connection failed', {
                    code, retryable: isRetryable(error),
                    ...(error instanceof ServerApiError && error.phase !== undefined ? { phase: error.phase } : {}),
                    ...(error instanceof ServerApiError && error.status !== undefined ? { status: error.status } : {}),
                    ...(error instanceof ServerApiError && error.reason !== undefined ? { reason: error.reason } : {}),
                });
                if (code === 'UNSUPPORTED_VERSION') {
                    this.logger.warn('Server does not support the Remote protocol version; automatic reconnect is paused.');
                }
                if (TERMINAL_AUTH_ERRORS.has(code)) {
                    this.logger.warn(code === 'CONNECTION_REPLACED'
                        ? 'Another instance is using this Host identity. Stop it or use a separate DSH_HOME; automatic reconnect is paused.'
                        : code === 'SERVER_CREDENTIALS_BUSY'
                            ? 'Credential refresh is locked. Stop other instances; after a crash, stop all instances before removing server-credentials.json.refresh-lock and authorizing again.'
                            : 'Host authorization failed. Authorize this Host again from a Remote client or in Remote settings.');
                }
                if (code === 'DEVICE_REVOKED') {
                    try {
                        await this.api.clearAuthorization();
                    }
                    catch (clearError) {
                        this.logger.error('failed to clear revoked Host authorization', { code: errorCode(clearError) });
                    }
                }
                if (TERMINAL_AUTH_ERRORS.has(code) || code === 'UNSUPPORTED_VERSION') {
                    await this.dropTunnels();
                    return;
                }
                if (!this.config.reconnect.enabled)
                    return;
            }
            if (this.stopped)
                return;
            if (this.reconnectRequested) {
                this.reconnectRequested = false;
                continue;
            }
            if (!this.config.reconnect.enabled)
                return;
            // Every close, including the first, waits a full-jitter draw from
            // [0, maxDelayMs]. A restarted Server therefore gets the whole fleet
            // spread over the widest window, and an ordinary network drop cannot
            // turn into a tight reconnect loop either.
            await this.waitBeforeRetry();
            if (this.reconnectRequested) {
                this.reconnectRequested = false;
                continue;
            }
        }
    }
    async connectOnce() {
        const credentials = await this.api.authenticate(this.identity);
        if (this.stopped)
            return;
        const offeredCapabilities = this.rtcFactoryProvider === undefined || this.config.forceRelay
            ? [RELAY_RESUME_CAPABILITY, 'transport.relay', 'transport.relay.attach', ...this.hostCapabilities()]
            : [WEBRTC_RESUME_CAPABILITY, RELAY_RESUME_CAPABILITY, 'transport.lan', 'transport.p2p', 'transport.turn', 'transport.relay', 'transport.relay.attach', ...this.hostCapabilities()];
        const recoveryTickets = [...this.tunnels.values()].flatMap(tunnel => tunnel.lease?.recoveryTicket() ?? []).slice(0, 64);
        const socket = this.createWebSocket(websocketUrl(this.api.baseUrl));
        this.socket = socket;
        this.controlFrameLimits = {};
        this.heartbeatIntervalMs = DEFAULT_HEARTBEAT_INTERVAL_MS;
        let acknowledged = false;
        let retainOnClose = false;
        let invalidControl = false;
        let messageQueue = Promise.resolve();
        await new Promise((resolve, reject) => {
            let settled = false;
            let closing = false;
            let upgradeTimer;
            let helloTimer;
            let refreshTimer;
            let livenessTimer;
            const clearLiveness = () => {
                if (livenessTimer === undefined)
                    return;
                clearTimeout(livenessTimer);
                livenessTimer = undefined;
            };
            const finish = (error) => {
                if (settled)
                    return;
                settled = true;
                if (upgradeTimer !== undefined)
                    clearTimeout(upgradeTimer);
                if (helloTimer !== undefined)
                    clearTimeout(helloTimer);
                if (refreshTimer !== undefined)
                    clearTimeout(refreshTimer);
                clearLiveness();
                this.online = false;
                socket.onopen = socket.readyState === 0
                    ? () => {
                        socket.onopen = null;
                        try {
                            socket.close(1000, 'connection abandoned');
                        }
                        catch {
                            // Ignore close failures on an abandoned socket.
                        }
                        ;
                        socket.terminate?.();
                    }
                    : null;
                socket.onmessage = null;
                // Keep an inert error handler until the abandoned socket finishes closing
                // so asynchronous EventEmitter 'error' emissions on Node `ws` never throw.
                socket.onerror = () => undefined;
                socket.onclose = () => {
                    socket.onopen = null;
                    socket.onerror = null;
                    socket.onclose = null;
                };
                if (this.socket === socket) {
                    this.socket = undefined;
                    this.forceCloseSocket = undefined;
                }
                const preserve = this.config.reconnect.enabled && !this.stopped && !this.reconnectRequested
                    && (error === undefined ? retainOnClose : isRetryable(error)) && !invalidControl && !TERMINAL_AUTH_ERRORS.has(this.terminalError ?? '')
                    && [...this.tunnels.values()].some(tunnel => tunnel.lease?.canDetach());
                const cleanup = preserve
                    ? Promise.all([...this.tunnels.values()].filter(tunnel => !tunnel.lease?.canDetach()).map(tunnel => this.dropTunnel(tunnel.connectionId)))
                    : this.dropTunnels();
                void cleanup.finally(() => error === undefined ? resolve() : reject(error));
            };
            let forceDrainWake;
            const handleClose = (event, forced = false) => {
                if (settled || this.socket !== socket)
                    return;
                if (closing) {
                    if (forced) {
                        forceDrainWake?.();
                        if (this.stopped || this.reconnectRequested)
                            finish();
                    }
                    return;
                }
                closing = true;
                clearLiveness();
                const closeSemantics = classifyControlClose(event.code, event.reason);
                // Retain authenticated tunnels only for an expected Server outage or a
                // peer heartbeat expiry. Another instance replacing us (4003) and
                // revocation (4004) must never retain; the reason string is the
                // semantic key because deployments disagree on the shutdown code.
                retainOnClose = [1000, 1001, 4007].includes(event.code)
                    || (closeSemantics.retryable && !closeSemantics.replaced);
                const close = async () => {
                    if (!forced) {
                        let drainTimer;
                        await Promise.race([
                            messageQueue.catch(() => undefined),
                            new Promise(resolve => {
                                forceDrainWake = resolve;
                                drainTimer = setTimeout(resolve, 50);
                            }),
                        ]);
                        if (drainTimer !== undefined)
                            clearTimeout(drainTimer);
                    }
                    forceDrainWake = undefined;
                    if (settled)
                        return;
                    if (this.stopped) {
                        finish();
                        return;
                    }
                    if (event.code === 4003) {
                        finish(new ControlConnectionError('CONNECTION_REPLACED', 'Another instance connected with this Host identity.'));
                        return;
                    }
                    if (!acknowledged && recoveryTickets.length && ([4008, 4012].includes(event.code)
                        || (event.code === 4002 && event.reason === 'recovery authorization rejected'))) {
                        // A rolled-back Server rejects the additive hello field; a newer
                        // Server rejects invalid recovery tickets with a dedicated code.
                        // Also accept the exact reason from the earlier implementation.
                        // Drop the old sessions, then retry the legacy hello once.
                        await this.dropTunnels();
                        if (settled)
                            return;
                        finish(new ControlConnectionError('CREDENTIALS_REFRESHED', 'Retry control without recovery state.'));
                        return;
                    }
                    if (event.code === 4002) {
                        if (this.authRecoveryAttempted) {
                            finish(new ControlConnectionError('AUTH_INVALID', 'Server rejected refreshed credentials.'));
                            return;
                        }
                        try {
                            await Promise.race([
                                this.api.refreshCredentials(credentials.accessToken),
                                new Promise((_, rejectRefresh) => {
                                    refreshTimer = setTimeout(() => rejectRefresh(new ControlConnectionError('CONNECTION_FAILED', 'Credential refresh timed out.')), 15_000);
                                }),
                            ]);
                        }
                        catch (error) {
                            if (refreshTimer !== undefined) {
                                clearTimeout(refreshTimer);
                                refreshTimer = undefined;
                            }
                            if (settled)
                                return;
                            finish(asError(error));
                            return;
                        }
                        if (refreshTimer !== undefined) {
                            clearTimeout(refreshTimer);
                            refreshTimer = undefined;
                        }
                        if (settled)
                            return;
                        // Only a successfully refreshed credential consumes the hello retry.
                        // Transient refresh errors must remain eligible for normal backoff.
                        this.authRecoveryAttempted = true;
                        finish(new ControlConnectionError('CREDENTIALS_REFRESHED', 'Retry hello with refreshed credentials.'));
                        return;
                    }
                    if (event.code === 4004 || this.terminalError === 'DEVICE_REVOKED') {
                        finish(new ControlConnectionError('DEVICE_REVOKED', 'The Server revoked this Host device.'));
                        return;
                    }
                    if (event.code === 4011 || this.terminalError === 'UNSUPPORTED_VERSION') {
                        finish(new ControlConnectionError('UNSUPPORTED_VERSION', 'The Server does not support the Remote protocol version.'));
                        return;
                    }
                    if (acknowledged && this.terminalError === undefined)
                        this.terminalError = closeCode(event.code);
                    finish(acknowledged ? undefined : new ControlConnectionError(closeCode(event.code), event.reason || 'Server control connection closed.'));
                };
                void close();
            };
            const closeSocket = (code, reason) => {
                try {
                    socket.close(code, reason);
                }
                catch {
                    try {
                        socket.close(1000, reason);
                    }
                    catch {
                        // Half-open or CONNECTING sockets may fail to send a close frame; settle below.
                    }
                }
                ;
                socket.terminate?.();
                handleClose({ code, reason }, true);
            };
            this.forceCloseSocket = closeSocket;
            const armLiveness = () => {
                clearLiveness();
                const timeoutMs = Math.max(15_000, this.heartbeatIntervalMs * 3);
                livenessTimer = setTimeout(() => {
                    livenessTimer = undefined;
                    if (this.stopped || settled || closing || this.socket !== socket)
                        return;
                    const silentMs = this.lastActiveAt === undefined ? timeoutMs : Math.max(0, Date.now() - this.lastActiveAt);
                    this.logger.warn('server control heartbeat timeout; reconnecting', {
                        silentMs,
                        heartbeatIntervalMs: this.heartbeatIntervalMs,
                    });
                    closeSocket(4009, 'heartbeat timeout');
                }, timeoutMs);
                livenessTimer.unref?.();
            };
            upgradeTimer = setTimeout(() => closeSocket(4001, 'upgrade timeout'), 30_000);
            upgradeTimer.unref?.();
            socket.onopen = () => {
                if (settled || closing || this.socket !== socket)
                    return;
                if (upgradeTimer !== undefined) {
                    clearTimeout(upgradeTimer);
                    upgradeTimer = undefined;
                }
                // The hello deadline starts after the WebSocket upgrade. The handshake
                // itself can be slow, and closing a socket while CONNECTING throws in
                // some implementations (including Node's built-in WebSocket).
                helloTimer = setTimeout(() => closeSocket(4001, 'hello timeout'), 10_000);
                this.sendControl('hello', {
                    role: 'host',
                    deviceId: this.identity.deviceId,
                    accessToken: credentials.accessToken,
                    protocols: [PROTOCOL_VERSION],
                    clientVersion: PLUGIN_VERSION,
                    ...(this.harnessVersion === undefined ? {} : { harnessVersion: this.harnessVersion }),
                    capabilities: offeredCapabilities,
                    ...(recoveryTickets.length ? { recoveryTickets } : {}),
                });
            };
            socket.onmessage = event => {
                if (settled || closing || this.socket !== socket)
                    return;
                try {
                    const preview = decodeControl(event.data, this.controlFrameLimits);
                    if (preview.type === 'error') {
                        const payload = requireControlError(preview.payload);
                        if (payload.code === 'DEVICE_REVOKED' || payload.connectionId === undefined) {
                            this.terminalError = payload.code;
                        }
                    }
                }
                catch {
                    // Malformed frames are handled in order by messageQueue below.
                }
                messageQueue = messageQueue.then(async () => {
                    if (settled || this.socket !== socket)
                        return;
                    const frame = decodeControl(event.data, this.controlFrameLimits);
                    this.lastActiveAt = Date.now();
                    if (acknowledged)
                        armLiveness();
                    if (frame.type === 'hello.ack') {
                        const payload = requireHelloAck(frame.payload);
                        this.heartbeatIntervalMs = payload.heartbeatIntervalMs;
                        this.webRtcNegotiateTimeoutMs = Math.max(DEFAULT_WEBRTC_NEGOTIATE_TIMEOUT_MS, payload.webrtcFallbackTimeoutMs ?? DEFAULT_WEBRTC_NEGOTIATE_TIMEOUT_MS);
                        this.authRecoveryAttempted = false;
                        this.controlFrameLimits = {
                            maxControlFrameBytes: payload.maxControlFrameBytes,
                            maxRelayFrameBytes: payload.maxRelayFrameBytes,
                        };
                        this.negotiatedCapabilities = acceptNegotiatedCapabilities(offeredCapabilities, payload.capabilities);
                        if (!this.negotiatedCapabilities.some(capability => capability === 'transport.relay'
                            || capability === 'transport.lan'
                            || capability === 'transport.p2p'
                            || capability === 'transport.turn')) {
                            throw new ControlConnectionError('INVALID_MESSAGE', 'Server did not negotiate a transport capability.');
                        }
                        acknowledged = true;
                        clearTimeout(helloTimer);
                        armLiveness();
                        // Warm the RTC backend right away: loading it lazily inside the
                        // first signal.offer handler added seconds to every first WebRTC
                        // negotiation and blocked the control frame queue.
                        if (this.rtcFactory === undefined && this.rtcFactoryProvider !== undefined && !this.config.forceRelay) {
                            void this.rtcFactoryProvider().then(factory => {
                                if (factory !== undefined)
                                    this.rtcFactory ??= factory;
                            }).catch(() => undefined);
                        }
                        for (const tunnel of [...this.tunnels.values()]) {
                            const required = tunnel.transport === 'relay' ? RELAY_RESUME_CAPABILITY : WEBRTC_RESUME_CAPABILITY;
                            if (tunnel.lease && !this.negotiatedCapabilities.includes(required))
                                await this.dropTunnel(tunnel.connectionId);
                        }
                        this.online = true;
                        this.terminalError = undefined;
                        this.logger.info('server control connection online', {
                            serverVersion: payload.serverVersion,
                            connectionSessionId: shortId(payload.connectionSessionId),
                        });
                        for (const tunnel of this.tunnels.values())
                            tunnel.lease?.tick(true);
                        return;
                    }
                    if (!acknowledged)
                        throw new ControlConnectionError('INVALID_MESSAGE', 'Server sent a frame before hello.ack.');
                    await this.handleFrame(frame);
                }).catch(error => {
                    if (settled || this.socket !== socket)
                        return;
                    invalidControl = true;
                    const code = errorCode(error);
                    this.terminalError = code;
                    this.logger.error('server control frame failed', {
                        code,
                        reason: diagnosticReason(error),
                    });
                    closeSocket(4008, 'invalid control frame');
                });
            };
            socket.onerror = () => {
                if (!acknowledged)
                    finish(new ControlConnectionError('CONNECTION_FAILED', 'Unable to open the Server WebSocket.'));
            };
            socket.onclose = event => {
                handleClose(event);
            };
        });
    }
    async handleFrame(frame) {
        if (frame.type === 'ping') {
            const nonce = objectValue(frame.payload, 'nonce');
            if (typeof nonce !== 'string')
                throw new ControlConnectionError('INVALID_MESSAGE', 'Control ping has no nonce.');
            this.sendControl('pong', { nonce });
            return;
        }
        if (frame.type === 'connection.lease.ack') {
            const ack = frame.payload;
            this.tunnels.get(ack.connectionId)?.lease?.acknowledge(ack);
            return;
        }
        if (frame.type === 'pong')
            return;
        if (frame.type === 'connect.incoming') {
            await this.handleConnectIncoming(requireConnectIncoming(frame.payload));
            return;
        }
        if (frame.type === 'secure.handshake') {
            await this.handleHandshake(requireHandshake(frame.payload));
            return;
        }
        if (frame.type === 'relay') {
            const payload = requireRelay(frame.payload);
            if (this.tunnels.get(payload.connectionId)?.dataSocket !== undefined)
                return;
            await this.handleRelay(payload);
            return;
        }
        if (frame.type === 'signal.offer') {
            if (!this.canUseWebRtc()) {
                throw new ControlConnectionError('INVALID_MESSAGE', 'Server forwarded WebRTC signaling without negotiating it.');
            }
            // RTC backend loading and the TURN credential fetch must not block the
            // serial control frame queue: ICE candidates and the secure handshake
            // keep flowing while the offer is still being prepared.
            void this.handleSignalOffer(requireSignal(frame.payload)).catch(error => {
                if (this.stopped)
                    return;
                this.logger.warn('webrtc offer handling failed', { reason: diagnosticReason(asError(error)) });
            });
            return;
        }
        if (frame.type === 'signal.ice') {
            this.handleSignalIce(requireSignalIce(frame.payload));
            return;
        }
        if (frame.type === 'transport.selected') {
            await this.handleTransportSelected(requireTransportSelected(frame.payload));
            return;
        }
        if (frame.type === 'signal.answer')
            return;
        if (frame.type === 'error') {
            const payload = requireControlError(frame.payload);
            if (payload.code === 'DEVICE_REVOKED') {
                this.terminalError = payload.code;
                if (this.forceCloseSocket)
                    this.forceCloseSocket(4004, 'device revoked');
                else
                    this.socket?.close(4004, 'device revoked');
            }
            else if (payload.connectionId !== undefined) {
                await this.dropTunnel(payload.connectionId, payload.code, {
                    closedBy: 'server',
                    retryable: payload.retryable,
                });
                const fields = {
                    code: payload.code,
                    connectionId: shortId(payload.connectionId),
                    retryable: payload.retryable,
                };
                // Retryable closes also cover ordinary Client disconnects, so they stay
                // at info. Debug hid the Server-side origin that shares the
                // CONNECTION_FAILED fallback code with local channel failures.
                if (payload.retryable)
                    this.logger.info('server closed a remote connection', fields);
                else
                    this.logger.warn('server closed a remote connection', fields);
            }
            else {
                this.terminalError = payload.code;
                this.logger.warn('server returned a control error', { code: payload.code, retryable: payload.retryable });
            }
            return;
        }
        throw new ControlConnectionError('INVALID_MESSAGE', `Unexpected Server control frame: ${frame.type}`);
    }
    async handleConnectIncoming(payload) {
        const sourceSocket = this.socket;
        let descriptor;
        try {
            descriptor = await this.api.deviceFor(payload.clientDeviceId);
        }
        catch (error) {
            if (this.socket !== sourceSocket)
                return;
            this.sendControl('connect.rejected', { connectionId: payload.connectionId });
            this.logger.warn('connection rejected by account authorization', {
                clientDeviceId: shortId(payload.clientDeviceId),
                code: errorCode(error),
            });
            return;
        }
        if (this.socket !== sourceSocket)
            return;
        if (descriptor.role !== 'client' || descriptor.deviceId !== payload.clientDeviceId
            || descriptor.identityKey !== payload.clientIdentityKey) {
            this.sendControl('connect.rejected', { connectionId: payload.connectionId });
            this.logger.warn('connection rejected by peer identity validation', {
                clientDeviceId: shortId(payload.clientDeviceId),
            });
            return;
        }
        const existing = this.identities.trustedPeer(descriptor.deviceId);
        const stalePin = existing !== undefined && existing.publicKey !== descriptor.identityKey;
        // A stale pin means the peer re-authorized with the account and obtained a new
        // identity key. descriptor.identityKey has already been validated against the
        // account directory above, so rotating the pin for the same membership is safe
        // when the operator opts in via config.rotatePinnedPeerKey.
        const rotateStalePin = stalePin
            && this.config.rotatePinnedPeerKey
            && existing.membershipId === descriptor.membershipId;
        if (stalePin && !rotateStalePin) {
            this.sendControl('connect.rejected', { connectionId: payload.connectionId });
            this.logger.warn('connection rejected by pinned peer identity', {
                clientDeviceId: shortId(payload.clientDeviceId),
            });
            return;
        }
        if (rotateStalePin) {
            this.logger.warn('rotating pinned peer identity for same-membership device', {
                clientDeviceId: shortId(payload.clientDeviceId),
            });
        }
        const peer = existing !== undefined && !stalePin
            && existing.membershipId === descriptor.membershipId
            && existing.name === descriptor.name
            && existing.platform === descriptor.platform
            ? existing
            : await this.identities.trustPeer({
                deviceId: descriptor.deviceId,
                name: descriptor.name,
                platform: descriptor.platform,
                publicKey: descriptor.identityKey,
                membershipId: descriptor.membershipId,
            });
        if (this.socket !== sourceSocket)
            return;
        const previous = this.tunnels.get(payload.connectionId);
        previous?.noise.destroy();
        const noise = new NoiseIkSession({
            role: 'responder',
            localPrivateKey: this.identity.privateKey,
            localPublicKey: this.identity.publicKey,
            remotePublicKey: peer.publicKey,
            prologue: createNoisePrologue(payload.connectionId, this.identity.deviceId, peer.deviceId),
        });
        const tunnel = {
            recoveryTicket: this.negotiatedCapabilities.includes(WEBRTC_RESUME_CAPABILITY) ? payload.recoveryTicket : undefined,
            relayRecoveryTicket: this.negotiatedCapabilities.includes(RELAY_RESUME_CAPABILITY) ? payload.relayRecoveryTicket : undefined,
            connectionId: payload.connectionId,
            membershipId: descriptor.membershipId,
            peer,
            preferredTransports: payload.preferredTransports,
            noise,
            transport: 'negotiating',
            ...(typeof payload.relayEndpoint === 'string' && typeof payload.relayTicket === 'string'
                ? { relayAssignment: payload }
                : {}),
        };
        this.tunnels.set(payload.connectionId, tunnel);
        this.sendControl('connect.accepted', { connectionId: payload.connectionId });
    }
    async handleHandshake(payload) {
        const tunnel = this.tunnels.get(payload.connectionId);
        if (tunnel !== undefined
            && tunnel.channel !== undefined
            && payload.targetDeviceId === this.identity.deviceId
            && payload.step === 1) {
            // A queued Relay/WebRTC fallback can deliver the initiator's first
            // handshake again after the authenticated channel is already ready.
            // It belongs to this exact tunnel, so ignore it without taking the
            // Host's shared control connection offline.
            this.logger.warn('duplicate secure handshake ignored', {
                connectionId: shortId(tunnel.connectionId),
                peerDeviceId: shortId(tunnel.peer.deviceId),
            });
            return;
        }
        if (tunnel === undefined || payload.targetDeviceId !== this.identity.deviceId || payload.step !== 1) {
            throw new ControlConnectionError('SECURE_CHANNEL_FAILED', 'Noise IK handshake is not valid for this connection.');
        }
        if (tunnel.transport === 'negotiating' && (tunnel.rtc !== undefined || tunnel.relayAssignment !== undefined)) {
            // transport.selected and secure.handshake traverse the Server control
            // plane separately. Do not guess Relay if forwarding or the responder's
            // RTC-ready callback delivers the handshake first; resume as soon as
            // either side confirms the selected data plane.
            if (tunnel.pendingHandshake === undefined)
                tunnel.pendingHandshake = payload;
            else
                this.logger.warn('duplicate pending secure handshake ignored', {
                    connectionId: shortId(tunnel.connectionId),
                    peerDeviceId: shortId(tunnel.peer.deviceId),
                });
            return;
        }
        await this.completeHandshake(tunnel, payload);
    }
    async completeHandshake(tunnel, payload) {
        tunnel.noise.readHandshake(fromBase64Url(payload.data));
        const reply = tunnel.noise.writeHandshake();
        if (!tunnel.noise.complete)
            throw new ControlConnectionError('SECURE_CHANNEL_FAILED', 'Noise IK handshake did not complete.');
        const viaWebRtc = tunnel.rtc !== undefined
            && (tunnel.transport === 'lan' || tunnel.transport === 'p2p' || tunnel.transport === 'turn');
        if (!viaWebRtc && tunnel.transport === 'negotiating')
            tunnel.transport = 'relay';
        const mode = viaWebRtc
            ? tunnel.transportMode ?? (tunnel.transport === 'turn' ? 'TURN' : tunnel.transport === 'lan' ? 'LAN' : 'P2P')
            : 'Relay';
        const transmit = viaWebRtc
            ? (ciphertext) => tunnel.rtc.send(ciphertext)
            : (ciphertext) => this.sendRelay(tunnel, ciphertext);
        const channel = new ServerNoiseChannel(tunnel, transmit, async () => {
            // The connection controller may close the channel directly. If it still
            // owns this tunnel, clean up its transport without re-entering the
            // controller's closeConnection path.
            if (this.tunnels.get(tunnel.connectionId) !== tunnel)
                return;
            this.notifyTunnelClosed(tunnel);
            this.tunnels.delete(tunnel.connectionId);
            tunnel.lease?.stop();
            try {
                await tunnel.rtc?.close();
            }
            catch (error) {
                this.logger.warn('remote connection RTC cleanup failed', {
                    connectionId: shortId(tunnel.connectionId), reason: diagnosticReason(error),
                });
            }
            tunnel.dataSocket?.close();
            tunnel.dataSocket = undefined;
            tunnel.dataReady = false;
        }, mode);
        tunnel.channel = channel;
        await this.connections.accept(channel);
        // Publish the responder handshake only after the channel is registered.
        // The Client starts its first RPC as soon as step 2 arrives; sending the
        // reply earlier lets WebRTC deliver that RPC while tunnel.channel is still
        // undefined, which silently drops the request.
        this.sendControl('secure.handshake', {
            connectionId: tunnel.connectionId,
            targetDeviceId: tunnel.peer.deviceId,
            step: 2,
            data: toBase64Url(reply),
        });
        const leaseTicket = viaWebRtc ? tunnel.recoveryTicket
            : tunnel.transport === 'relay' && tunnel.dataReady && tunnel.dataSocket?.readyState === 1 ? tunnel.relayRecoveryTicket : undefined;
        if (leaseTicket) {
            tunnel.lease = new ControlLease(tunnel.connectionId, leaseTicket, payload => {
                const heartbeatTimeoutMs = Math.max(15_000, this.heartbeatIntervalMs * 3);
                if (this.online && this.lastActiveAt !== undefined && Date.now() - this.lastActiveAt >= heartbeatTimeoutMs) {
                    if (this.forceCloseSocket)
                        this.forceCloseSocket(4009, 'heartbeat timeout');
                    else
                        this.socket?.close(4009, 'heartbeat timeout');
                    throw new Error('Control heartbeat timed out');
                }
                this.sendControl('connection.lease.request', payload);
            }, () => { void this.dropTunnel(tunnel.connectionId, 'CONNECTION_FAILED'); });
            tunnel.lease.start();
        }
        this.logger.info('authenticated peer channel ready', {
            connectionId: shortId(tunnel.connectionId),
            peerDeviceId: shortId(tunnel.peer.deviceId),
            transport: mode,
        });
    }
    async resumePendingHandshake(tunnel) {
        const payload = tunnel.pendingHandshake;
        if (payload === undefined || tunnel.channel !== undefined || tunnel.transport === 'negotiating')
            return;
        tunnel.pendingHandshake = undefined;
        await this.completeHandshake(tunnel, payload);
    }
    async handleRelay(payload) {
        if (!this.negotiatedCapabilities.includes('transport.relay')) {
            throw new ControlConnectionError('INVALID_MESSAGE', 'Server forwarded Relay without negotiating it.');
        }
        if (payload.targetDeviceId !== this.identity.deviceId) {
            throw new ControlConnectionError('INVALID_MESSAGE', 'Relay frame target does not match this Host.');
        }
        const tunnel = this.tunnels.get(payload.connectionId);
        if (tunnel?.channel === undefined) {
            this.logger.warn('stale relay frame ignored', {
                connectionId: shortId(payload.connectionId),
            });
            return;
        }
        try {
            tunnel.channel.receive(payload.counter, fromBase64Url(payload.ciphertext));
        }
        catch (error) {
            await tunnel.channel.close();
            throw new ControlConnectionError('SECURE_CHANNEL_FAILED', asError(error).message);
        }
    }
    async handleSignalOffer(payload) {
        const tunnel = this.tunnels.get(payload.connectionId);
        if (tunnel === undefined || payload.targetDeviceId !== this.identity.deviceId) {
            this.logger.warn('stale webrtc offer ignored', { connectionId: shortId(payload.connectionId) });
            return;
        }
        if (tunnel.channel !== undefined || tunnel.rtc !== undefined) {
            // Late or duplicate offer after relay establishment / RTC start: ignore.
            this.logger.warn('duplicate webrtc offer ignored', { connectionId: shortId(tunnel.connectionId) });
            return;
        }
        if (this.config.forceRelay) {
            // Device-level forced degradation (webrtc plan §11).
            this.logger.warn('webrtc offer ignored: forceRelay is enabled', { connectionId: shortId(tunnel.connectionId) });
            return;
        }
        if (this.rtcFactory === undefined && this.rtcFactoryProvider !== undefined) {
            this.rtcFactory = await this.rtcFactoryProvider().catch(() => undefined);
        }
        if (this.rtcFactory === undefined) {
            // No Node RTC backend on this Host (webrtc plan §6.2): drop the offer so
            // the initiator times out and falls back to the Relay data plane.
            this.logger.warn('webrtc offer ignored: no RTC backend available', { connectionId: shortId(tunnel.connectionId) });
            return;
        }
        let iceServers = [];
        try {
            iceServers = await this.api.turnCredentials(tunnel.connectionId);
        }
        catch (error) {
            this.logger.warn('TURN credentials unavailable; trying direct candidates', {
                connectionId: shortId(tunnel.connectionId),
                code: errorCode(error),
            });
        }
        // Authorization/credentials can finish after this connection was dropped
        // or after the initiator gave up and selected the relay data plane.
        if (this.stopped || this.tunnels.get(tunnel.connectionId) !== tunnel || tunnel.rtc !== undefined
            || tunnel.channel !== undefined || tunnel.transport !== 'negotiating')
            return;
        if (!tunnel.preferredTransports.includes('turn'))
            iceServers = stunOnlyIceServers(iceServers);
        const rtc = new RtcDataChannelTransport({
            role: 'responder',
            factory: this.rtcFactory,
            iceServers,
            onSignal: signal => this.sendRtcSignal(tunnel, signal),
            negotiateTimeoutMs: this.webRtcNegotiateTimeoutMs,
            label: `host<-${tunnel.peer.deviceId}`,
            onDiagnostic: event => {
                if (event.type !== 'local-candidate-filtered' && event.type !== 'candidate-pair-filtered')
                    return;
                this.logger.debug('webrtc candidate filtered', {
                    connectionId: shortId(tunnel.connectionId),
                    peerDeviceId: shortId(tunnel.peer.deviceId),
                    type: event.type,
                    reason: event.reason,
                    candidate: event.type === 'local-candidate-filtered' ? event.candidate : event.localCandidate,
                });
            },
        });
        tunnel.rtc = rtc;
        rtc.onMessage(data => tunnel.channel?.receive(undefined, data));
        rtc.onClose(() => {
            void this.handleRtcFailed(tunnel, rtc, new Error('WebRTC data channel closed.'));
        });
        void rtc.connect().then(() => {
            this.handleRtcOpened(tunnel, rtc.selectedTransport() ?? 'p2p');
        }).catch(error => {
            void this.handleRtcFailed(tunnel, rtc, asError(error));
        });
        rtc.handleSignal({ type: 'offer', sdp: payload.sdp });
        // Candidates that arrived while the RTC backend / TURN credentials were
        // still loading. The data-channel transport buffers them itself until the
        // remote description is set, so replay order is safe.
        const buffered = tunnel.pendingIce;
        if (buffered !== undefined) {
            tunnel.pendingIce = undefined;
            for (const candidate of buffered)
                rtc.handleSignal({ type: 'ice', candidate });
        }
    }
    handleSignalIce(payload) {
        if (!this.canUseWebRtc()) {
            throw new ControlConnectionError('INVALID_MESSAGE', 'Server forwarded WebRTC signaling without negotiating it.');
        }
        const tunnel = this.tunnels.get(payload.connectionId);
        if (tunnel === undefined || payload.targetDeviceId !== this.identity.deviceId)
            return;
        const rtc = tunnel.rtc;
        if (rtc !== undefined) {
            rtc.handleSignal({ type: 'ice', candidate: payload.candidate });
            return;
        }
        // The offer handler is still loading the RTC backend or TURN credentials.
        // Buffer the candidate instead of dropping it: lost trickle ICE was a
        // major source of slow or failed hole punching.
        if (tunnel.channel === undefined)
            (tunnel.pendingIce ??= []).push(payload.candidate);
    }
    async handleTransportSelected(payload) {
        const tunnel = this.tunnels.get(payload.connectionId);
        if (tunnel === undefined || payload.targetDeviceId !== this.identity.deviceId) {
            this.logger.warn('stale transport selection ignored', { connectionId: shortId(payload.connectionId) });
            return;
        }
        if (tunnel.channel !== undefined) {
            // Selection is immutable once Noise has bound the business channel to a
            // data plane. Late duplicate control frames must not switch it beneath
            // an authenticated connection.
            if (tunnel.transport !== payload.transport) {
                this.logger.warn('late transport selection ignored', {
                    connectionId: shortId(tunnel.connectionId),
                    selected: payload.transport,
                });
            }
            return;
        }
        const requiredCapability = `transport.${payload.transport}`;
        if (!this.negotiatedCapabilities.includes(requiredCapability)) {
            throw new ControlConnectionError('INVALID_MESSAGE', `Client selected unnegotiated transport: ${payload.transport}`);
        }
        if (payload.transport === 'relay') {
            const rtc = tunnel.rtc;
            tunnel.rtc = undefined;
            tunnel.transport = 'relay';
            tunnel.transportMode = undefined;
            await rtc?.close();
            if (tunnel.relayAssignment !== undefined) {
                try {
                    await this.openDataSocket(tunnel);
                }
                catch (error) {
                    this.logger.warn('relay data attach failed', {
                        connectionId: shortId(tunnel.connectionId),
                        peerDeviceId: shortId(tunnel.peer.deviceId),
                        reason: diagnosticReason(error),
                    });
                    await this.dropTunnel(tunnel.connectionId, 'CONNECTION_FAILED');
                    this.sendControl('error', {
                        code: 'CONNECTION_FAILED',
                        message: 'Relay data connection failed.',
                        retryable: true,
                        connectionId: tunnel.connectionId,
                    });
                    return;
                }
            }
            await this.resumePendingHandshake(tunnel);
            return;
        }
        if (tunnel.rtc === undefined) {
            throw new ControlConnectionError('INVALID_MESSAGE', 'Client selected WebRTC before creating a data channel.');
        }
        // The initiator emits transport.selected only after its DataChannel is
        // open, then immediately starts Noise. Apply that ordered control frame
        // before the handshake so a slower responder-side RTC ready callback
        // cannot bind replies to Relay while requests arrive over WebRTC.
        tunnel.transport = payload.transport;
        tunnel.transportMode = tunnel.rtc.selectedPathMode();
        if (payload.turnNode !== undefined) {
            this.logger.info('client selected a turn relay', {
                connectionId: shortId(tunnel.connectionId),
                peerDeviceId: shortId(tunnel.peer.deviceId),
                // Hostnames only: never echo arbitrary client-supplied text into logs.
                turnNode: TURN_NODE_TEXT.test(payload.turnNode) ? payload.turnNode : '<invalid>',
            });
        }
        await this.resumePendingHandshake(tunnel);
    }
    canUseWebRtc() {
        return this.negotiatedCapabilities.includes('transport.lan')
            || this.negotiatedCapabilities.includes('transport.p2p')
            || this.negotiatedCapabilities.includes('transport.turn');
    }
    sendRtcSignal(tunnel, signal) {
        if (signal.type === 'answer') {
            this.sendControl('signal.answer', {
                connectionId: tunnel.connectionId,
                targetDeviceId: tunnel.peer.deviceId,
                sdp: signal.sdp,
            });
        }
        else if (signal.type === 'ice') {
            this.sendControl('signal.ice', {
                connectionId: tunnel.connectionId,
                targetDeviceId: tunnel.peer.deviceId,
                candidate: signal.candidate,
            });
        }
    }
    handleRtcOpened(tunnel, selected) {
        if (this.tunnels.get(tunnel.connectionId) !== tunnel || tunnel.rtc === undefined)
            return;
        const wireSelected = selected === 'lan'
            && !this.negotiatedCapabilities.includes('transport.lan')
            && this.negotiatedCapabilities.includes('transport.p2p')
            ? 'p2p'
            : selected;
        const requiredCapability = wireSelected === 'lan'
            ? 'transport.lan'
            : wireSelected === 'turn' ? 'transport.turn' : 'transport.p2p';
        if (!this.negotiatedCapabilities.includes(requiredCapability)) {
            const error = new Error(`WebRTC selected unnegotiated transport: ${selected}`);
            if (!this.negotiatedCapabilities.includes('transport.relay')) {
                void this.dropTunnel(tunnel.connectionId, 'CONNECTION_FAILED');
                return;
            }
            void this.handleRtcFailed(tunnel, tunnel.rtc, error);
            return;
        }
        tunnel.transport = wireSelected;
        tunnel.transportMode = tunnel.rtc.selectedPathMode();
        this.sendTransportSelected(tunnel, wireSelected);
        const diagnostics = rtcDiagnostics(tunnel.rtc);
        this.logger.info('webrtc data channel ready', {
            connectionId: shortId(tunnel.connectionId),
            peerDeviceId: shortId(tunnel.peer.deviceId),
            transport: tunnel.transportMode ?? wireSelected,
        });
        if (diagnostics !== undefined) {
            this.logger.debug('webrtc data channel diagnostics', {
                connectionId: shortId(tunnel.connectionId),
                ...webrtcDiagnosticsLogFields(diagnostics),
            });
        }
        void this.resumePendingHandshake(tunnel).catch(error => {
            this.logger.warn('pending secure handshake failed', {
                connectionId: shortId(tunnel.connectionId),
                reason: diagnosticReason(error),
            });
            void this.dropTunnel(tunnel.connectionId, 'SECURE_CHANNEL_FAILED');
        });
    }
    async handleRtcFailed(tunnel, rtc, error) {
        if (this.tunnels.get(tunnel.connectionId) !== tunnel || tunnel.rtc !== rtc)
            return;
        const diagnostics = rtcDiagnostics(rtc);
        if (tunnel.transport === 'lan' || tunnel.transport === 'p2p' || tunnel.transport === 'turn') {
            this.logger.warn('webrtc data channel failed; disconnecting peer', {
                connectionId: shortId(tunnel.connectionId),
                reason: diagnosticReason(error),
            });
            if (diagnostics !== undefined) {
                this.logger.debug('webrtc data channel failure diagnostics', {
                    connectionId: shortId(tunnel.connectionId),
                    ...webrtcDiagnosticsLogFields(diagnostics),
                });
            }
            await this.dropTunnel(tunnel.connectionId, 'CONNECTION_FAILED');
            return;
        }
        tunnel.rtc = undefined;
        tunnel.transport = 'relay';
        await rtc.close();
        this.logger.warn('webrtc negotiation failed; falling back to relay', {
            connectionId: shortId(tunnel.connectionId),
            reason: diagnosticReason(error),
        });
        if (diagnostics !== undefined) {
            this.logger.debug('webrtc negotiation failure diagnostics', {
                connectionId: shortId(tunnel.connectionId),
                ...webrtcDiagnosticsLogFields(diagnostics),
            });
        }
        await this.resumePendingHandshake(tunnel);
    }
    sendTransportSelected(tunnel, transport) {
        this.sendControl('transport.selected', {
            connectionId: tunnel.connectionId,
            targetDeviceId: tunnel.peer.deviceId,
            transport,
        });
    }
    async sendRelay(tunnel, ciphertext) {
        if (this.tunnels.get(tunnel.connectionId) !== tunnel || tunnel.channel === undefined) {
            throw new Error('Relay tunnel closed');
        }
        const counter = Number(tunnel.noise.sendingCounter() - 1n);
        if (!Number.isSafeInteger(counter) || counter < 0)
            throw new ControlConnectionError('FRAME_TOO_LARGE', 'Noise transport counter overflowed.');
        const socket = tunnel.dataSocket ?? this.socket;
        if (socket === undefined)
            throw new Error('Relay transport closed');
        await waitForRelayCapacity(socket);
        if (this.tunnels.get(tunnel.connectionId) !== tunnel || tunnel.channel === undefined) {
            throw new Error('Relay tunnel closed');
        }
        if (tunnel.dataSocket !== undefined) {
            if (tunnel.dataSocket !== socket || tunnel.dataSocket.readyState !== 1 || !tunnel.dataReady) {
                throw new Error('Relay data transport is not ready');
            }
            socket.send(encodeRelayDataFrame(createRelayDataFrame('relay', {
                connectionId: tunnel.connectionId,
                targetDeviceId: tunnel.peer.deviceId,
                counter,
                ciphertext: toBase64Url(ciphertext),
            }), this.controlFrameLimits));
            return;
        }
        if (this.socket !== socket)
            throw new Error('Relay transport replaced');
        this.sendControl('relay', {
            connectionId: tunnel.connectionId,
            targetDeviceId: tunnel.peer.deviceId,
            counter,
            ciphertext: toBase64Url(ciphertext),
        });
    }
    async openDataSocket(tunnel) {
        const assignment = tunnel.relayAssignment;
        if (assignment === undefined || tunnel.dataSocket !== undefined)
            return;
        if (typeof assignment.relayEndpoint !== 'string' || typeof assignment.relayTicket !== 'string')
            return;
        const socket = this.createWebSocket(assignment.relayEndpoint);
        socket.binaryType = 'arraybuffer';
        tunnel.dataSocket = socket;
        await new Promise((resolve, reject) => {
            let settled = false;
            const timer = setTimeout(() => finish(new Error('Relay data attach timed out')), 15_000);
            const finish = (error) => {
                if (settled)
                    return;
                settled = true;
                clearTimeout(timer);
                if (error === undefined)
                    resolve();
                else
                    reject(error);
            };
            socket.onopen = () => {
                try {
                    socket.send(encodeRelayDataFrame(createRelayDataFrame('relay.attach', {
                        connectionId: tunnel.connectionId,
                        deviceId: this.identity.deviceId,
                        peerDeviceId: tunnel.peer.deviceId,
                        ticket: assignment.relayTicket,
                    }), this.controlFrameLimits));
                }
                catch (error) {
                    finish(asError(error));
                }
            };
            socket.onmessage = event => {
                try {
                    if (typeof event.data !== 'string')
                        throw new ControlConnectionError('INVALID_MESSAGE', 'Relay data frames must be text JSON.');
                    const frame = decodeRelayDataFrame(event.data, this.controlFrameLimits);
                    if (frame.type === 'relay.ready') {
                        if (frame.payload.connectionId !== tunnel.connectionId
                            || (assignment.relayEpoch !== undefined && frame.payload.epoch !== assignment.relayEpoch)) {
                            throw new ControlConnectionError('INVALID_MESSAGE', 'Relay data attach does not match the assigned connection.');
                        }
                        tunnel.dataReady = true;
                        finish();
                        return;
                    }
                    void this.handleDataSocketFrame(tunnel, frame.type, frame.payload).catch(error => {
                        finish(asError(error));
                        void this.dropTunnel(tunnel.connectionId, 'CONNECTION_FAILED');
                    });
                }
                catch (error) {
                    finish(asError(error));
                    void this.dropTunnel(tunnel.connectionId, 'CONNECTION_FAILED');
                }
            };
            socket.onerror = () => finish(new Error('Relay data socket failed'));
            socket.onclose = () => {
                if (!tunnel.dataReady)
                    finish(new Error('Relay data socket closed before attach'));
                else
                    void this.dropTunnel(tunnel.connectionId, 'CONNECTION_FAILED');
            };
        });
    }
    async handleDataSocketFrame(tunnel, type, payload) {
        if (this.tunnels.get(tunnel.connectionId) !== tunnel)
            return;
        if (type === 'relay.detach') {
            await this.dropTunnel(tunnel.connectionId, 'CONNECTION_FAILED');
            return;
        }
        if (type === 'ping') {
            if (tunnel.dataSocket?.readyState === 1) {
                tunnel.dataSocket.send(encodeRelayDataFrame(createRelayDataFrame('pong', payload), this.controlFrameLimits));
            }
            return;
        }
        if (type !== 'relay')
            throw new ControlConnectionError('INVALID_MESSAGE', `Unexpected Relay data frame: ${type}`);
        await this.handleRelay(requireRelay(payload));
    }
    sendControl(type, payload) {
        const socket = this.socket;
        if (socket === undefined || socket.readyState !== 1)
            throw new ControlConnectionError('CONNECTION_FAILED', 'Server control socket is not open.');
        socket.send(encodeControlFrame(createControlFrame(type, payload), this.controlFrameLimits));
    }
    notifyTunnelClosed(tunnel) {
        if (!tunnel.lease || this.socket?.readyState !== 1)
            return;
        try {
            this.sendControl('connection.lease.close', { connectionId: tunnel.connectionId });
        }
        catch { /* local cleanup proceeds */ }
    }
    async dropTunnels() {
        const tunnels = [...this.tunnels.values()];
        this.tunnels.clear();
        await Promise.all(tunnels.map(async (tunnel) => {
            tunnel.lease?.stop();
            if (tunnel.rtc !== undefined)
                await tunnel.rtc.close();
            tunnel.dataSocket?.close();
            if (tunnel.channel !== undefined)
                await tunnel.channel.close();
            else
                tunnel.noise.destroy();
        }));
        await this.connections.close();
    }
    async dropTunnel(connectionId, code, detail) {
        const tunnel = this.tunnels.get(connectionId);
        if (tunnel === undefined)
            return;
        this.notifyTunnelClosed(tunnel);
        this.tunnels.delete(connectionId);
        tunnel.lease?.stop();
        try {
            await tunnel.rtc?.close();
        }
        catch (error) {
            this.logger.warn('remote connection RTC cleanup failed', {
                connectionId: shortId(connectionId),
                reason: diagnosticReason(error),
            });
        }
        tunnel.dataSocket?.close();
        tunnel.dataSocket = undefined;
        tunnel.dataReady = false;
        if (tunnel.channel !== undefined) {
            try {
                const closed = detail === undefined
                    ? await this.connections.closeConnection(connectionId, code)
                    : await this.connections.closeConnection(connectionId, code, detail);
                if (!closed)
                    await tunnel.channel.close(code);
            }
            catch (error) {
                await tunnel.channel.close(code).catch(() => undefined);
                this.logger.warn('remote connection channel cleanup failed', {
                    connectionId: shortId(connectionId),
                    reason: diagnosticReason(error),
                });
            }
        }
        else {
            tunnel.noise.destroy();
        }
    }
    waitBeforeRetry() {
        // Full jitter over the configured maximum (AWS "full jitter"): every
        // retry draws uniformly from [0, maxDelayMs], so the fleet spreads out
        // even when the Server restarts. `reconnect.initialDelayMs` and
        // `reconnect.jitter` remain accepted configuration but no longer shape
        // the delay; only `maxDelayMs` bounds it.
        const delay = Math.round(Math.random() * this.config.reconnect.maxDelayMs);
        return new Promise(resolve => {
            const timer = setTimeout(() => { this.retryWake = undefined; resolve(); }, delay);
            this.retryWake = () => { clearTimeout(timer); resolve(); };
        });
    }
}
const TERMINAL_AUTH_ERRORS = new Set([
    'CONNECTION_REPLACED',
    'SERVER_CREDENTIALS_BUSY',
    'ACCOUNT_AUTH_REQUIRED',
    'AUTH_INVALID',
    'DEVICE_OWNERSHIP_REQUIRED',
    'DEVICE_REVOKED',
    'TOKEN_EXPIRED',
]);
class ServerNoiseChannel {
    tunnel;
    transmit;
    onClose;
    sends = new SerialSend();
    security;
    peerDeviceId;
    peerIdentityKey;
    mode;
    handlers = new Set();
    incoming = new SecureMessageCodec();
    outgoing = new SecureMessageCodec();
    closed = false;
    /** Noise + SecureMessageCodec counters are not re-entrant; serialize sends. */
    sendTail = Promise.resolve();
    constructor(tunnel, transmit, onClose, mode) {
        this.tunnel = tunnel;
        this.transmit = transmit;
        this.onClose = onClose;
        this.mode = mode;
        this.security = {
            protocol: 'Noise_IK_25519_ChaChaPoly_SHA256',
            connectionId: tunnel.connectionId,
            membershipId: tunnel.membershipId,
        };
        this.peerDeviceId = tunnel.peer.deviceId;
        this.peerIdentityKey = tunnel.peer.publicKey;
    }
    async send(message) {
        const run = this.sendTail.then(() => this.sendNow(message));
        this.sendTail = run.catch(() => undefined);
        return run;
    }
    async sendNow(message) {
        if (this.tunnel.lease && !this.tunnel.lease.valid())
            throw new Error('Control lease expired');
        if (this.closed)
            throw new Error('secure channel is closed');
        const encoded = encodeMessage(message);
        try {
            await this.sends.run(encoded.byteLength, async () => {
                if (this.closed)
                    throw new Error('Secure channel closed');
                for (const plaintext of this.outgoing.encode(encoded)) {
                    if (this.closed)
                        throw new Error('Secure channel closed');
                    await this.transmit(this.tunnel.noise.encrypt(plaintext));
                }
            });
        }
        catch (error) {
            await this.close().catch(() => undefined);
            throw error;
        }
    }
    onMessage(handler) {
        this.handlers.add(handler);
        return () => this.handlers.delete(handler);
    }
    receive(counter, ciphertext) {
        if (this.tunnel.lease && !this.tunnel.lease.valid())
            return;
        if (this.closed)
            return;
        if (counter !== undefined) {
            const expected = Number(this.tunnel.noise.receivingCounter());
            if (!Number.isSafeInteger(counter) || counter !== expected) {
                throw new ControlConnectionError('INVALID_MESSAGE', 'Relay counter is duplicated or out of order.');
            }
        }
        const plaintext = this.incoming.decode(this.tunnel.noise.decrypt(ciphertext));
        if (plaintext === undefined)
            return;
        const message = decodeMessage(plaintext);
        for (const handler of this.handlers)
            handler(message);
    }
    async close(_code) {
        if (this.closed)
            return;
        this.closed = true;
        this.handlers.clear();
        this.incoming.reset();
        this.outgoing.reset();
        this.tunnel.noise.destroy();
        await this.onClose();
    }
}
class ControlConnectionError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
    }
}
function websocketUrl(baseUrl) {
    const url = new URL(baseUrl);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.pathname = `${url.pathname.replace(/\/$/, '')}/ws/v1/connect`;
    return url.toString();
}
function decodeControl(data, limits) {
    if (typeof data !== 'string')
        throw new ControlConnectionError('INVALID_MESSAGE', 'Server control frames must be text JSON.');
    try {
        return decodeControlFrame(data, limits);
    }
    catch {
        throw new ControlConnectionError('INVALID_MESSAGE', 'Server sent an invalid control frame.');
    }
}
function requireHelloAck(value) {
    const payload = requireObject(value);
    if (payload.protocol !== PROTOCOL_VERSION || typeof payload.serverVersion !== 'string'
        || typeof payload.connectionSessionId !== 'string' || !Number.isSafeInteger(payload.heartbeatIntervalMs) || payload.heartbeatIntervalMs <= 0
        || !Number.isSafeInteger(payload.maxControlFrameBytes) || !Number.isSafeInteger(payload.maxRelayFrameBytes)) {
        throw new ControlConnectionError('INVALID_MESSAGE', 'hello.ack payload is invalid.');
    }
    return payload;
}
function requireConnectIncoming(value) {
    const payload = requireObject(value);
    if (typeof payload.connectionId !== 'string' || typeof payload.clientDeviceId !== 'string'
        || typeof payload.clientIdentityKey !== 'string' || payload.authorization !== 'account'
        || !Array.isArray(payload.preferredTransports)) {
        throw new ControlConnectionError('INVALID_MESSAGE', 'connect.incoming payload is invalid.');
    }
    return payload;
}
function requireHandshake(value) {
    const payload = requireObject(value);
    if (typeof payload.connectionId !== 'string' || typeof payload.targetDeviceId !== 'string'
        || !Number.isSafeInteger(payload.step) || typeof payload.data !== 'string') {
        throw new ControlConnectionError('INVALID_MESSAGE', 'secure.handshake payload is invalid.');
    }
    return payload;
}
function requireRelay(value) {
    const payload = requireObject(value);
    if (typeof payload.connectionId !== 'string' || typeof payload.targetDeviceId !== 'string'
        || !Number.isSafeInteger(payload.counter) || typeof payload.ciphertext !== 'string') {
        throw new ControlConnectionError('INVALID_MESSAGE', 'relay payload is invalid.');
    }
    return payload;
}
function requireSignal(value) {
    const payload = requireObject(value);
    if (typeof payload.connectionId !== 'string' || typeof payload.targetDeviceId !== 'string'
        || typeof payload.sdp !== 'string' || payload.sdp.length === 0) {
        throw new ControlConnectionError('INVALID_MESSAGE', 'signal offer/answer payload is invalid.');
    }
    return payload;
}
function requireSignalIce(value) {
    const payload = requireObject(value);
    if (typeof payload.connectionId !== 'string' || typeof payload.targetDeviceId !== 'string'
        || typeof payload.candidate !== 'object' || payload.candidate === null || Array.isArray(payload.candidate)) {
        throw new ControlConnectionError('INVALID_MESSAGE', 'signal.ice payload is invalid.');
    }
    return payload;
}
function requireTransportSelected(value) {
    const payload = requireObject(value);
    if (typeof payload.connectionId !== 'string' || typeof payload.targetDeviceId !== 'string'
        || (payload.transport !== 'lan' && payload.transport !== 'p2p'
            && payload.transport !== 'turn' && payload.transport !== 'relay')) {
        throw new ControlConnectionError('INVALID_MESSAGE', 'transport.selected payload is invalid.');
    }
    return payload;
}
function requireControlError(value) {
    const payload = requireObject(value);
    if (typeof payload.code !== 'string' || typeof payload.message !== 'string'
        || (payload.connectionId !== undefined && (typeof payload.connectionId !== 'string' || payload.connectionId === ''))) {
        throw new ControlConnectionError('INVALID_MESSAGE', 'error payload is invalid.');
    }
    return payload;
}
function requireObject(value) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new ControlConnectionError('INVALID_MESSAGE', 'Control payload must be an object.');
    }
    return value;
}
function objectValue(value, key) { return requireObject(value)[key]; }
function shortId(value) { return value.length <= 12 ? value : `${value.slice(0, 8)}…${value.slice(-4)}`; }
/** Client-reported TURN relay hostnames (IPv4/IPv6[:port]) may enter logs. */
const TURN_NODE_TEXT = /^[A-Za-z0-9.[\]:-]+$/;
function asError(error) { return error instanceof Error ? error : new Error('Unknown Server connection error.'); }
function diagnosticReason(error) {
    const message = asError(error).message.replace(/[\r\n]+/g, ' ').slice(0, 160);
    return message || 'Unknown Server connection error.';
}
function webrtcDiagnosticsLogFields(diagnostics) {
    if (diagnostics === undefined)
        return {};
    return {
        rtcConnectionState: diagnostics.connectionState,
        rtcIceConnectionState: diagnostics.iceConnectionState,
        rtcIceGatheringState: diagnostics.iceGatheringState,
        rtcLocalCandidates: diagnostics.localCandidates,
        rtcRemoteCandidates: diagnostics.remoteCandidates,
        rtcCandidatePairs: diagnostics.candidatePairs,
        rtcFilteredLocalCandidates: diagnostics.filteredLocalCandidates,
        rtcFilteredCandidatePairs: diagnostics.filteredCandidatePairs,
        ...(diagnostics.selectedPath === undefined ? {} : { rtcSelectedPath: diagnostics.selectedPath }),
    };
}
function rtcDiagnostics(rtc) {
    try {
        const candidate = rtc;
        return typeof candidate.diagnostics === 'function' ? candidate.diagnostics() : undefined;
    }
    catch {
        return undefined;
    }
}
function errorCode(error) { return error instanceof ServerApiError || error instanceof ControlConnectionError ? error.code : 'CONNECTION_FAILED'; }
function isRetryable(error) { return errorCode(error) !== 'UNSUPPORTED_VERSION' && !TERMINAL_AUTH_ERRORS.has(errorCode(error)) && (!(error instanceof ServerApiError) || error.retryable); }
function closeCode(code) {
    if (code === 4002)
        return 'AUTH_INVALID';
    if (code === 4003)
        return 'CONNECTION_REPLACED';
    if (code === 4004)
        return 'DEVICE_REVOKED';
    if (code === 4007)
        return 'RATE_LIMITED';
    if (code === 4011)
        return 'UNSUPPORTED_VERSION';
    return 'CONNECTION_FAILED';
}
//# sourceMappingURL=server-connection.js.map