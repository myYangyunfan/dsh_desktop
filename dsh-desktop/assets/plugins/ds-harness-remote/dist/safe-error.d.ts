export declare class RpcError extends Error {
    readonly code: string;
    readonly details?: unknown | undefined;
    readonly retryable: boolean;
    constructor(code: string, message: string, details?: unknown | undefined, retryable?: boolean);
}
export declare function safeErrorCode(error: unknown): string;
//# sourceMappingURL=safe-error.d.ts.map