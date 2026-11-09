import type { RtpHeader } from "../../rtp/rtp";
import type { SrtpProfile } from "../const";
import { Context } from "./context";
export declare class SrtpContext extends Context {
    constructor(masterKey: Buffer, masterSalt: Buffer, profile: SrtpProfile);
    encryptRtp(payload: Buffer, header: RtpHeader): Buffer<ArrayBufferLike>;
    decryptRtp(cipherText: Buffer): [Buffer, RtpHeader];
    private get rtpAuthTagLength();
}
