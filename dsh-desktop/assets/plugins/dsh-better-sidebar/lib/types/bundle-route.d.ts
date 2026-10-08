import type { Context, SidebarHttpRequest, SidebarHttpResponse } from './context-types.ts';
/** The chunk names the client may request (mirror of src/client/chunk-loader.ts). */
export declare const CHUNK_NAMES: readonly ["editor", "mermaid", "locale"];
export type ChunkName = (typeof CHUNK_NAMES)[number];
/**
 * Build the /sidebar/bundle route handler. `fence` is the shared browser-
 * trust check every /sidebar route applies; `chunkDir` is the directory the
 * chunk scripts live in (overridable for tests).
 */
export declare function createBundleRouteHandler(fence: (req: SidebarHttpRequest) => boolean, chunkDir?: string): (req: SidebarHttpRequest, res: SidebarHttpResponse) => Promise<void>;
/** Register the /sidebar/bundle route (disposed with the fiber). */
export declare function registerBundleRoute(ctx: Context, fence: (req: SidebarHttpRequest) => boolean): () => void;
