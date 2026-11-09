import { AgentAcpClient, CodexRemoteClient } from '@dsh-remote/client-core';
import { AcpVirtualHarness, discoverAcpVirtualWorkspaces } from './acp/virtual-harness.js';
import { probeRemoteHostFeatures, remoteHostFeatures } from './client-capabilities.js';
import { ClientCodexStreams } from './client-codex-streams.js';
import { ClientConnection } from './client-connection.js';
import { ClientControl } from './client-control.js';
import { ClientModeError, HOST_AUTHORIZATION_ERRORS, record, shortId } from './client-runtime-contract.js';
import { readRemoteWorkspaceBaseline, remoteWorkspaceTitle, workspaceRecordId, } from './client-workspace-queries.js';
import { codexProjectWorkspaceId, CodexVirtualHarness, discoverCodexVirtualWorkspaces, } from './codex/virtual-harness.js';
import { registerControlRoute } from './control-route.js';
import { harnessSessionGeneration } from './harness-version.js';
import { uuidV7 } from './ids.js';
import { RemoteTypertGateway } from './remote-typert-gateway.js';
import { safeErrorCode } from './safe-error.js';
import { ServerApiError } from './server-api.js';
import { TypertGatewaySwitch } from './typert-gateway-switch.js';
import { loadNodeRtcFactory } from './werift-rtc.js';
export class ClientModeRuntime {
    config;
    identities;
    server;
    logger;
    host;
    rtcFactoryProvider;
    async connect(targetDeviceId, signal) {
        const lifetime = this.remoteLifetime.signal;
        const connectionSignal = signal === undefined ? lifetime : AbortSignal.any([lifetime, signal]);
        connectionSignal.throwIfAborted();
        const remote = await this.connection.connect(targetDeviceId, connectionSignal);
        if (connectionSignal.aborted || this.closed) {
            await remote.client.close().catch(() => undefined);
            throw new ClientModeError('CANCELLED', 'The Remote connection request was superseded or closed.');
        }
        return remote;
    }
    handleControl(endpoint, payload, signal) {
        return this.control.handleControl(endpoint, payload, signal);
    }
    connection;
    control;
    codexStreamBridge;
    preview;
    identity;
    connected;
    pendingWorkspaceSelection;
    codexVirtual;
    codexVirtualSelection;
    codexOpenedSessions = new Map();
    codexOpenGeneration = 0;
    cursorVirtual;
    acpVirtualBackend = 'cursor';
    gatewaySwitch;
    codexStreams = new Map();
    connectionProgress;
    connectionProgressRun = 0;
    closed = false;
    remoteLifetime = new AbortController();
    constructor(config, identities, server, typertGateway, logger, host, rtcFactoryProvider = loadNodeRtcFactory) {
        this.config = config;
        this.identities = identities;
        this.server = server;
        this.logger = logger;
        this.host = host;
        this.rtcFactoryProvider = rtcFactoryProvider;
        const owner = this;
        this.connection = new ClientConnection({
            get connectionProgressRun() { return owner.connectionProgressRun; },
            set connectionProgressRun(value) { owner.connectionProgressRun = value; },
            get connectionProgress() { return owner.connectionProgress; },
            set connectionProgress(value) { owner.connectionProgress = value; },
            requireIdentity: (...args) => owner.requireIdentity(...args),
            get server() { return owner.server; },
            get config() { return owner.config; },
            get rtcFactoryProvider() { return owner.rtcFactoryProvider; },
            get logger() { return owner.logger; },
            get connected() { return owner.connected; },
            set connected(value) { owner.connected = value; },
            closePreview: (...args) => owner.closePreview(...args),
            get pendingWorkspaceSelection() { return owner.pendingWorkspaceSelection; },
            set pendingWorkspaceSelection(value) { owner.pendingWorkspaceSelection = value; },
            closeCodexVirtual: (...args) => owner.closeCodexVirtual(...args),
            closeCursorVirtual: (...args) => owner.closeCursorVirtual(...args),
            get gatewaySwitch() { return owner.gatewaySwitch; },
            get identities() { return owner.identities; },
        });
        this.control = new ClientControl({
            detailedStatus: (...args) => owner.detailedStatus(...args),
            devices: (...args) => owner.devices(...args),
            get server() { return owner.server; },
            authorizeClientWithAccount: (...args) => owner.authorizeClientWithAccount(...args),
            startClientOAuthQrLogin: (...args) => owner.startClientOAuthQrLogin(...args),
            pollClientOAuthQrLogin: (...args) => owner.pollClientOAuthQrLogin(...args),
            activeRemote: (...args) => owner.activeRemote(...args),
            get preview() { return owner.preview; },
            set preview(value) { owner.preview = value; },
            listRemoteDirectory: (...args) => owner.listRemoteDirectory(...args),
            listRemoteWorkspaces: (...args) => owner.listRemoteWorkspaces(...args),
            listCodexWorkspaces: (...args) => owner.listCodexWorkspaces(...args),
            openRemoteWorkspace: (...args) => owner.openRemoteWorkspace(...args),
            openCodexWorkspace: (...args) => owner.openCodexWorkspace(...args),
            createCodexWorkspace: (...args) => owner.createCodexWorkspace(...args),
            listCursorWorkspaces: (...args) => owner.listCursorWorkspaces(...args),
            openCursorWorkspace: (...args) => owner.openCursorWorkspace(...args),
            createCursorWorkspace: (...args) => owner.createCursorWorkspace(...args),
            consumeWorkspaceSelection: (...args) => owner.consumeWorkspaceSelection(...args),
            callRemoteFileViewer: (...args) => owner.callRemoteFileViewer(...args),
            activeCodexRemote: (...args) => owner.codexStreamBridge.activeCodexRemote(...args),
            requireLocalCodex: (...args) => owner.codexStreamBridge.requireLocalCodex(...args),
            localCodexAvailable: (...args) => owner.codexStreamBridge.localCodexAvailable(...args),
            pluginRoute: (...args) => owner.pluginRoute(...args),
            openCodexStream: (...args) => owner.codexStreamBridge.openCodexStream(...args),
            nextCodexFrames: (...args) => owner.codexStreamBridge.nextCodexFrames(...args),
            closeCodexStream: (...args) => owner.codexStreamBridge.closeCodexStream(...args),
            get host() { return owner.host; },
            setHostAuthorization: (...args) => owner.setHostAuthorization(...args),
            setMode: (...args) => owner.setMode(...args),
        });
        this.codexStreamBridge = new ClientCodexStreams({
            activeRemote: (...args) => owner.activeRemote(...args),
            get codexStreams() { return owner.codexStreams; },
            get host() { return owner.host; },
        });
        this.gatewaySwitch = new TypertGatewaySwitch(typertGateway);
    }
    async start() {
        if (this.closed)
            throw new Error('client remote-mode runtime is closed');
        this.identity = await this.identities.loadOrCreate(this.config.deviceName);
        this.server.bindIdentity(this.identity);
        this.gatewaySwitch.install();
        this.logger.info('client remote-mode identity ready', {
            deviceId: shortId(this.identity.deviceId),
            fingerprint: this.identity.fingerprint,
        });
        // A previously authorized Client should make the local Host controllable
        // on startup as well. Do not register an anonymous Client just to probe:
        // only persisted Client credentials opt into this default.
        if (this.config.hostControl?.enabled !== false
            && this.host !== undefined
            && this.server.hasStoredAuthorization !== undefined) {
            try {
                if (await this.server.hasStoredAuthorization()
                    && (this.host.hasStoredAuthorization === undefined || !await this.host.hasStoredAuthorization())) {
                    await this.authorizeHostByDefault();
                }
            }
            catch (error) {
                this.logger.warn('automatic Host authorization failed', { code: safeErrorCode(error) });
            }
        }
    }
    async authorizeHostByDefault() {
        try {
            if (this.host === undefined)
                return;
            if (this.config.hostControl?.enabled === false)
                return;
            if (this.host.hostStatus().authorized)
                return;
            if (this.host.hasStoredAuthorization !== undefined && await this.host.hasStoredAuthorization())
                return;
            const credentials = await this.server.authenticate(this.requireIdentity());
            await this.host.authorizeHostAsOwned(credentials.accessToken, credentials.account);
        }
        catch (error) {
            this.logger.warn('automatic Host authorization failed', { code: safeErrorCode(error) });
        }
    }
    registerControl(connection, webServer) {
        return registerControlRoute(connection, (endpoint, payload, signal) => this.control.handleControl(endpoint, payload, signal), webServer);
    }
    status() {
        const targetStatus = this.gatewaySwitch.status();
        return {
            available: this.config.serverUrl !== undefined,
            identityReady: this.identity !== undefined,
            deviceId: this.identity?.deviceId,
            deviceName: this.identity?.name,
            serverUrl: this.config.serverUrl,
            ...targetStatus,
            connected: this.connected !== undefined,
            transport: this.connected?.client.getStats().mode ?? 'Disconnected',
            connectedTargetDeviceId: this.connected?.target.deviceId,
            preferredTransports: this.config.forceRelay ? ['relay'] : ['lan', 'p2p', 'turn', 'relay'],
            ...(this.connectionProgress === undefined ? {} : {
                connectionProgress: {
                    targetDeviceId: this.connectionProgress.targetDeviceId,
                    phase: this.connectionProgress.phase,
                    ...(this.connectionProgress.activeTransports === undefined
                        ? {}
                        : { activeTransports: [...this.connectionProgress.activeTransports] }),
                },
            }),
            remoteFeatures: this.connected?.features ?? remoteHostFeatures(),
            ...(this.pendingWorkspaceSelection === undefined
                ? {}
                : { workspaceSelection: { ...this.pendingWorkspaceSelection } }),
            backend: this.cursorVirtual !== undefined
                ? this.acpVirtualBackend
                : this.codexVirtual === undefined ? 'harness' : 'codex',
            hostAuthorizationAvailable: this.host !== undefined,
            ...(this.host === undefined ? {} : { host: this.host.hostStatus() }),
        };
    }
    async closePreview() {
        const preview = this.preview;
        this.preview = undefined;
        await preview?.close();
    }
    async detailedStatus() {
        const connected = this.connected;
        if (connected === undefined || this.identity === undefined)
            return this.status();
        const details = await connected.transport.connectionDetails();
        if (this.connected !== connected)
            return this.status();
        return {
            ...this.status(),
            network: {
                ...details,
                local: {
                    deviceId: this.identity.deviceId,
                    name: this.identity.name,
                    platform: process.platform,
                },
                remote: {
                    deviceId: connected.target.deviceId,
                    name: connected.target.name,
                    platform: connected.target.platform,
                },
            },
        };
    }
    async devices() {
        this.assertHostAuthorizationForDeviceDiscovery();
        this.requireIdentity();
        const serverDevices = await this.server.listDevices();
        const remoteDevices = serverDevices.filter(device => device.deviceId !== this.host?.hostStatus().deviceId);
        return Promise.all(remoteDevices.map(async (device) => {
            await this.connection.authorizeHostPeer(device);
            const presence = await this.server.presenceFor(device.deviceId).catch(() => ({ online: false }));
            return { ...device, ...presence };
        }));
    }
    /**
     * Device discovery is exposed through the local app control route. When this
     * installation also runs a Host, keep that route closed after the Host's
     * Server credential has become terminally invalid. The Client credential can
     * remain usable for a short time after a revoke, so checking only
     * `ClientServerApi.listDevices()` would otherwise leak the device directory
     * from a Host that the user has already been told to re-authorize.
     */
    assertHostAuthorizationForDeviceDiscovery() {
        const status = this.host?.hostStatus();
        if (status === undefined || status.error === undefined || !HOST_AUTHORIZATION_ERRORS.has(status.error))
            return;
        const message = status.error === 'DEVICE_REVOKED'
            ? 'The local Host was revoked on the Server. Sign out and authorize this Host again.'
            : 'The local Host authorization is no longer valid. Sign out and authorize this Host again.';
        throw new ClientModeError(status.error, message);
    }
    async authorizeClientWithAccount(email, password) {
        let authorization;
        try {
            authorization = await this.server.authorizeWithAccount(this.requireIdentity(), email, password);
        }
        catch (error) {
            if (!(error instanceof ServerApiError) || error.code !== 'DEVICE_REVOKED')
                throw error;
            this.identity = await this.identities.reset(this.config.deviceName);
            this.server.bindIdentity(this.identity);
            authorization = await this.server.authorizeWithAccount(this.identity, email, password);
        }
        await this.authorizeHostByDefault();
        this.logger.info('Client account authorized');
        return authorization;
    }
    async startClientOAuthQrLogin(provider) {
        return this.server.startOAuthQrLogin(provider);
    }
    async pollClientOAuthQrLogin(qrId) {
        const result = await this.server.pollOAuthQrLogin(this.requireIdentity(), qrId, async () => {
            this.identity = await this.identities.reset(this.config.deviceName);
            this.server.bindIdentity(this.identity);
            this.logger.info('Rotated revoked Client identity before QR authorization retry');
            return this.identity;
        });
        if (result.status === 'complete')
            this.logger.info('Client account authorized with QR login');
        if (result.status === 'complete')
            await this.authorizeHostByDefault();
        return result;
    }
    async clearClientAuthorization() {
        const cleanup = this.leaveRemote();
        this.codexOpenedSessions.clear();
        const results = await Promise.allSettled([cleanup, this.server.revokeCurrentDevice()]);
        // Local identity rotation also completes when Server revocation fails.
        this.identity = await this.identities.reset(this.config.deviceName);
        this.server.bindIdentity(this.identity);
        const failure = results.find(result => result.status === 'rejected');
        if (failure?.status === 'rejected')
            throw failure.reason;
    }
    async setHostAuthorization(enabled) {
        if (this.host === undefined)
            throw new ClientModeError('METHOD_NOT_ALLOWED', 'This plugin is not running as a Host.');
        if (!enabled) {
            await this.host.clearHostAuthorization();
            return this.status();
        }
        const credentials = await this.server.authenticate(this.requireIdentity());
        await this.host.authorizeHostAsOwned(credentials.accessToken, credentials.account);
        return this.status();
    }
    async setMode(mode, targetDeviceId, signal) {
        if (mode === 'local') {
            await this.leaveRemote();
            this.logger.info('Harness target switched', { mode: 'local' });
            return this.status();
        }
        if (targetDeviceId === undefined || targetDeviceId.length === 0) {
            throw new ClientModeError('INVALID_MESSAGE', 'A targetDeviceId is required for remote mode.');
        }
        const lifetime = this.remoteLifetime.signal;
        const next = await this.connect(targetDeviceId, signal);
        try {
            this.assertRemoteCompatible(next);
        }
        catch (error) {
            this.connection.clearConnectionProgress(next.progressRunId);
            await next.client.close().catch(() => undefined);
            throw error;
        }
        const previous = this.connected;
        await this.closePreview();
        if (lifetime.aborted || this.closed) {
            await next.client.close().catch(() => undefined);
            throw new ClientModeError('CANCELLED', 'The Remote connection request was superseded or closed.');
        }
        this.connected = next;
        this.connection.clearConnectionProgress(next.progressRunId);
        this.pendingWorkspaceSelection = undefined;
        await this.closeCodexVirtual();
        this.assertRemoteCurrent(next, signal);
        await this.closeCursorVirtual();
        this.assertRemoteCurrent(next, signal);
        this.selectRemoteTarget(next);
        await this.codexStreamBridge.closeCodexStreams(previous?.client);
        await previous?.client.close().catch(() => undefined);
        this.logger.info('Harness target switched', { mode: 'remote', targetDeviceId: shortId(next.target.deviceId) });
        return this.status();
    }
    async listRemoteDirectory(targetDeviceId, path, signal) {
        const remote = await this.ensureConnected(targetDeviceId, signal);
        const value = await new RemoteTypertGateway(remote.client).invoke({
            namespace: 'directoryPicker', method: 'list',
            args: path === undefined ? {} : { path },
            ...(signal === undefined ? {} : { signal }),
        });
        return value;
    }
    async listRemoteWorkspaces(targetDeviceId, signal) {
        const remote = await this.ensureConnected(targetDeviceId, signal);
        return readRemoteWorkspaceBaseline(new RemoteTypertGateway(remote.client), signal);
    }
    async openRemoteWorkspace(targetDeviceId, path, signal) {
        if (path.trim() === '')
            throw new ClientModeError('INVALID_MESSAGE', 'A remote working directory is required.');
        const remote = await this.ensureConnected(targetDeviceId, signal);
        this.assertRemoteCompatible(remote);
        const workspace = await new RemoteTypertGateway(remote.client).invoke({
            namespace: 'workspace', method: 'create',
            args: { request: { path } },
            ...(signal === undefined ? {} : { signal }),
        });
        this.assertRemoteCurrent(remote, signal);
        await this.closeCodexVirtual();
        this.assertRemoteCurrent(remote, signal);
        await this.closeCursorVirtual();
        this.assertRemoteCurrent(remote, signal);
        this.selectRemoteTarget(remote);
        const workspaceId = workspaceRecordId(workspace.workspace);
        this.pendingWorkspaceSelection = { targetDeviceId: remote.target.deviceId, workspaceId };
        this.logger.info('Remote workspace opened', { targetDeviceId: shortId(remote.target.deviceId) });
        return { ...this.status(), workspace };
    }
    async listCodexWorkspaces(targetDeviceId, signal) {
        const remote = await this.ensureConnected(targetDeviceId, signal);
        remote.features = await probeRemoteHostFeatures(remote.client, remote.clientVersion);
        if (!remote.features.codex) {
            throw new ClientModeError('FEATURE_NOT_SUPPORTED', 'The selected Host does not provide CodeX workspaces.');
        }
        return discoverCodexVirtualWorkspaces(new CodexRemoteClient(remote.client), signal);
    }
    async openCodexWorkspace(targetDeviceId, workspaceId, signal) {
        const generation = ++this.codexOpenGeneration;
        const remote = await this.ensureConnected(targetDeviceId, signal, () => this.codexOpenGeneration === generation);
        const assertCurrent = () => {
            signal?.throwIfAborted();
            if (this.closed || this.connected !== remote || this.codexOpenGeneration !== generation) {
                throw new ClientModeError('CANCELLED', 'The CodeX workspace selection was superseded or disconnected.');
            }
        };
        assertCurrent();
        remote.features = await probeRemoteHostFeatures(remote.client, remote.clientVersion);
        assertCurrent();
        if (!remote.features.codex) {
            throw new ClientModeError('FEATURE_NOT_SUPPORTED', 'The selected Host does not provide CodeX workspaces.');
        }
        this.assertLocalHarnessCarrierAvailable();
        const virtual = CodexVirtualHarness.remote(remote.client, {
            deviceId: remote.target.deviceId,
            name: remote.target.name,
        }, harnessSessionGeneration(this.host?.localHarnessVersion?.()), new RemoteTypertGateway(remote.client));
        try {
            let workspace;
            try {
                workspace = await virtual.selectWorkspace(workspaceId, signal);
            }
            catch {
                assertCurrent();
                throw new ClientModeError('WORKSPACE_NOT_FOUND', 'The selected CodeX workspace is no longer available.');
            }
            assertCurrent();
            await this.closeCodexVirtual(false);
            assertCurrent();
            await this.closeCursorVirtual();
            assertCurrent();
            const selectionKey = JSON.stringify([remote.target.deviceId, workspaceId]);
            const preferredSessionId = await virtual.preferredSessionId(signal, this.codexOpenedSessions.get(selectionKey));
            assertCurrent();
            this.codexVirtual = virtual;
            this.codexVirtualSelection = { targetDeviceId: remote.target.deviceId, workspaceId };
            this.selectCodexTarget(virtual, remote);
            this.pendingWorkspaceSelection = {
                targetDeviceId: remote.target.deviceId,
                workspaceId,
                backend: 'codex',
                ...(preferredSessionId === undefined ? {} : { sessionId: preferredSessionId }),
            };
            this.logger.info('CodeX virtual workspace opened', { targetDeviceId: shortId(remote.target.deviceId) });
            return { ...this.status(), workspace };
        }
        catch (error) {
            await virtual.close();
            throw error;
        }
    }
    async createCodexWorkspace(targetDeviceId, path, signal) {
        const trimmedPath = path.trim();
        if (trimmedPath === '')
            throw new ClientModeError('INVALID_MESSAGE', 'A CodeX project directory is required.');
        const remote = await this.ensureConnected(targetDeviceId, signal);
        remote.features = await probeRemoteHostFeatures(remote.client, remote.clientVersion);
        if (!remote.features.codex) {
            throw new ClientModeError('FEATURE_NOT_SUPPORTED', 'The selected Host does not provide CodeX workspaces.');
        }
        this.assertLocalHarnessCarrierAvailable();
        const result = record(await new CodexRemoteClient(remote.client).request('project/create', {
            name: remoteWorkspaceTitle(trimmedPath),
            roots: [{ path: trimmedPath }],
            idempotencyKey: uuidV7(),
        }, signal));
        const project = record(result.project);
        this.assertRemoteCurrent(remote, signal);
        if (typeof project.id !== 'string' || project.id.length === 0) {
            throw new ClientModeError('INVALID_MESSAGE', 'The Host returned an invalid CodeX project.');
        }
        return this.openCodexWorkspace(targetDeviceId, codexProjectWorkspaceId(project.id), signal);
    }
    async listCursorWorkspaces(targetDeviceId, signal, backend = 'cursor') {
        const remote = await this.ensureConnected(targetDeviceId, signal);
        remote.features = await probeRemoteHostFeatures(remote.client, remote.clientVersion);
        if (!remote.features[backend]) {
            throw new ClientModeError('FEATURE_NOT_SUPPORTED', `The selected Host does not provide ${backend} workspaces.`);
        }
        if (this.cursorVirtual !== undefined && this.connected?.target.deviceId === targetDeviceId && this.acpVirtualBackend === backend) {
            return this.cursorVirtual.workspaces();
        }
        const acpClient = new AgentAcpClient(remote.client);
        const workspaces = await discoverAcpVirtualWorkspaces(acpClient, backend, signal);
        return workspaces;
    }
    async openCursorWorkspace(targetDeviceId, workspaceId, signal, backend = 'cursor') {
        const remote = await this.ensureConnected(targetDeviceId, signal);
        remote.features = await probeRemoteHostFeatures(remote.client, remote.clientVersion);
        if (!remote.features[backend]) {
            throw new ClientModeError('FEATURE_NOT_SUPPORTED', `The selected Host does not provide ${backend} workspaces.`);
        }
        this.assertLocalHarnessCarrierAvailable();
        const virtual = AcpVirtualHarness.remote(remote.client, {
            deviceId: remote.target.deviceId,
            name: remote.target.name,
        }, backend, remote.features.acpModelLoadsSession ? ['agent.acp.antigravity.model-load.v1'] : [], new RemoteTypertGateway(remote.client));
        let workspace;
        try {
            try {
                workspace = await virtual.selectWorkspace(workspaceId);
            }
            catch {
                this.assertRemoteCurrent(remote, signal);
                throw new ClientModeError('WORKSPACE_NOT_FOUND', `The selected ${backend} workspace is no longer available.`);
            }
            this.assertRemoteCurrent(remote, signal);
            await this.closeCodexVirtual();
            this.assertRemoteCurrent(remote, signal);
            await this.closeCursorVirtual();
            this.assertRemoteCurrent(remote, signal);
            const preferredSessionId = await virtual.preferredSessionId();
            this.assertRemoteCurrent(remote, signal);
            this.cursorVirtual = virtual;
            this.acpVirtualBackend = backend;
            this.selectCursorTarget(virtual, remote);
            this.pendingWorkspaceSelection = {
                targetDeviceId: remote.target.deviceId,
                workspaceId: workspace.workspaceId,
                backend,
                ...(preferredSessionId === undefined ? {} : { sessionId: preferredSessionId }),
            };
        }
        catch (error) {
            await virtual.close();
            throw error;
        }
        this.logger.info(`${backend} virtual workspace opened`, { targetDeviceId: shortId(remote.target.deviceId) });
        return { ...this.status(), workspace };
    }
    async createCursorWorkspace(targetDeviceId, path, signal, backend = 'cursor') {
        const trimmedPath = path.trim();
        if (trimmedPath === '')
            throw new ClientModeError('INVALID_MESSAGE', `A ${backend} project directory is required.`);
        const remote = await this.ensureConnected(targetDeviceId, signal);
        remote.features = await probeRemoteHostFeatures(remote.client, remote.clientVersion);
        if (!remote.features[backend]) {
            throw new ClientModeError('FEATURE_NOT_SUPPORTED', `The selected Host does not provide ${backend} workspaces.`);
        }
        this.assertLocalHarnessCarrierAvailable();
        const virtual = AcpVirtualHarness.remote(remote.client, {
            deviceId: remote.target.deviceId,
            name: remote.target.name,
        }, backend, remote.features.acpModelLoadsSession ? ['agent.acp.antigravity.model-load.v1'] : [], new RemoteTypertGateway(remote.client));
        try {
            const workspace = await virtual.selectOrCreateWorkspace(trimmedPath);
            this.assertRemoteCurrent(remote, signal);
            await this.closeCodexVirtual();
            this.assertRemoteCurrent(remote, signal);
            await this.closeCursorVirtual();
            this.assertRemoteCurrent(remote, signal);
            this.cursorVirtual = virtual;
            this.acpVirtualBackend = backend;
            this.selectCursorTarget(virtual, remote);
            this.pendingWorkspaceSelection = {
                targetDeviceId: remote.target.deviceId,
                workspaceId: workspace.workspaceId,
                backend,
            };
            this.logger.info(`${backend} virtual workspace created`, { targetDeviceId: shortId(remote.target.deviceId) });
            return { ...this.status(), workspace };
        }
        catch (error) {
            await virtual.close();
            throw error;
        }
    }
    consumeWorkspaceSelection(selection) {
        const pending = this.pendingWorkspaceSelection;
        if (pending?.targetDeviceId === selection.targetDeviceId
            && pending.workspaceId === selection.workspaceId
            && (pending.backend ?? 'harness') === (selection.backend ?? 'harness')) {
            this.pendingWorkspaceSelection = undefined;
        }
        return this.status();
    }
    async close() {
        if (this.closed)
            return;
        this.closed = true;
        this.server.close?.();
        try {
            await this.leaveRemote();
        }
        finally {
            this.gatewaySwitch.restore();
        }
    }
    async leaveRemote() {
        this.remoteLifetime.abort(new ClientModeError('CANCELLED', 'The Remote connection was closed.'));
        this.remoteLifetime = new AbortController();
        const previous = this.connected;
        this.connected = undefined;
        this.connectionProgress = undefined;
        this.pendingWorkspaceSelection = undefined;
        this.gatewaySwitch.selectLocal();
        // Detach authority synchronously. Closing the carrier also releases pending
        // stream RPCs; one failed stream/preview must never skip carrier cleanup.
        const results = await Promise.allSettled([
            this.closeCodexVirtual(),
            this.closeCursorVirtual(),
            this.closePreview(),
            this.codexStreamBridge.closeCodexStreams(previous?.client),
            previous?.client.close(),
        ]);
        const failure = results.find(result => result.status === 'rejected');
        if (failure?.status === 'rejected')
            throw failure.reason;
    }
    async callRemoteFileViewer(endpoint, payload, signal) {
        const remote = this.connected;
        if (remote === undefined || this.status().mode !== 'remote') {
            throw new ClientModeError('REMOTE_NOT_CONNECTED', 'No Remote Host is selected.', true);
        }
        if (!remote.features.fileViewer) {
            throw new ClientModeError('FEATURE_NOT_SUPPORTED', 'The selected Remote Host does not support remote file viewing.');
        }
        return remote.client.rpc('fileviewer.call', { endpoint, payload }, signal);
    }
    async pluginRoute(route, body, signal) {
        const remote = this.connected;
        if (remote === undefined || this.status().mode !== 'remote') {
            throw new ClientModeError('REMOTE_NOT_CONNECTED', 'No Remote Host is selected.', true);
        }
        if (!remote.features.pluginRoute) {
            throw new ClientModeError('FEATURE_NOT_SUPPORTED', 'The connected Host cannot forward plugin routes.');
        }
        return remote.client.rpc('plugin.route.call', { route, body }, signal);
    }
    activeRemote() {
        return this.connected;
    }
    selectRemoteTarget(remote) {
        this.assertRemoteCompatible(remote);
        const target = { deviceId: remote.target.deviceId, name: remote.target.name };
        this.gatewaySwitch.selectRemote(this.remoteTypertGateway(remote), undefined, target);
    }
    remoteTypertGateway(remote) {
        const localSessionGeneration = harnessSessionGeneration(this.host?.localHarnessVersion?.());
        return new RemoteTypertGateway(remote.client, localSessionGeneration === 'v3' && remote.features.sessionFormat !== 3 ? 'legacy-to-v3' : undefined, remote.harnessVersion);
    }
    selectCodexTarget(virtual, remote) {
        const target = { deviceId: remote.target.deviceId, name: remote.target.name };
        this.gatewaySwitch.selectRemote(virtual, undefined, target);
    }
    async closeCodexVirtual(invalidatePending = true) {
        if (invalidatePending)
            this.codexOpenGeneration += 1;
        const virtual = this.codexVirtual;
        const selection = this.codexVirtualSelection;
        this.codexVirtual = undefined;
        this.codexVirtualSelection = undefined;
        // Keep only navigation IDs in memory, scoped to the Host and Workspace.
        // Capture before the first await: transport close clears `connected` first.
        if (selection !== undefined && virtual !== undefined) {
            for (const [workspaceId, sessionId] of virtual.openedSessions) {
                const key = JSON.stringify([selection.targetDeviceId, workspaceId]);
                this.codexOpenedSessions.delete(key);
                this.codexOpenedSessions.set(key, sessionId);
                if (this.codexOpenedSessions.size > 64) {
                    this.codexOpenedSessions.delete(this.codexOpenedSessions.keys().next().value);
                }
            }
        }
        await virtual?.close();
    }
    async closeCursorVirtual() {
        const virtual = this.cursorVirtual;
        this.cursorVirtual = undefined;
        await virtual?.close();
    }
    selectCursorTarget(virtual, remote) {
        const target = { deviceId: remote.target.deviceId, name: remote.target.name };
        this.gatewaySwitch.selectRemote(virtual, undefined, target);
    }
    assertRemoteCompatible(remote) {
        const localRemoteGateway = this.gatewaySwitch.supportsCarrier();
        const localSessionGeneration = harnessSessionGeneration(this.host?.localHarnessVersion?.());
        if (localRemoteGateway && remote.features.remoteGateway) {
            if (localSessionGeneration === 'v3' || remote.features.sessionFormat !== 3)
                return;
            throw new ClientModeError('HARNESS_VERSION_INCOMPATIBLE', 'The selected Host uses Harness Session V3, but this Client uses the legacy Typert Remote session format.');
        }
        throw new ClientModeError('HARNESS_VERSION_INCOMPATIBLE', 'Both this Client and the selected Host must provide a compatible Harness Typert Remote Gateway transport.');
    }
    assertLocalHarnessCarrierAvailable() {
        if (this.gatewaySwitch.supportsCarrier())
            return;
        throw new ClientModeError('HARNESS_VERSION_INCOMPATIBLE', 'This Client does not provide a compatible Harness carrier for the selected remote workspace.');
    }
    async ensureConnected(targetDeviceId, signal, isCurrent) {
        const lifetime = this.remoteLifetime.signal;
        if (this.connected?.target.deviceId === targetDeviceId)
            return this.connected;
        const next = await this.connect(targetDeviceId, signal);
        const assertCurrent = () => {
            signal?.throwIfAborted();
            if (this.closed || lifetime.aborted || isCurrent?.() === false) {
                throw new ClientModeError('CANCELLED', 'The Remote connection request was superseded or closed.');
            }
        };
        try {
            // Reject a stale connection before it can detach a newer Host or restore
            // authority after sign-out. Also fence the preview-close await below.
            assertCurrent();
            await this.closePreview();
            assertCurrent();
        }
        catch (error) {
            this.connection.clearConnectionProgress(next.progressRunId);
            await next.client.close().catch(() => undefined);
            throw error;
        }
        const previous = this.connected;
        this.connected = next;
        this.connection.clearConnectionProgress(next.progressRunId);
        await previous?.client.close().catch(() => undefined);
        return next;
    }
    assertRemoteCurrent(remote, signal) {
        signal?.throwIfAborted();
        if (this.closed || this.connected !== remote) {
            throw new ClientModeError('CANCELLED', 'The Remote workspace request was superseded or closed.');
        }
    }
    requireIdentity() {
        if (this.identity === undefined)
            throw new ClientModeError('IDENTITY_INVALID', 'The client identity is not ready.');
        return this.identity;
    }
}
export { probeRemoteHostFeatures, remoteHostFeatures } from './client-capabilities.js';
export { ClientModeError } from './client-runtime-contract.js';
//# sourceMappingURL=client-runtime.js.map