import { waitForRelayCapacity, SerialSend } from '@dsh-remote/webrtc';
import { NoiseIkSession, createNoisePrologue, fromBase64Url, toBase64Url, } from '@dsh-remote/crypto';
import { PROTOCOL_VERSION, SecureMessageCodec, acceptNegotiatedCapabilities, createControlFrame, decodeControlFrame, decodeMessage, encodeControlFrame, encodeMessage, } from '@dsh-remote/protocol';
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
        this.socket?.close(1000, 'plugin stopped');
        await this.running;
        await this.dropTunnels();
    }
    isOnline() { return this.online; }
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
        this.socket?.close(4000, 'manual reconnect');
        void this.running.finally(() => {
            if (!this.reconnectRequested || this.stopped)
                return;
            this.reconnectRequested = false;
            this.start();
        });
    }
    async run() {
        let delayMs = this.config.reconnect.initialDelayMs;
        this.authRecoveryAttempted = false;
        while (!this.stopped) {
            try {
                await this.connectOnce();
                delayMs = this.config.reconnect.initialDelayMs;
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
                });
                if (TERMINAL_AUTH_ERRORS.has(code)) {
                    this.logger.warn(code === 'CONNECTION_REPLACED'
                        ? 'Another instance is using this Host identity. Stop it or use a separate DSH_HOME; automatic reconnect is paused.'
                        : code === 'SERVER_CREDENTIALS_BUSY'
                            ? 'Credential refresh is locked. Stop other instances; after a crash, stop all instances before removing server-credentials.json.refresh-lock and authorizing again.'
                            : 'Host authorization failed. Run /remote login or authorize this Host again in Remote settings.');
                }
                if (code === 'DEVICE_REVOKED') {
                    try {
                        await this.api.clearAuthorization();
                    }
                    catch (clearError) {
                        this.logger.error('failed to clear revoked Host authorization', { code: errorCode(clearError) });
                    }
                }
                if (TERMINAL_AUTH_ERRORS.has(code) || !this.config.reconnect.enabled)
                    return;
            }
            if (this.stopped)
                return;
            if (this.reconnectRequested) {
                this.reconnectRequested = false;
                delayMs = this.config.reconnect.initialDelayMs;
                continue;
            }
            if (!this.config.reconnect.enabled)
                return;
            await this.waitBeforeRetry(delayMs);
            if (this.reconnectRequested) {
                this.reconnectRequested = false;
                delayMs = this.config.reconnect.initialDelayMs;
                continue;
            }
            delayMs = Math.min(this.config.reconnect.maxDelayMs, delayMs * 2);
        }
    }
    async connectOnce() {
        const credentials = await this.api.authenticate(this.identity);
        if (this.stopped)
            return;
        const offeredCapabilities = this.rtcFactoryProvider === undefined || this.config.forceRelay
            ? ['transport.relay', ...this.hostCapabilities()]
            : ['transport.lan', 'transport.p2p', 'transport.turn', 'transport.relay', ...this.hostCapabilities()];
        const socket = this.createWebSocket(websocketUrl(this.api.baseUrl));
        this.socket = socket;
        this.controlFrameLimits = {};
        let acknowledged = false;
        let messageQueue = Promise.resolve();
        await new Promise((resolve, reject) => {
            let settled = false;
            const helloTimer = setTimeout(() => socket.close(4001, 'hello timeout'), 10_000);
            const finish = (error) => {
                if (settled)
                    return;
                settled = true;
                clearTimeout(helloTimer);
                this.online = false;
                if (this.socket === socket)
                    this.socket = undefined;
                void this.dropTunnels().finally(() => error === undefined ? resolve() : reject(error));
            };
            socket.onopen = () => {
                this.sendControl('hello', {
                    role: 'host',
                    deviceId: this.identity.deviceId,
                    accessToken: credentials.accessToken,
                    protocols: [PROTOCOL_VERSION],
                    clientVersion: PLUGIN_VERSION,
                    ...(this.harnessVersion === undefined ? {} : { harnessVersion: this.harnessVersion }),
                    capabilities: offeredCapabilities,
                });
            };
            socket.onmessage = event => {
                messageQueue = messageQueue.then(async () => {
                    const frame = decodeControl(event.data, this.controlFrameLimits);
                    this.lastActiveAt = Date.now();
                    if (frame.type === 'hello.ack') {
                        const payload = requireHelloAck(frame.payload);
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
                        this.online = true;
                        this.terminalError = undefined;
                        this.logger.info('server control connection online', {
                            serverVersion: payload.serverVersion,
                            connectionSessionId: shortId(payload.connectionSessionId),
                        });
                        return;
                    }
                    if (!acknowledged)
                        throw new ControlConnectionError('INVALID_MESSAGE', 'Server sent a frame before hello.ack.');
                    await this.handleFrame(frame);
                }).catch(error => {
                    const code = errorCode(error);
                    this.terminalError = code;
                    this.logger.error('server control frame failed', {
                        code,
                        reason: diagnosticReason(error),
                    });
                    socket.close(4008, 'invalid control frame');
                });
            };
            socket.onerror = () => {
                if (!acknowledged)
                    finish(new ControlConnectionError('CONNECTION_FAILED', 'Unable to open the Server WebSocket.'));
            };
            socket.onclose = event => {
                const close = async () => {
                    await messageQueue.catch(() => undefined);
                    if (this.stopped) {
                        finish();
                        return;
                    }
                    if (event.code === 4003) {
                        finish(new ControlConnectionError('CONNECTION_REPLACED', 'Another instance connected with this Host identity.'));
                        return;
                    }
                    if (event.code === 4002) {
                        if (this.authRecoveryAttempted) {
                            finish(new ControlConnectionError('AUTH_INVALID', 'Server rejected refreshed credentials.'));
                            return;
                        }
                        try {
                            await this.api.refreshCredentials(credentials.accessToken);
                        }
                        catch (error) {
                            finish(asError(error));
                            return;
                        }
                        // Only a successfully refreshed credential consumes the hello retry.
                        // Transient refresh errors must remain eligible for normal backoff.
                        this.authRecoveryAttempted = true;
                        finish(new ControlConnectionError('CREDENTIALS_REFRESHED', 'Retry hello with refreshed credentials.'));
                        return;
                    }
                    if (event.code === 4004) {
                        finish(new ControlConnectionError('DEVICE_REVOKED', 'The Server revoked this Host device.'));
                        return;
                    }
                    if (acknowledged)
                        this.terminalError = closeCode(event.code);
                    finish(acknowledged ? undefined : new ControlConnectionError(closeCode(event.code), event.reason || 'Server control connection closed.'));
                };
                void close();
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
            await this.handleRelay(requireRelay(frame.payload));
            return;
        }
        if (frame.type === 'signal.offer') {
            await this.handleSignalOffer(requireSignal(frame.payload));
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
        let descriptor;
        try {
            descriptor = await this.api.deviceFor(payload.clientDeviceId);
        }
        catch (error) {
            this.sendControl('connect.rejected', { connectionId: payload.connectionId });
            this.logger.warn('connection rejected by account authorization', {
                clientDeviceId: shortId(payload.clientDeviceId),
                code: errorCode(error),
            });
            return;
        }
        if (descriptor.role !== 'client' || descriptor.deviceId !== payload.clientDeviceId
            || descriptor.identityKey !== payload.clientIdentityKey) {
            this.sendControl('connect.rejected', { connectionId: payload.connectionId });
            this.logger.warn('connection rejected by peer identity validation', {
                clientDeviceId: shortId(payload.clientDeviceId),
            });
            return;
        }
        const existing = this.identities.trustedPeer(descriptor.deviceId);
        if (existing !== undefined && existing.publicKey !== descriptor.identityKey) {
            this.sendControl('connect.rejected', { connectionId: payload.connectionId });
            this.logger.warn('connection rejected by pinned peer identity', {
                clientDeviceId: shortId(payload.clientDeviceId),
            });
            return;
        }
        const peer = existing !== undefined
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
        const previous = this.tunnels.get(payload.connectionId);
        previous?.noise.destroy();
        const noise = new NoiseIkSession({
            role: 'responder',
            localPrivateKey: this.identity.privateKey,
            localPublicKey: this.identity.publicKey,
            remotePublicKey: peer.publicKey,
            prologue: createNoisePrologue(payload.connectionId, this.identity.deviceId, peer.deviceId),
        });
        this.tunnels.set(payload.connectionId, {
            connectionId: payload.connectionId,
            membershipId: descriptor.membershipId,
            peer,
            preferredTransports: payload.preferredTransports,
            noise,
            transport: 'negotiating',
        });
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
        if (tunnel.transport === 'negotiating' && tunnel.rtc !== undefined) {
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
        const channel = new ServerNoiseChannel(tunnel, transmit, () => {
            if (this.tunnels.get(tunnel.connectionId) === tunnel)
                this.tunnels.delete(tunnel.connectionId);
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
        if (!this.canUseWebRtc()) {
            throw new ControlConnectionError('INVALID_MESSAGE', 'Server forwarded WebRTC signaling without negotiating it.');
        }
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
        // Authorization/credentials can finish after this connection was dropped.
        if (this.stopped || this.tunnels.get(tunnel.connectionId) !== tunnel || tunnel.rtc !== undefined || tunnel.channel !== undefined)
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
    }
    handleSignalIce(payload) {
        if (!this.canUseWebRtc()) {
            throw new ControlConnectionError('INVALID_MESSAGE', 'Server forwarded WebRTC signaling without negotiating it.');
        }
        const tunnel = this.tunnels.get(payload.connectionId);
        if (tunnel === undefined || payload.targetDeviceId !== this.identity.deviceId)
            return;
        tunnel.rtc?.handleSignal({ type: 'ice', candidate: payload.candidate });
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
        const counter = Number(tunnel.noise.sendingCounter() - 1n);
        if (!Number.isSafeInteger(counter) || counter < 0)
            throw new ControlConnectionError('FRAME_TOO_LARGE', 'Noise transport counter overflowed.');
        const socket = this.socket;
        if (socket === undefined)
            throw new Error('Relay transport closed');
        await waitForRelayCapacity(socket);
        if (this.socket !== socket)
            throw new Error('Relay transport replaced');
        this.sendControl('relay', {
            connectionId: tunnel.connectionId,
            targetDeviceId: tunnel.peer.deviceId,
            counter,
            ciphertext: toBase64Url(ciphertext),
        });
    }
    sendControl(type, payload) {
        const socket = this.socket;
        if (socket === undefined || socket.readyState !== 1)
            throw new ControlConnectionError('CONNECTION_FAILED', 'Server control socket is not open.');
        socket.send(encodeControlFrame(createControlFrame(type, payload), this.controlFrameLimits));
    }
    async dropTunnels() {
        const tunnels = [...this.tunnels.values()];
        this.tunnels.clear();
        await Promise.all(tunnels.map(async (tunnel) => {
            if (tunnel.rtc !== undefined)
                await tunnel.rtc.close();
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
        this.tunnels.delete(connectionId);
        try {
            await tunnel.rtc?.close();
        }
        catch (error) {
            this.logger.warn('remote connection RTC cleanup failed', {
                connectionId: shortId(connectionId),
                reason: diagnosticReason(error),
            });
        }
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
    waitBeforeRetry(baseDelay) {
        const spread = baseDelay * this.config.reconnect.jitter;
        const delay = Math.max(0, Math.round(baseDelay - spread + Math.random() * spread * 2));
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
        if (this.closed)
            throw new Error('secure channel is closed');
        const encoded = encodeMessage(message);
        try {
            await this.sends.run(encoded.byteLength, async () => {
                if (this.closed)
                    throw new Error('Secure channel closed');
                for (const plaintext of this.outgoing.encode(encoded))
                    await this.transmit(this.tunnel.noise.encrypt(plaintext));
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
        this.onClose();
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
        || typeof payload.connectionSessionId !== 'string' || !Number.isSafeInteger(payload.heartbeatIntervalMs)
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
function isRetryable(error) { return !TERMINAL_AUTH_ERRORS.has(errorCode(error)) && (!(error instanceof ServerApiError) || error.retryable); }
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