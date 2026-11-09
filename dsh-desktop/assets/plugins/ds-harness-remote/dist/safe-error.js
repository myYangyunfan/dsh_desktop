import { z } from 'zod';
export class RpcError extends Error {
    code;
    details;
    retryable;
    constructor(code, message, details, retryable = false) {
        super(message);
        this.code = code;
        this.details = details;
        this.retryable = retryable;
    }
}
export function safeErrorCode(error) {
    if (error instanceof RpcError)
        return error.code;
    if (error instanceof z.ZodError)
        return 'INVALID_MESSAGE';
    return 'INTERNAL_ERROR';
}
const SAFE_STARTUP_CODES = new Set([
    'IDENTITY_INVALID',
    'IDENTITY_LOCKED',
    'STORAGE_CONFLICT',
    'SERVER_CREDENTIALS_INVALID',
    'SERVER_CREDENTIALS_BUSY',
]);
const SAFE_STATIC_STARTUP_MESSAGES = new Set([
    'device identity is incomplete; repair it explicitly before reconnecting',
    'device public and private keys do not match',
    'device identity is locked by another process; stop other DSH instances and retry',
    'Remote storage fallback record is invalid; no credentials were changed.',
    'Both Remote storage directories exist; stop all Harness instances and resolve them manually. No credentials were overwritten.',
    'Legacy Remote storage changed after fallback; inspect it before reconnecting.',
    'Pinned Remote storage is missing; no replacement identity was created.',
    'Remote storage ownership could not be verified; nothing was moved. Inspect the legacy directory manually.',
    'Remote storage must be a real directory; symbolic links are not migrated.',
    'Remote storage contains a lock or symbolic link; stop all Harness instances and inspect it before migration.',
]);
export function safeStartupError(error) {
    const code = error instanceof Error && 'code' in error && typeof error.code === 'string' && SAFE_STARTUP_CODES.has(error.code)
        ? error.code
        : safeErrorCode(error);
    if (code === 'SERVER_CREDENTIALS_INVALID') {
        return { code, message: 'Local Remote server credentials are invalid.' };
    }
    if (code === 'SERVER_CREDENTIALS_BUSY') {
        return {
            code,
            message: 'Credential refresh is locked. Stop other instances; after a crash, stop all instances before removing server-credentials.json.refresh-lock and authorizing again.',
        };
    }
    if (code === 'IDENTITY_INVALID' || code === 'IDENTITY_LOCKED' || code === 'STORAGE_CONFLICT') {
        const rawMessage = error instanceof Error ? error.message : '';
        if (SAFE_STATIC_STARTUP_MESSAGES.has(rawMessage) || /^private key permissions must be 0600, got [0-7]{3,4}$/.test(rawMessage)) {
            return { code, message: rawMessage };
        }
        if (rawMessage.startsWith('device identity is invalid')) {
            return { code, message: 'device identity is invalid' };
        }
        if (rawMessage.startsWith('trusted peer ')) {
            return { code, message: 'trusted peer record is invalid' };
        }
        return {
            code,
            message: code === 'IDENTITY_LOCKED'
                ? 'device identity is locked by another process; stop other DSH instances and retry'
                : code === 'STORAGE_CONFLICT'
                    ? 'Remote storage ownership could not be verified; nothing was moved. Inspect the legacy directory manually.'
                    : 'device identity is invalid',
        };
    }
    return { code, message: 'Remote plugin failed to start.' };
}
//# sourceMappingURL=safe-error.js.map