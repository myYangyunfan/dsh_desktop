import { type Address } from "../imports/common";
import type { Protocol, TransactionRequestOptions } from "../types/model";
import type { Message } from "./message";
/**
 * Resolve a request target to a concrete IP before creating a Transaction so
 * response source-address checks match the UDP peer address (hostname ≠ IP).
 */
export declare function resolveRequestAddress(addr: Address, family?: 0 | 4 | 6): Promise<Address>;
/**
 * Normalize legacy positional args and the options-object form into one shape.
 * Existing callers pass `(retransmissions?, onRequestSent?)`.
 */
export declare function normalizeTransactionOptions(retransmissionsOrOptions?: number | TransactionRequestOptions, onRequestSent?: (attempt: number) => void): TransactionRequestOptions;
/** Compare ICE transport addresses (host, port). */
export declare function addressEquals(a: Address, b: Address): boolean;
export declare class Transaction {
    private request;
    private addr;
    private protocol;
    private timeoutDelay;
    ended: boolean;
    private tries;
    private readonly triesMax;
    private readonly onResponse;
    private readonly onRequestSent?;
    private readonly signal?;
    /** Remote address this transaction was sent to; responses must match. */
    readonly expectedAddr: Address;
    /**
     * When set, protocol layers re-parse the wire response with this key so
     * MESSAGE-INTEGRITY failures are rejected before responseReceived.
     */
    readonly integrityKey?: Buffer;
    private waitTimer?;
    private waitResolve?;
    private onAbort?;
    constructor(request: Message, addr: Address, protocol: Protocol, retransmissionsOrOptions?: number | TransactionRequestOptions, onRequestSent?: (attempt: number) => void);
    /**
     * Accept a matching authenticated non-error response from the expected
     * remote address. Wrong address, missing MESSAGE-INTEGRITY (when required),
     * or non-success class is rejected without completing the transaction
     * (wrong address / unauthenticated responses are ignored so we keep waiting).
     */
    responseReceived: (message: Message, addr: Address) => void;
    run: () => Promise<[Message, readonly [string, number]]>;
    private attachAbortListener;
    private failWithTimeout;
    private clearWait;
    private wait;
    private retry;
    cancel(): void;
}
/**
 * Build Transaction options for Protocol.request, folding integrityKey into
 * options so response path can re-verify MESSAGE-INTEGRITY.
 */
export declare function buildTransactionOptions(integrityKey: Buffer | undefined, retransmissionsOrOptions?: number | TransactionRequestOptions, onRequestSent?: (attempt: number) => void): TransactionRequestOptions;
