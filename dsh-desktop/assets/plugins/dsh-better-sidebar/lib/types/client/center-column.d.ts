/** Match Sidebar's existing last-resort retry cadence (issue #248). */
export declare const CENTER_COLUMN_REVALIDATE_MS = 1500;
interface CenterColumnResolveOptions {
    /** Explicit document for tests / callers that do not yet have a cached node. */
    document?: Document;
    /** Injectable DOM lookup for tests. */
    query?: () => Element | null;
    /** Injectable clock for deterministic retry-boundary tests. */
    now?: () => number;
    /** Injectable <html style> fingerprint for deterministic HMR tests. */
    htmlStyle?: () => string | null;
    /** Override only for tests; production follows the 1.5s safety-net cadence. */
    revalidateMs?: number;
}
/**
 * Resolve the AppFrame center column while keeping streaming mutations cheap.
 *
 * Sidebar intentionally keeps both recovery mechanisms that predate #403:
 * the `#root` subtree MutationObserver catches boot/HMR DOM swaps, and the
 * 1.5s interval is a last-resort safety net for interleavings no observer is
 * guaranteed to see (#248). The expensive part was letting every scheduled
 * locate scan `#root` with querySelector at streaming-token cadence.
 *
 * Once a connected column is cached, normal calls therefore reuse it without
 * a document query. A full query is still forced when either:
 * - the cached node disconnects;
 * - `<html style>` changes (the existing HMR/layout resync signal); or
 * - 1.5s has elapsed since the last full validation (the safety-net cadence).
 *
 * This preserves recovery semantics while bounding whole-tree selector work
 * to low-frequency validation instead of chat mutation frequency.
 */
export declare function resolveCenterColumn(current: HTMLElement | null, options?: CenterColumnResolveOptions): HTMLElement | undefined;
export {};
