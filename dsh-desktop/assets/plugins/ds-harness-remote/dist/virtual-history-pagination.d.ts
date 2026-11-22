export declare const VIRTUAL_HISTORY_DEFAULT_MAX_MESSAGES = 50;
export declare const VIRTUAL_HISTORY_MAX_MESSAGES = 200;
export declare const VIRTUAL_HISTORY_MAX_BYTES: number;
export declare const VIRTUAL_HISTORY_RPC_ENVELOPE_RESERVE_BYTES: number;
export declare const VIRTUAL_HISTORY_HARD_MAX_BYTES: number;
export declare class VirtualHistoryResponseTooLargeError extends Error {
    readonly actualBytes: number;
    readonly maxBytes: number;
    readonly code: "RESPONSE_TOO_LARGE";
    readonly retryable: false;
    constructor(actualBytes: number, maxBytes: number, message?: string);
}
export type VirtualHistoryTurnWindow = number | {
    readonly minMessages?: number;
    readonly minTurns?: number;
};
export interface VirtualHistoryEntryLike {
    readonly type?: unknown;
    readonly event: {
        readonly type: string;
        readonly seq: number;
        readonly time?: unknown;
        readonly data?: unknown;
        readonly surfaceOp?: unknown;
        readonly sourceEventSeqs?: readonly number[];
    };
    readonly view?: unknown;
}
export interface SelectVirtualHistorySliceOptions<T extends VirtualHistoryEntryLike> {
    readonly maxMessages?: number;
    readonly turnWindow?: VirtualHistoryTurnWindow;
    readonly countSurfaceMessages?: boolean;
    readonly hasLeadingHistory?: boolean;
    readonly maxBytes?: number;
    readonly hardMaxBytes?: number;
    readonly envelopeBytes?: number;
    readonly measureRecordBytes?: (entry: T) => number;
}
export interface VirtualHistorySliceResult<T> {
    readonly records: T[];
    readonly hasMore: boolean;
    readonly cutIndex: number;
}
export declare function utf8JsonByteLength(value: unknown): number;
export declare function normalizeVirtualHistoryTurnWindow(value: unknown): VirtualHistoryTurnWindow | undefined;
export declare function boundedVirtualHistoryMaxMessages(value: number | undefined, hasTurnWindow?: boolean): number;
export declare function selectVirtualHistorySlice<T extends VirtualHistoryEntryLike>(window: readonly T[], options?: SelectVirtualHistorySliceOptions<T>): VirtualHistorySliceResult<T>;
//# sourceMappingURL=virtual-history-pagination.d.ts.map