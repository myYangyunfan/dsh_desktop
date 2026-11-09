const CURSOR_WORKSPACE_PREFIX = 'cursor:cwd:';
const AGY_WORKSPACE_PREFIX = 'antigravity:cwd:';
const OPENCODE_WORKSPACE_PREFIX = 'opencode:cwd:';
const CURSOR_PROVIDER = 'cursor';
const OPENCODE_PROVIDER = 'opencode';
/** Build a backend-scoped virtual Workspace id for an absolute Host cwd. */
export function acpCwdWorkspaceId(path, backend) {
    if (backend !== "cursor" && backend !== "antigravity" && backend !== "pi" && backend !== "opencode" && backend !== "claude")
        throw new Error("An explicit ACP workspace backend is required.");
    const prefix = backend === "claude" ? "claude:cwd:" : backend === "pi" ? "pi:cwd:" : backend === "opencode" ? OPENCODE_WORKSPACE_PREFIX : backend === "antigravity" ? AGY_WORKSPACE_PREFIX : CURSOR_WORKSPACE_PREFIX;
    return `${prefix}${encodeURIComponent(path)}`;
}
export function createAcpWorkspaceView(path, backend, title) {
    const now = new Date().toISOString();
    const label = title?.trim() || path.split(/[\\/]/).filter(Boolean).at(-1) || path;
    return {
        workspaceId: acpCwdWorkspaceId(path, backend),
        path,
        title: label,
        sessionIds: [],
        sessionCount: 0,
        createdAt: now,
        updatedAt: now,
    };
}
/** Discover ACP virtual workspaces visible on the Host. */
export async function discoverAcpVirtualWorkspaces(client, backend, signal) {
    if (client?.listWorkspaces !== undefined) {
        try {
            const items = await client.listWorkspaces(backend, signal);
            if (Array.isArray(items) && items.length > 0) {
                return items
                    .filter(item => typeof item?.path === 'string' && item.path.trim() !== '')
                    .map(item => {
                    const view = createAcpWorkspaceView(item.path, backend, item.title);
                    if (typeof item.sessionCount === 'number')
                        view.sessionCount = item.sessionCount;
                    return view;
                });
            }
        }
        catch (error) {
            if (backend === 'pi' || backend === 'claude')
                throw error;
            // Discovery is optional for legacy backends; an unavailable Host returns no workspaces.
        }
    }
    return [];
}
export function recreateWorkspaceFromId(workspaceId, backend) {
    const prefix = backend === "claude" ? "claude:cwd:" : backend === "pi" ? "pi:cwd:" : backend === "opencode" ? OPENCODE_WORKSPACE_PREFIX : backend === "antigravity" ? AGY_WORKSPACE_PREFIX : CURSOR_WORKSPACE_PREFIX;
    if (!workspaceId.startsWith(prefix))
        return undefined;
    try {
        const path = decodeURIComponent(workspaceId.slice(prefix.length));
        if (path.length > 0)
            return createAcpWorkspaceView(path, backend);
    }
    catch {
        return undefined;
    }
    return undefined;
}
export function nativeWorkspace(view) {
    return {
        workspaceId: view.workspaceId,
        path: view.path,
        title: view.title,
        sessionIds: view.sessionIds,
        createdAt: view.createdAt,
        updatedAt: view.updatedAt,
    };
}
export function modelCatalog(backend = "cursor") {
    const provider = backend === 'claude' ? 'claude' : backend === 'pi' ? 'pi' : backend === 'opencode' ? OPENCODE_PROVIDER : backend === 'antigravity' ? 'antigravity' : CURSOR_PROVIDER;
    const name = backend === 'claude' ? 'Claude' : backend === 'pi' ? 'Pi' : backend === 'opencode' ? 'OpenCode' : backend === 'antigravity' ? 'Antigravity' : 'Cursor';
    const models = [];
    const defaultModel = models[0]?.id ?? 'host-settings';
    return {
        default: { provider, model: defaultModel },
        routableProviders: [],
        groups: [{
                id: provider,
                name,
                models,
            }],
        failures: [],
    };
}
//# sourceMappingURL=virtual-catalog.js.map