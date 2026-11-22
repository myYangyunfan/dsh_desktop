import { record, string } from './virtual-values.js';
/**
 * Map an upstream CodeX turn into the virtual Harness `turn/end` reason.
 * Preserve provider failure text and `codex_error_info` so Remote clients can
 * show usage limits / rate limits instead of a generic "CodeX turn failed."
 */
export function turnEndReason(turn) {
    if (turn.status === 'failed' || turn.error !== undefined && turn.error !== null) {
        return { kind: 'error', error: projectTurnError(turn.error) };
    }
    if (turn.status === 'interrupted' || turn.status === 'cancelled' || turn.status === 'canceled' || turn.status === 'aborted') {
        return { kind: 'interrupted' };
    }
    return { kind: 'completed' };
}
export function projectTurnError(error) {
    if (typeof error === 'string') {
        const message = error.trim();
        return {
            message: message === '' ? 'CodeX turn failed.' : message,
            code: 'codex-turn-failed',
        };
    }
    const value = record(error);
    const message = string(value.message)?.trim();
    const codexInfo = string(value.codex_error_info)?.trim();
    const code = (codexInfo && codexInfo !== '' ? codexInfo : undefined)
        ?? string(value.code)?.trim()
        ?? 'codex-turn-failed';
    return {
        message: message && message !== '' ? message : 'CodeX turn failed.',
        code: code === '' ? 'codex-turn-failed' : code,
        ...(codexInfo && codexInfo !== '' ? { codex_error_info: codexInfo } : {}),
    };
}
//# sourceMappingURL=turn-end-reason.js.map