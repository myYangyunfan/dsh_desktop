export declare class ChangeCipherSpec {
    type: number;
    static readonly spec: {
        type: number;
    };
    constructor(type?: number);
    static createEmpty(): ChangeCipherSpec;
    static deSerialize(buf: Buffer): ChangeCipherSpec;
    serialize(): Buffer<ArrayBuffer>;
}
