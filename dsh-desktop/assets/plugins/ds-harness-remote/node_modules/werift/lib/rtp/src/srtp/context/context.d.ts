import { createHmac } from "crypto";
import type { CipherAesBase } from "../cipher";
import { type SrtpProfile } from "../const";
/** AES-128-ECB single-block encrypt for SRTP KDF (no padding). */
export declare function aes128EcbEncrypt(key: Buffer, plaintext: Buffer): Buffer;
export declare class Context {
    masterKey: Buffer;
    masterSalt: Buffer;
    profile: SrtpProfile;
    srtpSSRCStates: {
        [ssrc: number]: SrtpSsrcState;
    };
    srtpSessionKey: Buffer;
    srtpSessionSalt: Buffer;
    srtpSessionAuthTag: Buffer;
    srtpSessionAuth: ReturnType<typeof createHmac>;
    srtcpSSRCStates: {
        [ssrc: number]: SrtcpSSRCState;
    };
    srtcpSessionKey: Buffer;
    srtcpSessionSalt: Buffer;
    srtcpSessionAuthTag: Buffer;
    srtcpSessionAuth: ReturnType<typeof createHmac>;
    cipher: CipherAesBase;
    constructor(masterKey: Buffer, masterSalt: Buffer, profile: SrtpProfile);
    generateSessionKey(label: number): Buffer<ArrayBufferLike>;
    generateSessionSalt(label: number): Buffer<ArrayBufferLike>;
    generateSessionAuthTag(label: number): Buffer<ArrayBuffer>;
    getSrtpSsrcState(ssrc: number): SrtpSsrcState;
    getSrtcpSsrcState(ssrc: number): SrtcpSSRCState;
    updateRolloverCount(sequenceNumber: number, s: SrtpSsrcState): void;
    generateSrtpAuthTag(buf: Buffer, roc: number): Buffer<ArrayBuffer>;
    index(ssrc: number): number;
    setIndex(ssrc: number, index: number): void;
}
export interface SrtpSsrcState {
    ssrc: number;
    rolloverCounter: number;
    rolloverHasProcessed?: boolean;
    lastSequenceNumber: number;
}
export type SrtcpSSRCState = {
    srtcpIndex: number;
    ssrc: number;
};
