/** Bumped on any incompatible wire change. Client and server must match exactly. */
export declare const PROTOCOL_VERSION = 5;
/** Request header carrying PROTOCOL_VERSION on tunnel API calls. */
export declare const PROTOCOL_HEADER = "hostc-protocol";
/**
 * Text messages on the client connection. Everything else is a binary frame.
 * The runtime answers PING on every WebSocket of the tunnel, visitors' included, so it must be a
 * message no app sends; a plain "ping" would be swallowed by apps with their own heartbeat.
 */
export declare const PING = "hostc:ping";
export declare const PONG = "hostc:pong";
/** How often the client pings, and how long it waits for the pong. */
export declare const HEARTBEAT_INTERVAL_MS = 15000;
export declare const HEARTBEAT_TIMEOUT_MS = 10000;
/** The server treats the client as gone when its last ping is older than this. */
export declare const CLIENT_STALE_MS = 45000;
/** Largest DATA payload for an HTTP body chunk. */
export declare const MAX_CHUNK_BYTES: number;
/** Per-stream, per-direction flow control window for HTTP bodies. */
export declare const STREAM_WINDOW_BYTES: number;
/**
 * WebSocket messages are forwarded whole and never split.
 * Cloudflare Workers/DO accepts received messages up to 32 MiB; 16 MiB leaves headroom for frame encoding inside the 128 MiB isolate limit.
 */
export declare const MAX_WEBSOCKET_MESSAGE_BYTES: number;
/** Concurrent streams (HTTP requests + WebSockets) per tunnel. */
export declare const MAX_STREAMS = 256;
/** How long the server waits for the local server to start responding. */
export declare const RESPONSE_TIMEOUT_MS = 120000;
/** A new tunnel must be connected within this window. */
export declare const CONNECT_GRACE_MS: number;
/** A disconnected tunnel keeps its URL for this long, waiting for a reconnect. */
export declare const RECONNECT_GRACE_MS: number;
/** Close code the client uses when it shuts down on purpose; the tunnel is released at once. */
export declare const CLOSE_SHUTDOWN = 4000;
/** Close code the server uses when a newer connection replaced this one. */
export declare const CLOSE_REPLACED = 4001;
/** Close code for protocol violations. */
export declare const CLOSE_PROTOCOL_ERROR = 1002;
export declare const API_TUNNELS_PATH = "/api/tunnels";
/** Lowercase letters and digits without the look-alikes 0, 1, l and o. */
export declare const TUNNEL_ID_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";
export declare const TUNNEL_ID_LENGTH = 12;
/**
 * What a client may ask to have in front of the id, so that the address says what it opens. A fixed list:
 * free text would let a link pose as another site. Never part of the id, and `-` is not in its alphabet.
 */
export declare const TUNNEL_PREFIXES: readonly ["codex"];
export type TunnelPrefix = (typeof TUNNEL_PREFIXES)[number];
export declare function isTunnelPrefix(value: unknown): value is TunnelPrefix;
/** The tunnel id in a host label, with or without a prefix; `null` when the label is not a tunnel's. */
export declare function tunnelIdFromLabel(label: string): string | null;
export declare function isTunnelId(value: string): boolean;
/** Response body of `POST /api/tunnels`. */
export type CreateTunnelResponse = {
    id: string;
    url: string;
    connectUrl: string;
    token: string;
};
export declare function isCreateTunnelResponse(value: unknown): value is CreateTunnelResponse;
//# sourceMappingURL=constants.d.ts.map