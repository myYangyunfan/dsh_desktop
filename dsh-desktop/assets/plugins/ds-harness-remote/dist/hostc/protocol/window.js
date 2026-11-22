import { STREAM_WINDOW_BYTES } from "./constants.js";
/**
 * A stream moves at most one window per round trip, so 256 KiB caps it at about 1.3 MB/s over a
 * 200 ms path. Receivers widen a window, up to this size, while it holds the stream back. Senders
 * accept any WINDOW grant, so how a receiver grows its windows is not part of the wire format.
 */
export const MAX_STREAM_WINDOW_BYTES = 4 * 1024 * 1024;
/** Window beyond STREAM_WINDOW_BYTES, shared by all streams of a tunnel on one side. Bounds the extra memory. */
export const WINDOW_BUDGET_BYTES = 16 * 1024 * 1024;
/** Windows that take longer than this to reach the next hop are slow streams; they never grow. */
const WINDOW_GROWTH_MS = 1000;
/** Allowance for clock steps and jitter when comparing how long windows took. */
const WINDOW_JITTER_MS = 5;
/** Extra window available to the streams of one tunnel connection. */
export class WindowBudget {
    available = WINDOW_BUDGET_BYTES;
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
export class GrowingWindow {
    size = STREAM_WINDOW_BYTES;
    budget;
    /** Start of the current window (0 until the first full window) and its bytes the next hop took. */
    startedAt = 0;
    bytes = 0;
    /** Shortest time a full window has taken: about one round trip. 0 until measured. */
    fastestMs = 0;
    /** The next hop had taken everything at some point during the current window. */
    caughtUp = false;
    constructor(budget) {
        this.budget = budget;
    }
    /**
     * Counts bytes the next hop took. `caughtUp` says nothing else is queued for it now. Returns the
     * bytes to grant on top of the ones taken.
     */
    delivered(bytes, caughtUp, now = Date.now()) {
        this.bytes += bytes;
        this.caughtUp ||= caughtUp;
        if (this.bytes < this.size) {
            return 0;
        }
        const elapsed = now - this.startedAt;
        const timed = this.startedAt > 0;
        const keptUp = this.caughtUp;
        this.startedAt = now;
        this.bytes = 0;
        this.caughtUp = false;
        if (!timed) {
            // The first window went out before any grant, so how fast it arrived says nothing about the round trip.
            return 0;
        }
        this.fastestMs = this.fastestMs === 0 ? elapsed : Math.min(this.fastestMs, elapsed);
        const limitedByWindow = elapsed < WINDOW_GROWTH_MS && elapsed <= this.fastestMs * 1.5 + WINDOW_JITTER_MS && keptUp;
        if (!limitedByWindow) {
            return 0;
        }
        const extra = Math.min(this.size, MAX_STREAM_WINDOW_BYTES - this.size, this.budget.available);
        this.size += extra;
        this.budget.available -= extra;
        return extra;
    }
    /** Gives the extra window back once the stream has ended. Safe to call more than once. */
    release() {
        this.budget.available += this.size - STREAM_WINDOW_BYTES;
        this.size = STREAM_WINDOW_BYTES;
    }
}
//# sourceMappingURL=window.js.map