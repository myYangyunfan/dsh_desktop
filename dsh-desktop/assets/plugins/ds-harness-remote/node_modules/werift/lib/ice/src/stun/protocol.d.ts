import { Event, UdpTransport } from "../imports/common";
import type { Address, InterfaceAddresses } from "../../../common/src/network";
import type { Candidate } from "../candidate";
import type { Protocol, TransactionRequestOptions } from "../types/model";
import { type Message } from "./message";
import { Transaction } from "./transaction";
export declare class StunProtocol implements Protocol {
    static readonly type = "stun";
    readonly type = "stun";
    transport: UdpTransport;
    transactions: {
        [key: string]: Transaction;
    };
    get transactionsKeys(): string[];
    localCandidate?: Candidate;
    sentMessage?: Message;
    localIp?: string;
    readonly onRequestReceived: Event<[Message, readonly [string, number], Buffer<ArrayBufferLike>]>;
    readonly onDataReceived: Event<[Buffer<ArrayBufferLike>]>;
    constructor();
    connectionMade: (useIpv4: boolean, portRange?: [number, number], interfaceAddresses?: InterfaceAddresses) => Promise<void>;
    private datagramReceived;
    getExtraInfo(): Address;
    sendStun(message: Message, addr: Address): Promise<void>;
    sendData(data: Buffer, addr: Address): Promise<void>;
    request(request: Message, addr: Address, integrityKey?: Buffer, retransmissionsOrOptions?: number | TransactionRequestOptions, onRequestSent?: (attempt: number) => void): Promise<[Message, readonly [string, number]]>;
    close(): Promise<void>;
}
