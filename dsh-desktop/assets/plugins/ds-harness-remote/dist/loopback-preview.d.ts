import type { RemoteClientCore } from '@dsh-remote/client-core';
/** One unpredictable origin per upstream port. Only the local machine can reach this listener. */
export declare class LoopbackPreview {
    private readonly client;
    private readonly servers;
    private readonly sockets;
    private readonly lifetime;
    constructor(client: RemoteClientCore);
    open(port: number): Promise<{
        url: string;
    }>;
    close(): Promise<void>;
    private start;
    private headers;
    private http;
    private websocket;
    private release;
}
//# sourceMappingURL=loopback-preview.d.ts.map