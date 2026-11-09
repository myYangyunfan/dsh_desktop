import type { Candidate } from "../candidate";
import type { Address, Event } from "../imports/common";
import type { Message } from "../stun/message";
/**
 * Options for a STUN transaction / Protocol.request.
 * Retransmission count and response wait deadline are independent
 * so consent freshness (retransmissions: 0, longer timeout) can be expressed.
 */
export interface TransactionRequestOptions {
    /** Number of retransmissions after the initial send. 0 = send once. */
    retransmissions?: number;
    /**
     * Initial response wait deadline in milliseconds.
     * Doubled after each retransmission when retransmissions > 0.
     * Defaults to RETRY_RTO when omitted.
     */
    responseTimeout?: number;
    /** Called for each wire send (attempt 0 is the initial transmission). */
    onRequestSent?: (attempt: number) => void;
    /** Abort the outstanding transaction (e.g. consent lifecycle teardown). */
    signal?: AbortSignal;
    /**
     * When set, responses must include MESSAGE-INTEGRITY and pass HMAC
     * verification (protocol re-parses the wire bytes with this key; the
     * transaction also rejects unsigned Messages as defense-in-depth).
     * Unsigned or forged responses must not complete the transaction.
     */
    integrityKey?: Buffer;
}
export interface Protocol {
    type: string;
    onRequestReceived: Event<[Message, Address, Buffer]>;
    onDataReceived: Event<[Buffer]>;
    request: (message: Message, addr: Address, integrityKey?: Buffer, retransmissionsOrOptions?: number | TransactionRequestOptions, onRequestSent?: (attempt: number) => void) => Promise<[Message, Address]>;
    close: () => Promise<void>;
    connectionMade: (...args: any) => Promise<void>;
    sendStun: (message: Message, addr: Address) => Promise<void>;
    sendData: (data: Buffer, addr: Address) => Promise<void>;
    localCandidate?: Candidate;
    sentMessage?: Message;
    responseAddr?: Address;
    responseMessage?: string;
    localIp?: string;
}
