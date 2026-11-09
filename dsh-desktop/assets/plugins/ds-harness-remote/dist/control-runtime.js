import { hostname } from 'node:os';
import { execFileSync } from 'node:child_process';
import { resolveConfig } from './config.js';
import { ClientModeError, } from './client-runtime.js';
import { IdentityInvalidError, IdentityStore, resetDefaultIdentityRoles, serverStorageDirectory, } from './identity-store.js';
import { safeStartupError } from './safe-error.js';
import { ClientServerApi, HostServerApi } from './server-api.js';
import { ServerCredentialStore, ServerCredentialsInvalidError } from './server-credentials.js';
import { registerControlRoute } from './control-route.js';
import { ControlStatusStream } from './control-stream.js';
import { codexBinaryCandidates } from './codex/domain.js';
import { cursorBinaryCandidates } from './acp/gateway.js';
import { defaultCheckExecutable, installOrConfigureBackend, isBuiltinAcpBackend } from './acp/backend-installer.js';
/** Loopback-only control plane shared by Local/Remote switching and plugin setup. */
export class PluginControlRuntime {
    config;
    identityDirectory;
    settings;
    client;
    host;
    switchServer;
    updates;
    useDefaultStorage;
    logoutFlight;
    serverSwitchFlight;
    startupFailure;
    storageAvailable = true;
    setStartupFailure(error, options) {
        this.startupFailure = error;
        if (options?.storageAvailable !== undefined) {
            this.storageAvailable = options.storageAvailable;
        }
        this.client = undefined;
        this.host = undefined;
    }
    clearStartupFailure() {
        this.startupFailure = undefined;
        this.storageAvailable = true;
    }
    setIdentityDirectory(directory) {
        this.identityDirectory = directory;
        this.storageAvailable = true;
    }
    constructor(config, identityDirectory, settings, client, host, switchServer, 
    /** Update-check snapshots merged into every `status` result; absent when the plugin is disabled. */
    updates, useDefaultStorage = false) {
        this.config = config;
        this.identityDirectory = identityDirectory;
        this.settings = settings;
        this.client = client;
        this.host = host;
        this.switchServer = switchServer;
        this.updates = updates;
        this.useDefaultStorage = useDefaultStorage;
    }
    register(connection, webServer) {
        const statusStream = new ControlStatusStream(() => this.streamStatus());
        return registerControlRoute(connection, (endpoint, payload, signal) => this.handle(endpoint, payload, signal), webServer, statusStream);
    }
    /**
     * Read the value the status event stream pushes. It resolves through the same
     * endpoint handler as the unary `status` control call, so a pushed status and
     * a polled one can never diverge.
     */
    async streamStatus() {
        const result = await this.handle('status', {}, new AbortController().signal);
        if (!result.ok)
            throw new ClientModeError('STATUS_UNAVAILABLE', result.error.message);
        return result.value;
    }
    async handle(endpoint, payload, signal) {
        try {
            // A request arriving during replacement must use the new Server runtime.
            if (endpoint !== 'settings.server.set' && endpoint !== 'settings.identity.reset')
                await this.serverSwitchFlight;
            if (endpoint.startsWith('host.pairing.')) {
                if (this.host?.pairingControl === undefined)
                    throw new ClientModeError('METHOD_NOT_ALLOWED', 'Host device pairing is unavailable.');
                const action = endpoint.slice('host.pairing.'.length);
                if (action !== 'start' && action !== 'status' && action !== 'confirm' && action !== 'cancel')
                    throw new ClientModeError('METHOD_NOT_ALLOWED', 'Unknown pairing action.');
                const input = record(payload);
                if (Object.keys(input).some(key => key !== 'sessionId' && key !== 'verificationCode')
                    || input.sessionId !== undefined && typeof input.sessionId !== 'string'
                    || input.verificationCode !== undefined && typeof input.verificationCode !== 'string')
                    throw new ClientModeError('INVALID_MESSAGE', 'Invalid pairing request.');
                if (action === 'start')
                    await this.client?.handleControl('mode.set', { mode: 'local' }, signal);
                const view = await this.host.pairingControl(action, input);
                if (view?.localSaved && this.host.hostStatus().pairingHostOnly)
                    await this.client?.handleControl('mode.set', { mode: 'local' }, signal);
                return ok(view);
            }
            if (endpoint === 'settings.development.set')
                return ok(await this.setDevelopment(payload));
            if (endpoint === 'settings.appearance.set')
                return ok(await this.setAppearance(payload));
            if (endpoint === 'settings.get')
                return ok(await this.settingsView());
            if (endpoint === 'settings.configure')
                return ok(await this.configure(payload));
            if (endpoint === 'settings.server.set')
                return ok(await this.setServer(payload));
            if (endpoint === 'settings.role.set')
                return ok(await this.setRole(payload));
            if (endpoint === 'settings.codex.set')
                return ok(await this.setCodex(payload));
            if (endpoint === 'settings.cursor.set')
                return ok(await this.setCursor(payload));
            if (endpoint === 'settings.acp.set')
                return ok(await this.setAcp(payload));
            if (endpoint === 'settings.acp.add')
                return ok(await this.addAcp(payload));
            if (endpoint === 'settings.acp.remove')
                return ok(await this.removeAcp(payload));
            if (endpoint === 'settings.acp.installOrConfigure')
                return ok(await this.installOrConfigureAcp(payload));
            if (endpoint === 'settings.logout')
                return ok(await this.logout());
            if (endpoint === 'settings.identity.reset')
                return ok(await this.resetIdentity(payload));
            if (endpoint === 'host.authorization.set' && this.client !== undefined) {
                const value = record(payload);
                if (typeof value.enabled !== 'boolean')
                    throw new ClientModeError('INVALID_MESSAGE', 'Host authorization state is required.');
                const status = await this.client.setHostAuthorization(value.enabled);
                if (this.settings !== undefined) {
                    const current = resolveConfig(this.settings.get());
                    await this.settings.replace(editableConfig({ ...current, hostControl: { enabled: value.enabled } }));
                }
                return ok(status);
            }
            if (endpoint === 'host.reconnect') {
                if (this.host === undefined)
                    throw new ClientModeError('METHOD_NOT_ALLOWED', 'This plugin is not running as a Host.');
                this.host.reconnectHost();
                return withUpdate(ok(this.hostOnlyStatus()), this.updates?.snapshot());
            }
            if (endpoint === 'status') {
                if (this.startupFailure !== undefined) {
                    const startupError = safeStartupError(this.startupFailure);
                    const failureStatus = {
                        mode: 'local',
                        available: false,
                        controlUnavailable: false,
                        connected: false,
                        transport: 'Disconnected',
                        startupError,
                        hostAuthorizationAvailable: false,
                    };
                    return withUpdate(ok(failureStatus), this.updates?.snapshot());
                }
                // Both mode paths merge the update snapshot here, so the SSE stream,
                // polling, and the unary call always observe the same payload shape.
                const base = this.client !== undefined
                    ? await this.client.handleControl(endpoint, payload, signal)
                    : ok(this.hostOnlyStatus());
                return withUpdate(base, this.updates?.snapshot());
            }
            if (this.client !== undefined)
                return this.client.handleControl(endpoint, payload, signal);
            if (endpoint === 'devices')
                return ok([]);
            if (endpoint === 'host.account.login') {
                if (this.host === undefined)
                    throw new ClientModeError('METHOD_NOT_ALLOWED', 'This plugin is not running as a Host.');
                const value = record(payload);
                if (typeof value.email !== 'string' || typeof value.password !== 'string') {
                    throw new ClientModeError('INVALID_MESSAGE', 'Email and password are required.');
                }
                return ok(await this.host.authorizeHostWithAccount(value.email, value.password));
            }
            if (endpoint === 'host.registration-code.submit') {
                if (this.host === undefined)
                    throw new ClientModeError('METHOD_NOT_ALLOWED', 'This plugin is not running as a Host.');
                const value = record(payload);
                if (typeof value.code !== 'string' || value.code.trim() === '') {
                    throw new ClientModeError('INVALID_MESSAGE', 'A Host registration code is required.');
                }
                return ok(await this.host.authorizeHostWithCode(value.code));
            }
            if (endpoint === 'mode.set' && record(payload).mode === 'local') {
                return withUpdate(ok(this.hostOnlyStatus()), this.updates?.snapshot());
            }
            if (this.startupFailure instanceof Error) {
                throw this.startupFailure;
            }
            throw new ClientModeError('METHOD_NOT_ALLOWED', 'Remote Client mode is disabled by the plugin role.');
        }
        catch (error) {
            return fail(error);
        }
    }
    async configure(payload) {
        if (this.settings === undefined) {
            throw new ClientModeError('SETTINGS_UNAVAILABLE', 'DSH user settings are unavailable in this profile.');
        }
        const value = record(payload);
        if (value.role !== 'host' && value.role !== 'client') {
            throw new ClientModeError('INVALID_MESSAGE', 'Role must be Host or Client.');
        }
        if (typeof value.serverUrl !== 'string') {
            throw new ClientModeError('INVALID_MESSAGE', 'Server URL is required.');
        }
        const current = editableConfig(resolveConfig(this.settings.get()));
        if (value.role === 'client' && this.host?.hostStatus?.()?.pairingHostOnly)
            throw new ClientModeError('DEVICE_SCOPE_REQUIRED', 'This Host only accepts incoming connections.');
        const next = resolveConfig({ ...current, role: value.role, serverUrl: value.serverUrl });
        if (!this.storageAvailable && this.startupFailure instanceof Error) {
            throw this.startupFailure;
        }
        const identities = new IdentityStore({
            directory: serverStorageDirectory(this.identityDirectory, next.serverUrl, value.role),
            role: value.role,
        });
        let identity = await identities.loadOrCreate(hostname());
        const api = value.role === 'host'
            ? new HostServerApi(next.serverUrl, new ServerCredentialStore(identities.directory))
            : new ClientServerApi(next.serverUrl, new ServerCredentialStore(identities.directory));
        let authorization;
        if (value.role === 'host' && typeof value.registrationCode === 'string' && value.registrationCode.trim() !== '') {
            authorization = await api.authorizeHostWithCode(identity, value.registrationCode);
        }
        else {
            if (typeof value.email !== 'string' || typeof value.password !== 'string') {
                throw new ClientModeError('INVALID_MESSAGE', 'Email and password are required for account authorization.');
            }
            authorization = await api.authorizeWithAccount(identity, value.email, value.password, async () => {
                identity = await identities.reset(hostname());
                return identity;
            });
        }
        if (value.role === 'client' && resolveConfig(this.settings.get()).hostControl?.enabled !== false) {
            await this.client?.authorizeHostByDefault();
        }
        await this.settings.replace(editableConfig(next));
        return {
            status: 'authorized',
            role: value.role,
            ...(authorization.account === undefined ? {} : { account: authorization.account }),
            settings: await this.settingsView(),
        };
    }
    async setServer(payload) {
        if (this.serverSwitchFlight !== undefined) {
            throw new ClientModeError('SERVER_SWITCH_BUSY', 'A Server switch is already in progress.');
        }
        const flight = this.applyServer(payload);
        this.serverSwitchFlight = flight;
        try {
            return await flight;
        }
        finally {
            if (this.serverSwitchFlight === flight)
                this.serverSwitchFlight = undefined;
        }
    }
    async applyServer(payload) {
        await this.logoutFlight;
        if (this.settings === undefined) {
            throw new ClientModeError('SETTINGS_UNAVAILABLE', 'DSH user settings are unavailable in this profile.');
        }
        const value = record(payload);
        if (typeof value.serverUrl !== 'string') {
            throw new ClientModeError('INVALID_MESSAGE', 'Server URL is required.');
        }
        const current = editableConfig(resolveConfig(this.settings.get()));
        const next = resolveConfig({ ...current, serverUrl: value.serverUrl });
        await this.settings.replace(editableConfig(next));
        if (this.switchServer !== undefined) {
            if (next.serverUrl !== this.config.serverUrl || this.startupFailure !== undefined) {
                try {
                    const runtimes = await this.switchServer(next);
                    this.client = runtimes.client;
                    this.host = runtimes.host;
                    this.clearStartupFailure();
                }
                catch (error) {
                    this.config = next;
                    this.setStartupFailure(error);
                    throw error;
                }
            }
            this.config = next;
            return { ...await this.settingsView(), applies: 'live' };
        }
        return this.settingsView();
    }
    async resetIdentity(payload) {
        if (this.serverSwitchFlight !== undefined) {
            throw new ClientModeError('SERVER_SWITCH_BUSY', 'A Server switch is already in progress.');
        }
        const flight = this.applyResetIdentity(payload);
        this.serverSwitchFlight = flight;
        try {
            return await flight;
        }
        finally {
            if (this.serverSwitchFlight === flight)
                this.serverSwitchFlight = undefined;
        }
    }
    async applyResetIdentity(payload) {
        await this.logoutFlight;
        const value = payload === undefined ? {} : record(payload);
        const roleArg = value.role === undefined ? 'all' : value.role;
        if (roleArg !== 'host' && roleArg !== 'client' && roleArg !== 'all') {
            throw new ClientModeError('INVALID_MESSAGE', 'Role must be host, client, or all.');
        }
        const roles = roleArg === 'client' ? ['client'] : roleArg === 'host' ? ['host'] : ['host', 'client'];
        const config = this.settings === undefined ? this.config : resolveConfig(this.settings.get());
        const nextDirectory = await resetDefaultIdentityRoles(roles, config.serverUrl, hostname(), this.useDefaultStorage ? {} : { directory: this.identityDirectory });
        this.setIdentityDirectory(nextDirectory);
        if (this.switchServer !== undefined) {
            try {
                const runtimes = await this.switchServer(config);
                this.client = runtimes.client;
                this.host = runtimes.host;
                this.config = config;
                this.clearStartupFailure();
            }
            catch (error) {
                this.setStartupFailure(error);
                throw error;
            }
            return { ...await this.settingsView(), applies: 'live' };
        }
        this.clearStartupFailure();
        return { ...await this.settingsView(), applies: 'live' };
    }
    async setRole(payload) {
        if (this.settings === undefined) {
            throw new ClientModeError('SETTINGS_UNAVAILABLE', 'DSH user settings are unavailable in this profile.');
        }
        const role = record(payload).role;
        if (role !== 'host' && role !== 'client') {
            throw new ClientModeError('INVALID_MESSAGE', 'Role must be Host or Client.');
        }
        const current = editableConfig(resolveConfig(this.settings.get()));
        const currentRole = current.role === 'client' ? 'client' : 'host';
        if (role === 'client' && this.host?.hostStatus?.()?.pairingHostOnly)
            throw new ClientModeError('DEVICE_SCOPE_REQUIRED', 'This Host only accepts incoming Remote connections.');
        if (role !== currentRole && current.serverUrl !== undefined
            && await this.association(current.serverUrl, role) === undefined) {
            await this.authorizeOwnedRole(current.serverUrl, currentRole, role);
        }
        await this.settings.replace({ ...current, role });
        return this.settingsView();
    }
    async setDevelopment(payload) {
        if (this.settings === undefined)
            throw new ClientModeError('SETTINGS_UNAVAILABLE', 'DSH user settings are unavailable in this profile.');
        const value = record(payload);
        if (value.debugLogging !== undefined && typeof value.debugLogging !== 'boolean')
            throw new ClientModeError('INVALID_MESSAGE', 'The debug logging switch must be a boolean.');
        if (value.remoteToolsEnabled !== undefined && typeof value.remoteToolsEnabled !== 'boolean')
            throw new ClientModeError('INVALID_MESSAGE', 'The Remote Tools switch must be a boolean.');
        if (value.terminalEnabled !== undefined && typeof value.terminalEnabled !== 'boolean')
            throw new ClientModeError('INVALID_MESSAGE', 'The terminal switch must be a boolean.');
        if (value.ports !== undefined && (!Array.isArray(value.ports) || value.ports.some((port) => !Number.isInteger(port))))
            throw new ClientModeError('INVALID_MESSAGE', 'Loopback ports must be integers.');
        if (value.terminalEnabled === undefined && value.remoteToolsEnabled === undefined && value.ports === undefined && value.debugLogging === undefined)
            throw new ClientModeError('INVALID_MESSAGE', 'A development setting is required.');
        const current = editableConfig(resolveConfig(this.settings.get()));
        const next = resolveConfig({ ...current,
            logLevel: value.debugLogging === undefined ? current.logLevel : value.debugLogging ? 'debug' : 'info',
            terminal: { enabled: value.terminalEnabled === undefined ? (current.terminal?.enabled ?? true) : value.terminalEnabled },
            remoteTools: { enabled: value.remoteToolsEnabled === undefined ? (current.remoteTools?.enabled ?? true) : value.remoteToolsEnabled },
            loopback: { ports: value.ports === undefined ? (current.loopback?.ports ?? []) : value.ports },
        });
        await this.settings.replace(editableConfig(next));
        if (value.terminalEnabled !== undefined)
            this.host?.setTerminalEnabled?.(value.terminalEnabled);
        if (value.ports !== undefined)
            this.host?.setLoopbackPorts?.(value.ports);
        return this.settingsView();
    }
    async setAppearance(payload) {
        if (this.settings === undefined)
            throw new ClientModeError('SETTINGS_UNAVAILABLE', 'DSH user settings are unavailable in this profile.');
        const entry = record(payload).sidebarEntry;
        if (entry !== 'standard' && entry !== 'compact')
            throw new ClientModeError('INVALID_MESSAGE', 'The sidebar entry style must be Standard or Compact.');
        const current = editableConfig(resolveConfig(this.settings.get()));
        await this.settings.replace(editableConfig(resolveConfig({ ...current, sidebar: { entry } })));
        return this.settingsView();
    }
    async setCodex(payload) {
        if (this.settings === undefined) {
            throw new ClientModeError('SETTINGS_UNAVAILABLE', 'DSH user settings are unavailable in this profile.');
        }
        const enabled = record(payload).enabled;
        if (typeof enabled !== 'boolean') {
            throw new ClientModeError('INVALID_MESSAGE', 'Codex Remote enabled must be a boolean.');
        }
        return this.setAcp({ backend: 'codex', enabled });
    }
    async setCursor(payload) {
        if (this.settings === undefined) {
            throw new ClientModeError('SETTINGS_UNAVAILABLE', 'DSH user settings are unavailable in this profile.');
        }
        const enabled = record(payload).enabled;
        if (typeof enabled !== 'boolean') {
            throw new ClientModeError('INVALID_MESSAGE', 'Cursor Remote enabled must be a boolean.');
        }
        const current = editableConfig(resolveConfig(this.settings.get()));
        const next = resolveConfig({
            ...current,
            cursor: { ...current.cursor, enabled },
            acp: {
                enabled: enabled || current.acp?.enabled === true,
                backends: current.acp?.backends?.map(item => item.id === 'cursor' ? { ...item, enabled } : item),
            },
        });
        await this.settings.replace(editableConfig(next));
        await this.host?.setAgentBackends?.(resolveConfig(this.settings.get()));
        return { ...await this.settingsView(), applies: 'live' };
    }
    async setAcp(payload) {
        if (this.settings === undefined)
            throw new ClientModeError('SETTINGS_UNAVAILABLE', 'DSH user settings are unavailable in this profile.');
        const value = record(payload);
        const backend = value.backend;
        const enabled = value.enabled;
        if (typeof backend !== 'string' || typeof enabled !== 'boolean')
            throw new ClientModeError('INVALID_MESSAGE', 'ACP backend and enabled are required.');
        const current = resolveConfig(this.settings.get());
        if (!current.acp?.backends.some(item => item.id === backend))
            throw new ClientModeError('INVALID_MESSAGE', 'Unknown ACP backend.');
        const backends = current.acp.backends.map(item => item.id === backend ? { ...item, enabled } : item);
        await this.settings.replace({
            ...editableConfig(current),
            ...(backend === 'cursor' ? { cursor: { ...current.cursor, enabled } } : {}),
            ...(backend === 'codex' ? { codex: { ...current.codex, enabled } } : {}),
            acp: { enabled: enabled || current.acp.enabled, backends },
        });
        await this.host?.setAgentBackends?.(resolveConfig(this.settings.get()));
        return { ...await this.settingsView(), applies: 'live' };
    }
    async addAcp(payload) {
        if (this.settings === undefined)
            throw new ClientModeError('SETTINGS_UNAVAILABLE', 'DSH user settings are unavailable in this profile.');
        const value = record(payload);
        if (typeof value.id !== 'string' || typeof value.command !== 'string' || !Array.isArray(value.args) || !value.args.every(item => typeof item === 'string')) {
            throw new ClientModeError('INVALID_MESSAGE', 'ACP name, command, and arguments are required.');
        }
        const current = resolveConfig(this.settings.get());
        if (value.id === 'kimi')
            throw new ClientModeError('INVALID_MESSAGE', 'Kimi is not implemented.');
        if (current.acp?.backends.some(item => item.id === value.id))
            throw new ClientModeError('INVALID_MESSAGE', 'ACP backend already exists.');
        const backends = [...(current.acp?.backends ?? []), { id: value.id, command: value.command, args: value.args, enabled: false }];
        const next = resolveConfig({ ...editableConfig(current), acp: { enabled: current.acp?.enabled ?? true, backends } });
        await this.settings.replace(editableConfig(next));
        await this.host?.setAgentBackends?.(resolveConfig(this.settings.get()));
        return { ...await this.settingsView(), applies: 'live' };
    }
    async removeAcp(payload) {
        if (this.settings === undefined)
            throw new ClientModeError('SETTINGS_UNAVAILABLE', 'DSH user settings are unavailable in this profile.');
        const id = record(payload).id;
        if (typeof id !== 'string' || ['codex', 'cursor', 'antigravity', 'pi', 'claude', 'opencode', 'hermes'].includes(id))
            throw new ClientModeError('INVALID_MESSAGE', 'Only custom ACP backends can be removed.');
        const current = resolveConfig(this.settings.get());
        const backends = (current.acp?.backends ?? []).filter(item => item.id !== id);
        await this.settings.replace(editableConfig({ ...current, acp: { enabled: current.acp?.enabled ?? true, backends } }));
        await this.host?.setAgentBackends?.(resolveConfig(this.settings.get()));
        return { ...await this.settingsView(), applies: 'live' };
    }
    async installOrConfigureAcp(payload) {
        if (this.settings === undefined)
            throw new ClientModeError('SETTINGS_UNAVAILABLE', 'DSH user settings are unavailable in this profile.');
        const value = record(payload);
        const backend = value.backend;
        if (typeof backend !== 'string' || !isBuiltinAcpBackend(backend)) {
            throw new ClientModeError('INVALID_MESSAGE', 'A valid built-in ACP backend is required.');
        }
        const outcome = await installOrConfigureBackend(backend);
        if (outcome.action === 'download_required') {
            const view = await this.settingsView();
            return {
                ...view,
                acpInstallResult: {
                    backend,
                    action: 'download_required',
                    downloadUrl: outcome.downloadUrl,
                },
            };
        }
        const detected = outcome.detectedCommand;
        if (!detected) {
            throw new ClientModeError('ACP_UNAVAILABLE', `Backend ${backend} could not be configured.`);
        }
        const defaultArgsMap = {
            codex: ['app-server'],
            cursor: ['acp'],
            antigravity: ['--input-format', 'stream-json', '--output-format', 'stream-json'],
            hermes: ['acp'],
            opencode: ['acp'],
            pi: [],
            claude: [],
        };
        const defaultArgs = defaultArgsMap[backend] ?? ['acp'];
        const current = resolveConfig(this.settings.get());
        const existing = current.acp?.backends.some(item => item.id === backend);
        const backends = existing
            ? (current.acp?.backends ?? []).map(item => item.id === backend ? { ...item, command: detected, enabled: true } : item)
            : [...(current.acp?.backends ?? []), { id: backend, command: detected, enabled: true, args: defaultArgs }];
        await this.settings.replace({
            ...editableConfig(current),
            ...(backend === 'cursor' ? { cursor: { ...current.cursor, binary: detected, enabled: true } } : {}),
            ...(backend === 'codex' ? { codex: { ...current.codex, binary: detected, enabled: true } } : {}),
            acp: { enabled: true, backends },
        });
        await this.host?.setAgentBackends?.(resolveConfig(this.settings.get()));
        const view = await this.settingsView();
        return {
            ...view,
            applies: 'live',
            acpInstallResult: {
                backend,
                action: outcome.action,
                downloadUrl: outcome.downloadUrl,
            },
        };
    }
    async authorizeOwnedRole(serverUrl, sourceRole, targetRole) {
        if (!this.storageAvailable && this.startupFailure instanceof Error) {
            throw this.startupFailure;
        }
        const sourceDirectory = serverStorageDirectory(this.identityDirectory, serverUrl, sourceRole);
        const sourceIdentity = await new IdentityStore({ directory: sourceDirectory, role: sourceRole }).loadOrCreate(hostname());
        const sourceStore = new ServerCredentialStore(sourceDirectory);
        if (await sourceStore.load(serverUrl, sourceIdentity.deviceId) === undefined)
            return;
        const sourceApi = sourceRole === 'host'
            ? new HostServerApi(serverUrl, sourceStore)
            : new ClientServerApi(serverUrl, sourceStore);
        sourceApi.bindIdentity(sourceIdentity);
        await sourceApi.loadStoredPolicy();
        if (sourceApi.pairingHostOnly())
            throw new ClientModeError('DEVICE_SCOPE_REQUIRED', 'Paired Host cannot create a Client identity.');
        const sourceCredentials = await sourceApi.authenticate(sourceIdentity);
        const targetDirectory = serverStorageDirectory(this.identityDirectory, serverUrl, targetRole);
        const targetIdentity = await new IdentityStore({ directory: targetDirectory, role: targetRole }).loadOrCreate(hostname());
        const targetApi = targetRole === 'host'
            ? new HostServerApi(serverUrl, new ServerCredentialStore(targetDirectory))
            : new ClientServerApi(serverUrl, new ServerCredentialStore(targetDirectory));
        await targetApi.authorizeOwnedRole(targetIdentity, sourceCredentials.accessToken, sourceCredentials.account);
    }
    logout() {
        if (this.logoutFlight !== undefined)
            return this.logoutFlight;
        const task = this.clearAuthorization();
        this.logoutFlight = task;
        void task.finally(() => {
            if (this.logoutFlight === task)
                this.logoutFlight = undefined;
        }).catch(() => undefined);
        return task;
    }
    async clearAuthorization() {
        if (!this.storageAvailable && this.startupFailure instanceof Error) {
            throw this.startupFailure;
        }
        const config = this.settings === undefined ? this.config : resolveConfig(this.settings.get());
        if (config.serverUrl !== undefined) {
            const runtimes = await Promise.allSettled([
                this.client?.clearClientAuthorization(),
                this.host?.clearHostAuthorization(),
            ]);
            const stores = await Promise.allSettled(['host', 'client'].map(async (role) => {
                const directory = serverStorageDirectory(this.identityDirectory, config.serverUrl, role);
                await new ServerCredentialStore(directory).clear();
            }));
            // A failed revocation must not skip the other role or leave its local
            // credential behind. Report failure only after every cleanup settles.
            const failure = [...runtimes, ...stores].find(result => result.status === 'rejected');
            if (failure?.status === 'rejected')
                throw failure.reason;
        }
        return this.settingsView();
    }
    async settingsView() {
        const config = this.settings === undefined ? editableConfig(this.config) : editableConfig(resolveConfig(this.settings.get()));
        const associations = await this.associations(config);
        const role = config.role === 'client' ? 'client' : 'host';
        const association = associations[role];
        return {
            config,
            deviceName: hostname(),
            writable: this.settings !== undefined,
            applies: 'restart',
            associations,
            acpAvailability: Object.fromEntries((config.acp?.backends ?? []).map(item => [item.id, backendCommandAvailable(item.id, item.command ?? '')])),
            ...(association === undefined ? {} : { association }),
            ...(this.startupFailure === undefined ? {} : {
                startupError: safeStartupError(this.startupFailure),
            }),
        };
    }
    async associations(config) {
        if (config.serverUrl === undefined || !this.storageAvailable)
            return {};
        const [host, client] = await Promise.all([
            this.association(config.serverUrl, 'host'),
            this.association(config.serverUrl, 'client'),
        ]);
        return {
            ...(host === undefined ? {} : { host }),
            ...(client === undefined ? {} : { client }),
        };
    }
    async association(serverUrl, role) {
        if (role === 'client' && this.host?.hostStatus?.()?.pairingHostOnly)
            return undefined;
        try {
            const identities = new IdentityStore({
                directory: serverStorageDirectory(this.identityDirectory, serverUrl, role),
                role,
            });
            const identity = await identities.loadExisting();
            if (identity === undefined)
                return undefined;
            const credentials = await new ServerCredentialStore(identities.directory).load(serverUrl, identity.deviceId);
            if (credentials === undefined)
                return undefined;
            return {
                method: credentials.authorizationMethod,
                ...(credentials.account === undefined ? {} : { account: credentials.account }),
            };
        }
        catch (error) {
            if (error instanceof IdentityInvalidError || error instanceof ServerCredentialsInvalidError) {
                return undefined;
            }
            throw error;
        }
    }
    hostOnlyStatus() {
        return {
            mode: 'local',
            available: false,
            deviceName: hostname(),
            hostAuthorizationAvailable: this.host !== undefined,
            ...(this.host === undefined ? {} : { host: this.host.hostStatus() }),
        };
    }
}
function backendCommandAvailable(backend, command) {
    if (!command || typeof command !== 'string' || command.trim().length === 0)
        return false;
    const trimmed = command.trim();
    if (defaultCheckExecutable(trimmed))
        return true;
    const candidates = backend === 'codex' ? codexBinaryCandidates(trimmed)
        : backend === 'cursor' || backend === 'antigravity' || backend === 'opencode' ? cursorBinaryCandidates(trimmed) : [trimmed];
    return candidates.some(candidate => defaultCheckExecutable(candidate) || commandAvailable(candidate));
}
function commandAvailable(command) {
    try {
        execFileSync(process.platform === 'win32' ? 'where' : 'which', [command], {
            stdio: 'ignore',
            timeout: 5000,
        });
        return true;
    }
    catch {
        return false;
    }
}
function editableConfig(config) {
    return {
        enabled: config.enabled,
        role: config.role,
        ...(config.serverUrl === undefined ? {} : { serverUrl: config.serverUrl }),
        terminal: config.terminal,
        remoteTools: config.remoteTools,
        sidebar: config.sidebar,
        hostControl: config.hostControl ?? { enabled: true },
        loopback: config.loopback,
        forceRelay: config.forceRelay,
        logLevel: config.logLevel,
        reconnect: config.reconnect.enabled
            ? {
                initialDelayMs: config.reconnect.initialDelayMs,
                maxDelayMs: config.reconnect.maxDelayMs,
                jitter: config.reconnect.jitter,
            }
            : false,
        codex: {
            enabled: config.codex.enabled,
            binary: config.codex.binary,
        },
        cursor: {
            enabled: config.cursor.enabled,
            binary: config.cursor.binary,
        },
        ...(config.acp === undefined ? {} : { acp: { enabled: config.acp.enabled, backends: config.acp.backends } }),
    };
}
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function record(value) {
    if (!isRecord(value))
        throw new ClientModeError('INVALID_MESSAGE', 'The control request payload is invalid.');
    return value;
}
function ok(value) { return { ok: true, value }; }
/** Attach the update-check snapshot to a successful status-shaped result. */
function withUpdate(result, update) {
    if (update === undefined || !result.ok || !isRecord(result.value))
        return result;
    return ok({ ...result.value, update });
}
function fail(error) {
    const source = error instanceof Error ? error : undefined;
    const remoteCode = source !== undefined && 'code' in source && typeof source.code === 'string'
        ? source.code
        : source instanceof ClientModeError ? source.code : undefined;
    return {
        ok: false,
        error: {
            code: 'internal',
            message: source?.message ?? 'The plugin control operation failed.',
            details: remoteCode === undefined ? {} : { remoteCode },
        },
    };
}
//# sourceMappingURL=control-runtime.js.map