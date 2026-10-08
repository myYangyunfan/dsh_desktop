/** One poll tick. See the module doc for the signal contract. */
export type PollingTask = (signal: AbortSignal) => Promise<void>;
export interface UsePollingOptions {
    /** Tick cadence in milliseconds. */
    intervalMs: number;
    /**
     * Scheduling mode. `'fixed-interval'` (default) fires ticks on a plain
     * `setInterval` cadence — an in-flight task never delays the next tick,
     * overlapping tasks guard their own writes (abort controllers or
     * generation counters inside the task). `'self-scheduling'` arms the next
     * tick only after the previous task settles: at most ONE request in
     * flight, ever, so a slow host never sees request storms.
     */
    mode?: 'fixed-interval' | 'self-scheduling';
    /** Run one task immediately when the poller (re)starts, before the first
     * scheduled tick. */
    immediate?: boolean;
}
export declare function usePolling(enabled: boolean, task: PollingTask, { intervalMs, mode, immediate }: UsePollingOptions): void;
