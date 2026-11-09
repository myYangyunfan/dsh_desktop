import { createRpcError, createRpcResponse, parseRemoteWorkspaceTypes, } from '@dsh-remote/protocol';
import { z } from 'zod';
import { RpcError, safeErrorCode } from './safe-error.js';
export { RpcError } from './safe-error.js';
const wireRequestSchema = z.object({ method: z.string().min(1), params: z.unknown() }).strict();
const emptyParamsSchema = z.object({}).strict();
const historyConfigureSchema = z.object({ compact: z.boolean() }).strict();
const apiMethods = new Set([
    'harness.transport.describe',
    'remote.history.configure',
    'harness.remote.call',
    'harness.remote.transfer.open',
    'harness.remote.transfer.chunk',
    'harness.remote.transfer.commit',
    'harness.remote.transfer.read',
    'harness.remote.transfer.close',
    'harness.remote.stream.open',
    'harness.remote.stream.close',
    'loopback.call',
    'fileviewer.call',
    'codex.app.call',
    'codex.app.respond',
    'codex.app.stream.open',
    'codex.app.stream.close',
    'codex.app.transfer.open',
    'codex.app.transfer.chunk',
    'codex.app.transfer.commit',
    'codex.app.transfer.read',
    'codex.app.transfer.close',
    'agent.acp.call',
    'agent.acp.respond',
    'agent.acp.stream.open',
    'agent.acp.stream.close',
    'agent.acp.transfer.open',
    'agent.acp.transfer.chunk',
    'agent.acp.transfer.commit',
    'agent.acp.transfer.read',
    'agent.acp.transfer.close',
    'plugin.route.call',
    'workspace.upload.open',
    'workspace.upload.chunk',
    'workspace.upload.commit',
    'workspace.upload.abort',
]);
export const HOST_CAPABILITIES = [
    'harness.remote.v1',
    'harness.remote.transfer.v1',
    'fileviewer.read.v1',
    'workspace.upload.v1',
    'codex.appserver.v1',
    'codex.appserver.transfer.v1',
    'agent.acp.v1',
    'agent.acp.transfer.v1',
];
export class RpcRouter {
    maxPending;
    logger;
    fileViewer;
    harnessRemote;
    capabilities;
    codex;
    acp;
    loopback;
    workspaceTypes;
    pluginRoute;
    workspaceUpload;
    active = 0;
    constructor(maxPending = 128, logger, fileViewer, harnessRemote, capabilities = () => HOST_CAPABILITIES, codex, acp, loopback, workspaceTypes, pluginRoute, workspaceUpload) {
        this.maxPending = maxPending;
        this.logger = logger;
        this.fileViewer = fileViewer;
        this.harnessRemote = harnessRemote;
        this.capabilities = capabilities;
        this.codex = codex;
        this.acp = acp;
        this.loopback = loopback;
        this.workspaceTypes = workspaceTypes;
        this.pluginRoute = pluginRoute;
        this.workspaceUpload = workspaceUpload;
    }
    async closePeerStreams() {
        this.loopback?.closeAll();
        await Promise.all([
            this.harnessRemote?.closeAll(),
            this.codex?.closeAll(),
            this.acp?.closeAll(),
            this.workspaceUpload?.closeAll(),
        ]);
    }
    async handle(message) {
        if (message.type !== 'rpc.request') {
            return createRpcError(message.id, 'INVALID_MESSAGE', 'Only RPC requests are accepted on the Host business channel.');
        }
        const parsedPayload = wireRequestSchema.safeParse(message.payload);
        if (!parsedPayload.success)
            return createRpcError(message.id, 'INVALID_MESSAGE', 'The RPC request payload is invalid.');
        if (!apiMethods.has(parsedPayload.data.method)) {
            return createRpcError(message.id, 'METHOD_NOT_FOUND', 'The requested method does not exist.');
        }
        const request = message;
        if (this.active >= this.maxPending) {
            return createRpcError(request.id, 'RATE_LIMITED', 'Too many Host requests are already pending.', undefined, true);
        }
        this.active += 1;
        const startedAt = performance.now();
        try {
            const result = await this.invoke(request.payload.method, request.payload.params);
            const subMethod = typeof request.payload.params?.method === 'string'
                ? String(request.payload.params.method)
                : undefined;
            this.logger?.info('host rpc ok', {
                method: request.payload.method,
                ...(subMethod ? { subMethod } : {}),
                durationMs: Math.round(performance.now() - startedAt),
            });
            return createRpcResponse(request.id, result);
        }
        catch (error) {
            const response = errorResponse(request.id, error);
            const failedEndpoint = !request.payload.method.startsWith('workspace.upload.')
                && typeof request.payload.params?.endpoint === 'string'
                ? String(request.payload.params.endpoint)
                : undefined;
            this.logger?.warn('host rpc failed', {
                method: request.payload.method,
                ...(failedEndpoint ? { endpoint: failedEndpoint } : {}),
                durationMs: Math.round(performance.now() - startedAt),
                code: response.payload.code,
                retryable: response.payload.retryable,
            });
            return response;
        }
        finally {
            this.active -= 1;
        }
    }
    invoke(method, params) {
        switch (method) {
            case 'harness.transport.describe': {
                emptyParamsSchema.parse(params);
                const capabilities = [...new Set([...this.capabilities(), 'remote.history.compact.v1',
                        ...(this.harnessRemote === undefined ? [] : ['harness.remote.stream.transfer.v1']),
                    ])];
                let workspaceTypes;
                if (this.workspaceTypes !== undefined) {
                    try {
                        workspaceTypes = parseRemoteWorkspaceTypes(this.workspaceTypes());
                    }
                    catch {
                        workspaceTypes = [];
                    }
                }
                return {
                    capabilities,
                    ...(workspaceTypes === undefined ? {} : { workspaceTypes }),
                };
            }
            case 'remote.history.configure': {
                const { compact } = historyConfigureSchema.parse(params);
                for (const bridge of [this.harnessRemote, this.codex, this.acp]) {
                    if (bridge !== undefined)
                        bridge.compactHistoryEnabled = compact;
                }
                return { compact };
            }
            case 'harness.remote.call': return this.requireRemoteGateway().call(params);
            case 'harness.remote.transfer.open': return this.requireRemoteGateway().openTransfer(params);
            case 'harness.remote.transfer.chunk': return this.requireRemoteGateway().appendTransfer(params);
            case 'harness.remote.transfer.commit': return this.requireRemoteGateway().commitTransfer(params);
            case 'harness.remote.transfer.read': return this.requireRemoteGateway().readTransfer(params);
            case 'harness.remote.transfer.close': return this.requireRemoteGateway().closeTransfer(params);
            case 'harness.remote.stream.open': return this.requireRemoteGateway().openStream(params);
            case 'harness.remote.stream.close': return this.requireRemoteGateway().closeStream(params);
            case 'loopback.call': {
                if (this.loopback === undefined)
                    throw new RpcError('FEATURE_NOT_SUPPORTED', 'Loopback preview is unavailable on this Host.');
                return this.loopback.call(params);
            }
            case 'fileviewer.call': {
                if (this.fileViewer === undefined) {
                    throw new RpcError('FILE_VIEWER_UNAVAILABLE', 'The Remote Host does not have DSH File Viewer available.');
                }
                return this.fileViewer.call(params);
            }
            case 'codex.app.call': return this.requireCodex().call(params);
            case 'codex.app.respond': return this.requireCodex().respond(params);
            case 'codex.app.stream.open': return this.requireCodex().openStream(params);
            case 'codex.app.stream.close': return this.requireCodex().closeStream(params);
            case 'codex.app.transfer.open': return this.requireCodex().openTransfer(params);
            case 'codex.app.transfer.chunk': return this.requireCodex().appendTransfer(params);
            case 'codex.app.transfer.commit': return this.requireCodex().commitTransfer(params);
            case 'codex.app.transfer.read': return this.requireCodex().readTransfer(params);
            case 'codex.app.transfer.close': return this.requireCodex().closeTransfer(params);
            case 'agent.acp.call': return this.requireAcp().call(params);
            case 'agent.acp.respond': return this.requireAcp().respond(params);
            case 'agent.acp.stream.open': return this.requireAcp().openStream(params);
            case 'agent.acp.stream.close': return this.requireAcp().closeStream(params);
            case 'agent.acp.transfer.open': return this.requireAcp().openTransfer(params);
            case 'agent.acp.transfer.chunk': return this.requireAcp().appendTransfer(params);
            case 'agent.acp.transfer.commit': return this.requireAcp().commitTransfer(params);
            case 'agent.acp.transfer.read': return this.requireAcp().readTransfer(params);
            case 'agent.acp.transfer.close': return this.requireAcp().closeTransfer(params);
            case 'workspace.upload.open':
            case 'workspace.upload.chunk':
            case 'workspace.upload.commit':
            case 'workspace.upload.abort': {
                if (!this.workspaceUpload)
                    throw new RpcError('FEATURE_NOT_SUPPORTED', 'Workspace upload is unavailable on this Host.');
                return this.workspaceUpload.call(method, params);
            }
            case 'plugin.route.call': return this.requirePluginRoute().call(params);
            default: throw new RpcError('METHOD_NOT_FOUND', 'The requested method does not exist.');
        }
    }
    requireRemoteGateway() {
        if (this.harnessRemote === undefined) {
            throw new RpcError('FEATURE_NOT_SUPPORTED', 'This Harness version does not provide the Remote Gateway transport.');
        }
        return this.harnessRemote;
    }
    requireCodex() {
        if (this.codex === undefined) {
            throw new RpcError('FEATURE_NOT_SUPPORTED', 'Codex Remote is disabled or unavailable on this Host.');
        }
        return this.codex;
    }
    requireAcp() {
        if (this.acp === undefined) {
            throw new RpcError('FEATURE_NOT_SUPPORTED', 'Agent ACP is disabled or unavailable on this Host.');
        }
        return this.acp;
    }
    requirePluginRoute() {
        if (this.pluginRoute === undefined) {
            throw new RpcError('FEATURE_NOT_SUPPORTED', 'This Host cannot forward local plugin routes.');
        }
        return this.pluginRoute;
    }
}
function errorResponse(requestId, error) {
    const code = safeErrorCode(error);
    if (error instanceof RpcError)
        return createRpcError(requestId, code, error.message, error.details, error.retryable);
    return createRpcError(requestId, code, code === 'INVALID_MESSAGE' ? 'The RPC parameters are invalid.' : 'The Host could not complete the request.');
}
//# sourceMappingURL=rpc-router.js.map