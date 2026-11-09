export declare class RtcpRrPacket {
    ssrc: number;
    reports: RtcpReceiverInfo[];
    static readonly type = 201;
    readonly type = 201;
    constructor(props?: Partial<RtcpRrPacket>);
    serialize(): Buffer<ArrayBuffer>;
    static deSerialize(data: Buffer, count: number): RtcpRrPacket;
}
export declare class RtcpReceiverInfo {
    ssrc: number;
    fractionLost: number;
    packetsLost: number;
    highestSequence: number;
    jitter: number;
    /**last SR */
    lsr: number;
    /**delay since last SR */
    dlsr: number;
    constructor(props?: Partial<RtcpReceiverInfo>);
    toJSON(): {
        ssrc: number;
        fractionLost: number;
        packetsLost: number;
        highestSequence: number;
        jitter: number;
        lsr: number;
        dlsr: number;
    };
    serialize(): Buffer<ArrayBuffer>;
    static deSerialize(data: Buffer): RtcpReceiverInfo;
}
