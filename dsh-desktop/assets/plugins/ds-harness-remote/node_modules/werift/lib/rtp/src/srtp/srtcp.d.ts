import { SrtcpContext } from "./context/srtcp";
import { type Config, Session } from "./session";
export declare class SrtcpSession extends Session<SrtcpContext> {
    config: Config;
    constructor(config: Config);
    decrypt: (buf: Buffer) => Buffer<ArrayBufferLike>;
    encrypt(rawRtcp: Buffer): Buffer<ArrayBufferLike>;
}
