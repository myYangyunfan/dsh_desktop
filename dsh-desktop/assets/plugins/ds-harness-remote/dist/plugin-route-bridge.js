import { MAX_SECURE_MESSAGE_BYTES, MAX_HARNESS_API_TRANSFER_BYTES } from '@dsh-remote/protocol';
import { z } from 'zod';
import { RpcError } from './safe-error.js';
/** Local plugin web routes forwardable over the authenticated channel (POST only). */
export const PLUGIN_ROUTE_ALLOWLIST = ['api/bot', 'api/session/uploadFileBinary'];
/** DS-Bot v0.3.8 channel + computer endpoints; unknown future operations stay local. */
export const BOT_REMOTE_OPERATIONS = [
    'abandon-work', 'add-agent', 'agent-adopt', 'agent-archive', 'agent-rename',
    'agent-session', 'answer-question', 'approval-answer', 'avatar', 'avatar-delete',
    'avatar-import', 'avatar-library', 'bot-capability', 'bot-new-part', 'bot-open-part',
    'browser-frame', 'browser-give-back', 'browser-result', 'browser-stop', 'browser-takeover',
    'browser-wait', 'btw-delete', 'capability-approve', 'capability-delete', 'capability-save',
    'changes-check', 'changes-diff', 'changes-summary', 'chat', 'computer-allow-foreground',
    'computer-app-answer', 'computer-cursor-wait', 'computer-handback', 'computer-hold-answer', 'computer-open-settings',
    'computer-permission', 'computer-provider-retry', 'computer-revoke-app', 'computer-set-enabled', 'computer-set-level',
    'computer-shot', 'computer-stop', 'computer-system-status', 'computer-takeover', 'computer-user-active',
    'connector-add', 'connector-cancel', 'connector-client', 'connector-connect', 'connector-disconnect',
    'connector-import', 'connector-import-scan', 'connector-remove', 'connector-request-cancel', 'connector-retry',
    'connector-set', 'connector-sign-in-code', 'create-bot', 'create-room', 'delete-bot',
    'delete-room', 'diagnostics', 'diagnostics-clear', 'diagnostics-log', 'dismiss-question',
    'dismiss-view', 'dsh-update-install', 'duplicate-bot', 'earlier', 'efforts',
    'exchange', 'exchange-text', 'file-download', 'file-text', 'folder-list',
    'folder-pick', 'folders', 'goal-control', 'goal-draft', 'group-rows',
    'group-search', 'hello', 'im-add', 'im-chat', 'im-login-start',
    'im-login-wait', 'im-pair', 'im-remove', 'im-retry', 'im-unpair',
    'im-update', 'image', 'learning-answer', 'local-agent-add', 'local-agent-models',
    'local-agent-refresh', 'local-agent-remove', 'local-agent-update', 'local-agents', 'mail-account-add',
    'mail-account-remove', 'mail-rule-set', 'mail-send-answer', 'mail-sign-in-code', 'markdown-image',
    'memory-add', 'memory-ask', 'memory-edit', 'memory-forget', 'memory-history',
    'memory-layer', 'memory-move', 'memory-pin', 'memory-restore', 'memory-tidy-undo',
    'memory-view', 'models', 'notices', 'phone-pair', 'phone-pair-cancel',
    'phone-remove', 'phone-set', 'private-release', 'provider-add', 'provider-key',
    'provider-models', 'provider-models-save', 'provider-remove', 'providers', 'remove-agent',
    'repo-stars', 'resume', 'room-chat', 'room-progress', 'room-todo',
    'run-stats', 'schedule-create', 'schedule-delete', 'schedules', 'secret-allow',
    'secret-cancel', 'secret-decrypt', 'secret-delete', 'secret-encrypt', 'secret-set',
    'secret-store', 'secret-unlock', 'secret-update', 'section-delete', 'section-order',
    'section-save', 'send', 'set-flags', 'set-main', 'set-prefs',
    'side-ask', 'side-cancel', 'side-close', 'side-new', 'stage-image',
    'state', 'stop-chat', 'stop-member-work', 'stop-room-work', 'task-cancel',
    'task-note', 'team-workspace', 'thinking', 'update-bot', 'update-check',
    'update-install', 'update-room', 'usage', 'usage-summary', 'view-reply',
    // Older DS-Bot Hosts still implement these operations.
    'btw', 'btw-cancel', 'room-continue',
];
export function isAllowedPluginRoute(route) {
    return PLUGIN_ROUTE_ALLOWLIST.some(allowed => allowed === route);
}
const callSchema = z.object({
    route: z.enum(PLUGIN_ROUTE_ALLOWLIST),
    body: z.object({
        endpoint: z.enum(BOT_REMOTE_OPERATIONS),
        payload: z.record(z.string(), z.unknown()).nullable().optional(),
    }).strict(),
}).strict();
/** Fixed official attachment intake; caller-selected filesystem paths are forbidden. */
const uploadFields = {
    sessionId: z.string().min(1).max(512),
    name: z.string().max(512).optional(),
    data: z.string().max(256 * 1024 * 1024).regex(/^[A-Za-z0-9+/]*={0,2}$/).refine(value => value.length % 4 === 0),
};
const imageUploadCallSchema = z.object({
    route: z.literal('api/session/uploadFileBinary'),
    body: z.discriminatedUnion('endpoint', [
        z.object({ endpoint: z.literal('image'), payload: z.object({ ...uploadFields,
                mediaType: z.enum(['image/png', 'image/jpeg', 'image/webp', 'image/gif']),
            }).strict() }).strict(),
        z.object({ endpoint: z.literal('file'), payload: z.object(uploadFields).strict() }).strict(),
    ]),
}).strict();
/** Local plugin route call timeout, mirroring the Harness API bridge budget. */
const PLUGIN_ROUTE_TIMEOUT_MS = 30_000;
/**
 * Forwards bounded POST calls to local plugin web routes (first case: ds-bot's
 * `api/bot`) through the shared fetch handler of the Host connection service.
 * The route allowlist and both size bounds keep the tunnel fail-closed.
 */
