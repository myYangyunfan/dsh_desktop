import { AgentAcpClient } from '@dsh-remote/client-core';
import type { RemoteTypertGatewayTarget, TypertGatewayRequest, TypertRpcResult } from '../typert-gateway-contract.js';
import type { AcpVirtualWorkspaceView } from './virtual-catalog.js';
import type { AcpClientLike } from './virtual-contract.js';
/**
 * Browser-safe, in-memory Harness projection for the independent Agent ACP domain. Projects
 * cwd workspaces and ACP sessions onto the native DSH Workspace / Session /
 * Composer surface without writing DSH SessionStore.
 */
export declare class AcpVirtualHarness implements RemoteTypertGatewayTarget {
    private readonly client;
    private readonly host;
    readonly backend: "cursor" | "antigravity" | "pi" | "opencode" | "claude";
    /**
     * Host gateway used for endpoints this virtual Harness does not project
     * (settings, plugins, models, credentials, …). A real Harness workspace
     * serves them from the Host; without this fallback the native Client would
     * see `method-not-found` for every global surface and can fail its render.
     */
    private readonly hostCarrier?;
    private readonly live;
    private readonly events;
    private readonly titles;
    private readonly workspaceById;
    private readonly sessions;
    private readonly workspaceStreams;
    private readonly controlStreams;
    private readonly eventStreams;
    private readonly follows;
    private readonly pendingApprovals;
    private readonly pendingHistory;
    private selectedWorkspaceId?;
    private readonly selectedModels;
    private lastProjectionSeq;
    private readonly imageAttachments;
    private closed;
    private readonly archivedSessionIds;
    private readonly unsubscribeArchived?;
    constructor(client: AcpClientLike, host: {
        deviceId: string;
        name: string;
    }, backend?: "cursor" | "antigravity" | "pi" | "opencode" | "claude", 
    /**
     * Host gateway used for endpoints this virtual Harness does not project
     * (settings, plugins, models, credentials, …). A real Harness workspace
     * serves them from the Host; without this fallback the native Client would
     * see `method-not-found` for every global surface and can fail its render.
     */
    hostCarrier?: RemoteTypertGatewayTarget | undefined);
    static remote(core: ConstructorParameters<typeof AgentAcpClient>[0], host: {
        deviceId: string;
        name: string;
    }, backend?: "cursor" | "antigravity" | "pi" | "opencode" | "claude", capabilities?: readonly string[], hostCarrier?: RemoteTypertGatewayTarget): AcpVirtualHarness;
    workspaces(): Promise<AcpVirtualWorkspaceView[]>;
    private backendLabel;
    selectWorkspace(workspaceId: string): Promise<AcpVirtualWorkspaceView>;
    selectOrCreateWorkspace(path: string): Promise<AcpVirtualWorkspaceView>;
    preferredSessionId(): Promise<string | undefined>;
    invoke(request: TypertGatewayRequest): Promise<unknown>;
    dispatch(endpoint: string, payload: unknown, signal: AbortSignal): Promise<TypertRpcResult>;
    open(endpoint: string, payload: unknown, signal: AbortSignal): Promise<AsyncIterable<unknown>>;
    close(): Promise<void>;
    private visibleWorkspaces;
    private createWorkspace;
    private renameWorkspace;
    private workspaceForSession;
    private archiveSession;
    private applyArchived;
    private createSession;
    private ensureSessionRegistered;
    private prompt;
    private cancel;
    private renameSession;
    private cacheImageAttachments;
    private attachment;
    private hydrateSession;
    private hydrateSessionOnce;
    private sessionHistory;
    private sessionProjections;
    private sessionPage;
    private historyPage;
    private describeHost;
    private listDirectory;
    private registerSession;
    private discoverAndAttachSessions;
    private attachSessionToWorkspace;
    private ensureInitialSession;
    private handleSessionList;
    private sessionSummaries;
    private sortWorkspaceSessions;
    private sessionSummary;
    private resolveSessionId;
    private modelSelection;
    private modelSelectionProjection;
    private hostSessionModels;
    private selectModel;
    private publishWorkspaceBaseline;
    private nextProjectionSeq;
}
export { acpCwdWorkspaceId, createAcpWorkspaceView, discoverAcpVirtualWorkspaces, modelCatalog } from './virtual-catalog.js';
export type { AcpModelSelection, AcpModelView, AcpVirtualWorkspaceView } from './virtual-catalog.js';
export type { AcpClientLike } from './virtual-contract.js';
//# sourceMappingURL=virtual-harness.d.ts.map