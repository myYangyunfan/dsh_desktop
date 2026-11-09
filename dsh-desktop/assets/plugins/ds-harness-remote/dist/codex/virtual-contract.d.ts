import type { CodexPermissionPreset } from '@dsh-remote/protocol';
import type { TypertRpcResult } from '../typert-gateway-contract.js';
import type { JsonRecord } from './virtual-values.js';
export declare const SESSION_SEARCH_RESULT_LIMIT = 20;
export declare const SESSION_SEARCH_SNIPPET_CODE_POINTS = 240;
export declare const CODEX_DEFAULT_PERMISSION = "workspace-write";
export declare const CODEX_IMAGE_ATTACHMENT_PREFIX = "codex-image:";
export declare function isHostWorkspaceEndpoint(endpoint: string): boolean;
export declare function isHostWorkspaceStreamEndpoint(endpoint: string): boolean;
export interface StreamedBlock {
    itemId: string;
    index: number;
    kind: 'text' | 'reasoning';
    text: string;
}
interface AssistantStreamAttempt {
    attemptId: string;
    startedAfterSeq: number;
    nextIndex: number;
    stream: Array<{
        time: number;
        chunk: JsonRecord;
    }>;
}
export interface FollowState {
    sessionId: string;
    threadId: string;
    queue: AsyncValueQueue;
    nextSeq: number;
    turn: number;
    stepOpen: boolean;
    startedItems: Set<string>;
    completedItems: Set<string>;
    streamedBlocks: Map<string, StreamedBlock>;
    nextBlockIndex: number;
    streamActive: boolean;
    assistantStreamRevision: number;
    assistantAttempt?: AssistantStreamAttempt;
    liveItems: Map<string, JsonRecord>;
    liveToolOutput: Map<string, string>;
    liveToolResultSeq: Map<string, number>;
    pendingToolImages: JsonRecord[];
    requestId?: string;
    activeTurnId?: string;
    close?: () => Promise<void>;
}
export interface PendingApproval {
    requestHandle: string;
    sessionId: string;
}
export interface CodexImageAttachmentEntry {
    sessionId: string;
    attachment: JsonRecord;
    data: string;
}
export declare function codexPromptInput(content: unknown[]): JsonRecord[] | undefined;
export declare function codexPermissionsProjection(preset: CodexPermissionPreset | undefined): unknown;
export declare function codexImageLimitsProjection(): unknown;
export declare function isCodexPermissionPreset(value: string): value is CodexPermissionPreset;
export declare function sessionIdFromAddress(address: JsonRecord): string;
export declare function carrierArgs(payload: unknown): JsonRecord;
export declare function requestArg(args: JsonRecord): JsonRecord;
export declare function success<T>(value: T): {
    ok: true;
    value: T;
};
export declare function failure(code: string, message: string, details?: JsonRecord): {
    ok: false;
    error: {
        code: string;
        message: string;
        details: JsonRecord;
    };
};
export declare function ok(value?: unknown): TypertRpcResult;
export declare function business(value: unknown): TypertRpcResult;
export declare function fail(code: string, message: string, details?: JsonRecord): TypertRpcResult;
export declare function failFrom(error: unknown): TypertRpcResult;
export declare function isLegacySessionHistoryUnsupported(error: unknown): boolean;
export declare function truncateCodePoints(value: string, maximum: number): string;
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