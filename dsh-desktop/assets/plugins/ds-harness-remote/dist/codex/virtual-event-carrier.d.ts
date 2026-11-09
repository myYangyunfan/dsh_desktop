import type { CatalogState } from './virtual-catalog.js';
import type { PendingApproval } from './virtual-contract.js';
import { AsyncValueQueue } from './virtual-contract.js';
import type { CodexClientLike, JsonRecord } from './virtual-values.js';
/** Collaborates with one CodexVirtualHarness; never creates a second session or connection state. */
export interface CodexEventCarrierContext {
    readonly workspaceStreams: Set<AsyncValueQueue>;
    readonly refreshCatalog: (signal?: AbortSignal) => Promise<CatalogState>;
    readonly selectedWorkspaceId: string | undefined;
    readonly controlStreams: Set<AsyncValueQueue>;
    readonly host: {
        deviceId: string;
        name: string;
    };
    readonly eventStreams: Map<string, AsyncValueQueue>;
    readonly currentCatalog: (signal?: AbortSignal) => Promise<CatalogState>;
    readonly pendingApprovals: Map<string, PendingApproval>;
    readonly client: CodexClientLike;
}
export declare class CodexEventCarrier {
    private readonly context;
    constructor(context: CodexEventCarrierContext);
    workspaceFollow(signal: AbortSignal): Promise<AsyncIterable<unknown>>;
    sessionControl(signal: AbortSignal): Promise<AsyncIterable<unknown>>;
    /**
     * Background jobs belong to the Host Harness session, not to a CodeX virtual
     * Workspace. The native session header mounts a job roster stream as soon as a
     * Session opens, so answer it with an authoritative empty roster instead of a
     * terminal `method-not-found` failure that tears the page down.
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
    publishProjection(sessionId: string, key: string, value: unknown, seq: number): void;
}
//# sourceMappingURL=virtual-event-carrier.d.ts.map