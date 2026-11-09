import { FragmentedHandshake } from "../../../record/message/fragment";
import type { Handshake } from "../../../typings/domain";
import { HandshakeType } from "../../const";
export declare class ServerHelloVerifyRequest implements Handshake {
    serverVersion: {
        major: number;
        minor: number;
    };
    cookie: Buffer;
    msgType: HandshakeType;
    messageSeq?: number;
    static readonly spec: {
        serverVersion: {
            major: number;
            minor: number;
        };
        cookie: any;
    };
    constructor(serverVersion: {
        major: number;
        minor: number;
    }, cookie: Buffer);
    static createEmpty(): ServerHelloVerifyRequest;
    static deSerialize(buf: Buffer): ServerHelloVerifyRequest;
    serialize(): Buffer<ArrayBuffer>;
    get version(): {
        major: number;
        minor: number;
    };
    toFragment(): FragmentedHandshake;
}
