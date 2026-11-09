export declare function encodeTcpFrame(data: Buffer): Buffer<ArrayBuffer>;
export declare function splitTcpFrames(buffer: Buffer): {
    frames: Buffer<ArrayBufferLike>[];
    rest: Buffer<ArrayBufferLike>;
};
