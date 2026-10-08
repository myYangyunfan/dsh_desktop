/**
 * A size-capped Map that evicts least-recently-used entries once the cap is
 * reached (issue #113). Recency is refreshed by both get and set. Backs the
 * engine's per-session caches so idle sessions can be dropped and later
 * rebuilt from the durable session log instead of accumulating forever.
 * @module billion-context-dsh/lru
 */
/** Default cap for the engine's per-session caches (kernel states, nudge dedup). */
export declare const DEFAULT_SESSION_CACHE_LIMIT = 512;
export declare class LruMap<K, V> extends Map<K, V> {
    private readonly maxEntries;
    constructor(maxEntries: number);
    get(key: K): V | undefined;
    set(key: K, value: V): this;
}
