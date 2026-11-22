import type { PluginRouteCallResult } from '@dsh-remote/protocol';
import type { SafeLogger } from './logging.js';
/** Local plugin web routes forwardable over the authenticated channel (POST only). */
export declare const PLUGIN_ROUTE_ALLOWLIST: readonly ["api/bot", "api/session/uploadFileBinary"];
/** DS-Bot v0.3.6 channel + computer endpoints; unknown future operations stay local. */
export declare const BOT_REMOTE_OPERATIONS: readonly ["abandon-work", "add-agent", "agent-adopt", "agent-archive", "agent-rename", "agent-session", "answer-question", "approval-answer", "avatar", "avatar-delete", "avatar-import", "avatar-library", "bot-capability", "bot-new-part", "bot-open-part", "browser-frame", "browser-give-back", "browser-result", "browser-stop", "browser-takeover", "browser-wait", "btw-delete", "capability-approve", "capability-delete", "capability-save", "chat", "computer-allow-foreground", "computer-app-answer", "computer-cursor-wait", "computer-handback", "computer-hold-answer", "computer-open-settings", "computer-permission", "computer-provider-retry", "computer-revoke-app", "computer-set-enabled", "computer-set-level", "computer-shot", "computer-stop", "computer-system-status", "computer-takeover", "computer-user-active", "connector-add", "connector-cancel", "connector-client", "connector-connect", "connector-disconnect", "connector-import", "connector-import-scan", "connector-remove", "connector-request-cancel", "connector-retry", "connector-set", "connector-sign-in-code", "create-bot", "create-room", "delete-bot", "delete-room", "diagnostics", "diagnostics-clear", "diagnostics-log", "dismiss-question", "dismiss-view", "dsh-update-install", "duplicate-bot", "earlier", "efforts", "exchange", "exchange-text", "file-text", "folder-list", "folder-pick", "folders", "goal-control", "goal-draft", "group-rows", "hello", "im-add", "im-chat", "im-login-start", "im-login-wait", "im-pair", "im-remove", "im-retry", "im-unpair", "im-update", "image", "learning-answer", "local-agent-add", "local-agent-models", "local-agent-refresh", "local-agent-remove", "local-agent-update", "local-agents", "mail-account-add", "mail-account-remove", "mail-rule-set", "mail-send-answer", "mail-sign-in-code", "memory-add", "memory-ask", "memory-edit", "memory-forget", "memory-history", "memory-layer", "memory-move", "memory-pin", "memory-restore", "memory-tidy-undo", "memory-view", "models", "notices", "phone-pair", "phone-pair-cancel", "phone-remove", "phone-set", "private-release", "provider-add", "provider-key", "provider-models", "provider-remove", "providers", "remove-agent", "repo-stars", "resume", "room-chat", "room-progress", "run-stats", "schedule-create", "schedule-delete", "schedules", "secret-allow", "secret-cancel", "secret-delete", "secret-set", "secret-update", "section-delete", "section-order", "section-save", "send", "set-flags", "set-main", "set-prefs", "side-ask", "side-cancel", "side-close", "side-new", "stage-image", "state", "stop-chat", "stop-member-work", "stop-room-work", "team-workspace", "thinking", "update-bot", "update-check", "update-install", "update-room", "usage", "usage-summary", "view-reply", "btw", "btw-cancel", "room-continue"];
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
    call(input: unknown, transferred?: boolean): Promise<PluginRouteCallResult>;
}
//# sourceMappingURL=plugin-route-bridge.d.ts.map