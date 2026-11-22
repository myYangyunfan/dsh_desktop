import { WorkspaceUploadBudget } from './workspace-upload-budget.js';
export declare const WORKSPACE_UPLOAD_BYTES: number;
export declare const WORKSPACE_UPLOAD_CHUNK: number;
/** Bounded authority revalidation while chunks stream; publication always revalidates. */
export declare const WORKSPACE_UPLOAD_AUTHORITY_TTL_MS = 5000;
export declare const WORKSPACE_UPLOAD_AUTHORITY_BYTES: number;
/** One authenticated peer owns this bounded, ephemeral upload service. */
export declare class WorkspaceUploadHost {
    private readonly resolveRoot;
    private readonly ttlMs;
    private readonly transportMode;
    private readonly now;
    private readonly budget;
    private readonly uploads;
    private readonly completed;
    private queue;
    private readonly lifetime;
    private readonly timer;
    private closed;
    constructor(resolveRoot: (sessionId: string, signal: AbortSignal) => Promise<string | undefined>, ttlMs?: number, transportMode?: () => string | undefined, now?: () => number, budget?: WorkspaceUploadBudget);
    call(method: string, input: unknown): Promise<unknown>;
    closeAll(): Promise<void>;
    private serialize;
    private begin;
    private append;
    private commit;
    private requireUpload;
    private assertLive;
    private sessionRoot;
    /**
     * Chunks re-check the workspace root identity locally on every call. The
     * expensive session-authority lookup is bounded (TTL/bytes) and always runs
     * before publication; a revoked session can therefore never publish a file.
     */
    private authorityExpired;
    private validateRoot;
    private discard;
    private expire;
}
//# sourceMappingURL=workspace-upload.d.ts.map