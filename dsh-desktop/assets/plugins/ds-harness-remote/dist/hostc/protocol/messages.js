import { ProtocolError } from "./frame.js";
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false });
export function encodeText(value) {
    return encoder.encode(value);
}
export function decodeText(bytes) {
    try {
        return decoder.decode(bytes);
    }
    catch {
        throw new ProtocolError("invalid UTF-8");
    }
}
export function encodeOpen(message) {
    return encodeText(JSON.stringify(message));
}
export function decodeOpen(bytes) {
    const value = parseJson(bytes);
    if (typeof value.method !== "string" ||
        typeof value.path !== "string" ||
        !value.path.startsWith("/") ||
        !isHeaderList(value.headers) ||
        typeof value.body !== "boolean" ||
        (value.websocket !== undefined && !isStringArray(value.websocket))) {
        throw new ProtocolError("invalid OPEN payload");
    }
    return value;
}
export function encodeHead(message) {
    return encodeText(JSON.stringify(message));
}
export function decodeHead(bytes) {
    const value = parseJson(bytes);
    if (!Number.isInteger(value.status) ||
        value.status < 100 ||
        value.status > 599 ||
        !isHeaderList(value.headers) ||
        typeof value.body !== "boolean" ||
        (value.protocol !== undefined && typeof value.protocol !== "string")) {
        throw new ProtocolError("invalid HEAD payload");
    }
    return value;
}
/** WebSocket END payload, laid out like a WebSocket close frame: `u16 code | UTF-8 reason`. */
export function encodeClose(message) {
    const reason = encodeText(message.reason);
    const bytes = new Uint8Array(2 + reason.byteLength);
    new DataView(bytes.buffer).setUint16(0, message.code);
    bytes.set(reason, 2);
    return bytes;
}
export function decodeClose(bytes) {
    if (bytes.byteLength < 2) {
        return { code: 1005, reason: "" };
    }
    const code = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint16(0);
    return { code, reason: decodeText(bytes.subarray(2)) };
}
export function encodeWindow(bytes) {
    const payload = new Uint8Array(4);
    new DataView(payload.buffer).setUint32(0, bytes);
    return payload;
}
export function decodeWindow(bytes) {
    if (bytes.byteLength !== 4) {
        throw new ProtocolError("invalid WINDOW payload");
    }
    const value = new DataView(bytes.buffer, bytes.byteOffset, 4).getUint32(0);
    if (value === 0) {
        throw new ProtocolError("empty WINDOW grant");
    }
    return value;
}
/**
 * Close codes that may be sent in a close frame by an application.
 * Reserved codes (1005, 1006, 1015) and out-of-range values become 1000.
 */
export function sendableCloseCode(code) {
    if (code === undefined) {
        return 1000;
    }
    // Same rule as the `ws` library: 1004, 1005, 1006 and 1015 are reserved.
    if (code >= 1000 && code <= 1014 && code !== 1004 && code !== 1005 && code !== 1006) {
        return code;
    }
    if (code >= 3000 && code <= 4999) {
        return code;
    }
    return 1000;
}
/** Close reasons are limited to 123 bytes of UTF-8. */
export function sendableCloseReason(reason) {
    if (!reason) {
        return "";
    }
    let result = reason;
    while (encoder.encode(result).byteLength > 123) {
        result = result.slice(0, -1);
    }
    return result;
}
/** Whether a response to `method` with `status` carries a body (RFC 9110 §6.4.1). */
export function responseHasBody(method, status) {
    return method !== "HEAD" && status >= 200 && status !== 204 && status !== 205 && status !== 304;
}
/**
 * Parses a Sec-WebSocket-Protocol header. Returns null when it is malformed:
 * subprotocols must be unique HTTP tokens (RFC 6455 §4.1).
 */
export function parseSubprotocols(header) {
    if (!header) {
        return [];
    }
    const protocols = header.split(",").map((protocol) => protocol.trim());
    const valid = protocols.every((protocol) => /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(protocol));
    return valid && new Set(protocols).size === protocols.length ? protocols : null;
}
function parseJson(bytes) {
    let value;
    try {
        value = JSON.parse(decodeText(bytes));
    }
    catch {
        throw new ProtocolError("invalid JSON payload");
    }
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        throw new ProtocolError("JSON payload must be an object");
    }
    return value;
}
function isHeaderList(value) {
    return (Array.isArray(value) &&
        value.every((entry) => Array.isArray(entry) && entry.length === 2 && typeof entry[0] === "string" && typeof entry[1] === "string"));
}
function isStringArray(value) {
    return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}
//# sourceMappingURL=messages.js.map