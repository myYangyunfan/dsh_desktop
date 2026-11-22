import { CLOSE_PROTOCOL_ERROR, decodeFrame, decodeOpen, encodeFrame, encodeText, encodeHead, FrameType as Frames, HEARTBEAT_INTERVAL_MS, HEARTBEAT_TIMEOUT_MS, MAX_STREAMS, PING, ProtocolError, WindowBudget, } from "./protocol/index.js";
import { WebSocket } from "ws";
import { errorFromResponse, PROTOCOL_HEADERS, TunnelError } from "./api.js";
import { createStream } from "./streams.js";
/** One WebSocket session with the tunnel server. */
export class Connection {
    closed;
    socket;
    options;
    streams = new Map();
    windowBudget = new WindowBudget();
    heartbeat;
    pongTimeout;
    static open(options, signal) {
        return new Promise((resolve, reject) => {
            signal?.throwIfAborted();
            const socket = new WebSocket(options.tunnel.connectUrl, {
                headers: { authorization: `Bearer ${options.tunnel.token}`, ...PROTOCOL_HEADERS },
                perMessageDeflate: false,
                handshakeTimeout: 6_000,
            });
            const abort = () => socket.terminate();
            const removeAbort = () => signal?.removeEventListener("abort", abort);
            signal?.addEventListener("abort", abort, { once: true });
            socket.once("close", removeAbort);
            socket.once("unexpected-response", (_request, response) => {
                reject(errorFromResponse(response.statusCode ?? 0, "Tunnel rejected the connection"));
                response.destroy();
                socket.terminate();
            });
            socket.once("error", (error) => {
                reject(new TunnelError("network_error", `Could not connect: ${error.message}`, { cause: error }));
            });
            socket.once("open", () => {
                removeAbort();
                socket.removeAllListeners("error");
                resolve(new Connection(socket, options));
            });
        });
    }
    constructor(socket, options) {
        this.socket = socket;
        this.options = options;
        let resolveClosed;
        this.closed = new Promise((resolve) => {
            resolveClosed = resolve;
        });
        socket.on("message", (data, isBinary) => {
            // Anything that arrives proves the connection works. The pong can wait behind megabytes of
            // a wide upload window when the link slows down, and waiting for it alone dropped the tunnel.
            clearTimeout(this.pongTimeout);
            if (isBinary) {
                this.receive(data);
            }
        });
        socket.on("error", () => {
            // A close event always follows.
        });
        socket.on("close", (code, reason) => {
            clearInterval(this.heartbeat);
            clearTimeout(this.pongTimeout);
            for (const stream of this.streams.values()) {
                stream.abort();
            }
            this.streams.clear();
            resolveClosed({ code, reason: reason.toString() || closeDescription(code) });
        });
        // A connection that silently died (sleep, network change) never emits close; when nothing, not
        // even the pong, arrives after a ping, it is gone.
        const { intervalMs, timeoutMs } = options.heartbeat ?? {
            intervalMs: HEARTBEAT_INTERVAL_MS,
            timeoutMs: HEARTBEAT_TIMEOUT_MS,
        };
        this.heartbeat = setInterval(() => {
            socket.send(PING);
            clearTimeout(this.pongTimeout);
            this.pongTimeout = setTimeout(() => socket.terminate(), timeoutMs);
        }, intervalMs);
    }
    close(code, reason) {
        if (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING) {
            this.socket.close(code, reason);
            setTimeout(() => this.socket.terminate(), 1000).unref();
        }
    }
    receive(data) {
        let frame;
        try {
            frame = decodeFrame(Array.isArray(data) ? Buffer.concat(data) : data instanceof ArrayBuffer ? new Uint8Array(data) : data);
        }
        catch (error) {
            this.close(CLOSE_PROTOCOL_ERROR, error.message);
            return;
        }
        try {
            this.dispatch(frame);
        }
        catch (error) {
            if (error instanceof ProtocolError) {
                this.close(CLOSE_PROTOCOL_ERROR, error.message);
                return;
            }
            // Whatever went wrong with one stream (bad input from the public side, a local socket error)
            // must not take down the CLI or the other streams.
            this.streams.get(frame.stream)?.abort();
            this.streams.delete(frame.stream);
            this.send(Frames.Reset, frame.stream, encodeText("Host could not forward the request"));
        }
    }
    dispatch(frame) {
        if (frame.type !== Frames.Open) {
            // Frames for streams that already ended are expected and ignored.
            this.streams.get(frame.stream)?.receive(frame);
            return;
        }
        if (this.streams.has(frame.stream)) {
            throw new ProtocolError(`stream ${frame.stream} is already open`);
        }
        if (this.streams.size >= MAX_STREAMS) {
            this.send(Frames.Reset, frame.stream, encodeText("Too many concurrent streams"));
            return;
        }
        const request = this.options.authorize(decodeOpen(frame.payload));
        if (request === undefined) {
            this.send(Frames.Head, frame.stream, encodeHead({ status: 403, headers: [], body: false }));
            return;
        }
        const stream = createStream({
            target: this.options.target,
            stripResponseHeaders: this.options.stripResponseHeaders,
            publicOrigin: new URL(this.options.tunnel.url).origin,
            send: (type, id, payload, flushed) => this.send(type, id, payload, flushed),
            log: this.options.onRequest,
            remove: (id) => this.streams.delete(id),
            windowBudget: this.windowBudget,
        }, frame.stream, request);
        this.streams.set(frame.stream, stream);
        stream.start();
    }
    send(type, stream, payload, flushed) {
        if (this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(encodeFrame(type, stream, payload), flushed);
        }
    }
}
function closeDescription(code) {
    return code === 1006 ? "connection lost" : `closed with code ${code}`;
}
//# sourceMappingURL=connection.js.map