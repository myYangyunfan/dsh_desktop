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
//# sourceMappingURL=safe-error.js.map