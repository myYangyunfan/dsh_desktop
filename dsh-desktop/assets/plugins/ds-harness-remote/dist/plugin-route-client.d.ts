type Fetch = typeof globalThis.fetch;
export interface PluginRouteClientOptions {
    /** Publish a remote roster only after the official Session catalog has caught up. */
    beforeResponse?(status: Record<string, unknown>, body: Record<string, unknown>, json: unknown, signal: AbortSignal): Promise<void>;
}
/** Route authority is read before each plugin request, including the first page load. */
export declare function createPluginRouteFetch(original: Fetch, baseUrl: string, options?: PluginRouteClientOptions): Fetch;
export interface PluginRouteSessions {
    list: {
        getSnapshot(): {
            ids: readonly string[];
            phase: string;
        };
    };
    refresh?(): Promise<void>;
}
/** `ready` is monotone in Harness; prove membership instead of trusting refresh's void result. */
export declare function createPluginRouteCatalogGuard(readSessions: () => Promise<PluginRouteSessions>): NonNullable<PluginRouteClientOptions['beforeResponse']>;
export {};
//# sourceMappingURL=plugin-route-client.d.ts.map