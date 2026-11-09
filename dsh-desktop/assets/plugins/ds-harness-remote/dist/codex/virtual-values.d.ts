export declare const CODEX_SESSION_PREFIX = "codex:";
export type JsonRecord = Record<string, unknown>;
export interface CodexClientLike {
    request(method: string, params: unknown, signal?: AbortSignal): Promise<unknown>;
    subscribe(threadId: string, onFrame: (frame: {
        method: string;
        params: unknown;
    }) => void, signal?: AbortSignal, onClose?: (reason: 'cancelled' | 'completed' | 'failed' | 'peer-disconnected') => void): Promise<{
        close(): Promise<void>;
    }>;
    respond(requestHandle: string, decision: 'accept' | 'decline' | 'cancel', signal?: AbortSignal): Promise<void>;
}
export declare function nativeThreadId(sessionId: string): string;
export declare function record(value: unknown): JsonRecord;
export declare function isRecord(value: unknown): value is JsonRecord;
export declare function array(value: unknown): unknown[];
export declare function string(value: unknown): string | undefined;
export declare function integer(value: unknown): number | undefined;
export declare function finiteNumber(value: unknown): number | undefined;
export declare function optionalInteger(value: unknown): number | undefined;
export declare function optionalNonNegativeInteger(value: unknown): number | undefined;
export declare function optionalPositiveInteger(value: unknown): number | undefined;
export declare function requiredString(value: unknown, field: string): string;
export declare function normalizeTime(value: unknown): number;
export declare function isoTime(value: unknown): string;
export declare function basename(path: string): string;
export declare function hashString(value: string): string;
export declare function errorCode(error: Error): string | undefined;
//# sourceMappingURL=virtual-values.d.ts.map