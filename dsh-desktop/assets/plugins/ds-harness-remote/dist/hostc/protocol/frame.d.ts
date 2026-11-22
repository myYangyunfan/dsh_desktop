/**
 * Binary frame: `u8 type | u32 streamId (big endian) | payload`.
 *
 * The transport is one WebSocket, which is already ordered and reliable,
 * so frames carry no sequence numbers or checksums.
 */
export declare const FrameType: {
    /** server → client. JSON `OpenMessage`. Starts a stream. */
    readonly Open: 1;
    /** client → server. JSON `HeadMessage`. Response status and headers. */
    readonly Head: 2;
    /** both. HTTP body chunk or binary WebSocket message. */
    readonly Data: 3;
    /** both. Text WebSocket message (UTF-8). */
    readonly Text: 4;
    /** both. End of this direction. Empty for HTTP, close code + reason for WebSockets. */
    readonly End: 5;
    /** both. UTF-8 reason. Aborts the stream in both directions. */
    readonly Reset: 6;
    /** both. u32. Grants more HTTP body bytes to the peer. */
    readonly Window: 7;
};
export type FrameType = (typeof FrameType)[keyof typeof FrameType];
export declare const FRAME_HEADER_BYTES = 5;
export declare const MAX_STREAM_ID = 4294967295;
export type Frame = {
    type: FrameType;
    stream: number;
    payload: Uint8Array;
};
export declare class ProtocolError extends Error {
    name: string;
}
export declare function encodeFrame(type: FrameType, stream: number, payload?: Uint8Array): Uint8Array<ArrayBuffer>;
export declare function decodeFrame(bytes: Uint8Array): Frame;
//# sourceMappingURL=frame.d.ts.map