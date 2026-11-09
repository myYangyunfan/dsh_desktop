import { type Chunk, DataChunk, ForwardTsnChunk } from "./chunk";
import { SCTP_STATE } from "./const";
import { type Unpacked } from "./helper";
import { Event } from "./imports/common";
import { OutgoingSSNResetRequestParam, type StreamParam } from "./param";
import type { Transport } from "./transport";
declare const SCTPConnectionStates: readonly ["new", "closed", "connected", "connecting"];
type SCTPConnectionState = Unpacked<typeof SCTPConnectionStates>;
export declare class SCTP {
    transport: Transport;
    port: number;
    flush: Event<[void]>;
    readonly stateChanged: {
        [key in SCTPConnectionState]: Event<[]>;
    };
    readonly onReconfigStreams: Event<[number[]]>;
    /**streamId: number, ppId: number, data: Buffer */
    readonly onReceive: Event<[number, number, Buffer<ArrayBufferLike>]>;
    onSackReceived: () => Promise<void>;
    associationState: SCTP_STATE;
    started: boolean;
    state: SCTPConnectionState;
    isServer: boolean;
    private isStopping;
    private isClosed;
    private hmacKey;
    private localPartialReliability;
    private localPort;
    private localVerificationTag;
    remoteExtensions: number[];
    remotePartialReliability: boolean;
    private remotePort?;
    private remoteVerificationTag;
    private advertisedRwnd;
    private peerAdvertisedRwnd;
    private get peerRwnd();
    private inboundStreams;
    _inboundStreamsCount: number;
    _inboundStreamsMax: number;
    private lastReceivedTsn?;
    private sackDuplicates;
    private sackMisOrdered;
    private sackNeeded;
    private sackPacketCount;
    private sackHasNewDataInPacket;
    private sackImmediate;
    private sackTimeout;
    private cwnd;
    private fastRecoveryExit?;
    private fastRecoveryTransmit;
    private forwardTsnChunk?;
    private flightSize;
    outboundQueue: DataChunk[];
    private outboundStreamSeq;
    _outboundStreamsCount: number;
    /**local transmission sequence number */
    private localTsn;
    private lastSackedTsn;
    private advancedPeerAckTsn;
    private partialBytesAcked;
    private sentQueue;
    private transmitting;
    private transmitRequested;
    /**初期TSNと同じ値に初期化される単調に増加する数です. これは、新しいre-configuration requestパラメーターを送信するたびに1ずつ増加します */
    reconfigRequestSeq: number;
    /**このフィールドは、incoming要求のre-configuration requestシーケンス番号を保持します. 他の場合では、次に予想されるre-configuration requestシーケンス番号から1を引いた値が保持されます */
    reconfigResponseSeq: number;
    reconfigRequest?: OutgoingSSNResetRequestParam;
    reconfigQueue: number[];
    private srtt?;
    private rttvar?;
    private rto;
    /**t1 is wait for initAck or cookieAck */
    private timer1Handle?;
    private timer1Chunk?;
    private timer1Failures;
    /**t2 is wait for shutdown */
    private timer2Handle?;
    private timer2Chunk?;
    private timer2Failures;
    /**t3 is wait for data sack */
    private timer3Handle?;
    /**Re-configuration Timer */
    private timerReconfigHandle?;
    private timerReconfigFailures;
    private timerHeartbeatHandle?;
    private heartbeatInterval;
    private ssthresh?;
    constructor(transport: Transport, port?: number);
    private get isStopped();
    get maxChannels(): number | undefined;
    static client(transport: Transport, port?: number): SCTP;
    static server(transport: Transport, port?: number): SCTP;
    private handleData;
    private scheduleSack;
    private sendSack;
    private receiveChunk;
    private getExtensions;
    private receiveReconfigParam;
    private receiveDataChunk;
    private receiveSackChunk;
    receiveForwardTsnChunk(chunk: ForwardTsnChunk): void;
    private updateRto;
    private receive;
    private getInboundStream;
    private markReceived;
    send: (streamId: number, ppId: number, userData: Buffer, { expiry, maxRetransmits, ordered, }?: {
        expiry?: number | undefined;
        maxRetransmits?: number | undefined;
        ordered?: boolean;
    }) => Promise<void>;
    private transmit;
    private transmitOnce;
    transmitReconfigRequest(): Promise<void>;
    sendReconfigParam(param: StreamParam): Promise<void>;
    private sendResetRequest;
    private flightSizeIncrease;
    private flightSizeDecrease;
    /**t1 is wait for initAck or cookieAck */
    private timer1Start;
    private timer1Expired;
    private timer1Cancel;
    /**t2 is wait for shutdown */
    private t2Start;
    private timer2Expired;
    private timer2Cancel;
    /**t3 is wait for data sack */
    private timer3Start;
    private timer3Restart;
    private timer3Expired;
    private timer3Cancel;
    /**Re-configuration Timer */
    private timerReconfigHandleStart;
    private timerReconfigHandleExpired;
    private timerReconfigCancel;
    private heartbeatStart;
    private heartbeatRestart;
    private heartbeatCancel;
    private timerHeartbeatExpired;
    setHeartbeatInterval(interval: number): void;
    private updateAdvancedPeerAckPoint;
    private maybeAbandon;
    static getCapabilities(): RTCSctpCapabilities;
    setRemotePort(port: number): void;
    start(remotePort?: number): Promise<void>;
    private init;
    private setExtensions;
    sendChunk(chunk: Chunk): Promise<void>;
    setState(state: SCTP_STATE): void;
    setConnectionState(state: SCTPConnectionState): void;
    stop(): Promise<void>;
    abort(): Promise<void>;
    private removeAllListeners;
}
export declare class InboundStream {
    reassembly: DataChunk[];
    streamSequenceNumber: number;
    constructor();
    addChunk(chunk: DataChunk): void;
    popMessages(): Generator<[number, number, Buffer]>;
    pruneChunks(tsn: number): number;
}
export declare class RTCSctpCapabilities {
    maxMessageSize: number;
    constructor(maxMessageSize: number);
}
export {};
