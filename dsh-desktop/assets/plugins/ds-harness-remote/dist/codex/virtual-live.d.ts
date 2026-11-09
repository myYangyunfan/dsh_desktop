import type { CodexPermissionPreset } from '@dsh-remote/protocol';
import type { HarnessSessionGeneration } from '../harness-version.js';
import type { CodexModelDirectory, CodexModelSelection } from './virtual-catalog.js';
import type { CodexImageAttachmentEntry, FollowState, PendingApproval, StreamedBlock } from './virtual-contract.js';
import type { CodexNativeHistoryPage, ProjectedNativeEvent, ToolEventView } from './virtual-history.js';
import type { CodexClientLike, JsonRecord } from './virtual-values.js';
/** Collaborates with one CodexVirtualHarness; never creates a second session or connection state. */
export interface CodexLiveProjectionContext {
    readonly readHistoryPage: (threadId: string, page: {
        beforeSeq?: number;
        throughSeq?: number;
        maxMessages?: number;
    }, signal?: AbortSignal) => Promise<CodexNativeHistoryPage>;
    readonly models: (signal?: AbortSignal) => Promise<CodexModelDirectory>;
    readonly pendingRequestIds: Map<string, string>;
    readonly follows: Set<FollowState>;
    readonly sessionTitle: (sessionId: string) => string | null;
    readonly modelSelection: (sessionId: string, directory?: CodexModelDirectory) => CodexModelSelection;
    readonly permissionSelection: (sessionId: string) => CodexPermissionPreset | undefined;
    readonly sessionGeneration: HarnessSessionGeneration;
    readonly client: CodexClientLike;
    readonly closed: boolean;
    readonly rememberOpenedSession: (sessionId: string) => void;
    readonly nextProjectionSeq: () => number;
    readonly updateThreadName: (threadId: string, name: string) => void;
    readonly publishProjection: (sessionId: string, key: string, value: unknown, seq: number) => void;
    readonly setPermissionSelection: (sessionId: string, preset: CodexPermissionPreset | undefined) => void;
    readonly emitRemoteEvent: (event: string, args: unknown[]) => void;
    readonly selectedModels: Map<string, CodexModelSelection>;
    readonly refreshAndPublishWorkspaces: () => Promise<void>;
    readonly pendingApprovals: Map<string, PendingApproval>;
    readonly emitApproval: (input: {
        eventId: string;
        agentId: string;
        request: JsonRecord;
    }) => void;
    readonly imageAttachments: Map<string, CodexImageAttachmentEntry>;
}
export declare class CodexLiveProjection {
    private readonly context;
    constructor(context: CodexLiveProjectionContext);
    sessionFollow(request: JsonRecord, signal: AbortSignal): Promise<AsyncIterable<unknown>>;
    acceptCodexFrame(follow: FollowState, frame: {
        method: string;
        params: unknown;
    }): void;
    acceptCompletedItem(follow: FollowState, item: JsonRecord, settleAssistant: boolean): void;
    pushEvent(follow: FollowState, type: string, data: unknown, view?: ToolEventView, placement?: {
        replaceSeq: number;
    }): number;
    cacheImageBlocks(sessionId: string, value: unknown): void;
    ensureStreamBlock(follow: FollowState, key: string, itemId: string, kind: 'text' | 'reasoning'): StreamedBlock;
    appendStreamDelta(follow: FollowState, key: string, itemId: string, kind: 'text' | 'reasoning', delta: string): void;
    closeItemStreamBlocks(follow: FollowState, itemId: string, fallback?: string): void;
    closeAllStreamBlocks(follow: FollowState): void;
    finishStream(follow: FollowState): void;
    pushAssistantChunk(follow: FollowState, chunk: JsonRecord): void;
    endAssistantAttempt(follow: FollowState, outcome: {
        kind: 'abandoned';
    } | {
        kind: 'committed';
        eventType: 'assistant/message';
        seq: number;
    }): void;
    ensureToolStarted(follow: FollowState, item: JsonRecord): void;
    emitToolResult(follow: FollowState, item: JsonRecord, resultText: string): void;
    pushToolResult(follow: FollowState, itemId: string, event: ProjectedNativeEvent): void;
    resetLiveTurn(follow: FollowState): void;
    closeFollowAfterRemoteStreamClosed(follow: FollowState): void;
}
//# sourceMappingURL=virtual-live.d.ts.map