import { RtcpHeader } from "./header";
export declare class RtcpSourceDescriptionPacket {
    static readonly type = 202;
    readonly type = 202;
    chunks: SourceDescriptionChunk[];
    constructor(props: Partial<RtcpSourceDescriptionPacket>);
    get length(): number;
    serialize(): Buffer<ArrayBuffer>;
    static deSerialize(payload: Buffer, header: RtcpHeader): RtcpSourceDescriptionPacket;
}
export declare class SourceDescriptionChunk {
    source: number;
    items: SourceDescriptionItem[];
    constructor(props?: Partial<SourceDescriptionChunk>);
    get length(): number;
    serialize(): Buffer<ArrayBuffer>;
    static deSerialize(data: Buffer): SourceDescriptionChunk;
}
export declare class SourceDescriptionItem {
    type: number;
    text: string;
    constructor(props: Partial<SourceDescriptionItem>);
    get length(): number;
    serialize(): Buffer<ArrayBuffer>;
    static deSerialize(data: Buffer): SourceDescriptionItem;
}
