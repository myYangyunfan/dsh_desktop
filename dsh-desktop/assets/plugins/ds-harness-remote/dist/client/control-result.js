/** Preserve domain errors across the loopback RPC envelope for auth recovery. */
export function unwrapControlResult(result, fallbackMessage) {
    if (!result.ok) {
        const remoteCode = result.error?.details?.remoteCode;
        throw Object.assign(new Error(result.error?.message ?? fallbackMessage), {
            code: typeof remoteCode === 'string' ? remoteCode : result.error?.code,
            details: result.error?.details,
        });
    }
    return result.value;
}
//# sourceMappingURL=control-result.js.map