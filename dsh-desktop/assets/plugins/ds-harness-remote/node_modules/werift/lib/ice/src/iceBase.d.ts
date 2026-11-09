import { Candidate } from "./candidate";
import type { MdnsLookup } from "./dns/lookup";
import type { Cancelable } from "./helper";
import { type Address, type Event, type InterfaceAddresses, type TlsConnectionOptions } from "./imports/common";
import { Message } from "./stun/message";
import type { Protocol } from "./types/model";
export interface IceConnection {
    iceLite: boolean;
    iceControlling: boolean;
    localUsername: string;
    localPassword: string;
    remotePassword: string;
    remoteUsername: string;
    remoteIsLite: boolean;
    checkList: CandidatePair[];
    localCandidates: Candidate[];
    remoteCandidates: Candidate[];
    candidatePairs: CandidatePair[];
    stunServer?: Address;
    turnServer?: Address;
    generation: number;
    options: IceOptions;
    remoteCandidatesEnd: boolean;
    localCandidatesEnd: boolean;
    state: IceState;
    lookup?: MdnsLookup;
    nominated?: CandidatePair;
    readonly onData: Event<[Buffer]>;
    readonly stateChanged: Event<[IceState]>;
    readonly onIceCandidate: Event<[Candidate]>;
    restart(): void;
    setRemoteParams(params: {
        iceLite: boolean;
        usernameFragment: string;
        password: string;
    }): void;
    gatherCandidates(): Promise<void>;
    connect(): Promise<void>;
    close(): Promise<void>;
    addRemoteCandidate(remoteCandidate: Candidate | undefined): Promise<void>;
    send(data: Buffer): Promise<void>;
    getDefaultCandidate(): Candidate | undefined;
    resetNominatedPair(): void;
}
export interface CandidatePairStats {
    packetsSent: number;
    packetsReceived: number;
    bytesSent: number;
    bytesReceived: number;
    rtt?: number;
    totalRoundTripTime: number;
    roundTripTimeMeasurements: number;
    requestsReceived: number;
    requestsSent: number;
    responsesReceived: number;
    responsesSent: number;
    retransmissionsReceived: number;
    retransmissionsSent: number;
    consentRequestsSent: number;
}
export declare class CandidatePair implements CandidatePairStats {
    protocol: Protocol;
    remoteCandidate: Candidate;
    iceControlling: boolean;
    readonly id: string;
    handle?: Cancelable<void>;
    nominated: boolean;
    remoteNominated: boolean;
    private _state;
    get state(): CandidatePairState;
    packetsSent: number;
    packetsReceived: number;
    bytesSent: number;
    bytesReceived: number;
    rtt?: number;
    totalRoundTripTime: number;
    roundTripTimeMeasurements: number;
    requestsReceived: number;
    requestsSent: number;
    responsesReceived: number;
    responsesSent: number;
    retransmissionsReceived: number;
    retransmissionsSent: number;
    consentRequestsSent: number;
    private readonly requestTransactionIds;
    toJSON(): {
        protocol: string;
        localCandidate: string;
        remoteCandidate: string;
    };
    get json(): {
        protocol: string;
        localCandidate: string;
        remoteCandidate: string;
    };
    constructor(protocol: Protocol, remoteCandidate: Candidate, iceControlling: boolean);
    updateState(state: CandidatePairState): void;
    get localCandidate(): Candidate;
    get remoteAddr(): Address;
    get component(): number;
    get priority(): number;
    get foundation(): string;
    noteIncomingRequest(transactionId: string): boolean;
}
export declare const ICE_COMPLETED: 1;
export declare const ICE_FAILED: 2;
/** Basic consent check period in seconds (RFC 7675). Actual interval is 0.8–1.2× this. */
export declare const CONSENT_INTERVAL = 5;
/**
 * @deprecated Consent expiry is based on {@link CONSENT_TIMEOUT} (30s after the
 * last valid response), not a consecutive failure count. Kept for API compatibility.
 */
export declare const CONSENT_FAILURES = 6;
/** RFC 7675: consent expires this many seconds after the last valid response. */
export declare const CONSENT_TIMEOUT = 30;
/**
 * Default single-shot response wait for consent requests (ms) when RTT is unknown.
 * Independent of retransmission count. Downstream ICE-lite peers typically
 * answer in 150–300ms; 1s is a conservative default used by interop patches.
 */
export declare const CONSENT_RESPONSE_TIMEOUT = 1000;
/** RFC 8445 §14.3: ICE RTO must not be less than 500ms. */
export declare const CONSENT_RESPONSE_TIMEOUT_MIN = 500;
/**
 * Compute consent response wait from pair RTT (seconds).
 * Uses 2×RTT + 200ms jitter margin, floored at {@link CONSENT_RESPONSE_TIMEOUT_MIN}.
 * Falls back to {@link CONSENT_RESPONSE_TIMEOUT} when RTT is unavailable.
 */
export declare function consentResponseTimeoutMs(rttSeconds?: number): number;
export declare enum CandidatePairState {
    FROZEN = 0,
    WAITING = 1,
    IN_PROGRESS = 2,
    SUCCEEDED = 3,
    FAILED = 4
}
export type IceState = "disconnected" | "closed" | "completed" | "new" | "connected" | "failed";
export interface IceOptions {
    /** Advertise and operate as an ICE lite agent. */
    iceLite: boolean;
    useTcp: boolean;
    stunServer?: Address;
    turnServer?: Address;
    turnUsername?: string;
    turnPassword?: string;
    turnTransport?: "udp" | "tcp" | "tls";
    turnTlsOptions?: TlsConnectionOptions;
    forceTurn?: boolean;
    localPasswordPrefix?: string;
    useIpv4: boolean;
    useIpv6: boolean;
    useLinkLocalAddress?: boolean;
    portRange?: [number, number];
    interfaceAddresses?: InterfaceAddresses;
    additionalHostAddresses?: string[];
    filterStunResponse?: (message: Message, addr: Address, protocol: Protocol) => boolean;
    filterCandidatePair?: (pair: CandidatePair) => boolean;
}
export declare const defaultOptions: IceOptions;
export declare function validateRemoteCandidate(candidate: Candidate): Candidate;
export declare function sortCandidatePairs(pairs: {
    localCandidate: Pick<Candidate, "priority">;
    remoteCandidate: Pick<Candidate, "priority">;
}[], iceControlling: boolean): {
    localCandidate: Pick<Candidate, "priority">;
    remoteCandidate: Pick<Candidate, "priority">;
}[];
export declare function candidatePairPriority(local: Pick<Candidate, "priority">, remote: Pick<Candidate, "priority">, iceControlling: boolean): number;
export declare function serverReflexiveCandidate(protocol: Protocol, stunServer: Address): Promise<Candidate | undefined>;
export declare function validateAddress(addr?: Address): Address | undefined;
