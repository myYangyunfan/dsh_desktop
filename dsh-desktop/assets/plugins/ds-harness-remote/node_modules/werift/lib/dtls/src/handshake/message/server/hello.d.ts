import type { CipherSuites } from "../../../cipher/const";
import { FragmentedHandshake } from "../../../record/message/fragment";
import type { Extension, Handshake, Random, Version } from "../../../typings/domain";
import { HandshakeType } from "../../const";
export declare class ServerHello implements Handshake {
    serverVersion: Version;
    random: Random;
    sessionId: Buffer;
    cipherSuite: CipherSuites;
    compressionMethod: number;
    extensions: Extension[];
    msgType: HandshakeType;
    messageSeq?: number;
    static readonly spec: {
        serverVersion: {
            major: number;
            minor: number;
        };
        random: {
            gmt_unix_time: number;
            random_bytes: any;
        };
        sessionId: any;
        cipherSuite: number;
        compressionMethod: number;
    };
    constructor(serverVersion: Version, random: Random, sessionId: Buffer, cipherSuite: CipherSuites, compressionMethod: number, extensions: Extension[]);
    static createEmpty(): ServerHello;
    static deSerialize(buf: Buffer): ServerHello;
    serialize(): Buffer<ArrayBuffer>;
    toFragment(): FragmentedHandshake;
}
