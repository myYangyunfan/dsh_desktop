import type { PortalRenderer } from './types.js';
/**
 * Escape shell ancestors that establish a fixed-position containing block.
 *
 * Host chrome around our action buttons can carry `transform`, `filter` or
 * `contain`, which turns `position: fixed` backdrops into children of that box
 * (issue #222): the mask then covers the wrapper instead of the viewport and the
 * `onMouseDown` outside-click test compares against the wrong `currentTarget`.
 * Floating layers therefore render through `ReactDOM.createPortal` into
 * `document.body`.
 *
 * The fallback has to stay total, because a throw here takes down the whole
 * action slot: the renderer may be missing (older host, no `react-dom`), the DOM
 * may be absent (SSR, unit tests, prerender), `document.body` may not exist yet
 * while the shell mounts, and `createPortal` itself rejects a detached or
 * non-element container. In every case the layer degrades to inline rendering
 * instead of vanishing or crashing the slot.
 */
export declare function renderBodyPortal(portal: PortalRenderer | undefined, children: unknown): unknown;
//# sourceMappingURL=portal.d.ts.map