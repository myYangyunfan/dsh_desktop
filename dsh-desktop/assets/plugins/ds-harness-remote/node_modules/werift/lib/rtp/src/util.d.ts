import { RtpPacket } from "./rtp/rtp";
export declare class RtpBuilder {
    private props;
    sequenceNumber: number;
    timestamp: number;
    constructor(props: {
        between: number;
        clockRate: number;
    });
    create(payload: Buffer): RtpPacket;
}
