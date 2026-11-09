type firEntry = {
    ssrc: number;
    sequenceNumber: number;
};
export declare class FullIntraRequest {
    static count: number;
    count: number;
    senderSsrc: number;
    mediaSsrc: number;
    fir: firEntry[];
    constructor(props?: Partial<FullIntraRequest>);
    get length(): number;
    static deSerialize(data: Buffer): FullIntraRequest;
    serialize(): Buffer<ArrayBuffer>;
}
export {};
