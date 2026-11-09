import { RpcError } from '../safe-error.js';
/** Parse the public CodeX session identity without treating it as a Harness agent id. */
export function parseCodexSessionId(value) {
    if (typeof value !== 'string')
        return undefined;
    const match = /^codex:([A-Za-z0-9][A-Za-z0-9._-]{0,255})$/.exec(value);
    return match === null ? undefined : { sessionId: value, threadId: match[1] };
}
export function requireCodexSessionId(value) {
    const parsed = parseCodexSessionId(value);
    if (parsed === undefined)
        throw new RpcError('CODEX_SESSION_INVALID', 'The CodeX session identifier is invalid.');
    return parsed;
}
//# sourceMappingURL=session-id.js.map