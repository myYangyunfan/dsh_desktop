import type { RtcpHeader } from "../../rtcp/header";
import type { SrtpProfile } from "../const";
import { Context } from "./context";
export declare class SrtcpContext extends Context {
    constructor(masterKey: Buffer, masterSalt: Buffer, profile: SrtpProfile);
    encryptRTCP(rawRtcp: Buffer): Buffer<ArrayBufferLike>;
    decryptRTCP(encrypted: Buffer): [Buffer, RtcpHeader];
}
