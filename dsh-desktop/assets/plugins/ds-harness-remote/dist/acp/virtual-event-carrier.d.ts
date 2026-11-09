import type { AcpVirtualWorkspaceView } from './virtual-catalog.js';
import type { AcpClientLike, AcpSessionState, JsonRecord, PendingApproval } from './virtual-contract.js';
import { AsyncValueQueue } from './virtual-contract.js';
/** Collaborates with one AcpVirtualHarness; never creates a second session or connection state. */
export interface AcpEventCarrierContext {
    readonly workspaceStreams: Set<AsyncValueQueue>;
    readonly visibleWorkspaces: () => AcpVirtualWorkspaceView[];
    readonly controlStreams: Set<AsyncValueQueue>;
    readonly eventStreams: Map<string, AsyncValueQueue>;
    readonly selectedWorkspaceId: string | undefined;
    readonly workspaceById: Map<string, AcpVirtualWorkspaceView>;
    readonly backendLabel: () => string;
    readonly pendingApprovals: Map<string, PendingApproval>;
    readonly client: AcpClientLike;
    readonly sessions: Map<string, AcpSessionState>;
    readonly nextProjectionSeq: () => number;
    readonly archivedSessionIds: ReadonlySet<string>;
}
export declare class AcpEventCarrier {
    private readonly context;
    constructor(context: AcpEventCarrierContext);
    workspaceFollow(signal: AbortSignal): Promise<AsyncIterable<unknown>>;
    sessionControl(signal: AbortSignal): Promise<AsyncIterable<unknown>>;
    /**
     * Background jobs belong to the Host Harness session, not to a backend-scoped
     * virtual Workspace. The native session header mounts a job roster stream as
     * soon as a Session opens, so answer it with an authoritative empty roster
     * instead of a terminal `method-not-found` failure that tears the page down.
     */
    emptyJobStream(endpoint: 'job/list' | 'job/follow', signal: AbortSignal): AsyncIterable<unknown>;
    remoteEvents(signal: AbortSignal): Promise<AsyncIterable<unknown>>;
    emitRemoteEvent(event: string, args: unknown[]): void;
    emitApproval(input: {
        eventId: string;
        agentId: string;
        request: JsonRecord;
    }): void;
    answerRemoteEvent(args: JsonRecord, signal: AbortSignal): Promise<undefined>;
    publishProjection(sessionId: string, key: string, value: unknown, seq?: number): void;
}
//# sourceMappingURL=virtual-event-carrier.d.ts.map