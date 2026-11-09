import { type Address, Event } from "./imports/common";
import { Candidate } from "./candidate";
import { MdnsLookup } from "./dns/lookup";
import { CandidatePair, type IceConnection, type IceOptions, type IceState } from "./iceBase";
import { Message } from "./stun/message";
import type { Protocol } from "./types/model";
export declare class Connection implements IceConnection {
    private _iceControlling;
    localUsername: string;
    localPassword: string;
    remoteIsLite: boolean;
    remotePassword: string;
    remoteUsername: string;
    checkList: CandidatePair[];
    localCandidates: Candidate[];
    stunServer?: Address;
    turnServer?: Address;
    options: IceOptions;
    remoteCandidatesEnd: boolean;
    localCandidatesEnd: boolean;
    generation: number;
    userHistory: {
        [username: string]: string;
    };
    private readonly tieBreaker;
    state: IceState;
    lookup?: MdnsLookup;
    private _remoteCandidates;
    nominated?: CandidatePair;
    private nominating;
    private checkListDone;
    private checkListState;
    private earlyChecks;
    private earlyChecksDone;
    private localCandidatesStart;
    private protocols;
    private queryConsentHandle?;
    /** RFC 7675 consent-to-send: application data may use the selected pair. */
    private consentFresh;
    /** Invalidates in-flight consent callbacks on restart / close / replace / expire. */
    private consentSessionId;
    private consentExpiryTimer?;
    private consentRequestAbort?;
    readonly onData: Event<[Buffer<ArrayBufferLike>]>;
    readonly stateChanged: Event<[IceState]>;
    readonly onIceCandidate: Event<[Candidate]>;
    constructor(_iceControlling: boolean, options?: Partial<IceOptions>);
    get iceControlling(): boolean;
    set iceControlling(value: boolean);
    get iceLite(): boolean;
    restart(): Promise<void>;
    resetNominatedPair(): void;
    setRemoteParams({ iceLite, usernameFragment, password, }: {
        iceLite: boolean;
        usernameFragment: string;
        password: string;
    }): void;
    gatherCandidates(): Promise<void>;
    private appendLocalCandidate;
    private ensureProtocol;
    private getCandidatePromises;
    connect(): Promise<void>;
    private unfreezeInitial;
    private schedulingChecks;
    /**
     * Stop consent request cadence, expiry timer, and outstanding transactions.
     * Does not change ICE state by itself.
     */
    private stopConsentLifecycle;
    /**
     * ICE-lite interop only (not required by RFC 7675): mirror libwebrtc
     * semi-aggressive nomination — attach USE-CANDIDATE when we are controlling,
     * the remote is ICE-lite, and the target is the current selected pair.
     */
    private shouldNominateConsentRequest;
    private canSendApplicationData;
    private abortableDelay;
    private queryConsent;
    close(): Promise<void>;
    private setState;
    addRemoteCandidate(remoteCandidate: Candidate | undefined): Promise<void>;
    send: (data: Buffer) => Promise<void>;
    getDefaultCandidate(): Candidate;
    set remoteCandidates(value: Candidate[]);
    get remoteCandidates(): Candidate[];
    get candidatePairs(): CandidatePair[];
    private sortCheckList;
    private findPair;
    private applyIceControlling;
    private switchRole;
    private checkComplete;
    checkStart: (pair: CandidatePair) => {
        awaitable: Promise<void>;
        resolve: (value: void | PromiseLike<void>) => void;
        reject: (reason?: any) => void;
    };
    private addPair;
    checkIncoming(message: Message, addr: Address, protocol: Protocol): void;
    private tryPair;
    private pairLocalProtocol;
    private pairRemoteCandidate;
    private buildRequest;
    private pruneTcpConnections;
    private respondError;
}
