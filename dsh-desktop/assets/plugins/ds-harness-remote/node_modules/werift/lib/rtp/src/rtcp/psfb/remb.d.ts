export declare class ReceiverEstimatedMaxBitrate {
    static count: number;
    length: number;
    count: number;
    senderSsrc: number;
    mediaSsrc: number;
    readonly uniqueID: string;
    ssrcNum: number;
    brExp: number;
    brMantissa: number;
    bitrate: bigint;
    ssrcFeedbacks: number[];
    constructor(props?: Partial<ReceiverEstimatedMaxBitrate>);
    static deSerialize(data: Buffer): ReceiverEstimatedMaxBitrate;
    serialize(): Buffer<ArrayBuffer>;
}
