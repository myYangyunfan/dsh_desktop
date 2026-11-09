import type { CurveTypes, NamedCurveAlgorithms } from "../../../cipher/const";
import { FragmentedHandshake } from "../../../record/message/fragment";
import type { Handshake } from "../../../typings/domain";
import { HandshakeType } from "../../const";
export declare class ServerKeyExchange implements Handshake {
    ellipticCurveType: CurveTypes;
    namedCurve: NamedCurveAlgorithms;
    publicKeyLength: number;
    publicKey: Buffer;
    hashAlgorithm: number;
    signatureAlgorithm: number;
    signatureLength: number;
    signature: Buffer;
    msgType: HandshakeType;
    messageSeq?: number;
    static readonly spec: {
        ellipticCurveType: number;
        namedCurve: number;
        publicKeyLength: number;
        publicKey: any;
        hashAlgorithm: number;
        signatureAlgorithm: number;
        signatureLength: number;
        signature: any;
    };
    constructor(ellipticCurveType: CurveTypes, namedCurve: NamedCurveAlgorithms, publicKeyLength: number, publicKey: Buffer, hashAlgorithm: number, signatureAlgorithm: number, signatureLength: number, signature: Buffer);
    static createEmpty(): ServerKeyExchange;
    static deSerialize(buf: Buffer): ServerKeyExchange;
    serialize(): Buffer<ArrayBuffer>;
    toFragment(): FragmentedHandshake;
}
