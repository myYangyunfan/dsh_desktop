import { RtcpHeader } from "../header";
export declare class TransportWideCC {
    static count: number;
    count: number;
    length: number;
    senderSsrc: number;
    mediaSourceSsrc: number;
    baseSequenceNumber: number;
    packetStatusCount: number;
    /** 24bit multiples of 64ms */
    referenceTime: number;
    fbPktCount: number;
    packetChunks: (RunLengthChunk | StatusVectorChunk)[];
    recvDeltas: RecvDelta[];
    header: RtcpHeader;
    constructor(props?: Partial<TransportWideCC>);
    static deSerialize(data: Buffer, header: RtcpHeader): TransportWideCC;
    serialize(): Buffer<ArrayBuffer>;
    get packetResults(): PacketResult[];
}
export declare class RunLengthChunk {
    type: PacketChunk.TypeTCCRunLengthChunk;
    packetStatus: PacketStatus;
    /** 13bit */
    runLength: number;
    constructor(props?: Partial<RunLengthChunk>);
    static deSerialize(data: Buffer): RunLengthChunk;
    serialize(): Buffer<ArrayBuffer>;
    results(currentSequenceNumber: number): PacketResult[];
}
export declare class StatusVectorChunk {
    type: number;
    symbolSize: number;
    symbolList: number[];
    constructor(props?: Partial<StatusVectorChunk>);
    static deSerialize(data: Buffer): StatusVectorChunk;
    serialize(): Buffer<ArrayBuffer>;
}
export declare class RecvDelta {
    /**optional (If undefined, it will be set automatically.)*/
    type?: PacketStatus.TypeTCCPacketReceivedSmallDelta | PacketStatus.TypeTCCPacketReceivedLargeDelta;
    /**micro sec */
    delta: number;
    constructor(props?: Partial<RecvDelta>);
    static deSerialize(data: Buffer): RecvDelta;
    deSerialize(data: Buffer): void;
    parsed: boolean;
    parseDelta(): void;
    serialize(): Buffer<ArrayBuffer>;
}
export declare enum PacketChunk {
    TypeTCCRunLengthChunk = 0,
    TypeTCCStatusVectorChunk = 1,
    packetStatusChunkLength = 2
}
export declare enum PacketStatus {
    TypeTCCPacketNotReceived = 0,
    TypeTCCPacketReceivedSmallDelta = 1,
    TypeTCCPacketReceivedLargeDelta = 2,
    TypeTCCPacketReceivedWithoutDelta = 3
}
export declare class PacketResult {
    sequenceNumber: number;
    delta: number;
    received: boolean;
    receivedAtMs: number;
    constructor(props: Partial<PacketResult>);
}
