/**
 * Lazy chunk view wrapper: mounts a component that lives in a lazy chunk,
 * showing a loading placeholder while the chunk script loads and an error +
 * retry affordance on failure. Used by the built-in tab/viewer descriptors.
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
 */
export declare function lazyChunkComponent<P extends object>(chunk: ChunkName, pick: (mod: ChunkExports) => ComponentType<P> | undefined): (props: P) => ReactNode;
