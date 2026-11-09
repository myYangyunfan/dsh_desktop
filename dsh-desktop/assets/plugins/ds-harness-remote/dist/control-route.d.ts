import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from 'node:http';
import type { ControlResult } from './control-result.js';
/** Namespaced loopback RPC prefix shared by the Host runtime and browser UI. */
export declare const CONTROL_RPC_PREFIX = "/ds-harness-remote";
/** Loopback control endpoint carrying the status event stream. */
export declare const STATUS_STREAM_ENDPOINT = "status.events";
/** Full URL path of the loopback status event stream. */
export declare const STATUS_STREAM_PATH = "/ds-harness-remote/status.events";
interface HostConnectionHandleLike {
    requestRejection?(request: {
        headers: IncomingHttpHeaders;
    }): number | undefined;
    rpc: {
        handle(channel: string, handler: ControlRouteHandler, options: {
            authority: 'loopback' | 'trusted-host';
        }): () => Promise<void>;
    };
}
export interface HostWebServerLike {
    register(route: {
        kind: 'prefix';
        path: string;
        handler(req: IncomingMessage, res: ServerResponse): void | Promise<void>;
    }): () => void | Promise<void>;
}
export type ControlRouteHandler = (endpoint: string, payload: unknown, signal: AbortSignal) => Promise<ControlResult<unknown>>;
/** Long-lived loopback response owner for the status event stream. */
export interface ControlStatusStreamLike {
    handle(response: ServerResponse): Promise<void>;
    close(): void;
}
export declare function registerControlRoute(connection: HostConnectionHandleLike, handler: ControlRouteHandler, webServer?: HostWebServerLike, statusStream?: ControlStatusStreamLike): () => Promise<void>;
export {};
//# sourceMappingURL=control-route.d.ts.map