export class PluginRouteBridge {
    dispatch;
    logger;
    constructor(dispatch, logger) {
        this.dispatch = dispatch;
        this.logger = logger;
    }
    async call(input, transferred = false) {
        let params;
        try {
            params = (typeof input === 'object' && input !== null && 'route' in input
                && input.route === 'api/session/uploadFileBinary'
                ? imageUploadCallSchema.parse(input) : callSchema.parse(input));
        }
        catch (error) {
            if (error instanceof z.ZodError) {
                throw new RpcError('INVALID_MESSAGE', 'The plugin route call is invalid for the remote channel.');
            }
            throw error;
        }
        if (serializedBytes(params) > (transferred && params.route === 'api/session/uploadFileBinary' ? MAX_HARNESS_API_TRANSFER_BYTES : MAX_SECURE_MESSAGE_BYTES)) {
            throw new RpcError('INVALID_MESSAGE', `The plugin route call exceeds the ${MAX_SECURE_MESSAGE_BYTES}-byte remote limit.`);
        }
        const startedAt = performance.now();
        let result;
        try {
            result = await this.dispatch(params.route, params.body, AbortSignal.timeout(PLUGIN_ROUTE_TIMEOUT_MS));
        }
        catch (error) {
            this.logger?.warn('plugin route call failed', {
                route: params.route,
                durationMs: Math.round(performance.now() - startedAt),
            });
            throw error;
        }
        if (serializedBytes(result) > MAX_SECURE_MESSAGE_BYTES) {
            throw new RpcError('RESPONSE_TOO_LARGE', 'The plugin route response exceeds the bounded remote limit.');
        }
        this.logger?.debug('plugin route call ok', {
            route: params.route,
            status: result.status,
            durationMs: Math.round(performance.now() - startedAt),
        });
        return { status: result.status, json: result.json };
    }
}
function serializedBytes(value) {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}
//# sourceMappingURL=plugin-route-bridge.js.map