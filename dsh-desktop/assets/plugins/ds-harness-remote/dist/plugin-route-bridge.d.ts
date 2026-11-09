import type { PluginRouteCallResult } from '@dsh-remote/protocol';
import type { SafeLogger } from './logging.js';
/** Local plugin web routes forwardable over the authenticated channel (POST only). */
export declare const PLUGIN_ROUTE_ALLOWLIST: readonly ["api/bot"];
/** Reviewed DS Bot operations; new upstream operations stay local by default. */
export declare const BOT_REMOTE_OPERATIONS: readonly ["state", "models", "efforts", "exchange", "earlier", "usage", "room-progress", "schedules", "create-bot", "duplicate-bot", "update-bot", "delete-bot", "set-main", "set-flags", "create-room", "update-room", "delete-room", "add-agent", "agent-session", "agent-adopt", "agent-archive", "agent-rename", "remove-agent", "send", "btw", "btw-cancel", "room-continue", "answer-question", "dismiss-question", "view-reply", "approval-answer", "stop-member-work"];
export declare function isAllowedPluginRoute(route: string): route is typeof PLUGIN_ROUTE_ALLOWLIST[number];
export type PluginRouteDispatcher = (route: string, body: unknown, signal: AbortSignal) => Promise<{
    status: number;
    json: unknown;
}>;
/**
 * Forwards bounded POST calls to local plugin web routes (first case: ds-bot's
 * `api/bot`) through the shared fetch handler of the Host connection service.
 * The route allowlist and both size bounds keep the tunnel fail-closed.
 */
export declare class PluginRouteBridge {
    private readonly dispatch;
    private readonly logger?;
    constructor(dispatch: PluginRouteDispatcher, logger?: SafeLogger | undefined);
    call(input: unknown): Promise<PluginRouteCallResult>;
}
//# sourceMappingURL=plugin-route-bridge.d.ts.map