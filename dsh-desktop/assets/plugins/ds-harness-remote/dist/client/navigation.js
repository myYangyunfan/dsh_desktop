export const pendingWorkspaceSelectionKey = 'dsh-remote:pending-workspace-selection';
export function storedWorkspaceSelection() {
    const raw = window.sessionStorage.getItem(pendingWorkspaceSelectionKey);
    if (raw === null)
        return undefined;
    try {
        const value = JSON.parse(raw);
        if (typeof value.targetDeviceId !== 'string' || typeof value.workspaceId !== 'string')
            throw new Error('invalid');
        if (value.backend !== undefined
            && value.backend !== 'harness'
            && value.backend !== 'codex'
            && value.backend !== 'cursor'
            && value.backend !== 'antigravity'
            && value.backend !== 'pi'
            && value.backend !== 'claude' && value.backend !== 'opencode')
            throw new Error('invalid');
        if (value.sessionId !== undefined && typeof value.sessionId !== 'string')
            throw new Error('invalid');
        return value;
    }
    catch {
        window.sessionStorage.removeItem(pendingWorkspaceSelectionKey);
        return undefined;
    }
}
export function workspacesReady(snapshot) {
    return snapshot.baselinesReady === true || snapshot.phase === 'ready';
}
//# sourceMappingURL=navigation.js.map