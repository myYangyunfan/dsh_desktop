import type { RemoteInfo, Socket } from "dgram";
export interface Transport {
    onData?: (buf: Buffer) => void;
    send: (buf: Buffer) => Promise<void>;
    close: () => void;
}
export declare class UdpTransport implements Transport {
    private upd;
    private rinfo;
    constructor(upd: Socket, rinfo: Partial<RemoteInfo>);
    onData?: (buf: Buffer) => void;
    send: (buf: Buffer) => Promise<void>;
    close(): void;
}
export declare const createUdpTransport: (socket: Socket, rinfo?: Partial<RemoteInfo>) => UdpTransport;
