import { isCanonicalBase64 } from './codex-image-codec.js';
import { errorCode, isRecord, record, requiredString, string } from './virtual-values.js';
export const SESSION_SEARCH_RESULT_LIMIT = 20;
export const SESSION_SEARCH_SNIPPET_CODE_POINTS = 240;
export const CODEX_DEFAULT_PERMISSION = 'workspace-write';
const MAX_CODEX_PROMPT_PARTS = 16;
const MAX_CODEX_PROMPT_TEXT = 256 * 1024;
const MAX_CODEX_IMAGE_BASE64 = 288 * 1024 * 1024;
const CODEX_IMAGE_MEDIA_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
export const CODEX_IMAGE_ATTACHMENT_PREFIX = 'codex-image:';
const HOST_WORKSPACE_ENDPOINTS = new Set([
    'workspaceFiles/list', 'workspaceFiles/stat', 'workspaceFiles/read', 'workspaceFiles/readBytes',
    'workspaceFiles/readAll', 'workspaceFiles/readRelated', 'terminal/environment', 'terminal/shells',
    'terminal/list', 'terminal/create', 'terminal/write', 'terminal/resize', 'terminal/rename', 'terminal/close',
]);
const HOST_WORKSPACE_STREAM_ENDPOINTS = new Set(['workspaceFiles/changes', 'terminal/follow', 'terminal/retain']);
export function isHostWorkspaceEndpoint(endpoint) {
    return HOST_WORKSPACE_ENDPOINTS.has(endpoint);
}
export function isHostWorkspaceStreamEndpoint(endpoint) {
    return HOST_WORKSPACE_STREAM_ENDPOINTS.has(endpoint);
}
export function codexPromptInput(content) {
    if (content.length === 0 || content.length > MAX_CODEX_PROMPT_PARTS)
        return undefined;
    const input = [];
    for (const value of content) {
        if (!isRecord(value))
            return undefined;
        if (value.type === 'text') {
            if (typeof value.text !== 'string' || value.text.length === 0 || value.text.length > MAX_CODEX_PROMPT_TEXT)
                return undefined;
            input.push({ type: 'text', text: value.text });
            continue;
        }
        if (value.type === 'image') {
            if (typeof value.mediaType !== 'string' || !CODEX_IMAGE_MEDIA_TYPES.has(value.mediaType)
                || typeof value.data !== 'string' || value.data.length > MAX_CODEX_IMAGE_BASE64
                || !isCanonicalBase64(value.data))
                return undefined;
            input.push({ type: 'image', mediaType: value.mediaType, data: value.data });
            continue;
        }
        return undefined;
    }
    return input;
}
export function codexPermissionsProjection(preset) {
    return {
        options: [
            {
                value: 'workspace-write',
                name: 'workspace-write',
                description: 'Write inside the workspace; wider command and file access requires one-time approval.',
            },
            {
                value: 'danger-full-access',
                name: 'danger-full-access',
                description: 'Full Host file access without approval prompts for subsequent turns in this virtual Session.',
            },
        ],
        currentValue: preset ?? 'Host settings (not reported)',
    };
}
export function codexImageLimitsProjection() {
    return {
        maxImageBytes: 20 * 1024 * 1024,
        maxImagesPerMessage: MAX_CODEX_PROMPT_PARTS,
        maxMessageImageBytes: 100 * 1024 * 1024,
        maxImagePixels: 40_000_000,
        maxImageDimension: 8_192,
        mediaTypes: [...CODEX_IMAGE_MEDIA_TYPES],
    };
}
export function isCodexPermissionPreset(value) {
    return value === 'workspace-write' || value === 'danger-full-access';
}
export function sessionIdFromAddress(address) {
    if (address.kind === 'session')
        return requiredString(address.sessionId, 'sessionId');
    return requiredString(address.childSessionId, 'childSessionId');
}
export function carrierArgs(payload) {
    return record(record(payload).args);
}
export function requestArg(args) {
    return record(args.request ?? args._request ?? args);
}
export function success(value) {
    return { ok: true, value };
}
export function failure(code, message, details = {}) {
    return { ok: false, error: { code, message, details } };
}
export function ok(value) {
    return value === undefined ? { ok: true } : { ok: true, value };
}
export function business(value) {
    const result = record(value);
    if (result.ok === true)
        return ok(result.value);
    if (result.ok === false) {
        const error = record(result.error);
        return fail(string(error.code) ?? 'internal', string(error.message) ?? 'CodeX virtual Harness rejected the request.', record(error.details));
    }
    return ok(value);
}
export function fail(code, message, details = {}) {
    return { ok: false, error: { code, message, details } };
}
export function failFrom(error) {
    const source = error instanceof Error ? error : new Error(String(error));
    return fail(errorCode(source) ?? 'internal', source.message, errorDetails(source));
}
export function isLegacySessionHistoryUnsupported(error) {
    if (!(error instanceof Error))
        return false;
    return errorCode(error) === 'METHOD_NOT_ALLOWED'
        || errorCode(error) === 'METHOD_NOT_FOUND'
        || error.message.includes('The requested Codex method is not available over Remote.');
}
function errorDetails(error) {
    return 'details' in error && isRecord(error.details) ? error.details : {};
}
export function truncateCodePoints(value, maximum) {
    return [...value].slice(0, maximum).join('');
}
export class AsyncValueQueue {
    signal;
    values = [];
    waiters = [];
    closed = false;
    onAbort;
    constructor(signal) {
        this.signal = signal;
        this.onAbort = () => this.close();
        signal.addEventListener('abort', this.onAbort, { once: true });
        if (signal.aborted)
            this.close();
    }
    push(value) {
        if (this.closed)
            return;
        const waiter = this.waiters.shift();
        if (waiter === undefined)
            this.values.push(value);
        else
            waiter({ done: false, value });
    }
    close() {
        if (this.closed)
            return;
        this.closed = true;
        this.signal.removeEventListener('abort', this.onAbort);
        for (const waiter of this.waiters.splice(0))
            waiter({ done: true, value: undefined });
    }
    iterate(dispose) {
        const queue = this;
        return {
            async *[Symbol.asyncIterator]() {
                try {
                    yield* queue;
                }
                finally {
                    dispose();
                    queue.close();
                }
            },
        };
    }
    async *[Symbol.asyncIterator]() {
        while (true) {
            if (this.values.length > 0) {
                yield this.values.shift();
                continue;
            }
            if (this.closed)
                return;
            const next = await new Promise(resolve => this.waiters.push(resolve));
            if (next.done)
                return;
            yield next.value;
        }
    }
}
//# sourceMappingURL=virtual-contract.js.map