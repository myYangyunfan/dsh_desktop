import type { HashAlgorithms, SignatureAlgorithms } from "../../../cipher/const";
import { FragmentedHandshake } from "../../../record/message/fragment";
import type { Handshake } from "../../../typings/domain";
import { HandshakeType } from "../../const";
export declare class ServerCertificateRequest implements Handshake {
    certificateTypes: number[];
    signatures: {
        hash: HashAlgorithms;
        signature: SignatureAlgorithms;
    }[];
    authorities: number[];
    msgType: HandshakeType;
    messageSeq?: number;
    static readonly spec: {
        certificateTypes: any;
        signatures: any;
        authorities: any;
    };
    constructor(certificateTypes: number[], signatures: {
        hash: HashAlgorithms;
        signature: SignatureAlgorithms;
    }[], authorities: number[]);
    static createEmpty(): ServerCertificateRequest;
    static deSerialize(buf: Buffer): ServerCertificateRequest;
    serialize(): Buffer<ArrayBuffer>;
    toFragment(): FragmentedHandshake;
}
