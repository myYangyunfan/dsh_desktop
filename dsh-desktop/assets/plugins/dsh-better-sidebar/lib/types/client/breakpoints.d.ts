/** Viewport widths strictly below this are "mobile" (paired CSS: max-width: 767px). */
export declare const NARROW_MAX_WIDTH = 768;
/** Whether a viewport width is narrow (mobile). */
export declare function isNarrowWidth(width: number): boolean;
export interface ViewportSize {
    width: number;
    height: number;
}
/**
 * Live narrow-viewport flag for components. Reads `window.innerWidth` and
 * re-measures on resize (rAF-throttled, the repo's existing drag pattern).
 * Deliberately avoids `matchMedia` (jsdom does not implement it) — the
 * resize listener is equally exact for a breakpoint that never changes
 * while the page is open.
 */
export declare function useViewportSize(): ViewportSize;
export declare function useNarrowViewport(): boolean;
