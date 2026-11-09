import { type IncomingHttpHeaders } from 'node:http';
/** Strip hop headers including names nominated by Connection. Never log header/body contents. */
export declare function cleanHeaders(headers: Array<[string, string]>): Array<[string, string]>;
export declare function headerPairs(headers: IncomingHttpHeaders): Array<[string, string]>;
/** Per-peer HTTP/WS proxy to explicit IPv4 loopback ports; never a general TCP tunnel. */
export declare class LoopbackHost {
    private readonly onClose?;
    private readonly handles;
    private ports;
    private closed;
    private readonly timer;
    constructor(getPorts: () => readonly number[], onClose?: (() => void) | undefined);
    setPorts(ports: readonly number[]): void;
    call(input: unknown): Promise<unknown>;
    closeAll(): void;
    private close;
    private openHttp;
    private openWs;
}
//# sourceMappingURL=loopback-host.d.ts.map