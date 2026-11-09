export interface Page {
    granulePosition: number;
    segments: Buffer[];
    segmentTable: number[];
}
export declare class OggParser {
    pages: Page[];
    private checkSegments;
    exportSegments(): Buffer<ArrayBufferLike>[];
    read(buf: Buffer): this;
}
