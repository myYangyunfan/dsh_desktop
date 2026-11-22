export type HeaderList = [name: string, value: string][];
/** Payload of an OPEN frame. */
export type OpenMessage = {
    method: string;
    /** Origin-form request target: path plus query, always starting with `/`. */
    path: string;
    headers: HeaderList;
    /** Whether DATA frames and an END frame follow for the request body. */
    body: boolean;
    /** Present for WebSocket upgrades: the subprotocols the public client offered. */
    websocket?: string[];
};
/** Payload of a HEAD frame. */
export type HeadMessage = {
    status: number;
    headers: HeaderList;
    /** Whether DATA frames and an END frame follow for the response body. */
    body: boolean;
    /** Subprotocol the local WebSocket server selected (status 101 only). */
    protocol?: string;
};
export type CloseMessage = {
    code: number;
    reason: string;
};
export declare function encodeText(value: string): Uint8Array<ArrayBuffer>;
export declare function decodeText(bytes: Uint8Array): string;
export declare function encodeOpen(message: OpenMessage): Uint8Array<ArrayBuffer>;
export declare function decodeOpen(bytes: Uint8Array): OpenMessage;
export declare function encodeHead(message: HeadMessage): Uint8Array<ArrayBuffer>;
export declare function decodeHead(bytes: Uint8Array): HeadMessage;
/** WebSocket END payload, laid out like a WebSocket close frame: `u16 code | UTF-8 reason`. */
export declare function encodeClose(message: CloseMessage): Uint8Array<ArrayBuffer>;
export declare function decodeClose(bytes: Uint8Array): CloseMessage;
export declare function encodeWindow(bytes: number): Uint8Array<ArrayBuffer>;
export declare function decodeWindow(bytes: Uint8Array): number;
/**
 * Close codes that may be sent in a close frame by an application.
 * Reserved codes (1005, 1006, 1015) and out-of-range values become 1000.
 */
export declare function sendableCloseCode(code: number | undefined): number;
/** Close reasons are limited to 123 bytes of UTF-8. */
export declare function sendableCloseReason(reason: string | undefined): string;
/** Whether a response to `method` with `status` carries a body (RFC 9110 §6.4.1). */
export declare function responseHasBody(method: string, status: number): boolean;
/**
 * Parses a Sec-WebSocket-Protocol header. Returns null when it is malformed:
 * subprotocols must be unique HTTP tokens (RFC 6455 §4.1).
 */
export declare function parseSubprotocols(header: string | null): string[] | null;
//# sourceMappingURL=messages.d.ts.map