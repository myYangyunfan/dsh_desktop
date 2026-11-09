export declare class PictureLossIndication {
    static count: number;
    count: number;
    length: number;
    senderSsrc: number;
    mediaSsrc: number;
    constructor(props?: Partial<PictureLossIndication>);
    static deSerialize(data: Buffer): PictureLossIndication;
    serialize(): Buffer<ArrayBuffer>;
}
