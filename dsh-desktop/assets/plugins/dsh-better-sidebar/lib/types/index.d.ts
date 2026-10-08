import type { Context } from './context-types.ts';
import { Config, type ResolvedSidebarConfig, type SidebarConfig } from './config.ts';
import { type SidebarFsEntry } from './fs-tree.ts';
export { Config };
export type { SidebarConfig, ResolvedSidebarConfig };
export type { Context } from './context-types.ts';
export type { BetterSidebarService, TabDescriptor, TabComponentProps, FileViewerDescriptor, FileViewerProps, FileFetchStrategy, } from './client/service.ts';
export { archiveNameOf, collectZipEntries, contentDispositionOf, disambiguateArchiveNames } from './archive-route.ts';
/** Plugin identity for cordis.yml rows. */
export declare const name = "dsh-better-sidebar";
/** Row bound of one `fs.trees` batch request (a mount/refresh sends what it shows). */
export declare const FS_TREES_MAX_PATHS = 64;
/** One level of an `fs.trees` batch: either a listing or that level's failure. */
export interface SidebarFsLevel {
    path: string;
    entries: SidebarFsEntry[];
    truncated: boolean;
    /** Present only when THIS level failed (the batch itself still succeeded). */
    error?: string;
}
/** Services required before mounting: the webserver routes, the session store, the web runtime's trusted hosts, and the tool registry. */
export declare const inject: string[];
/** Content type served by /sidebar/file (binary-safe fallback for unknowns). */
export declare function mediaTypeForPath(path: string): string;
/**
 * The live face of the side card settings namespace, bound to the settings
 * service when it is mounted. The DSH settings RPC domain only serves
 * allowlisted namespaces (api-proxy exposedNamespaces), so the client reads
 * and writes THIS namespace through the plugin's own fenced /sidebar routes,
 * which call the seam in-process — no configuration-client gate involved.
 */
export interface SidebarSettingsFace {
    /** The current resolved value + revision (undefined while the settings service is absent). */
    get(): {
        value?: unknown;
        revision?: number;
    };
    /**
     * Whether the dsh-web-ui family's aionui-panel has been selected as the
     * right-panel provider (the `aionui-panel` settings namespace resolves
     * `rightPanel: 'aionui-panel'`). While true the sidebar must not mount —
     * the two right panels are mutually exclusive. False when the namespace is
     * absent (no aionui installed) or the provider is anything else.
     */
    externalDisable(): boolean;
    /** Merge a patch (revision-guarded) and return the fresh resolved view. */
    update(patch: Record<string, unknown>, expectedRevision?: number): Promise<{
        value?: unknown;
        revision?: number;
    }>;
}
/**
 * Plugin body: mount the fenced routes and the sidebar_open push socket.
 * @param ctx - host plugin context (webServer, sessions, webRuntime).
 * @param config - deployment-provided limits; the Loader validates against
 * {@link Config} and fills defaults, direct callers get them from
 * {@link resolveSidebarConfig}.
 */
export declare function apply(ctx: Context, config?: SidebarConfig): void;
