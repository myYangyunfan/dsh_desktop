/**
 * Binary frame: `u8 type | u32 streamId (big endian) | payload`.
 *
 * The transport is one WebSocket, which is already ordered and reliable,
 * so frames carry no sequence numbers or checksums.
 */
export const FrameType = {
    /** server → client. JSON `OpenMessage`. Starts a stream. */
    Open: 1,
    /** client → server. JSON `HeadMessage`. Response status and headers. */
    Head: 2,
    /** both. HTTP body chunk or binary WebSocket message. */
    Data: 3,
    /** both. Text WebSocket message (UTF-8). */
    Text: 4,
    /** both. End of this direction. Empty for HTTP, close code + reason for WebSockets. */
    End: 5,
    /** both. UTF-8 reason. Aborts the stream in both directions. */
    Reset: 6,
    /** both. u32. Grants more HTTP body bytes to the peer. */
    Window: 7,
};
export const FRAME_HEADER_BYTES = 5;
export const MAX_STREAM_ID = 0xffff_ffff;
export class ProtocolError extends Error {
    name = "ProtocolError";
}
const EMPTY = new Uint8Array(0);
export function encodeFrame(type, stream, payload = EMPTY) {
    if (!Number.isInteger(stream) || stream < 1 || stream > MAX_STREAM_ID) {
        throw new ProtocolError(`invalid stream id ${stream}`);
    }
    const bytes = new Uint8Array(FRAME_HEADER_BYTES + payload.byteLength);
    bytes[0] = type;
    new DataView(bytes.buffer).setUint32(1, stream);
    bytes.set(payload, FRAME_HEADER_BYTES);
    return bytes;
}
export function decodeFrame(bytes) {
    if (bytes.byteLength < FRAME_HEADER_BYTES) {
        throw new ProtocolError("frame too short");
    }
    const type = bytes[0];
    if (type < FrameType.Open || type > FrameType.Window) {
        throw new ProtocolError(`unknown frame type ${type}`);
    }
    const stream = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(1);
    if (stream === 0) {
        throw new ProtocolError("stream id 0 is reserved");
    }
    return { type, stream, payload: bytes.subarray(FRAME_HEADER_BYTES) };
}
//# sourceMappingURL=frame.js.map