import { FragmentedHandshake } from "../../../record/message/fragment";
import type { Handshake } from "../../../typings/domain";
import { HandshakeType } from "../../const";
export declare class ClientKeyExchange implements Handshake {
    publicKey: Buffer;
    msgType: HandshakeType;
    messageSeq?: number;
    static readonly spec: {
        publicKey: any;
    };
    constructor(publicKey: Buffer);
    static createEmpty(): ClientKeyExchange;
    static deSerialize(buf: Buffer): ClientKeyExchange;
    serialize(): Buffer<ArrayBuffer>;
    toFragment(): FragmentedHandshake;
}
