const CURSOR_SESSION_PREFIX = 'cursor:';
const ACP_SESSION_PREFIX = 'acp:';
const OPENCODE_SESSION_PREFIX = 'opencode:';
export function piStreamOutcome(reason) {
    if (reason === 'completed')
        return { kind: 'completed' };
    if (reason === 'cancelled' || reason === 'peer-disconnected')
        return { kind: 'aborted', reason: { kind: reason === 'cancelled' ? 'user' : 'disposed' } };
    return { kind: 'error', error: { code: 'ACP_STREAM_FAILED', message: 'Pi reply stream failed.' } };
}
export function piPromptOutcome(kind, update) {
    if (update.stopReason === 'cancelled')
        return { kind: 'aborted', reason: { kind: 'user' } };
    if (kind === 'prompt_failed' || update.stopReason === 'error')
        return {
            kind: 'error', error: { code: 'PI_PROMPT_FAILED', message: 'Pi reply failed.' },
        };
    if (update.stopReason === 'max_tokens')
        return { kind: 'max-tokens' };
    return { kind: 'completed' };
}
export function extractPromptText(content) {
    const parts = content.flatMap(part => {
        const item = record(part);
        if (item.type === 'text' && typeof item.text === 'string')
            return [item.text];
        return [];
    });
    const text = parts.join('');
    return text.length === 0 ? undefined : text;
}
export function extractText(update) {
    const content = update.content;
    if (typeof content === 'string')
        return content;
    if (isRecord(content) && typeof content.text === 'string')
        return content.text;
    if (Array.isArray(content)) {
        const parts = content
            .map(part => (isRecord(part) && typeof part.text === 'string' ? part.text : undefined))
            .filter((part) => part !== undefined);
        return parts.length === 0 ? undefined : parts.join('');
    }
    return typeof update.text === 'string' ? update.text : undefined;
}
export function summarizeQuestions(params) {
    if (!Array.isArray(params.questions))
        return undefined;
    const lines = params.questions
        .map(question => (isRecord(question) ? string(question.prompt) : undefined))
        .filter((line) => line !== undefined);
    return lines.length === 0 ? undefined : lines.join('\n');
}
function sessionIdFromAddress(address) {
    if (typeof address.sessionId === 'string' && address.sessionId.length > 0)
        return address.sessionId;
    if (typeof address.childSessionId === 'string' && address.childSessionId.length > 0)
        return address.childSessionId;
    if (address.kind === 'session' && typeof address.sessionId === 'string' && address.sessionId.length > 0) {
        return address.sessionId;
    }
    throw new Error('The sessionId is required.');
}
export function extractSessionId(request) {
    if (typeof request.sessionId === 'string' && request.sessionId.length > 0)
        return request.sessionId;
    if (isRecord(request.address))
        return sessionIdFromAddress(request.address);
    throw new Error('The sessionId is required.');
}
export function sessionPrefix(backend) {
    return backend === 'claude' ? 'claude:' : backend === 'pi' ? 'pi:' : backend === 'opencode' ? OPENCODE_SESSION_PREFIX : backend === 'antigravity' ? ACP_SESSION_PREFIX : CURSOR_SESSION_PREFIX;
}
export function nativeAcpId(sessionId, backend) {
    const prefix = sessionPrefix(backend);
    if (!sessionId.startsWith(prefix) || sessionId.length === prefix.length) {
        throw new Error('The selected Session does not belong to the virtual harness.');
    }
    return sessionId.slice(prefix.length);
}
export function isSurfaceEvent(type) {
    return type === 'user/message' || type === 'assistant/message' || type === 'tool/result';
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
export function business(value) {
    if (isRecord(value) && value.ok === false && isRecord(value.error)) {
        return {
            ok: false, error: {
                code: string(value.error.code) ?? 'internal',
                message: string(value.error.message) ?? 'The virtual Harness request failed.',
                details: isRecord(value.error.details) ? value.error.details : {},
            }
        };
    }
    if (isRecord(value) && value.ok === true)
        return { ok: true, value: value.value };
    return { ok: true, value };
}
export function fail(code, message, details = {}) {
    return { ok: false, error: { code, message, details } };
}
export function failFrom(error) {
    const source = error instanceof Error ? error : new Error(String(error));
    const code = 'code' in source && typeof source.code === 'string' ? source.code : 'internal';
    return fail(code, source.message);
}
export function record(value) {
    return isRecord(value) ? value : {};
}
export function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
export function array(value) {
    return Array.isArray(value) ? value : [];
}
export function string(value) {
    return typeof value === 'string' ? value : undefined;
}
function integer(value) {
    return typeof value === 'number' && Number.isSafeInteger(value) ? value : undefined;
}
export function optionalInteger(value) {
    if (value === undefined)
        return undefined;
    const parsed = integer(value);
    if (parsed === undefined)
        throw new Error('The History cursor is invalid.');
    return parsed;
}
export function optionalPositiveInteger(value) {
    const parsed = optionalInteger(value);
    if (parsed !== undefined && parsed <= 0)
        throw new Error('The History page size is invalid.');
    return parsed;
}
export function requiredString(value, field) {
    if (typeof value !== 'string' || value.length === 0)
        throw new Error(`The ${field} is required.`);
    return value;
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