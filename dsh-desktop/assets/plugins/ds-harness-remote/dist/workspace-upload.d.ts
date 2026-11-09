export declare const WORKSPACE_UPLOAD_BYTES: number;
export declare const WORKSPACE_UPLOAD_CHUNK: number;
/** One authenticated peer owns this bounded, ephemeral upload service. */
export declare class WorkspaceUploadHost {
    private readonly resolveRoot;
    private readonly ttlMs;
    private readonly transportMode;
    private readonly uploads;
    private readonly completed;
    private queue;
    private readonly lifetime;
    private readonly timer;
    private closed;
    constructor(resolveRoot: (sessionId: string, signal: AbortSignal) => Promise<string | undefined>, ttlMs?: number, transportMode?: () => string | undefined);
    call(method: string, input: unknown): Promise<unknown>;
    closeAll(): Promise<void>;
    private serialize;
    private begin;
    private append;
    private commit;
    private requireUpload;
    private assertLive;
    private sessionRoot;
    private validateRoot;
    private discard;
    private expire;
}
//# sourceMappingURL=workspace-upload.d.ts.map