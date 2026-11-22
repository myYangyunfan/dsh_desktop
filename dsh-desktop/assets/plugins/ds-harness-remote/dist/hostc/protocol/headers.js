/** Connection-level headers that must never be forwarded by a proxy (RFC 9110 §7.6.1). */
const HOP_BY_HOP = new Set([
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "proxy-connection",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
]);
/** Headers each WebSocket connection negotiates for itself, so neither direction of a handshake forwards them. */
const WEBSOCKET_HANDSHAKE = new Set([
    "sec-websocket-accept",
    "sec-websocket-extensions",
    "sec-websocket-key",
    "sec-websocket-protocol",
    "sec-websocket-version",
]);
/**
 * Drops hop-by-hop headers, headers named by the Connection header,
 * and any names in `drop` (lowercase).
 */
export function stripHopByHop(headers, drop = []) {
    const dropped = new Set(drop);
    for (const [name, value] of headers) {
        if (name.toLowerCase() === "connection") {
            for (const token of value.split(",")) {
                dropped.add(token.trim().toLowerCase());
            }
        }
    }
    return headers.filter(([name]) => {
        const lower = name.toLowerCase();
        return !HOP_BY_HOP.has(lower) && !dropped.has(lower);
    });
}
export function stripWebSocketHandshake(headers) {
    return stripHopByHop(headers, WEBSOCKET_HANDSHAKE);
}
//# sourceMappingURL=headers.js.map