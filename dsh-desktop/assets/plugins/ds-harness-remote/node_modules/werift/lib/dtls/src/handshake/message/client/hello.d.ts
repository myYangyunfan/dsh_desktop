import { FragmentedHandshake } from "../../../record/message/fragment";
import type { Extension } from "../../../typings/domain";
import { HandshakeType } from "../../const";
export declare class ClientHello {
    clientVersion: {
        major: number;
        minor: number;
    };
    random: {
        gmt_unix_time: number;
        random_bytes: Buffer;
    };
    sessionId: Buffer;
    cookie: Buffer;
    cipherSuites: number[];
    compressionMethods: number[];
    extensions: Extension[];
    msgType: HandshakeType;
    messageSeq: number;
    static readonly spec: {
        clientVersion: {
            major: number;
            minor: number;
        };
        random: {
            gmt_unix_time: number;
            random_bytes: any;
        };
        sessionId: any;
        cookie: any;
        cipherSuites: any;
        compressionMethods: any;
        extensions: any;
    };
    constructor(clientVersion: {
        major: number;
        minor: number;
    }, random: {
        gmt_unix_time: number;
        random_bytes: Buffer;
    }, sessionId: Buffer, cookie: Buffer, cipherSuites: number[], compressionMethods: number[], extensions: Extension[]);
    static createEmpty(): ClientHello;
    static deSerialize(buf: Buffer): ClientHello;
    serialize(): Buffer<ArrayBuffer>;
    toFragment(): FragmentedHandshake;
}
