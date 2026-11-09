/**
 * Serialize settings writes and leave DSH's HMR AsyncLocalStorage context
 * before invoking configEditor. Otherwise a callback reached from a reload is
 * treated as a nested transaction. The pump is kept on globalThis so a hot
 * reload reuses the same queue.
 */
/**
 * The HMR service intentionally keeps its AsyncLocalStorage private.  The
 * runtime still exposes the storage's `exit()` method, which is the boundary
 * configEditor needs when a plugin callback was entered from an HMR reload.
 * Keep this structural so older Hosts without HMR continue to use the pump.
 */
export interface HmrContextLike {
    executing?: {
        exit?<T>(callback: () => T): T;
    };
}
export declare function runHmrSafe<T>(run: () => Promise<T>, hmr?: HmrContextLike): Promise<T>;
//# sourceMappingURL=hmr-safe-settings.d.ts.map