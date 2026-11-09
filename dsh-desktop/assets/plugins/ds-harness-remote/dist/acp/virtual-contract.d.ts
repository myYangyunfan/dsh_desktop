import type { AcpSessionModels, AgentAcpFrameData, AgentAcpStreamClosedData, AgentAcpStreamOpenParams } from '@dsh-remote/protocol';
import { ACP_TOOL_CALL_ENDPOINTS } from '@dsh-remote/protocol';
import type { TypertRpcResult } from '../typert-gateway-contract.js';
import type { AcpImage } from './image-content.js';
import type { AcpModelSelection } from './virtual-catalog.js';
export type JsonRecord = Record<string, unknown>;
export type PiTurnOutcome = {
    kind: 'completed';
} | {
    kind: 'max-tokens';
} | {
    kind: 'aborted';
    reason: {
        kind: 'user' | 'disposed';
    };
} | {
    kind: 'error';
    error: {
        code: string;
        message: string;
    };
};
export declare function piStreamOutcome(reason: AgentAcpStreamClosedData['reason']): PiTurnOutcome;
export declare function piPromptOutcome(kind: string, update: JsonRecord): PiTurnOutcome;
export interface AcpSessionState {
    sessionId: string;
    acpSessionId: string;
    cwd: string;
    title?: string;
    titleOverridden?: boolean;
    titleFromPrompt?: boolean;
    blank: boolean;
    running: boolean;
    createdAt: number;
    updatedAt: number;
    events: Array<{
        type: 'event';
        event: NativeEvent;
    }>;
}
export interface NativeEvent {
    type: string;
    seq: number;
    time: number;
    data: unknown;
    surfaceOp?: 'append' | {
        op: 'replace';
        start: number;
        end: number;
    };
}
interface AssistantStreamAttempt {
    attemptId: string;
    startedAfterSeq: number;
    nextIndex: number;
    stream: Array<{
        type: 'chunk';
        time: number;
        chunk: JsonRecord;
    }>;
}
export interface FollowState {
    sessionId: string;
    acpSessionId: string;
    queue: AsyncValueQueue;
    nextSeq: number;
    turn: number;
    stepOpen: boolean;
    streamActive: boolean;
    blockIndex?: number;
    reasoningBlockIndex?: number;
    assistantStreamRevision: number;
    assistantAttempt?: AssistantStreamAttempt;
    accumulatedText: string;
    activeToolCalls: Set<string>;
    piToolOutputs: Map<string, {
        text: string;
        overflow: boolean;
    }>;
    piToolCalls: Map<string, {
        name: string;
        input?: unknown;
    }>;
    piStep?: number;
    piAfterTools?: boolean;
    piReasoning?: string;
    close?: () => Promise<void>;
}
export interface PendingApproval {
    requestHandle: string;
    sessionId: string;
}
export interface AcpClientLike {
    supportsArchive?(backend: string): boolean;
    archiveSession?(sessionId: string, backend: string, signal?: AbortSignal): Promise<unknown>;
    onSessionArchived?(handler: (data: {
        backend: 'opencode';
        sessionId: string;
        archived: true;
    }) => void): () => void;
    sessionModels?(sessionId: string, backend: "cursor" | "claude" | "antigravity" | "pi" | "opencode", signal?: AbortSignal): Promise<AcpSessionModels>;
    selectModel?(sessionId: string, backend: "cursor" | "claude" | "antigravity" | "pi" | "opencode", selection: AcpModelSelection, signal?: AbortSignal): Promise<AcpModelSelection>;
    workspaceToolCall?(sessionId: string, backend: "cursor" | "antigravity" | "pi" | "opencode", endpoint: typeof ACP_TOOL_CALL_ENDPOINTS[number], args: JsonRecord, signal?: AbortSignal): Promise<unknown>;
    createSession(cwd: string, mode?: "agent" | "plan" | "ask", backend?: "cursor" | "antigravity" | "pi" | "opencode" | "claude", signal?: AbortSignal): Promise<{
        sessionId: string;
        cwd?: string;
    }>;
    prompt(sessionId: string, text: string, signal?: AbortSignal, images?: AcpImage[], backend?: "cursor" | "antigravity" | "pi" | "opencode" | "claude"): Promise<unknown>;
    cancel(sessionId: string, signal?: AbortSignal): Promise<unknown>;
    listDirectory(path: string, signal?: AbortSignal): Promise<unknown>;
    listWorkspaces?(backend?: string, signal?: AbortSignal): Promise<Array<{
        path: string;
        title?: string;
        sessionCount?: number;
    }>>;
    listSessions?(path: string, backend?: string, limit?: number, signal?: AbortSignal): Promise<Array<{
        conversationId: string;
        title: string;
        createdAt: number;
        updatedAt: number;
    }>>;
    loadSessionHistory?(sessionId: string, backend?: string, signal?: AbortSignal): Promise<unknown[]>;
    openStream(sessionId: string, onFrame: (frame: AgentAcpFrameData) => void, onClosed?: (closed: AgentAcpStreamClosedData) => void, signal?: AbortSignal, tool?: AgentAcpStreamOpenParams['tool']): Promise<{
        close(): Promise<void>;
    }>;
    respond(requestHandle: string, decision: 'allow-once' | 'reject-once' | 'cancel', result?: unknown, signal?: AbortSignal): Promise<unknown>;
}
export declare function extractPromptText(content: unknown[]): string | undefined;
export declare function extractText(update: JsonRecord): string | undefined;
export declare function summarizeQuestions(params: JsonRecord): string | undefined;
export declare function extractSessionId(request: JsonRecord): string;
export declare function sessionPrefix(backend: 'cursor' | 'antigravity' | 'pi' | 'opencode' | 'claude'): string;
export declare function nativeAcpId(sessionId: string, backend: 'cursor' | 'antigravity' | 'pi' | 'opencode' | 'claude'): string;
export declare function isSurfaceEvent(type: string): boolean;
export declare function carrierArgs(payload: unknown): JsonRecord;
export declare function requestArg(args: JsonRecord): JsonRecord;
export declare function success(value: unknown): {
    ok: true;
    value: unknown;
};
export declare function failure(code: string, message: string, details?: JsonRecord): {
    ok: false;
    error: {
        code: string;
        message: string;
        details: JsonRecord;
    };
};
export declare function business(value: unknown): TypertRpcResult;
export declare function fail(code: string, message: string, details?: JsonRecord): TypertRpcResult;
export declare function failFrom(error: unknown): TypertRpcResult;
export declare function record(value: unknown): JsonRecord;
export declare function isRecord(value: unknown): value is JsonRecord;
export declare function array(value: unknown): unknown[];
export declare function string(value: unknown): string | undefined;
export declare function optionalInteger(value: unknown): number | undefined;
export declare function optionalPositiveInteger(value: unknown): number | undefined;
export declare function requiredString(value: unknown, field: string): string;
export declare class AsyncValueQueue implements AsyncIterable<unknown> {
    private readonly signal;
    private readonly values;
    private readonly waiters;
    private closed;
    private readonly onAbort;
    constructor(signal: AbortSignal);
    push(value: unknown): void;
    close(): void;
    iterate(dispose: () => void): AsyncIterable<unknown>;
    [Symbol.asyncIterator](): AsyncIterator<unknown>;
}
export {};
//# sourceMappingURL=virtual-contract.d.ts.map