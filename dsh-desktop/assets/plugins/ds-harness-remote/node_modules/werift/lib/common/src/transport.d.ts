import { type RemoteInfo, type Socket, type SocketType } from "dgram";
import * as net from "node:net";
import * as tls from "node:tls";
import { type AddressInfo } from "node:net";
import { type Address, type InterfaceAddresses } from "./network";
export type TlsConnectionOptions = Omit<tls.ConnectionOptions, "host" | "port" | "socket">;
export declare class UdpTransport implements Transport {
    private socketType;
    private options;
    readonly type = "udp";
    readonly socket: Socket;
    rinfo?: Partial<Pick<RemoteInfo, "address" | "port">>;
    onData: (data: Buffer, addr: Address) => void;
    closed: boolean;
    private constructor();
    static init(type: SocketType, options?: {
        portRange?: [number, number];
        port?: number;
        interfaceAddresses?: InterfaceAddresses;
    }): Promise<UdpTransport>;
    private init;
    send: (data: Buffer, addr?: Address) => Promise<void>;
    get address(): net.AddressInfo;
    get host(): string;
    get port(): number;
    close: () => Promise<void>;
}
export declare class TcpTransport implements Transport {
    readonly type: "tcp";
    private readonly stream;
    private constructor();
    static init(addr: Address): Promise<TcpTransport>;
    private init;
    get address(): net.AddressInfo;
    get closed(): boolean;
    get onData(): (data: Buffer, addr: Address) => void;
    set onData(handler: (data: Buffer, addr: Address) => void);
    send: (data: Buffer, addr?: Address) => Promise<void>;
    close: () => Promise<void>;
}
export declare class TlsTransport implements Transport {
    readonly type: "tls";
    private readonly stream;
    private constructor();
    static init(addr: Address, options?: TlsConnectionOptions): Promise<TlsTransport>;
    private init;
    get address(): net.AddressInfo;
    get closed(): boolean;
    get onData(): (data: Buffer, addr: Address) => void;
    set onData(handler: (data: Buffer, addr: Address) => void);
    send: (data: Buffer, addr?: Address) => Promise<void>;
    close: () => Promise<void>;
}
export interface Transport {
    type: string;
    address: AddressInfo;
    closed: boolean;
    onData: (data: Buffer, addr: Address) => void;
    send: (data: Buffer, addr?: Address) => Promise<void>;
    close: () => Promise<void>;
}
