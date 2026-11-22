/**
 * A stream moves at most one window per round trip, so 256 KiB caps it at about 1.3 MB/s over a
 * 200 ms path. Receivers widen a window, up to this size, while it holds the stream back. Senders
 * accept any WINDOW grant, so how a receiver grows its windows is not part of the wire format.
 */
export declare const MAX_STREAM_WINDOW_BYTES: number;
/** Window beyond STREAM_WINDOW_BYTES, shared by all streams of a tunnel on one side. Bounds the extra memory. */
export declare const WINDOW_BUDGET_BYTES: number;
/** Extra window available to the streams of one tunnel connection. */
export declare class WindowBudget {
    available: number;
}
/**
 * The window a receiver grants for one HTTP body, widened while it holds the stream back.
 *
 * While the window is the limit, a window takes one round trip whatever its size, so a doubled
 * window takes no longer than the fastest one. Once the link is the limit, a doubled window takes
 * twice as long and growing further would only queue data ahead of other streams. And the next hop
 * (the visitor, or the local server) must keep up: at some point during the window it has taken
 * everything that arrived. That is checked over the whole window, not when it ends: a wide window
 * arrives in bursts, and its end often falls inside one, with chunks still queued.
 */
export declare class GrowingWindow {
    size: number;
    private readonly budget;
    /** Start of the current window (0 until the first full window) and its bytes the next hop took. */
    private startedAt;
    private bytes;
    /** Shortest time a full window has taken: about one round trip. 0 until measured. */
    private fastestMs;
    /** The next hop had taken everything at some point during the current window. */
    private caughtUp;
    constructor(budget: WindowBudget);
    /**
     * Counts bytes the next hop took. `caughtUp` says nothing else is queued for it now. Returns the
     * bytes to grant on top of the ones taken.
     */
    delivered(bytes: number, caughtUp: boolean, now?: number): number;
    /** Gives the extra window back once the stream has ended. Safe to call more than once. */
    release(): void;
}
//# sourceMappingURL=window.d.ts.map