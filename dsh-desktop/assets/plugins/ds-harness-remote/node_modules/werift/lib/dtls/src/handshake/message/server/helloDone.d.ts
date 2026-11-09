import { FragmentedHandshake } from "../../../record/message/fragment";
import type { Handshake } from "../../../typings/domain";
import { HandshakeType } from "../../const";
export declare class ServerHelloDone implements Handshake {
    msgType: HandshakeType;
    messageSeq?: number;
    static readonly spec: {};
    static createEmpty(): ServerHelloDone;
    static deSerialize(buf: Buffer): ServerHelloDone;
    serialize(): Buffer<ArrayBuffer>;
    toFragment(): FragmentedHandshake;
}
