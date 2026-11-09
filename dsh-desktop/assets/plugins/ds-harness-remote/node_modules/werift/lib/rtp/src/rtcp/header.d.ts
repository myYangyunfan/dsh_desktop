export declare const RTCP_HEADER_SIZE = 4;
export declare class RtcpHeader {
    version: number;
    padding: boolean;
    count: number;
    type: number;
    /**このパケットの長さは、ヘッダーと任意のパディングを含む32ビットワードから 1を引いたものである */
    length: number;
    constructor(props?: Partial<RtcpHeader>);
    static serialize(type: number, count: number, payload: Buffer, length: number): Buffer<ArrayBuffer>;
    serialize(): Buffer<ArrayBuffer>;
    static deSerialize(buf: Buffer): RtcpHeader;
}
