import { CodexRemoteClient } from '@dsh-remote/client-core';
import type { HarnessSessionGeneration } from '../harness-version.js';
import type { RemoteTypertGatewayTarget, TypertGatewayRequest, TypertRpcResult } from '../typert-gateway-contract.js';
import type { CodexVirtualWorkspaceView } from './virtual-catalog.js';
import type { CodexClientLike } from './virtual-values.js';
/**
 * A plugin-owned virtual Harness target. It projects CodeX Thread/Turn data at
 * the existing Typert carrier boundary, so every UI layer above the
 * official Workspace and Session controllers remains native DSH.
 */
export declare class CodexVirtualHarness implements RemoteTypertGatewayTarget {
    private readonly client;
    private readonly host;
    private readonly sessionGeneration;
    private readonly hostCarrier?;
    private readonly live;
    private readonly events;
    private catalog?;
    private readonly workspaceStreams;
    private readonly controlStreams;
    private readonly eventStreams;
    private readonly follows;
    private readonly pendingRequestIds;
    private readonly pendingApprovals;
    private readonly pendingThreads;
    private readonly blankThreads;
    private readonly selectedModels;
    private readonly selectedPermissions;
    private readonly imageAttachments;
    private modelDirectory?;
    private modelDirectoryPromise?;
    private lastProjectionSeq;
    private commandSeq;
    private selectedWorkspaceId?;
    private lastOpenedSessionId?;
    private readonly openedWorkspaceSessions;
    private closed;
    constructor(client: CodexClientLike, host: {
        deviceId: string;
        name: string;
    }, sessionGeneration?: HarnessSessionGeneration, hostCarrier?: RemoteTypertGatewayTarget | undefined);
    static remote(core: ConstructorParameters<typeof CodexRemoteClient>[0], host: {
        deviceId: string;
        name: string;
    }, sessionGeneration?: HarnessSessionGeneration, hostCarrier?: RemoteTypertGatewayTarget): CodexVirtualHarness;
    workspaces(signal?: AbortSignal): Promise<CodexVirtualWorkspaceView[]>;
    selectWorkspace(workspaceId: string, signal?: AbortSignal): Promise<CodexVirtualWorkspaceView>;
    get openedSessionId(): string | undefined;
    get openedSessions(): ReadonlyMap<string, string>;
    private rememberOpenedSession;
    preferredSessionId(signal?: AbortSignal, preferredSessionId?: string | undefined): Promise<string | undefined>;
    invoke(request: TypertGatewayRequest): Promise<unknown>;
    dispatch(endpoint: string, payload: unknown, signal: AbortSignal): Promise<TypertRpcResult>;
    open(endpoint: string, payload: unknown, signal: AbortSignal): Promise<AsyncIterable<unknown>>;
    close(): Promise<void>;
    private refreshCatalog;
    private currentCatalog;
    private models;
    private modelSelection;
    private permissionSelection;
    private setPermissionSelection;
    private commandList;
    private executeCommand;
    private sessionTitle;
    private selectModel;
    private nextProjectionSeq;
    private updateThreadName;
    private sessionSummaries;
    private sessionSummary;
    private searchSessions;
    private createWorkspace;
    private renameWorkspace;
    private workspaceForSession;
    private selectedWorkspace;
    private describeHost;
    private listDirectory;
    private archiveSession;
    private createSession;
    private forkSession;
    private prompt;
    private attachment;
    private hydrateImageAttachments;
    private cancel;
    private renameSession;
    private sessionProjections;
    private sessionPage;
    private activeTurnId;
    private readHistoryPage;
    private cacheHistoryImages;
    private sessionHistory;
    private refreshAndPublishWorkspaces;
    private publishWorkspaceBaseline;
}
export { codexProjectWorkspaceId, discoverCodexVirtualWorkspaces } from './virtual-catalog.js';
export type { CodexVirtualWorkspaceView } from './virtual-catalog.js';
export { paginateCodexNativeHistory, projectCodexNativeHistory } from './virtual-history.js';
export type { CodexNativeHistory, CodexNativeHistoryPage } from './virtual-history.js';
//# sourceMappingURL=virtual-harness.d.ts.map