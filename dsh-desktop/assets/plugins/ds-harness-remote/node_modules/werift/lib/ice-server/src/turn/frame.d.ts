export interface ChannelDataMessage {
    channelNumber: number;
    data: Buffer;
}
export declare function isChannelData(data: Buffer): boolean;
export declare function encodeChannelData(channelNumber: number, data: Buffer): Buffer<ArrayBuffer>;
export declare function decodeChannelData(data: Buffer): ChannelDataMessage | undefined;
export declare function padTurnFrame(data: Buffer): Buffer<ArrayBufferLike>;
export declare function splitTurnTcpFrames(buffer: Buffer): {
    frames: Buffer<ArrayBufferLike>[];
    malformed: boolean;
    rest: Buffer<ArrayBufferLike>;
};
