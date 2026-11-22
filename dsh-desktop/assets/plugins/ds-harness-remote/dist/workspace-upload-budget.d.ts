export declare const HOST_UPLOAD_ACTIVE_LIMIT = 4;
export declare const HOST_UPLOAD_RESERVED_BYTES: number;
export declare const SESSION_UPLOAD_RESERVED_BYTES: number;
export declare const UPLOAD_DISK_FREE_BYTES: number;
export declare class WorkspaceUploadBudget {
    private readonly limits;
    private readonly freeBytes;
    private readonly active;
    private queue;
    constructor(limits?: {
        active: number;
        reservedBytes: number;
        sessionBytes: number;
        diskFreeBytes: number;
    }, freeBytes?: (root: string) => Promise<number>);
    reserve(root: string, dev: number, sessionId: string, bytes: number): Promise<{
        checkDisk: () => Promise<void>;
        consume: (amount: number) => void;
        commit: () => void;
        release: () => void;
    }>;
}
export type UploadReservation = Awaited<ReturnType<WorkspaceUploadBudget['reserve']>>;
//# sourceMappingURL=workspace-upload-budget.d.ts.map