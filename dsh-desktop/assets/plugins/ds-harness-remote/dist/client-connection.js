import { RemoteClientCore } from '@dsh-remote/client-core';
import { AdaptiveTransport } from '@dsh-remote/webrtc';
import { probeRemoteHostFeatures } from './client-capabilities.js';
import { assertAuthorizedHost, ClientModeError, diagnosticReason, DIRECT_LAN_PROGRESS_DISPLAY_MS, DIRECT_WEBRTC_NEGOTIATE_TIMEOUT_MS, iceServersForAttempt, preferredTransportsForAttempt, shortId, transportPreferenceForMode, webrtcDiagnosticsLogFields, websocketUrl, } from './client-runtime-contract.js';
import { ClientSecureTransport } from './client-secure-transport.js';
export class ClientConnection {
    context;
    constructor(context) {
        this.context = context;
    }
    async connect(targetDeviceId, signal) {
        signal?.throwIfAborted();
        const progressRunId = this.context.connectionProgressRun + 1;
        this.context.connectionProgressRun = progressRunId;
        this.context.connectionProgress = { runId: progressRunId, targetDeviceId, phase: 'checking-host' };
        const identity = this.context.requireIdentity();
        let client;
        // Keep cancellation attached through capability discovery as well as the
        // handshake: the candidate is not yet owned by context.connected there.
        const onAbort = () => { void client?.close().catch(() => undefined); };
        signal?.addEventListener('abort', onAbort, { once: true });
        try {
            const serverDevice = (await this.context.server.listDevices()).find(device => device.deviceId === targetDeviceId);
            signal?.throwIfAborted();
            if (serverDevice === undefined) {
                throw new ClientModeError('MEMBERSHIP_REQUIRED', 'The selected Host is not authorized for this account.');
            }
            this.updateConnectionProgress(progressRunId, 'authorizing-peer');
            const target = await this.authorizeHostPeer(serverDevice);
            signal?.throwIfAborted();
            const presence = await this.context.server.presenceFor(targetDeviceId);
            signal?.throwIfAborted();
            if (!presence.online)
                throw new ClientModeError('HOST_OFFLINE', 'The selected Host is offline.', true);
            const credentials = await this.context.server.authenticate(identity);
            signal?.throwIfAborted();
            const rtcFactory = this.context.config.forceRelay
                ? undefined
                : await this.context.rtcFactoryProvider({ routeTargets: [this.context.server.baseUrl] }).catch(() => undefined);
            if (!this.context.config.forceRelay && rtcFactory === undefined) {
                this.context.logger.warn('remote Harness WebRTC backend unavailable; using relay', {
                    targetDeviceId: shortId(target.deviceId),
                });
            }
            let webRtcFallback = false;
            const createTransport = (attempt) => new AdaptiveTransport(websocketUrl(this.context.server.baseUrl), {
                role: 'client',
                deviceId: identity.deviceId,
                accessToken: credentials.accessToken,
                targetDeviceId,
                forceRelay: this.context.config.forceRelay || attempt === 'relay',
                preferredTransports: preferredTransportsForAttempt(attempt),
                negotiateTimeoutMs: attempt === 'direct' ? DIRECT_WEBRTC_NEGOTIATE_TIMEOUT_MS : undefined,
                ...(rtcFactory === undefined || attempt === 'relay' ? {} : { rtcFactory }),
                fetchIceServers: async (connectionId) => iceServersForAttempt(attempt, await this.context.server.turnCredentials(connectionId)),
                onWebRtcFallback: (error, diagnostics) => {
                    webRtcFallback = true;
                    this.context.logger.warn(attempt === 'direct'
                        ? 'remote Harness direct WebRTC failed; trying TURN'
                        : 'remote Harness TURN WebRTC failed; using relay', {
                        targetDeviceId: shortId(target.deviceId),
                        attempt,
                        reason: diagnosticReason(error),
                    });
                    if (diagnostics !== undefined) {
                        this.context.logger.debug('remote Harness WebRTC fallback diagnostics', {
                            targetDeviceId: shortId(target.deviceId),
                            attempt,
                            ...webrtcDiagnosticsLogFields(diagnostics),
                        });
                    }
                },
            });
            const attempts = this.context.config.forceRelay || rtcFactory === undefined
                ? ['relay']
                : ['direct', 'turn', 'relay'];
            let transport;
            for (const attempt of attempts) {
                webRtcFallback = false;
                const stopProgressTimer = this.beginAttemptProgress(progressRunId, attempt);
                try {
                    transport = createTransport(attempt);
                    client = new RemoteClientCore(new ClientSecureTransport(transport, identity, target), 60_000);
                    const attemptClient = client;
                    signal?.throwIfAborted();
                    await attemptClient.connect();
                    signal?.throwIfAborted();
                }
                finally {
                    stopProgressTimer();
                }
                if (attempt === 'relay' || !webRtcFallback)
                    break;
                await client.close();
                client = undefined;
                transport = undefined;
                if (attempt === 'turn') {
                    this.context.logger.info('remote Harness relay fallback re-established', {
                        targetDeviceId: shortId(target.deviceId),
                    });
                }
            }
            if (client === undefined || transport === undefined) {
                throw new ClientModeError('CONNECTION_FAILED', 'Unable to establish a remote transport.', true);
            }
            const connectedClient = client;
            const connectedTransport = transport;
            const connectedPreference = transportPreferenceForMode(connectedClient.getStats().mode);
            this.updateConnectionProgress(progressRunId, 'connected', connectedPreference === undefined ? undefined : [connectedPreference]);
            connectedClient.onClose(() => {
                if (this.context.connected?.client !== connectedClient)
                    return;
                void this.context.closePreview();
                this.context.connected = undefined;
                this.context.connectionProgress = undefined;
                this.context.pendingWorkspaceSelection = undefined;
                void this.context.closeCodexVirtual();
                void this.context.closeCursorVirtual();
                this.context.gatewaySwitch.disconnectRemote();
                void connectedClient.close().catch(() => undefined);
                this.context.logger.warn('remote Harness transport closed; keeping Remote authority disconnected', {
                    targetDeviceId: shortId(target.deviceId),
                });
            });
            const connectionDetails = await connectedTransport.connectionDetails().catch(() => undefined);
            this.context.logger.info('remote Harness transport ready', {
                targetDeviceId: shortId(target.deviceId),
                transport: connectedClient.getStats().mode,
                ...(connectionDetails === undefined ? {} : {
                    preferredTransports: connectionDetails.preferredTransports,
                    negotiatedCapabilities: connectionDetails.negotiatedCapabilities,
                    webRtcEnabled: connectionDetails.webRtcEnabled,
                }),
            });
            if (connectionDetails?.webRtc?.diagnostics !== undefined) {
                this.context.logger.debug('remote Harness transport diagnostics', {
                    targetDeviceId: shortId(target.deviceId),
                    ...webrtcDiagnosticsLogFields(connectionDetails.webRtc.diagnostics),
                });
            }
            const features = await probeRemoteHostFeatures(connectedClient, serverDevice.clientVersion);
            signal?.throwIfAborted();
            return {
                client: connectedClient,
                target,
                transport: connectedTransport,
                features,
                progressRunId,
                ...(serverDevice.clientVersion === undefined ? {} : { clientVersion: serverDevice.clientVersion }),
                ...(serverDevice.harnessVersion === undefined ? {} : { harnessVersion: serverDevice.harnessVersion }),
            };
        }
        catch (error) {
            this.clearConnectionProgress(progressRunId);
            await client?.close().catch(() => undefined);
            throw error;
        }
        finally {
            signal?.removeEventListener('abort', onAbort);
        }
    }
    beginAttemptProgress(runId, attempt) {
        if (attempt !== 'direct') {
            this.updateConnectionProgress(runId, 'probing', [attempt]);
            return () => undefined;
        }
        this.updateConnectionProgress(runId, 'probing', ['lan']);
        // LAN and P2P candidates are gathered inside one ICE attempt. The
        // linear Remote UI still needs a single active route, so advance the
        // visible cue if direct negotiation takes longer than a local probe.
        const timer = setTimeout(() => {
            if (this.context.connectionProgress?.runId === runId && this.context.connectionProgress.phase === 'probing') {
                this.updateConnectionProgress(runId, 'probing', ['p2p']);
            }
        }, DIRECT_LAN_PROGRESS_DISPLAY_MS);
        return () => clearTimeout(timer);
    }
    updateConnectionProgress(runId, phase, activeTransports) {
        if (this.context.connectionProgress?.runId !== runId)
            return;
        this.context.connectionProgress = {
            runId,
            targetDeviceId: this.context.connectionProgress.targetDeviceId,
            phase,
            ...(activeTransports === undefined ? {} : { activeTransports }),
        };
    }
    clearConnectionProgress(runId) {
        if (this.context.connectionProgress?.runId === runId)
            this.context.connectionProgress = undefined;
    }
    async authorizeHostPeer(serverDevice) {
        const descriptor = await this.context.server.deviceFor(serverDevice.deviceId);
        assertAuthorizedHost(serverDevice, descriptor);
        const existing = this.context.identities.trustedPeer(descriptor.deviceId);
        if (existing !== undefined && existing.publicKey !== descriptor.identityKey) {
            throw new ClientModeError('PEER_IDENTITY_MISMATCH', 'The authorized Host identity key changed unexpectedly.');
        }
        if (existing !== undefined
            && existing.membershipId === descriptor.membershipId
            && existing.name === descriptor.name
            && existing.platform === descriptor.platform) {
            return existing;
        }
        return this.context.identities.trustPeer({
            deviceId: descriptor.deviceId,
            name: descriptor.name,
            platform: descriptor.platform,
            publicKey: descriptor.identityKey,
            membershipId: descriptor.membershipId,
        });
    }
}
//# sourceMappingURL=client-connection.js.map