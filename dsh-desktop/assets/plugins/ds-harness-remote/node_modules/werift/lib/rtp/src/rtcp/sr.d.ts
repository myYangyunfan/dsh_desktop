import { RtcpReceiverInfo } from "./rr";
export declare class RtcpSrPacket {
    ssrc: number;
    senderInfo: RtcpSenderInfo;
    reports: RtcpReceiverInfo[];
    static readonly type = 200;
    readonly type = 200;
    constructor(props: Pick<RtcpSrPacket, "senderInfo"> & Partial<RtcpSrPacket>);
    toJSON(): {
        ssrc: number;
        senderInfo: {
            ntpTimestamp: number;
            rtpTimestamp: number;
        };
        reports: {
            ssrc: number;
            fractionLost: number;
            packetsLost: number;
            highestSequence: number;
            jitter: number;
            lsr: number;
            dlsr: number;
        }[];
    };
    serialize(): Buffer<ArrayBuffer>;
    static deSerialize(payload: Buffer, count: number): RtcpSrPacket;
}
export declare class RtcpSenderInfo {
    ntpTimestamp: bigint;
    rtpTimestamp: number;
    packetCount: number;
    octetCount: number;
    constructor(props?: Partial<RtcpSenderInfo>);
    toJSON(): {
        ntpTimestamp: number;
        rtpTimestamp: number;
    };
    serialize(): Buffer<ArrayBuffer>;
    static deSerialize(data: Buffer): RtcpSenderInfo;
}
export declare const ntpTime2Sec: (ntp: bigint) => number;
