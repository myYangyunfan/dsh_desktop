export declare class RpcError extends Error {
    readonly code: string;
    readonly details?: unknown | undefined;
    readonly retryable: boolean;
    constructor(code: string, message: string, details?: unknown | undefined, retryable?: boolean);
}
export declare function safeErrorCode(error: unknown): string;
/**
 * Stable, non-sensitive reasons for workspace file denials. They are safe to
 * expose on the wire and to log: they describe the rule, never a path, file
 * name, file body or raw filesystem error.
 */
export declare const WORKSPACE_FILE_FAILURE_REASONS: readonly ["scope-missing", "authority-unavailable", "root-invalid", "outside-root", "symlink", "not-regular-file", "not-found", "too-large", "io"];
export type WorkspaceFileFailureReason = typeof WORKSPACE_FILE_FAILURE_REASONS[number];
export declare function workspaceFileFailureReason(error: unknown): WorkspaceFileFailureReason | undefined;
export declare function workspaceFileFailure(code: 'WORKSPACE_UNAVAILABLE' | 'WORKSPACE_PATH_DENIED' | 'WORKSPACE_TOO_LARGE', message: string, reason: WorkspaceFileFailureReason): RpcError;
export declare function safeStartupError(error: unknown): {
    code: string;
    message: string;
};
//# sourceMappingURL=safe-error.d.ts.map