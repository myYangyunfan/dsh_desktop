/**
 * Browser-side status feed. One EventSource subscription replaces the fixed
 * interval of unary `status` control calls, and degrades to that interval when
 * the Host exposes no event stream — an older Host, or a carrier whose control
 * channel serves POST only.
 */
/** The EventSource members the feed drives. */
export interface StatusStreamSource {
    close(): void;
    onmessage: ((event: MessageEvent) => void) | null;
    onerror: ((event: Event) => void) | null;
    readonly readyState: number;
}
/** Why a status stream stopped pushing and fell back to unary status reads. */
export type StatusStreamFallback = 'unsupported' | 'unavailable' | 'silent';
/** Construction options for {@link createStatusFeed}. */
export interface StatusStreamOptions<T> {
    /** Document-relative or absolute URL of the Host status event stream. */
    url: string;
    /** Unary status read used by the fallback path, and by no other path. */
    readStatus: () => Promise<T>;
    /** EventSource factory; tests supply a scripted source. */
    createSource?: (url: string) => StatusStreamSource;
    pollIntervalMs?: number;
    openTimeoutMs?: number;
    /** Reports the one reason the stream yielded to the fallback. */
    onFallback?: (reason: StatusStreamFallback) => void;
}
/** One shared status source for every component that renders Host status. */
export interface StatusFeed<T> {
    /** Latest pushed status; the same reference until the next frame arrives. */
    getSnapshot(): T | undefined;
    /** Listen to status frames; the first subscriber opens the stream, the last closes it. */
    subscribe(listener: (status: T) => void): () => void;
    /** Stop streaming and forget every listener, keeping the latest snapshot. */
    close(): void;
}
/** Fallback poll period: the interval the unary status polling used. */
export declare const STATUS_STREAM_POLL_INTERVAL_MS = 1500;
/** How long a stream may deliver nothing before the fallback replaces it. */
export declare const STATUS_STREAM_OPEN_TIMEOUT_MS = 4000;
/**
 * Create the status feed.
 * @param options - stream URL, fallback reader, and timing overrides.
 * @returns feed with a stable snapshot accessor and a ref-counted subscription.
 */
export declare function createStatusFeed<T>(options: StatusStreamOptions<T>): StatusFeed<T>;
//# sourceMappingURL=status-stream.d.ts.map