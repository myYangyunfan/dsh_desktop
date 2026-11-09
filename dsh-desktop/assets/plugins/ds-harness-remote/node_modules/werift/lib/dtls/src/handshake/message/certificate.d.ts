import { FragmentedHandshake } from "../../record/message/fragment";
import type { Handshake } from "../../typings/domain";
import { HandshakeType } from "../const";
export declare class Certificate implements Handshake {
    certificateList: Buffer[];
    msgType: HandshakeType;
    messageSeq?: number;
    static readonly spec: {
        certificateList: any;
    };
    constructor(certificateList: Buffer[]);
    static createEmpty(): Certificate;
    static deSerialize(buf: Buffer): Certificate;
    serialize(): Buffer<ArrayBuffer>;
    toFragment(): FragmentedHandshake;
}
