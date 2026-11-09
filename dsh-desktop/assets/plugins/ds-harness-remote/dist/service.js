import { HostPairing } from './host-pairing.js';
import { WorkspaceUploadHost } from './workspace-upload.js';
import { workspaceUploadRootResolver } from './workspace-upload-authority.js';
import { LoopbackHost } from './loopback-host.js';
import { TerminalPolicy } from './terminal-policy.js';
import { createEvent } from '@dsh-remote/protocol';
import { ConnectionController } from './connection-controller.js';
import { harnessSessionGeneration, readHarnessDistributionVersion, } from './harness-version.js';
import { RpcRouter } from './rpc-router.js';
import { RemoteFileViewerBridge } from './file-viewer-bridge.js';
import { HostServerApi, ServerApiError, } from './server-api.js';
import { HostServerConnection } from './server-connection.js';
import { ServerCredentialStore } from './server-credentials.js';
import { HarnessRemoteBridge } from './harness-remote-bridge.js';
import { PluginRouteBridge } from './plugin-route-bridge.js';
import { loadNodeRtcFactory } from './werift-rtc.js';
import { CodexRemoteDomain } from './codex/domain.js';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { AcpRemoteGateway } from './acp/gateway.js';
import { RpcError } from './safe-error.js';
import { CodexWorkspaceBridge, CodexWorkspaceState } from './codex-workspace-bridge.js';
export class HostPluginRuntime {
    config;
    identities;
    logger;
    localGateway;
    fileViewerHost;
    terminalSpawner;
    pluginRoutes;
    schedule;
    connections;
    terminalOwners = new Map();
    loopbackHosts = new Set();
    terminalEnabled;
    loopbackPorts;
    identity;
    serverApi;
    serverConnection;
    harnessVersion;
    pairing;
    closed = false;
    codex;
    acp;
    codexWorkspaceState = new CodexWorkspaceState(key => TerminalPolicy.releaseOwner(this.terminalOwners, key));
    localCodexPeer;
    localCodexPublish = async () => undefined;
    localAcpPeer;
    localAcpPublish = async () => undefined;
    constructor(config, identities, logger, localGateway, fileViewerHost, 
    /** PTY-backed terminal provider from the Host `subprocess` service, when present. */
    terminalSpawner, pluginRoutes, 
    /** Host `schedule` service; absent on Hosts whose composition omits reminders. */
    schedule) {
        this.config = config;
        this.identities = identities;
        this.logger = logger;
        this.localGateway = localGateway;
        this.fileViewerHost = fileViewerHost;
        this.terminalSpawner = terminalSpawner;
        this.pluginRoutes = pluginRoutes;
        this.schedule = schedule;
        this.terminalEnabled = config.terminal.enabled;
        this.loopbackPorts = [...config.loopback.ports];
        this.codex = new CodexRemoteDomain(config.codex, logger);
        this.acp = new AcpRemoteGateway(config.acp ?? { enabled: false, backends: [] }, logger, undefined, undefined, () => this.terminalEnabled, this.terminalSpawner);
        this.connections = new ConnectionController(this.identities, (context, send) => {
            const peerGateway = this.localGateway?.createPeer?.() ?? this.localGateway;
            const harnessRemote = peerGateway?.supportsCarrier === true
                ? new HarnessRemoteBridge(peerGateway, (event, data) => send(createEvent(event, data)), this.logger, this.harnessVersion, new TerminalPolicy(() => this.terminalEnabled, context.peerDeviceId, this.terminalOwners), new CodexWorkspaceBridge((threadId, signal) => this.codex.resolveThreadWorkspace(context.connectionId, threadId), () => this.terminalEnabled, this.codexWorkspaceState, this.terminalSpawner), workspaceUploadRootResolver(peerGateway, () => harnessSessionGeneration(this.harnessVersion) === 'v3', threadId => this.codex.resolveThreadWorkspace(context.connectionId, threadId), sessionId => this.acp.resolveUploadWorkspace(context.connectionId, sessionId)), this.schedule)
                : undefined;
            const fileViewer = new RemoteFileViewerBridge(() => this.fileViewerHost?.(), this.logger);
            const codex = this.codex.createPeer(context, (event, data) => send(createEvent(event, data)));
            const cursor = this.acp.createPeer(context, (event, data) => send(createEvent(event, data)));
            // The dispatcher must resolve inside the callback: the DSH connection
            // service (and its shared fetch handler) may become ready after this
            // plugin is activated.
            const dispatcher = this.pluginRoutes?.(peerGateway?.peer);
            const pluginRoute = dispatcher === undefined ? undefined : new PluginRouteBridge(dispatcher, this.logger);
            return new RpcRouter(undefined, this.logger, fileViewer, harnessRemote, () => this.hostCapabilities(), codex, cursor, 
            // Handles and their lifetime belong to this connection; only policy is shared.
            this.createLoopbackHost(), () => this.hostWorkspaceTypes(), pluginRoute, new WorkspaceUploadHost(workspaceUploadRootResolver(peerGateway, () => harnessSessionGeneration(this.harnessVersion) === 'v3', threadId => this.codex.resolveThreadWorkspace(context.connectionId, threadId), sessionId => this.acp.resolveUploadWorkspace(context.connectionId, sessionId)), undefined, context.transportMode));
        }, this.logger);
        if (config.serverUrl !== undefined) {
            this.serverApi = new HostServerApi(config.serverUrl, new ServerCredentialStore(identities.directory));
        }
    }
    setTerminalEnabled(enabled) {
        this.terminalEnabled = enabled;
    }
    setLoopbackPorts(ports) {
        this.loopbackPorts = [...ports];
        for (const loopback of this.loopbackHosts)
            loopback.setPorts(this.loopbackPorts);
    }
    backendUpdate = Promise.resolve();
    setAgentBackends(config) {
        const update = this.backendUpdate.catch(() => undefined).then(async () => {
            if (this.closed)
                throw new Error('remote runtime is closed');
            const codexChanged = JSON.stringify(this.config.codex) !== JSON.stringify(config.codex);
            await Promise.all([this.codex.reconfigure(config.codex), this.acp.reconfigure(config.acp ?? { enabled: false, backends: [] })]);
            if (codexChanged)
                await this.codexWorkspaceState.dispose();
            this.config.codex = config.codex;
        });
        this.backendUpdate = update;
        return update;
    }
    createLoopbackHost() {
        let loopback;
        loopback = new LoopbackHost(() => this.loopbackPorts, () => this.loopbackHosts.delete(loopback));
        this.loopbackHosts.add(loopback);
        return loopback;
    }
    async start() {
        if (this.closed)
            throw new Error('remote runtime is closed');
        this.identity = await this.identities.loadOrCreate(this.config.deviceName);
        this.logger.info('host identity ready', {
            deviceId: shortId(this.identity.deviceId),
            fingerprint: this.identity.fingerprint,
            server: this.config.serverUrl ?? 'not configured',
        });
        await this.codex.start();
        void this.acp.start().catch(() => {
            this.logger.warn('ACP background initialization failed', { code: 'ACP_START_FAILED' });
        });
        if (this.serverApi !== undefined) {
            this.harnessVersion = await this.readHarnessVersion();
            this.serverApi.setHarnessVersion(this.harnessVersion);
            this.serverApi.bindIdentity(this.identity);
            await this.serverApi.loadStoredPolicy();
            this.initializePairing();
            this.serverConnection = this.createServerConnection(this.identity);
            if (this.config.hostControl?.enabled !== false)
                this.serverConnection.start();
        }
    }
    currentIdentity() {
        if (this.identity === undefined)
            throw new Error('remote runtime has not started');
        return this.identity;
    }
    acceptAuthenticatedPeer(channel) {
        this.currentIdentity();
        return this.connections.accept(channel);
    }
    hostStatus() {
        const error = this.serverConnection?.lastError();
        const authorization = this.serverApi?.currentAuthorization();
        return {
            ...(this.identity === undefined ? {} : { deviceId: this.identity.deviceId }),
            configured: this.serverApi !== undefined,
            online: this.serverConnection?.isOnline() ?? false,
            reconnecting: this.serverConnection?.isReconnecting() ?? false,
            recoveryExpiresAt: this.serverConnection?.recoveryExpiresAt(),
            ...(this.serverConnection?.lastActivity() === undefined
                ? {}
                : { lastActiveAt: this.serverConnection.lastActivity() }),
            ...(error === undefined ? {} : { error }),
            ...(authorization?.account === undefined ? {} : { account: authorization.account }),
            authorized: authorization !== undefined,
            pairingHostOnly: this.serverApi?.pairingHostOnly() ?? false,
            accountRequired: error === 'ACCOUNT_AUTH_REQUIRED' || error === 'AUTH_REQUIRED' || error === 'AUTH_INVALID' || error === 'TOKEN_EXPIRED' || error === 'DEVICE_REVOKED' || error === 'DEVICE_OWNERSHIP_REQUIRED',
            connectedClients: this.listConnectedClients(),
        };
    }
    initializePairing() {
        this.pairing?.close();
        if (!this.serverApi || !this.identity || !this.config.serverUrl) {
            this.pairing = undefined;
            return;
        }
        this.pairing = new HostPairing(this.config.serverUrl, this.identities.directory, this.identity, {
            deviceId: this.identity.deviceId, name: this.identity.name, role: 'host', platform: process.platform,
            identityKey: this.identity.publicKey,
            ...(this.harnessVersion === undefined ? {} : { harnessVersion: this.harnessVersion }),
        }, async (result) => { await this.serverApi.adoptPairing(result); if (!this.closed)
            this.serverConnection?.reconnect(); });
    }
    async pairingControl(action, input) {
        if (this.pairing === undefined || this.closed)
            throw new ServerApiError('SERVER_NOT_CONFIGURED', 'Configure and save the Server URL before pairing.', false);
        if (action === 'start')
            return this.pairing.start();
        if (action === 'status')
            return this.pairing.status();
        if (typeof input.sessionId !== 'string')
            throw new ServerApiError('INVALID_MESSAGE', 'A specific pairing session is required.', false);
        return action === 'confirm' ? this.pairing.confirm(input.sessionId, input.verificationCode) : this.pairing.cancel(input.sessionId);
    }
    async hasStoredAuthorization() {
        return this.serverApi?.hasStoredAuthorization() ?? false;
    }
    listConnectedClients() {
        return this.connections.connectedPeers().map(peer => {
            const trusted = this.identities.trustedPeer(peer.deviceId);
            return {
                deviceId: peer.deviceId,
                name: trusted?.name.trim() ?? '',
                ...(trusted === undefined ? {} : { platform: trusted.platform }),
                ...(peer.mode === undefined ? {} : { mode: peer.mode }),
            };
        });
    }
    localHarnessVersion() {
        return this.harnessVersion;
    }
    reconnectHost() {
        if (this.closed)
            throw new Error('remote runtime is closed');
        if (this.serverConnection === undefined) {
            throw new ServerApiError('SERVER_NOT_CONFIGURED', 'Configure serverUrl before reconnecting.', false);
        }
        this.serverConnection.reconnect();
    }
    async hostOAuthProviders() {
        if (this.serverApi === undefined) {
            throw new ServerApiError('SERVER_NOT_CONFIGURED', 'Remote Host Server is unavailable.', false);
        }
        return this.serverApi.oauthProviders();
    }
    async startHostOAuthQrLogin(provider) {
        if (this.serverApi === undefined) {
            throw new ServerApiError('SERVER_NOT_CONFIGURED', 'Remote Host Server is unavailable.', false);
        }
        return this.serverApi.startOAuthQrLogin(provider);
    }
    async pollHostOAuthQrLogin(qrId) {
        if (this.serverApi === undefined) {
            throw new ServerApiError('SERVER_NOT_CONFIGURED', 'Remote Host Server is unavailable.', false);
        }
        const result = await this.serverApi.pollOAuthQrLogin(this.currentIdentity(), qrId, async () => {
            await this.serverConnection?.stop();
            await this.pairing?.discard();
            this.pairing = undefined;
            this.identity = await this.identities.reset(this.config.deviceName);
            this.serverApi.bindIdentity(this.identity);
            this.serverConnection = this.createServerConnection(this.identity);
            this.initializePairing();
            return this.identity;
        });
        if (result.status === 'complete') {
            this.serverConnection?.reconnect();
            this.logger.info('Host account authorized through OAuth QR login');
        }
        return result;
    }
    async clearHostAuthorization() {
        await this.pairing?.discard();
        this.pairing = undefined;
        await this.serverConnection?.stop();
        let revokeFailure;
        try {
            await this.serverApi?.revokeCurrentDevice();
        }
        catch (error) {
            revokeFailure = error;
        }
        this.identity = await this.identities.reset(this.config.deviceName);
        this.serverApi?.bindIdentity(this.identity);
        if (this.serverApi !== undefined)
            this.serverConnection = this.createServerConnection(this.identity);
        this.initializePairing();
        this.logger.info('Host authorization cleared');
        if (revokeFailure !== undefined)
            throw revokeFailure;
    }
    async authorizeHostAsOwned(accessToken, account) {
        if (this.serverApi === undefined) {
            throw new ServerApiError('SERVER_NOT_CONFIGURED', 'Configure serverUrl before enabling Host access.', false);
        }
        let result;
        try {
            result = await this.serverApi.authorizeOwnedRole(this.currentIdentity(), accessToken, account);
        }
        catch (error) {
            if (!(error instanceof ServerApiError) || error.code !== 'DEVICE_REVOKED')
                throw error;
            await this.serverConnection?.stop();
            await this.pairing?.discard();
            this.pairing = undefined;
            this.identity = await this.identities.reset(this.config.deviceName);
            this.serverApi.bindIdentity(this.identity);
            this.serverConnection = this.createServerConnection(this.identity);
            this.initializePairing();
            result = await this.serverApi.authorizeOwnedRole(this.identity, accessToken, account);
            this.logger.info('Rotated revoked Host identity before owned-device authorization');
        }
        this.serverConnection?.resume();
        this.logger.info('Host authorized as an owned device');
        return result;
    }
    async authorizeHostWithAccount(email, password) {
        if (this.serverApi === undefined) {
            throw new ServerApiError('SERVER_NOT_CONFIGURED', 'Configure serverUrl before signing in.', false);
        }
        const result = await this.serverApi.authorizeWithAccount(this.currentIdentity(), email, password, async () => {
            await this.serverConnection?.stop();
            await this.pairing?.discard();
            this.pairing = undefined;
            this.identity = await this.identities.reset(this.config.deviceName);
            this.serverApi.bindIdentity(this.identity);
            this.serverConnection = this.createServerConnection(this.identity);
            this.initializePairing();
            this.logger.info('Rotated revoked Host identity before account authorization');
            return this.identity;
        });
        this.serverConnection?.resume();
        this.logger.info('Host account authorized');
        return result;
    }
    async authorizeHostWithCode(code) {
        if (this.serverApi === undefined) {
            throw new ServerApiError('SERVER_NOT_CONFIGURED', 'Configure serverUrl before entering a Host registration code.', false);
        }
        const result = await this.serverApi.authorizeHostWithCode(this.currentIdentity(), code);
        this.serverConnection?.resume();
        this.logger.info('Host registration code authorized');
        return result;
    }
    async revokePeer(deviceId) {
        const revoked = await this.identities.revokePeer(deviceId);
        if (revoked)
            await this.connections.revoke(deviceId);
        return revoked;
    }
    codexStatus() {
        return this.codex.status();
    }
    codexCall(input) {
        return this.requireLocalCodexPeer().call(input);
    }
    codexRespond(input) {
        return this.requireLocalCodexPeer().respond(input);
    }
    codexOpenStream(input, publish) {
        this.localCodexPublish = publish;
        return this.requireLocalCodexPeer().openStream(input);
    }
    async codexCloseStream(input) {
        const peer = this.localCodexPeer;
        if (peer !== undefined)
            return peer.closeStream(input);
        const streamId = isPlainRecord(input) && typeof input.streamId === 'string' ? input.streamId : undefined;
        if (streamId === undefined)
            throw new RpcError('INVALID_MESSAGE', 'A Codex stream is required.');
        return { closed: false, streamId };
    }
    acpStatus() {
        return this.acp.status();
    }
    acpCall(input) {
        return this.requireLocalAcpPeer().call(input);
    }
    acpRespond(input) {
        return this.requireLocalAcpPeer().respond(input);
    }
    acpOpenStream(input, publish) {
        this.localAcpPublish = publish;
        return this.requireLocalAcpPeer().openStream(input);
    }
    async acpCloseStream(input) {
        const peer = this.localAcpPeer;
        if (peer !== undefined)
            return peer.closeStream(input);
        const streamId = isPlainRecord(input) && typeof input.streamId === 'string' ? input.streamId : undefined;
        if (streamId === undefined)
            throw new RpcError('INVALID_MESSAGE', 'A Cursor stream is required.');
        return { closed: false, streamId };
    }
    async close() {
        if (this.closed)
            return;
        this.closed = true;
        this.pairing?.close();
        this.serverApi?.close();
        await this.serverConnection?.stop();
        await this.connections.close();
        await this.localCodexPeer?.closeAll();
        this.localCodexPeer = undefined;
        await this.localAcpPeer?.closeAll();
        this.localAcpPeer = undefined;
        const shutdown = await Promise.allSettled([this.codexWorkspaceState.dispose(), this.codex.close(), this.acp.close()]);
        if (shutdown.some(result => result.status === 'rejected'))
            throw new RpcError('HOST_SHUTDOWN_FAILED', 'Some Host backend processes could not be stopped.');
        this.logger.info('host runtime stopped');
    }
    diagnostics() {
        return {
            loaded: this.identity !== undefined,
            deviceId: this.identity === undefined ? undefined : shortId(this.identity.deviceId),
            identityValid: this.identity !== undefined,
            serverConfigured: this.config.serverUrl !== undefined,
            serverOnline: this.serverConnection?.isOnline() ?? false,
            serverError: this.serverConnection?.lastError(),
            online: this.connections.isOnline(),
            activeConnections: this.connections.connectionCount(),
            peerDeviceId: this.connections.peerDeviceId() === undefined ? undefined : shortId(this.connections.peerDeviceId()),
            peerDeviceIds: this.connections.peerDeviceIds().map(shortId),
            trustedPeers: this.identities.listTrustedPeers().length,
            capabilities: this.hostCapabilities(),
            workspaceTypes: this.hostWorkspaceTypes(),
            codex: this.codex.status(),
            acp: this.acp.status(),
        };
    }
    createServerConnection(identity) {
        return new HostServerConnection(this.config, identity, this.identities, this.serverApi, this.connections, this.logger, undefined, this.config.forceRelay
            ? undefined
            : () => loadNodeRtcFactory({ routeTargets: this.config.serverUrl === undefined ? [] : [this.config.serverUrl] }), () => this.hostCapabilities(), this.harnessVersion);
    }
    async readHarnessVersion() {
        const version = await readHarnessDistributionVersion();
        if (version === undefined)
            this.logger.warn('Harness version is unavailable');
        return version;
    }
    hostCapabilities() {
        const capabilities = ['workspace.upload.v1'];
        if (this.loopbackPorts.length > 0)
            capabilities.push('loopback.http-ws.v1');
        if (this.localGateway?.supportsCarrier === true) {
            capabilities.push(harnessSessionGeneration(this.harnessVersion) === 'v3' ? 'harness.remote.v3' : 'harness.remote.v1', 'harness.remote.transfer.v1');
        }
        if (this.localGateway?.supportsCarrier && this.terminalEnabled)
            capabilities.push('harness.terminal.v1');
        if (this.fileViewerHost?.() !== undefined)
            capabilities.push('fileviewer.read.v1');
        if (this.pluginRoutes?.() !== undefined)
            capabilities.push('plugin.route.v1');
        if (this.codex.isAvailable())
            capabilities.push('codex.appserver.v1', 'codex.appserver.transfer.v1');
        // Protocol support is stable during background warmup; workspaceTypes reports readiness.
        if (this.acp.enabledBackends().length > 0) {
            capabilities.push('agent.acp.v1', 'agent.acp.transfer.v1', 'agent.acp.workspace-files.v1');
            if (this.acp.enabledBackends().includes('opencode'))
                capabilities.push('agent.acp.opencode.archive.v1');
            if (this.terminalEnabled)
                capabilities.push('agent.acp.terminal.v1');
            if (this.acp.enabledBackends().includes('antigravity'))
                capabilities.push('agent.acp.antigravity.models.v1', 'agent.acp.antigravity.model-load.v1');
            for (const backend of this.acp.enabledBackends()) {
                capabilities.push(`agent.acp.${backend}.v1`);
            }
        }
        return capabilities;
    }
    hostWorkspaceTypes() {
        const types = [];
        if (this.codex.isAvailable()) {
            types.push({
                id: 'codex',
                name: 'CodeX',
                capability: 'codex.appserver.v1',
                available: true,
            });
        }
        const readyBackends = this.acp.availableBackends();
        for (const backend of this.acp.enabledBackends()) {
            types.push({
                id: backend,
                name: backend === 'claude' ? 'Claude' : backend === 'hermes' ? 'Hermes' : backend === 'pi' ? 'Pi' : backend === 'cursor' ? 'Cursor' : backend === 'antigravity' ? 'Antigravity' : backend === 'opencode' ? 'OpenCode' : backend,
                capability: `agent.acp.${backend}.v1`,
                available: readyBackends.includes(backend),
            });
        }
        return types;
    }
    acpAvailable(command) {
        if (command === 'opencode') {
            try {
                if (existsSync('/usr/local/bin/opencode') || existsSync('/var/lib/dsh/.opencode/bin/opencode'))
                    return true;
            }
            catch { }
        }
        try {
            execFileSync(process.platform === 'win32' ? 'where' : 'which', [command], { stdio: 'ignore' });
            return true;
        }
        catch {
            return false;
        }
    }
    requireLocalCodexPeer() {
        if (!this.codex.isAvailable()) {
            throw new RpcError('CODEX_UNAVAILABLE', 'Local CodeX is disabled or unavailable on this Host.');
        }
        if (this.localCodexPeer !== undefined)
            return this.localCodexPeer;
        const identity = this.currentIdentity();
        const peer = this.codex.createPeer({
            connectionId: `loopback:${identity.deviceId}`,
            peerDeviceId: identity.deviceId,
        }, (event, data) => this.localCodexPublish(event, data));
        if (peer === undefined) {
            throw new RpcError('CODEX_UNAVAILABLE', 'Local CodeX is disabled or unavailable on this Host.');
        }
        this.localCodexPeer = peer;
        return peer;
    }
    requireLocalAcpPeer() {
        if (!this.acp.isAvailable()) {
            throw new RpcError('CURSOR_UNAVAILABLE', 'Local Agent ACP is disabled or unavailable on this Host.');
        }
        if (this.localAcpPeer !== undefined)
            return this.localAcpPeer;
        const identity = this.currentIdentity();
        const peer = this.acp.createPeer({
            connectionId: `loopback:${identity.deviceId}`,
            peerDeviceId: identity.deviceId,
        }, (event, data) => this.localAcpPublish(event, data));
        if (peer === undefined) {
            throw new RpcError('CURSOR_UNAVAILABLE', 'Local Agent ACP is disabled or unavailable on this Host.');
        }
        this.localAcpPeer = peer;
        return peer;
    }
}
function shortId(value) { return value.length <= 12 ? value : `${value.slice(0, 8)}…${value.slice(-4)}`; }
function isPlainRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
//# sourceMappingURL=service.js.map