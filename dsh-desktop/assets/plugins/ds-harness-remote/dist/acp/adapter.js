export function adaptCursorProcess(process, id = 'cursor') {
    return {
        id,
        start: () => process.start(),
        close: () => process.close(),
        isReady: () => process.isReady(),
        call: (method, params, timeoutMs) => process.call(method, params, timeoutMs),
        respond: (id, result) => process.respond(id, result),
        respondError: (id, code, message) => process.respondError(id, code, message),
        onInbound: handler => process.onInbound(handler),
        onUnavailable: handler => process.onUnavailable(handler),
    };
}
//# sourceMappingURL=adapter.js.map