import type { PluginRouteDispatcher } from './plugin-route-bridge.js';
export interface PluginRouteConnectionLike {
    createSharedFetchHandler?(channel: '/api'): {
        fetch(request: Request, peer?: unknown): Promise<Response>;
    };
    authenticatedUrl?(baseUrl: string): string;
}
/** Resolve lazily: Connection may activate after the Remote plugin. */
export declare function createPluginRouteDispatcher(readConnection: () => PluginRouteConnectionLike | undefined, readPort: () => number | undefined, peer?: unknown): PluginRouteDispatcher;
//# sourceMappingURL=plugin-route-dispatcher.d.ts.map