import type { DisplaySession } from '@dsh-remote/client-core';
import type { CodexClientLike, JsonRecord } from './virtual-values.js';
export declare const CODEX_PROVIDER = "codex";
export interface CodexVirtualWorkspaceView {
    workspaceId: string;
    path: string;
    title: string;
    sessionIds: string[];
    sessionCount: number;
    createdAt: string;
    updatedAt: string;
}
export declare function codexProjectWorkspaceId(projectId: string): string;
interface CodexProjectRoot {
    path: string;
}
interface CodexProject {
    id: string;
    name: string;
    roots: CodexProjectRoot[];
    position: number;
    createdAt: number;
    updatedAt: number;
}
interface CodexDirectoryEntry {
    name: string;
    path: string;
    hidden: boolean;
}
interface CodexDirectoryListing {
    path: string;
    home: string;
    crumbs: CodexDirectoryEntry[];
    entries: CodexDirectoryEntry[];
    truncated: boolean;
}
export interface CatalogState {
    threads: JsonRecord[];
    sessions: DisplaySession[];
    projects: CodexProject[];
    workspaces: CodexVirtualWorkspaceView[];
}
export interface CodexModelSelection {
    provider: string;
    model: string;
    reasoningEffort?: string;
}
interface CodexModelView {
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
export interface CodexModelDirectory {
    default: CodexModelSelection;
    groups: Array<{
        id: string;
        name: string;
        models: CodexModelView[];
    }>;
    models: Map<string, CodexModelView>;
}
/** Discover the CodeX projects visible through the Host App Server. */
export declare function discoverCodexVirtualWorkspaces(client: CodexClientLike, signal?: AbortSignal): Promise<CodexVirtualWorkspaceView[]>;
export declare function loadCatalog(client: CodexClientLike, signal?: AbortSignal, pendingThreads?: Map<string, JsonRecord>): Promise<CatalogState>;
export declare function loadModelDirectory(client: CodexClientLike, signal?: AbortSignal): Promise<CodexModelDirectory>;
export declare function nativeWorkspace(view: CodexVirtualWorkspaceView): Omit<CodexVirtualWorkspaceView, 'sessionCount'>;
export declare function nativeVisibleWorkspaces(catalog: CatalogState, selectedWorkspaceId?: string): CodexVirtualWorkspaceView[];
export declare function containsPath(root: string, candidate: string): boolean;
export declare function modelSelection(): CodexModelSelection;
export declare function modelSelectionProjection(selection: CodexModelSelection): {
    lastUsed: CodexModelSelection;
    next: CodexModelSelection;
};
export declare function modelCatalog(directory: CodexModelDirectory): unknown;
export declare function codexModelParams(selection: CodexModelSelection): {
    model: string;
    effort?: string;
};
export declare function displayTitle(session: DisplaySession): string | null;
export declare function isCodexDirectoryListing(value: unknown): value is CodexDirectoryListing;
export {};
//# sourceMappingURL=virtual-catalog.d.ts.map