import type { RtpHeader } from "../rtp/rtp";
import { SrtpContext } from "./context/srtp";
import { type Config, Session } from "./session";
export declare class SrtpSession extends Session<SrtpContext> {
    config: Config;
    constructor(config: Config);
    decrypt: (buf: Buffer) => Buffer<ArrayBufferLike>;
    encrypt(payload: Buffer, header: RtpHeader): Buffer<ArrayBufferLike>;
}
