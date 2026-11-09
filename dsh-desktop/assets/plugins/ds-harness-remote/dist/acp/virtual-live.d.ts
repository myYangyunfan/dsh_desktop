import type { AgentAcpFrameData } from '@dsh-remote/protocol';
import type { AcpModelSelection } from './virtual-catalog.js';
import type { AcpClientLike, AcpSessionState, FollowState, JsonRecord, NativeEvent, PendingApproval, PiTurnOutcome } from './virtual-contract.js';
/** Collaborates with one AcpVirtualHarness; never creates a second session or connection state. */
export interface AcpLiveProjectionContext {
    readonly ensureSessionRegistered: (sessionId: string) => AcpSessionState | undefined;
    readonly sessions: Map<string, AcpSessionState>;
    readonly hydrateSession: (session: AcpSessionState) => Promise<void>;
    readonly historyPage: (session: AcpSessionState, options?: {
        beforeSeq?: number;
        throughSeq?: number;
        limit?: number;
    }) => {
        assistantStream: {
            revision: number;
        };
        activeTurnId?: string | undefined;
        header: {
            version: number;
            id: string;
            createdAt: number;
            cwd: string;
            isSeeded: boolean;
        };
        cursor: number;
        nextTurn: number;
        records: {
            type: "event";
            event: NativeEvent;
        }[];
        hasMore: boolean;
    };
    readonly follows: Set<FollowState>;
    readonly backend: "cursor" | "antigravity" | "pi" | "opencode" | "claude";
    readonly modelSelectionProjection: (sessionId: string) => {
        lastUsed: AcpModelSelection;
        next: AcpModelSelection;
    };
    readonly client: AcpClientLike;
    readonly emitRemoteEvent: (event: string, args: unknown[]) => void;
    readonly selectedModels: Map<string, AcpModelSelection>;
    readonly publishProjection: (sessionId: string, key: string, value: unknown, seq?: number) => void;
    readonly nextProjectionSeq: () => number;
    readonly refreshSessionTitle: (session: AcpSessionState) => Promise<void>;
    readonly applySessionTitle: (session: AcpSessionState, title: string) => void;
    readonly publishWorkspaceBaseline: () => void;
    readonly pendingApprovals: Map<string, PendingApproval>;
    readonly emitApproval: (input: {
        eventId: string;
        agentId: string;
        request: JsonRecord;
    }) => void;
    readonly modelSelection: (sessionId: string) => AcpModelSelection;
}
export declare class AcpLiveProjection {
    private readonly context;
    constructor(context: AcpLiveProjectionContext);
    sessionFollow(request: JsonRecord, signal: AbortSignal): Promise<AsyncIterable<unknown>>;
    ensureFollow(session: AcpSessionState): Promise<void>;
    acceptAcpFrame(follow: FollowState, frame: AgentAcpFrameData): void;
    acceptSessionUpdate(follow: FollowState, params: JsonRecord): void;
    acceptApproval(follow: FollowState, params: JsonRecord, method: string): void;
    pushAssistantChunk(follow: FollowState, chunk: JsonRecord): void;
    endAssistantAttempt(follow: FollowState, outcome: {
        kind: 'abandoned';
    } | {
        kind: 'committed';
        eventType: 'assistant/message';
        seq: number;
    }): void;
    appendAssistantDelta(follow: FollowState, delta: string): void;
    appendReasoningDelta(follow: FollowState, delta: string): void;
    /** Pi model steps settle before tools; a tool round does not end the turn. */
    ensurePiStep(follow: FollowState, advanceAfterTools: boolean): void;
    finishPiAssistant(follow: FollowState, outcome?: PiTurnOutcome): void;
    closeFollowAfterRemoteStreamClosed(follow: FollowState, outcome?: PiTurnOutcome): void;
    pushEvent(follow: FollowState, type: string, data: unknown): number;
}
//# sourceMappingURL=virtual-live.d.ts.map