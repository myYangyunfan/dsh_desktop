import type { RtcpHeader } from "../../rtcp/header";
import type { RtpHeader } from "../../rtp/rtp";
export declare abstract class CipherAesBase {
    srtpSessionKey: Buffer;
    srtpSessionSalt: Buffer;
    srtcpSessionKey: Buffer;
    srtcpSessionSalt: Buffer;
    constructor(srtpSessionKey: Buffer, srtpSessionSalt: Buffer, srtcpSessionKey: Buffer, srtcpSessionSalt: Buffer);
    encryptRtp(header: RtpHeader, payload: Buffer, rolloverCounter: number): Buffer;
    decryptRtp(cipherText: Buffer, rolloverCounter: number, header?: RtpHeader): [Buffer, RtpHeader];
    encryptRTCP(rawRtcp: Buffer, srtcpIndex: number): Buffer;
    decryptRTCP(encrypted: Buffer): [Buffer, RtcpHeader];
}
