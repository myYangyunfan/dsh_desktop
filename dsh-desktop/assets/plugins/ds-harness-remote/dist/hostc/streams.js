import http from "node:http";
import https from "node:https";
import { decodeClose, decodeWindow, encodeClose, encodeHead, encodeText, encodeWindow, FrameType, GrowingWindow, MAX_CHUNK_BYTES, MAX_WEBSOCKET_MESSAGE_BYTES, ProtocolError, responseHasBody, sendableCloseCode, sendableCloseReason, STREAM_WINDOW_BYTES, stripHopByHop, stripWebSocketHandshake, } from "./protocol/index.js";
import { WebSocket } from "ws";
import { fromRawHeaders, toLocalRequestHeaders, toPublicResponseHeaders, toRawHeaders } from "./rewrite.js";
/**
 * Bytes a WebSocket may have queued towards a local server that does not read. The public side cannot
 * be paused (the Durable Object has no backpressure on hibernatable sockets, and pausing the shared
 * connection would stall every stream and the heartbeat), so the stream closes instead.
 */
const MAX_LOCAL_QUEUE_BYTES = 32 * 1024 * 1024;
export function createStream(context, id, open) {
    return open.websocket ? new WebSocketStream(context, id, open) : new HttpStream(context, id, open);
}
/** One public HTTP request forwarded to the local server. */
class HttpStream {
    context;
    id;
    open;
    startedAt = Date.now();
    request = null;
    response = null;
    sendCredit = STREAM_WINDOW_BYTES;
    wakeSender = null;
    /** Request body window granted to the server, widened while it holds the upload back. */
    window;
    requestEnded = false;
    finished = false;
    constructor(context, id, open) {
        this.context = context;
        this.id = id;
        this.open = open;
        this.window = new GrowingWindow(context.windowBudget);
    }
    start() {
        const { target, publicOrigin } = this.context;
        const secure = target.protocol === "https:";
        const request = (secure ? https : http).request({
            protocol: target.protocol,
            hostname: target.hostname.replace(/^\[|\]$/g, ""),
            port: target.port || (secure ? 443 : 80),
            method: this.open.method,
            path: this.open.path,
            headers: toRawHeaders(toLocalRequestHeaders(this.open.headers, publicOrigin, target)),
        });
        this.request = request;
        request.on("response", (response) => void this.respond(response));
        request.on("error", () => {
            if (!this.finished) {
                this.context.send(FrameType.Reset, this.id, encodeText("Local Web server unavailable"));
                this.abort();
                this.finish(502);
            }
        });
        if (!this.open.body) {
            this.requestEnded = true;
            request.end();
        }
    }
    receive(frame) {
        switch (frame.type) {
            case FrameType.Data: {
                const request = this.request;
                const bytes = frame.payload.byteLength;
                if (bytes === 0) {
                    return;
                }
                // Return the window once the bytes are handed to the local socket.
                request?.write(frame.payload, () => {
                    if (!this.finished) {
                        const grant = bytes + this.window.delivered(bytes, request.writableLength === 0);
                        if (grant > 0) {
                            this.context.send(FrameType.Window, this.id, encodeWindow(grant));
                        }
                    }
                });
                return;
            }
            case FrameType.End:
                this.requestEnded = true;
                this.request?.end();
                return;
            case FrameType.Reset:
                this.abort();
                this.finish(499);
                return;
            case FrameType.Window:
                this.sendCredit += decodeWindow(frame.payload);
                this.wakeSender?.();
                return;
            default:
                throw new ProtocolError(`unexpected frame type ${frame.type} for an HTTP stream`);
        }
    }
    abort() {
        this.finished = true;
        this.window.release();
        this.request?.destroy();
        this.response?.destroy();
        this.wakeSender?.();
    }
    async respond(response) {
        this.response = response;
        const status = response.statusCode ?? 0;
        if (status < 100 || status > 599) {
            this.context.send(FrameType.Reset, this.id, encodeText(`local server sent invalid status ${status}`));
            this.abort();
            this.finish(502);
            return;
        }
        const body = responseHasBody(this.open.method, status);
        const headers = toPublicResponseHeaders(this.context.stripResponseHeaders(stripHopByHop(fromRawHeaders(response.rawHeaders))), this.context.publicOrigin, this.context.target);
        this.context.send(FrameType.Head, this.id, encodeHead({ status, headers, body }));
        if (!body) {
            response.resume();
            this.finish(status);
            return;
        }
        try {
            // Async iteration pauses the local response while we wait for window.
            for await (const chunk of response) {
                for (let offset = 0; offset < chunk.byteLength; offset += MAX_CHUNK_BYTES) {
                    const part = chunk.subarray(offset, offset + MAX_CHUNK_BYTES);
                    while (!this.finished && this.sendCredit < part.byteLength) {
                        await new Promise((resolve) => {
                            this.wakeSender = resolve;
                        });
                    }
                    if (this.finished) {
                        return;
                    }
                    this.sendCredit -= part.byteLength;
                    this.context.send(FrameType.Data, this.id, part);
                }
            }
            if (!this.finished) {
                this.context.send(FrameType.End, this.id);
                this.finish(status);
            }
        }
        catch (error) {
            if (!this.finished) {
                this.context.send(FrameType.Reset, this.id, encodeText(`local response failed: ${String(error)}`));
                this.abort();
                this.finish(status);
            }
        }
    }
    finish(status) {
        this.finished = true;
        this.window.release();
        this.wakeSender?.();
        if (!this.requestEnded) {
            // The local server answered before reading the whole body; the rest will never be sent.
            this.request?.destroy();
        }
        this.context.remove(this.id);
        this.context.log({
            method: this.open.method,
            path: this.open.path,
            status,
            durationMs: Date.now() - this.startedAt,
            websocket: false,
        });
    }
}
/** One public WebSocket bridged to a WebSocket on the local server. */
class WebSocketStream {
    context;
    id;
    open;
    startedAt = Date.now();
    socket = null;
    settled = false;
    ended = false;
    /** Messages from the local server not yet written to the tunnel. */
    unflushed = 0;
    constructor(context, id, open) {
        this.context = context;
        this.id = id;
        this.open = open;
    }
    start() {
        const { target, publicOrigin, send } = this.context;
        // Concatenate instead of resolving: a path like `//other-host/` must never leave the target.
        const url = new URL(`${target.protocol === "https:" ? "wss:" : "ws:"}//${target.host}${this.open.path}`);
        if (url.host !== target.host) {
            throw new Error("request path escapes the target");
        }
        const requestHeaders = {};
        for (const [name, value] of toLocalRequestHeaders(this.open.headers, publicOrigin, target)) {
            const lower = name.toLowerCase();
            if (lower !== "host") {
                const previous = requestHeaders[lower];
                requestHeaders[lower] = previous === undefined ? value : `${previous}, ${value}`;
            }
        }
        const socket = new WebSocket(url, this.open.websocket ?? [], {
            headers: requestHeaders,
            rejectUnauthorized: true,
            maxPayload: MAX_WEBSOCKET_MESSAGE_BYTES,
        });
        this.socket = socket;
        let responseHeaders = [];
        socket.on("upgrade", (response) => {
            responseHeaders = this.context.stripResponseHeaders(stripWebSocketHandshake(fromRawHeaders(response.rawHeaders)));
        });
        socket.on("open", () => {
            const protocol = socket.protocol || undefined;
            send(FrameType.Head, this.id, encodeHead({ status: 101, headers: responseHeaders, body: false, protocol }));
            this.settle(101);
        });
        socket.on("unexpected-response", (_request, response) => {
            const status = response.statusCode ?? 502;
            const headers = toPublicResponseHeaders(this.context.stripResponseHeaders(stripHopByHop(fromRawHeaders(response.rawHeaders), ["content-length"])), this.context.publicOrigin, this.context.target);
            send(FrameType.Head, this.id, encodeHead({ status, headers, body: false }));
            response.resume();
            this.settle(status);
            this.end();
            socket.terminate();
        });
        socket.on("message", (data, isBinary) => {
            if (this.ended) {
                return;
            }
            // One batch at a time: what the tunnel has not taken stays in TCP and holds back the local server.
            socket.pause();
            this.unflushed++;
            send(isBinary ? FrameType.Data : FrameType.Text, this.id, toBytes(data), () => {
                this.unflushed--;
                if (this.unflushed === 0) {
                    socket.resume();
                }
            });
        });
        socket.on("close", (code, reason) => {
            if (!this.ended) {
                send(FrameType.End, this.id, encodeClose({ code, reason: reason.toString() }));
                this.end();
            }
        });
        socket.on("error", (error) => {
            if (this.ended) {
                return;
            }
            if (this.settled) {
                const code = error.code === "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH" ? 1009 : 1011;
                send(FrameType.End, this.id, encodeClose({ code, reason: error.message }));
            }
            else {
                send(FrameType.Reset, this.id, encodeText("Local Web server unavailable"));
                this.settle(502);
            }
            this.end();
            socket.terminate();
        });
    }
    receive(frame) {
        switch (frame.type) {
            case FrameType.Data:
            case FrameType.Text:
                if (this.socket?.readyState === WebSocket.OPEN) {
                    this.socket.send(frame.payload, { binary: frame.type === FrameType.Data });
                    if (this.socket.bufferedAmount > MAX_LOCAL_QUEUE_BYTES) {
                        this.context.send(FrameType.End, this.id, encodeClose({ code: 1013, reason: "local server is not reading" }));
                        this.end();
                        this.socket.terminate();
                    }
                }
                return;
            case FrameType.End: {
                const { code, reason } = decodeClose(frame.payload);
                this.end();
                this.socket?.close(sendableCloseCode(code), sendableCloseReason(reason));
                // The local server's close frame is behind whatever we stopped reading.
                this.socket?.resume();
                return;
            }
            case FrameType.Reset:
                this.settle(499);
                this.end();
                this.socket?.terminate();
                return;
            default:
                throw new ProtocolError(`unexpected frame type ${frame.type} for a WebSocket stream`);
        }
    }
    abort() {
        this.ended = true;
        this.socket?.terminate();
    }
    settle(status) {
        if (this.settled) {
            return;
        }
        this.settled = true;
        this.context.log({
            method: "GET",
            path: this.open.path,
            status,
            durationMs: Date.now() - this.startedAt,
            websocket: true,
        });
    }
    end() {
        if (!this.ended) {
            this.ended = true;
            this.context.remove(this.id);
        }
    }
}
function toBytes(data) {
    if (Array.isArray(data)) {
        return Buffer.concat(data);
    }
    return data instanceof ArrayBuffer ? new Uint8Array(data) : data;
}
//# sourceMappingURL=streams.js.map