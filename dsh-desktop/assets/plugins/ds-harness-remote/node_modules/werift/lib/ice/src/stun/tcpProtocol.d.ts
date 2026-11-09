import { type AddressInfo, type Socket } from "node:net";
import type { Candidate } from "../candidate";
import { type Address, Event } from "../imports/common";
import type { Protocol, TransactionRequestOptions } from "../types/model";
import { type Message } from "./message";
import { Transaction } from "./transaction";
type SocketEntry = {
    socket: Socket;
    buffer: Buffer;
    remoteAddr?: Address;
};
declare abstract class BaseTcpProtocol implements Protocol {
    static readonly type = "tcp";
    readonly type = "tcp";
    transactions: {
        [key: string]: Transaction;
    };
    localCandidate?: Candidate;
    sentMessage?: Message;
    localIp?: string;
    readonly onRequestReceived: Event<[Message, readonly [string, number], Buffer<ArrayBufferLike>]>;
    readonly onDataReceived: Event<[Buffer<ArrayBufferLike>]>;
    protected readonly sockets: Map<string, SocketEntry>;
    abstract connectionMade(...args: any[]): Promise<void>;
    protected abstract getSocket(addr: Address): Promise<SocketEntry>;
    protected rememberSocket(entry: SocketEntry): void;
    protected forgetSocket(remoteAddr?: Address): void;
    protected registerSocket(socket: Socket, remoteAddr?: Address): SocketEntry;
    private handleFrame;
    private sendFrame;
    sendStun(message: Message, addr: Address): Promise<void>;
    sendData(data: Buffer, addr: Address): Promise<void>;
    request(request: Message, addr: Address, integrityKey?: Buffer, retransmissionsOrOptions?: number | TransactionRequestOptions, onRequestSent?: (attempt: number) => void): Promise<[Message, readonly [string, number]]>;
    pruneForSelection(remoteAddr?: Address): Promise<void>;
    get activeSocketCount(): number;
    get address(): AddressInfo;
    close(): Promise<void>;
}
export declare class TcpActiveProtocol extends BaseTcpProtocol {
    private readonly pendingSockets;
    connectionMade(localIp: string): Promise<void>;
    protected getSocket(addr: Address): Promise<SocketEntry>;
}
export declare class TcpPassiveProtocol extends BaseTcpProtocol {
    private server;
    connectionMade(localIp: string, portRange?: [number, number]): Promise<void>;
    protected getSocket(addr: Address): Promise<SocketEntry>;
    get listeningPort(): number;
    close(): Promise<void>;
}
export {};
