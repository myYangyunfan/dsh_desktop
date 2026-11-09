import type { AcpClientLike } from './virtual-contract.js';
export interface AcpVirtualWorkspaceView {
    workspaceId: string;
    path: string;
    title: string;
    sessionIds: string[];
    sessionCount: number;
    createdAt: string;
    updatedAt: string;
}
/** Build a backend-scoped virtual Workspace id for an absolute Host cwd. */
export declare function acpCwdWorkspaceId(path: string, backend: "cursor" | "antigravity" | "pi" | "opencode" | "claude"): string;
export declare function createAcpWorkspaceView(path: string, backend: "cursor" | "antigravity" | "pi" | "opencode" | "claude", title?: string): AcpVirtualWorkspaceView;
/** Discover ACP virtual workspaces visible on the Host. */
export declare function discoverAcpVirtualWorkspaces(client: AcpClientLike, backend: "cursor" | "antigravity" | "pi" | "opencode" | "claude", signal?: AbortSignal): Promise<AcpVirtualWorkspaceView[]>;
export declare function recreateWorkspaceFromId(workspaceId: string, backend: "cursor" | "antigravity" | "pi" | "opencode" | "claude"): AcpVirtualWorkspaceView | undefined;
export declare function nativeWorkspace(view: AcpVirtualWorkspaceView): Omit<AcpVirtualWorkspaceView, 'sessionCount'>;
export interface AcpModelSelection {
    provider: string;
    model: string;
    reasoningEffort?: string;
}
export interface AcpModelView {
    id: string;
    name: string;
    description?: string;
    reasoning?: {
        efforts: Array<{
            id: string;
            name: string;
            description?: string;
        }>;
        defaultEffort?: string;
    };
}
export declare function modelCatalog(backend?: "cursor" | "antigravity" | "pi" | "opencode" | "claude"): {
    default: AcpModelSelection;
    routableProviders: string[];
    groups: Array<{
        id: string;
        name: string;
        models: AcpModelView[];
    }>;
    failures: Array<{
        id: string;
        name: string;
        message: string;
    }>;
};
//# sourceMappingURL=virtual-catalog.d.ts.map