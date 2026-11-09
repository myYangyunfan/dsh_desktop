import { CodexRemoteClient } from '@dsh-remote/client-core';
import { probeRemoteHostFeatures } from './client-capabilities.js';
import { ClientModeError, fail, isRecord, ok, record } from './client-runtime-contract.js';
import { LoopbackPreview } from './loopback-preview.js';
import { isAllowedPluginRoute } from './plugin-route-bridge.js';
export class ClientControl {
    context;
    constructor(context) {
        this.context = context;
    }
    async handleControl(endpoint, payload, signal) {
        try {
            if (endpoint === 'status')
                return ok(await this.context.detailedStatus());
            if (endpoint === 'devices')
                return ok(await this.context.devices());
            if (endpoint === 'client.account.providers')
                return ok(await this.context.server.oauthProviders());
            if (endpoint === 'client.account.login') {
                const value = record(payload);
                if (typeof value.email !== 'string' || typeof value.password !== 'string') {
                    throw new ClientModeError('INVALID_MESSAGE', 'Email and password are required.');
                }
                return ok(await this.context.authorizeClientWithAccount(value.email, value.password));
            }
            if (endpoint === 'client.account.qr.start') {
                const value = record(payload);
                const provider = value.provider ?? 'zhihu';
                if (typeof provider !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(provider)) {
                    throw new ClientModeError('INVALID_MESSAGE', 'An OAuth provider ID is required.');
                }
                return ok(await this.context.startClientOAuthQrLogin(provider));
            }
            if (endpoint === 'client.account.qr.poll') {
                const value = record(payload);
                if (typeof value.qrId !== 'string' || value.qrId.length < 20) {
                    throw new ClientModeError('INVALID_MESSAGE', 'A QR login session is required.');
                }
                return ok(await this.context.pollClientOAuthQrLogin(value.qrId));
            }
            if (endpoint === 'preview.open') {
                const remote = this.context.activeRemote();
                if (remote === undefined)
                    throw new ClientModeError('TRANSPORT_CLOSED', 'Connect to a Remote Host first.');
                this.context.preview ??= new LoopbackPreview(remote.client);
                return ok(await this.context.preview.open(record(payload).port));
            }
            if (endpoint === 'directory.list') {
                const value = record(payload);
                if (typeof value.targetDeviceId !== 'string')
                    throw new ClientModeError('INVALID_MESSAGE', 'A Host is required.');
                return ok(await this.context.listRemoteDirectory(value.targetDeviceId, typeof value.path === 'string' ? value.path : undefined, signal));
            }
            if (endpoint === 'workspaces.list') {
                const value = record(payload);
                if (typeof value.targetDeviceId !== 'string')
                    throw new ClientModeError('INVALID_MESSAGE', 'A Host is required.');
                return ok(await this.context.listRemoteWorkspaces(value.targetDeviceId, signal));
            }
            if (endpoint === 'codex.workspaces.list') {
                const value = record(payload);
                if (typeof value.targetDeviceId !== 'string')
                    throw new ClientModeError('INVALID_MESSAGE', 'A Host is required.');
                return ok(await this.context.listCodexWorkspaces(value.targetDeviceId, signal));
            }
            if (endpoint === 'workspace.open') {
                const value = record(payload);
                if (typeof value.targetDeviceId !== 'string' || typeof value.path !== 'string') {
                    throw new ClientModeError('INVALID_MESSAGE', 'A Host and working directory are required.');
                }
                return ok(await this.context.openRemoteWorkspace(value.targetDeviceId, value.path, signal));
            }
            if (endpoint === 'codex.workspace.open') {
                const value = record(payload);
                if (typeof value.targetDeviceId !== 'string' || typeof value.workspaceId !== 'string') {
                    throw new ClientModeError('INVALID_MESSAGE', 'A Host and CodeX Workspace are required.');
                }
                return ok(await this.context.openCodexWorkspace(value.targetDeviceId, value.workspaceId, signal));
            }
            if (endpoint === 'codex.workspace.create') {
                const value = record(payload);
                if (typeof value.targetDeviceId !== 'string' || typeof value.path !== 'string') {
                    throw new ClientModeError('INVALID_MESSAGE', 'A Host and CodeX project directory are required.');
                }
                return ok(await this.context.createCodexWorkspace(value.targetDeviceId, value.path, signal));
            }
            if (endpoint === 'cursor.workspaces.list') {
                const value = record(payload);
                if (typeof value.targetDeviceId !== 'string')
                    throw new ClientModeError('INVALID_MESSAGE', 'A Host is required.');
                return ok(await this.context.listCursorWorkspaces(value.targetDeviceId, signal, 'cursor'));
            }
            if (endpoint === 'cursor.workspace.open') {
                const value = record(payload);
                if (typeof value.targetDeviceId !== 'string' || typeof value.workspaceId !== 'string') {
                    throw new ClientModeError('INVALID_MESSAGE', 'A Host and Cursor Workspace are required.');
                }
                return ok(await this.context.openCursorWorkspace(value.targetDeviceId, value.workspaceId, signal, 'cursor'));
            }
            if (endpoint === 'cursor.workspace.create') {
                const value = record(payload);
                if (typeof value.targetDeviceId !== 'string' || typeof value.path !== 'string') {
                    throw new ClientModeError('INVALID_MESSAGE', 'A Host and Cursor project directory are required.');
                }
                return ok(await this.context.createCursorWorkspace(value.targetDeviceId, value.path, signal, 'cursor'));
            }
            if (endpoint === 'antigravity.workspaces.list') {
                const value = record(payload);
                if (typeof value.targetDeviceId !== 'string')
                    throw new ClientModeError('INVALID_MESSAGE', 'A Host is required.');
                return ok(await this.context.listCursorWorkspaces(value.targetDeviceId, signal, 'antigravity'));
            }
            if (endpoint === 'antigravity.workspace.open') {
                const value = record(payload);
                if (typeof value.targetDeviceId !== 'string' || typeof value.workspaceId !== 'string') {
                    throw new ClientModeError('INVALID_MESSAGE', 'A Host and Antigravity Workspace are required.');
                }
                return ok(await this.context.openCursorWorkspace(value.targetDeviceId, value.workspaceId, signal, 'antigravity'));
            }
            if (endpoint === 'antigravity.workspace.create') {
                const value = record(payload);
                if (typeof value.targetDeviceId !== 'string' || typeof value.path !== 'string') {
                    throw new ClientModeError('INVALID_MESSAGE', 'A Host and Antigravity project directory are required.');
                }
                return ok(await this.context.createCursorWorkspace(value.targetDeviceId, value.path, signal, 'antigravity'));
            }
            if (endpoint === 'pi.workspaces.list') {
                const value = record(payload);
                if (typeof value.targetDeviceId !== 'string')
                    throw new ClientModeError('INVALID_MESSAGE', 'A Host is required.');
                return ok(await this.context.listCursorWorkspaces(value.targetDeviceId, signal, 'pi'));
            }
            if (endpoint === 'pi.workspace.open') {
                const value = record(payload);
                if (typeof value.targetDeviceId !== 'string' || typeof value.workspaceId !== 'string') {
                    throw new ClientModeError('INVALID_MESSAGE', 'A Host and Pi Workspace are required.');
                }
                return ok(await this.context.openCursorWorkspace(value.targetDeviceId, value.workspaceId, signal, 'pi'));
            }
            if (endpoint === 'pi.workspace.create') {
                const value = record(payload);
                if (typeof value.targetDeviceId !== 'string' || typeof value.path !== 'string') {
                    throw new ClientModeError('INVALID_MESSAGE', 'A Host and Pi project directory are required.');
                }
                return ok(await this.context.createCursorWorkspace(value.targetDeviceId, value.path, signal, 'pi'));
            }
            if (endpoint === 'opencode.workspaces.list') {
                const value = record(payload);
                if (typeof value.targetDeviceId !== 'string')
                    throw new ClientModeError('INVALID_MESSAGE', 'A Host is required.');
                return ok(await this.context.listCursorWorkspaces(value.targetDeviceId, signal, 'opencode'));
            }
            if (endpoint === 'opencode.workspace.open') {
                const value = record(payload);
                if (typeof value.targetDeviceId !== 'string' || typeof value.workspaceId !== 'string') {
                    throw new ClientModeError('INVALID_MESSAGE', 'A Host and OpenCode Workspace are required.');
                }
                return ok(await this.context.openCursorWorkspace(value.targetDeviceId, value.workspaceId, signal, 'opencode'));
            }
            if (endpoint === 'opencode.workspace.create') {
                const value = record(payload);
                if (typeof value.targetDeviceId !== 'string' || typeof value.path !== 'string') {
                    throw new ClientModeError('INVALID_MESSAGE', 'A Host and OpenCode project directory are required.');
                }
                return ok(await this.context.createCursorWorkspace(value.targetDeviceId, value.path, signal, 'opencode'));
            }
            if (endpoint === 'claude.workspaces.list') {
                const value = record(payload);
                if (typeof value.targetDeviceId !== 'string')
                    throw new ClientModeError('INVALID_MESSAGE', 'A Host is required.');
                return ok(await this.context.listCursorWorkspaces(value.targetDeviceId, signal, 'claude'));
            }
            if (endpoint === 'claude.workspace.open') {
                const value = record(payload);
                if (typeof value.targetDeviceId !== 'string' || typeof value.workspaceId !== 'string') {
                    throw new ClientModeError('INVALID_MESSAGE', 'A Host and Claude Workspace are required.');
                }
                return ok(await this.context.openCursorWorkspace(value.targetDeviceId, value.workspaceId, signal, 'claude'));
            }
            if (endpoint === 'claude.workspace.create') {
                const value = record(payload);
                if (typeof value.targetDeviceId !== 'string' || typeof value.path !== 'string') {
                    throw new ClientModeError('INVALID_MESSAGE', 'A Host and Claude project directory are required.');
                }
                return ok(await this.context.createCursorWorkspace(value.targetDeviceId, value.path, signal, 'claude'));
            }
            if (endpoint === 'workspace.selection.consume') {
                const value = record(payload);
                if (typeof value.targetDeviceId !== 'string' || typeof value.workspaceId !== 'string') {
                    throw new ClientModeError('INVALID_MESSAGE', 'A Host and Workspace are required.');
                }
                return ok(this.context.consumeWorkspaceSelection({
                    targetDeviceId: value.targetDeviceId,
                    workspaceId: value.workspaceId,
                    ...(value.backend === 'codex' || value.backend === 'cursor' || value.backend === 'antigravity' || value.backend === 'pi' || value.backend === 'opencode' || value.backend === 'claude' ? { backend: value.backend } : {}),
                    ...(typeof value.sessionId === 'string' ? { sessionId: value.sessionId } : {}),
                }));
            }
            if (endpoint === 'fileviewer.stat' || endpoint === 'fileviewer.readRange' || endpoint === 'fileviewer.list') {
                const method = endpoint === 'fileviewer.stat'
                    ? 'stat'
                    : endpoint === 'fileviewer.readRange' ? 'readRange' : 'list';
                return ok(await this.context.callRemoteFileViewer(method, payload, signal));
            }
            if (endpoint === 'codex.call') {
                const value = record(payload);
                if (typeof value.method !== 'string' || !('params' in value)) {
                    throw new ClientModeError('INVALID_MESSAGE', 'A Codex method and params are required.');
                }
                const remote = this.context.activeCodexRemote();
                if (remote !== undefined)
                    return ok(await new CodexRemoteClient(remote.client).request(value.method, value.params, signal));
                const host = this.context.requireLocalCodex();
                return ok(await host.codexCall(value, signal));
            }
            if (endpoint === 'codex.probe') {
                const local = this.context.localCodexAvailable();
                let remoteSupported = false;
                const remote = this.context.activeRemote();
                if (remote !== undefined) {
                    try {
                        remote.features = await probeRemoteHostFeatures(remote.client, remote.clientVersion);
                        remoteSupported = remote.features.codex;
                    }
                    catch (error) {
                        if (!local)
                            throw error;
                    }
                }
                return ok({ supported: local || remoteSupported, local, remote: remoteSupported });
            }
            if (endpoint === 'codex.respond') {
                const value = record(payload);
                const remote = this.context.activeCodexRemote();
                if (remote !== undefined)
                    return ok(await remote.client.rpc('codex.app.respond', value, signal));
                const host = this.context.requireLocalCodex();
                return ok(await host.codexRespond(value, signal));
            }
            if (endpoint === 'plugin.route') {
                const value = record(payload);
                if (typeof value.route !== 'string' || !isAllowedPluginRoute(value.route)) {
                    throw new ClientModeError('INVALID_MESSAGE', 'A valid plugin route is required.');
                }
                if (!isRecord(value.body))
                    throw new ClientModeError('INVALID_MESSAGE', 'A plugin route body object is required.');
                return ok(await this.context.pluginRoute(value.route, value.body, signal));
            }
            if (endpoint === 'codex.stream.open')
                return ok(await this.context.openCodexStream(payload, signal));
            if (endpoint === 'codex.stream.next')
                return ok(await this.context.nextCodexFrames(payload, signal));
            if (endpoint === 'codex.stream.close')
                return ok(await this.context.closeCodexStream(payload));
            if (endpoint === 'host.account.login') {
                if (this.context.host === undefined)
                    throw new ClientModeError('METHOD_NOT_ALLOWED', 'This plugin is not running as a Host.');
                const value = record(payload);
                if (typeof value.email !== 'string' || typeof value.password !== 'string') {
                    throw new ClientModeError('INVALID_MESSAGE', 'Email and password are required.');
                }
                return ok(await this.context.host.authorizeHostWithAccount(value.email, value.password));
            }
            if (endpoint === 'host.authorization.set') {
                const value = record(payload);
                if (typeof value.enabled !== 'boolean') {
                    throw new ClientModeError('INVALID_MESSAGE', 'Host authorization state is required.');
                }
                return ok(await this.context.setHostAuthorization(value.enabled));
            }
            if (endpoint === 'host.registration-code.submit') {
                if (this.context.host === undefined)
                    throw new ClientModeError('METHOD_NOT_ALLOWED', 'This plugin is not running as a Host.');
                const value = record(payload);
                if (typeof value.code !== 'string' || value.code.trim() === '') {
                    throw new ClientModeError('INVALID_MESSAGE', 'A Host registration code is required.');
                }
                return ok(await this.context.host.authorizeHostWithCode(value.code));
            }
            if (endpoint === 'mode.set') {
                const value = record(payload);
                if (value.mode !== 'local' && value.mode !== 'remote')
                    throw new ClientModeError('INVALID_MESSAGE', 'Mode must be local or remote.');
                return ok(await this.context.setMode(value.mode, typeof value.targetDeviceId === 'string' ? value.targetDeviceId : undefined, signal));
            }
            throw new ClientModeError('METHOD_NOT_FOUND', 'The remote-mode control method does not exist.');
        }
        catch (error) {
            return fail(error);
        }
    }
}
//# sourceMappingURL=client-control.js.map