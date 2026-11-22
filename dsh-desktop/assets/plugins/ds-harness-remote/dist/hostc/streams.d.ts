import { type Frame, FrameType, type HeaderList, type OpenMessage, type WindowBudget } from "./protocol/index.js";
export type RequestLog = {
    method: string;
    path: string;
    status: number;
    durationMs: number;
    websocket: boolean;
};
/** What a stream needs from its connection. */
export type StreamContext = {
    target: URL;
    stripResponseHeaders: (headers: HeaderList) => HeaderList;
    publicOrigin: string;
    /** Queues a frame for the tunnel; `flushed` runs once it is written. */
    send: (type: FrameType, stream: number, payload?: Uint8Array, flushed?: () => void) => void;
    /** Reports a request once its response status is known. */
    log: (entry: RequestLog) => void;
    /** Forgets a stream that has ended. */
    remove: (stream: number) => void;
    /** Extra request body window, shared by the streams of the connection. */
    windowBudget: WindowBudget;
};
export interface Stream {
    start(): void;
    receive(frame: Frame): void;
    /** Tears down local resources without notifying the server. */
    abort(): void;
}
export declare function createStream(context: StreamContext, id: number, open: OpenMessage): Stream;
//# sourceMappingURL=streams.d.ts.map