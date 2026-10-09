/**
 * Lazy chunk view wrapper: mounts a component that lives in a lazy chunk,
 * showing a loading placeholder while the chunk script loads and an error +
 * retry affordance on failure. Used by the built-in tab/viewer descriptors.
 *
 * Load failures (kernel down → `client module system unavailable`, network
 * blips, …) stay on the error state with the manual retry button, but the
 * view also subscribes to the chunk's shared auto-retry loop
 * ({@link ensureChunkAutoRetry}): a waiting line shows the live attempt
 * count, and when the loop reports `ready` the view re-loads and recovers
 * WITHOUT user action — the 0.5.0 "sidebar bricked after kernel restart"
 * fix (see chunk-availability.ts).
 *
 * Contract note: {@link lazyChunkComponent} returns a plain render-prop
 * function — the descriptor contract is `component: (props) => ReactNode`,
 * and the repo renders descriptors BOTH ways: Sidebar calls
 * `descriptor.component(props)` directly, EditorHost renders it via
 * `createElement`. The wrapper function body therefore contains no hooks;
 * all state lives in the inner {@link LazyChunkView} component.
 */
import { type ComponentType, type ReactNode } from 'react';
import { type ChunkExports, type ChunkName } from './chunk-loader.ts';
/**
 * Build a descriptor-compatible lazy wrapper for a chunk-resident component.
 * The returned function is the descriptor `component` itself: it returns an
 * element and never calls hooks, so both invocation styles (plain function
 * call and createElement/JSX render) work. `pick` must be a module-level
 * function (stable identity) — an inline lambda would re-trigger the load
 * effect on every render.
 * @param chunk - the chunk name (see chunk-loader.ts).
 * @param pick - select the component from the chunk's exports.
 * @param fallback - optional read-only preview rendered while the chunk is
 *   unavailable (the fsRead viewers pass one so the file stays viewable).
 */
export declare function lazyChunkComponent<P extends object>(chunk: ChunkName, pick: (mod: ChunkExports) => ComponentType<P> | undefined, fallback?: (props: P) => ReactNode): (props: P) => ReactNode;
