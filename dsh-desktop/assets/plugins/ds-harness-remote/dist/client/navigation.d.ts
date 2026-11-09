import type { RemoteWorkspaceSelection, WorkspacesClientServiceLike } from './types.js';
export declare const pendingWorkspaceSelectionKey = "dsh-remote:pending-workspace-selection";
export declare function storedWorkspaceSelection(): RemoteWorkspaceSelection | undefined;
export declare function workspacesReady(snapshot: ReturnType<WorkspacesClientServiceLike['list']['getSnapshot']>): boolean;
//# sourceMappingURL=navigation.d.ts.map