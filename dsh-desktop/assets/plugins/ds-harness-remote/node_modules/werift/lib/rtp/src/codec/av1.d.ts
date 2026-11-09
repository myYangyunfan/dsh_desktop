import type { RtpHeader } from "..";
export declare class AV1RtpPayload {
    /**
     * RtpStartsWithFragment
     * MUST be set to 1 if the first OBU element is an OBU fragment that is a continuation of an OBU fragment from the previous packet, and MUST be set to 0 otherwise.
     */
    zBit_RtpStartsWithFragment: number;
    /**
     * RtpEndsWithFragment
     * MUST be set to 1 if the last OBU element is an OBU fragment that will continue in the next packet, and MUST be set to 0 otherwise.
     */
    yBit_RtpEndsWithFragment: number;
    /**
     * RtpNumObus
     * two bit field that describes the number of OBU elements in the packet. This field MUST be set equal to 0 or equal to the number of OBU elements contained in the packet. If set to 0, each OBU element MUST be preceded by a length field.
     */
    w_RtpNumObus: number;
    /**
     * RtpStartsNewCodedVideoSequence
     * MUST be set to 1 if the packet is the first packet of a coded video sequence, and MUST be set to 0 otherwise.
     */
    nBit_RtpStartsNewCodedVideoSequence: number;
    obu_or_fragment: {
        data: Buffer;
        isFragment: boolean;
    }[];
    static deSerialize: (buf: Buffer) => AV1RtpPayload;
    static isDetectedFinalPacketInSequence(header: RtpHeader): boolean;
    get isKeyframe(): boolean;
    static getFrame(payloads: AV1RtpPayload[]): Buffer<ArrayBuffer>;
}
export declare class AV1Obu {
    obu_forbidden_bit: number;
    obu_type: OBU_TYPE;
    obu_extension_flag: number;
    obu_has_size_field: number;
    obu_reserved_1bit: number;
    payload: Buffer;
    static deSerialize(buf: Buffer): AV1Obu;
    serialize(): Buffer<ArrayBuffer>;
}
export declare function leb128decode(buf: Buffer): number[];
declare const OBU_TYPES: {
    readonly 0: "Reserved";
    readonly 1: "OBU_SEQUENCE_HEADER";
    readonly 2: "OBU_TEMPORAL_DELIMITER";
    readonly 3: "OBU_FRAME_HEADER";
    readonly 4: "OBU_TILE_GROUP";
    readonly 5: "OBU_METADATA";
    readonly 6: "OBU_FRAME";
    readonly 7: "OBU_REDUNDANT_FRAME_HEADER";
    readonly 8: "OBU_TILE_LIST";
    readonly 15: "OBU_PADDING";
};
type OBU_TYPE = (typeof OBU_TYPES)[keyof typeof OBU_TYPES];
export {};
