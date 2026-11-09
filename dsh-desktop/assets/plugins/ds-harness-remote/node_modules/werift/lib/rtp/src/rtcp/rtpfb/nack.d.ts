import { RtcpHeader } from "../header";
export declare class GenericNack {
    static count: number;
    readonly count: number;
    header: RtcpHeader;
    senderSsrc: number;
    mediaSourceSsrc: number;
    lost: number[];
    toJSON(): {
        lost: number[];
        senderSsrc: number;
        mediaSourceSsrc: number;
    };
    constructor(props?: Partial<GenericNack>);
    static deSerialize(data: Buffer, header: RtcpHeader): GenericNack;
    serialize(): Buffer<ArrayBuffer>;
}
