import { ClientModeError, isRecord } from './client-runtime-contract.js';
export async function readRemoteWorkspaceBaseline(gateway, signal) {
    const lifetime = new AbortController();
    const activeSignal = signal === undefined
        ? lifetime.signal
        : AbortSignal.any([signal, lifetime.signal]);
    const source = await gateway.open('workspace/follow', { args: {} }, activeSignal);
    const iterator = source[Symbol.asyncIterator]();
    try {
        const first = await iterator.next();
        if (first.done || !isRecord(first.value) || first.value.type !== 'baseline'
            || !isRecord(first.value.value) || !Array.isArray(first.value.value.items)) {
            throw new ClientModeError('INVALID_MESSAGE', 'The remote Host returned an invalid Workspace baseline.');
        }
        return first.value.value.items.map((item) => {
            if (!isRecord(item) || typeof item.workspaceId !== 'string'
                || typeof item.path !== 'string' || typeof item.title !== 'string') {
                throw new ClientModeError('INVALID_MESSAGE', 'The remote Host returned an invalid Workspace row.');
            }
            return { workspaceId: item.workspaceId, path: item.path, title: item.title };
        });
    }
    finally {
        lifetime.abort('workspace-baseline-read');
        await iterator.return?.();
    }
}
export function workspaceRecordId(value) {
    if (typeof value !== 'object' || value === null || !('workspaceId' in value)
        || typeof value.workspaceId !== 'string' || value.workspaceId.length === 0) {
        throw new ClientModeError('INVALID_MESSAGE', 'The remote Host returned an invalid Workspace.');
    }
    return value.workspaceId;
}
export function remoteWorkspaceTitle(path) {
    const normalized = path.replace(/[\\/]+$/u, '');
    return normalized.split(/[\\/]+/u).filter(Boolean).at(-1) ?? path;
}
//# sourceMappingURL=client-workspace-queries.js.map