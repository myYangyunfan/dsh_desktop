export declare class DtlsRandom {
    gmt_unix_time: number;
    random_bytes: Buffer<ArrayBufferLike>;
    static readonly spec: {
        gmt_unix_time: number;
        random_bytes: any;
    };
    constructor(gmt_unix_time?: number, random_bytes?: Buffer<ArrayBufferLike>);
    static deSerialize(buf: Buffer): DtlsRandom;
    static from(spec: typeof DtlsRandom.spec): DtlsRandom;
    serialize(): Buffer<ArrayBuffer>;
}
