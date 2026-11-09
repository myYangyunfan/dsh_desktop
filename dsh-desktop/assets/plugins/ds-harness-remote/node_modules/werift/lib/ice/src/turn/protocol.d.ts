import type { Candidate } from "../candidate";
import { type Address, Event, type InterfaceAddresses, type TlsConnectionOptions, type Transport } from "../imports/common";
import { Message } from "../stun/message";
import { Transaction } from "../stun/transaction";
import type { Protocol, TransactionRequestOptions } from "../types/model";
/** Channel binding state for a single peer transport address. */
export interface TurnChannel {
    number: number;
    address: Address;
    /** Unix seconds when this channel should be refreshed. */
    refreshAt: number;
}
export declare class StunOverTurnProtocol implements Protocol {
    turn: TurnProtocol;
    static type: string;
    readonly type: string;
    localCandidate: Candidate;
    private disposer;
    onRequestReceived: Event<[Message, Address, Buffer]>;
    onDataReceived: Event<[Buffer]>;
    constructor(turn: TurnProtocol);
    private handleStunMessage;
    request(request: Message, addr: Address, integrityKey?: Buffer, retransmissionsOrOptions?: number | TransactionRequestOptions, onRequestSent?: (attempt: number) => void): Promise<[Message, readonly [string, number]]>;
    connectionMade(): Promise<void>;
    sendData(data: Buffer, addr: Address): Promise<void>;
    sendStun(message: Message, addr: Address): Promise<void>;
    close(): Promise<void>;
}
export declare class TurnProtocol implements Protocol {
    server: Address;
    username: string;
    password: string;
    lifetime: number;
    transport: Transport;
    options: {
        /**sec */
        channelRefreshTime?: number;
    };
    static type: string;
    readonly type: string;
    readonly onData: Event<[Buffer<ArrayBufferLike>, readonly [string, number]]>;
    onRequestReceived: Event<[Message, Address, Buffer]>;
    onDataReceived: Event<[Buffer]>;
    integrityKey?: Buffer;
    nonce?: Buffer;
    realm?: string;
    relayedAddress: Address;
    mappedAddress: Address;
    localCandidate: Candidate;
    transactions: {
        [hexId: string]: Transaction;
    };
    private refreshHandle?;
    private channelNumber;
    private channelByAddr;
    private addrByChannel;
    /**sec */
    private channelRefreshTime;
    /**
     * Serializes ChannelBind requests so allocation-wide auth state
     * (nonce/realm/integrityKey) is not updated concurrently. Rejections
     * must not poison this tail — see channelBindQueue assignment sites.
     */
    private channelBindQueue;
    /** In-flight ChannelBind per peer transport address (dedupe concurrent). */
    private channelBindingByAddr;
    private tcpBuffer;
    /** Permission cache keyed by peer IP only (RFC 8656). */
    private permissionByAddr;
    /**
     * Serializes CreatePermission requests (auth state race avoidance).
     * Rejections must not poison this tail.
     */
    private permissionQueue;
    /** In-flight CreatePermission per peer IP (dedupe concurrent). */
    private creatingPermissionByAddr;
    constructor(server: Address, username: string, password: string, lifetime: number, transport: Transport, options?: {
        /**sec */
        channelRefreshTime?: number;
    });
    connectionMade(): Promise<void>;
    private handleChannelData;
    private handleSTUNMessage;
    private dataReceived;
    private send;
    private createPermission;
    private refresh;
    request(request: Message, addr: Address, _integrityKey?: Buffer, retransmissionsOrOptions?: number | TransactionRequestOptions, onRequestSent?: (attempt: number) => void): Promise<[Message, Address]>;
    requestWithRetry(request: Message, addr: Address): Promise<[Message, Address]>;
    sendData(data: Buffer, addr: Address): Promise<void>;
    /**
     * Ensure a CreatePermission exists for the peer IP.
     * Peer failures are isolated: a rejection for peer A does not poison peer B.
     */
    getPermission(addr: Address): Promise<void>;
    /**
     * Ensure a ChannelBind exists for the peer transport address.
     * Peer failures are isolated; concurrent same-peer calls share one Promise.
     */
    getChannel(addr: Address): Promise<TurnChannel>;
    /**
     * Create or refresh a channel for addr. Provisional mapping is installed
     * before the request so early ChannelData can be decoded; only a failed
     * *initial* bind rolls the mapping back. Failed channel numbers are never
     * reused.
     */
    private ensureChannel;
    private channelBind;
    sendStun(message: Message, addr: Address): Promise<void>;
    close(): Promise<void>;
}
export interface TurnClientConfig {
    address: Address;
    username: string;
    password: string;
}
export interface TurnClientOptions {
    lifetime?: number;
    ssl?: boolean;
    transport?: "udp" | "tcp" | "tls";
    tlsOptions?: TlsConnectionOptions;
    portRange?: [number, number];
    interfaceAddresses?: InterfaceAddresses;
}
export declare function createTurnClient({ address, username, password }: TurnClientConfig, { lifetime, portRange, interfaceAddresses, ssl, tlsOptions, transport: transportType, }?: TurnClientOptions): Promise<TurnProtocol>;
export declare function createStunOverTurnClient({ address, username, password, }: {
    address: Address;
    username: string;
    password: string;
}, { lifetime, portRange, interfaceAddresses, ssl, tlsOptions, transport: transportType, }?: {
    lifetime?: number;
    ssl?: boolean;
    transport?: "udp" | "tcp" | "tls";
    tlsOptions?: TlsConnectionOptions;
    portRange?: [number, number];
    interfaceAddresses?: InterfaceAddresses;
}): Promise<StunOverTurnProtocol>;
export declare function makeIntegrityKey(username: string, realm: string, password: string): Buffer<ArrayBufferLike>;
