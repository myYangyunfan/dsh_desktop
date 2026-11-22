export type AcpPermissionPreset = 'workspace-write' | 'danger-full-access';
export interface PersistedAcpWorkspaceEntry {
    path: string;
    title?: string;
    updatedAt: string;
}
/**
 * Lightweight Host-side persistence for ACP workspace lists, order, renames,
 * delete tombstones, pinned sessions, and session permission presets.
 * Never touches DSH SessionStore or Workspace database.
 */
export declare class AcpWorkspaceStore {
    private readonly filePath?;
    private data;
    private loaded;
    private loadPromise?;
    private writeChain;
    constructor(filePath?: string | undefined);
    static inDirectory(directory?: string): AcpWorkspaceStore;
    load(): Promise<void>;
    private loadOnce;
    private getBackend;
    private ensureBackend;
    private persist;
    listWorkspaces(backend: string): Promise<{
        workspaces: PersistedAcpWorkspaceEntry[];
        deletedPaths: Set<string>;
    }>;
    upsertWorkspace(backend: string, path: string, title?: string): Promise<PersistedAcpWorkspaceEntry>;
    renameWorkspace(backend: string, path: string, title: string): Promise<PersistedAcpWorkspaceEntry>;
    deleteWorkspace(backend: string, path: string): Promise<void>;
    reorderWorkspaces(backend: string, orderedPaths: string[]): Promise<string[]>;
    getPinnedSessions(backend: string): Promise<string[]>;
    pinSession(backend: string, sessionId: string): Promise<string[]>;
    unpinSession(backend: string, sessionId: string): Promise<string[]>;
    getSessionPermission(sessionId: string): Promise<AcpPermissionPreset | undefined>;
    setSessionPermission(sessionId: string, preset: AcpPermissionPreset): Promise<void>;
    getAllSessionPermissions(): Promise<Record<string, AcpPermissionPreset>>;
}
//# sourceMappingURL=workspace-store.d.ts.map