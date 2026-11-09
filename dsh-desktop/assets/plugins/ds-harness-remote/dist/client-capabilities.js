import { remoteWorkspaceTypeAvailable } from '@dsh-remote/client-core';
import { parseRemoteWorkspaceTypes } from '@dsh-remote/protocol';
import { ClientModeError, isRecord } from './client-runtime-contract.js';
/** Empty profile before authenticated capability discovery. */
export function remoteHostFeatures(clientVersion) {
    return {
        commandList: false,
        fileViewer: false,
        terminal: false,
        remoteGateway: false,
        codex: false,
        cursor: false,
        antigravity: false,
        opencode: false,
        pluginRoute: false,
    };
}
export async function probeRemoteHostFeatures(client, clientVersion) {
    let value;
    try {
        value = await client.rpc('harness.transport.describe', {});
    }
    catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'METHOD_NOT_FOUND') {
            throw new ClientModeError('FEATURE_NOT_SUPPORTED', 'This Host predates Typert Remote capability discovery. Upgrade the Host.');
        }
        throw error;
    }
    if (!isRecord(value) || !Array.isArray(value.capabilities)
        || value.capabilities.some(capability => typeof capability !== 'string')) {
        throw new ClientModeError('INVALID_MESSAGE', 'The remote Host returned invalid transport capabilities.');
    }
    const capabilities = new Set(value.capabilities);
    const remoteV1 = capabilities.has('harness.remote.v1');
    const remoteV3 = capabilities.has('harness.remote.v3');
    const terminal = capabilities.has('harness.terminal.v1');
    const workspaceTypes = 'workspaceTypes' in value ? parseRemoteWorkspaceTypes(value.workspaceTypes) : undefined;
    const available = (id, capability) => remoteWorkspaceTypeAvailable(value.capabilities, workspaceTypes, id, capability);
    const codex = available('codex', 'codex.appserver.v1');
    const cursor = available('cursor', 'agent.acp.cursor.v1');
    const antigravity = available('antigravity', 'agent.acp.antigravity.v1');
    const pi = available('pi', 'agent.acp.pi.v1');
    const claude = available('claude', 'agent.acp.claude.v1');
    const opencode = available('opencode', 'agent.acp.opencode.v1');
    if (remoteV1 && remoteV3) {
        throw new ClientModeError('INVALID_MESSAGE', 'The remote Host advertised conflicting Harness Session formats.');
    }
    const sessionFormat = remoteV3 ? 3 : undefined;
    const remoteGateway = remoteV3 || remoteV1;
    if (!remoteGateway && !codex && !cursor && !antigravity && !pi && !opencode && !claude) {
        throw new ClientModeError('FEATURE_NOT_SUPPORTED', 'The remote Host exposes no supported Harness transport.');
    }
    return {
        commandList: remoteGateway,
        fileViewer: capabilities.has('fileviewer.read.v1'),
        terminal,
        remoteGateway,
        ...(sessionFormat === undefined ? {} : { sessionFormat }),
        codex,
        cursor,
        antigravity,
        ...(pi ? { pi: true } : {}),
        opencode,
        claude,
        ...(capabilities.has('agent.acp.antigravity.model-load.v1') ? { acpModelLoadsSession: true } : {}),
        ...(workspaceTypes === undefined ? {} : { workspaceTypes }),
        pluginRoute: capabilities.has('plugin.route.v1'),
    };
}
//# sourceMappingURL=client-capabilities.js.map