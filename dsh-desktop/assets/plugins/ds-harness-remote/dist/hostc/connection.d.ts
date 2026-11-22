import { type CreateTunnelResponse, type OpenMessage } from "./protocol/index.js";
import { type RequestLog } from "./streams.js";
export type ConnectionOptions = {
    tunnel: CreateTunnelResponse;
    target: URL;
    authorize: (request: OpenMessage) => OpenMessage | undefined;
    stripResponseHeaders: (headers: import("./protocol/index.js").HeaderList) => import("./protocol/index.js").HeaderList;
    onRequest: (entry: RequestLog) => void;
    /** Heartbeat timing; tests shorten it. */
    heartbeat?: {
        intervalMs: number;
        timeoutMs: number;
    };
};
export type CloseInfo = {
    code: number;
    reason: string;
};
/** One WebSocket session with the tunnel server. */
export declare class Connection {
    readonly closed: Promise<CloseInfo>;
    private readonly socket;
    private readonly options;
    private readonly streams;
    private readonly windowBudget;
    private readonly heartbeat;
    private pongTimeout;
    static open(options: ConnectionOptions, signal?: AbortSignal): Promise<Connection>;
    private constructor();
    close(code: number, reason: string): void;
    private receive;
    private dispatch;
    private send;
}
//# sourceMappingURL=connection.d.ts.map