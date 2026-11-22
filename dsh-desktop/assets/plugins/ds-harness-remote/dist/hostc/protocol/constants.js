/** Bumped on any incompatible wire change. Client and server must match exactly. */
export const PROTOCOL_VERSION = 5;
/** Request header carrying PROTOCOL_VERSION on tunnel API calls. */
export const PROTOCOL_HEADER = "hostc-protocol";
/**
 * Text messages on the client connection. Everything else is a binary frame.
 * The runtime answers PING on every WebSocket of the tunnel, visitors' included, so it must be a
 * message no app sends; a plain "ping" would be swallowed by apps with their own heartbeat.
 */
export const PING = "hostc:ping";
export const PONG = "hostc:pong";
/** How often the client pings, and how long it waits for the pong. */
export const HEARTBEAT_INTERVAL_MS = 15_000;
export const HEARTBEAT_TIMEOUT_MS = 10_000;
/** The server treats the client as gone when its last ping is older than this. */
export const CLIENT_STALE_MS = 45_000;
/** Largest DATA payload for an HTTP body chunk. */
export const MAX_CHUNK_BYTES = 64 * 1024;
/** Per-stream, per-direction flow control window for HTTP bodies. */
export const STREAM_WINDOW_BYTES = 256 * 1024;
/**
 * WebSocket messages are forwarded whole and never split.
 * Cloudflare Workers/DO accepts received messages up to 32 MiB; 16 MiB leaves headroom for frame encoding inside the 128 MiB isolate limit.
 */
export const MAX_WEBSOCKET_MESSAGE_BYTES = 16 * 1024 * 1024;
/** Concurrent streams (HTTP requests + WebSockets) per tunnel. */
export const MAX_STREAMS = 256;
/** How long the server waits for the local server to start responding. */
export const RESPONSE_TIMEOUT_MS = 120_000;
/** A new tunnel must be connected within this window. */
export const CONNECT_GRACE_MS = 2 * 60_000;
/** A disconnected tunnel keeps its URL for this long, waiting for a reconnect. */
export const RECONNECT_GRACE_MS = 10 * 60_000;
/** Close code the client uses when it shuts down on purpose; the tunnel is released at once. */
export const CLOSE_SHUTDOWN = 4000;
/** Close code the server uses when a newer connection replaced this one. */
export const CLOSE_REPLACED = 4001;
/** Close code for protocol violations. */
export const CLOSE_PROTOCOL_ERROR = 1002;
export const API_TUNNELS_PATH = "/api/tunnels";
/** Lowercase letters and digits without the look-alikes 0, 1, l and o. */
export const TUNNEL_ID_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";
export const TUNNEL_ID_LENGTH = 12;
/**
 * What a client may ask to have in front of the id, so that the address says what it opens. A fixed list:
 * free text would let a link pose as another site. Never part of the id, and `-` is not in its alphabet.
 */
export const TUNNEL_PREFIXES = ["codex"];
export function isTunnelPrefix(value) {
    return TUNNEL_PREFIXES.some((prefix) => prefix === value);
}
/** The tunnel id in a host label, with or without a prefix; `null` when the label is not a tunnel's. */
export function tunnelIdFromLabel(label) {
    const prefix = TUNNEL_PREFIXES.find((own) => label.startsWith(`${own}-`));
    const id = prefix ? label.slice(prefix.length + 1) : label;
    return isTunnelId(id) ? id : null;
}
export function isTunnelId(value) {
    if (value.length !== TUNNEL_ID_LENGTH) {
        return false;
    }
    for (const char of value) {
        if (!TUNNEL_ID_ALPHABET.includes(char)) {
            return false;
        }
    }
    return true;
}
export function isCreateTunnelResponse(value) {
    if (typeof value !== "object" || value === null) {
        return false;
    }
    const record = value;
    return (typeof record.id === "string" &&
        typeof record.url === "string" &&
        typeof record.connectUrl === "string" &&
        typeof record.token === "string");
}
//# sourceMappingURL=constants.js.map