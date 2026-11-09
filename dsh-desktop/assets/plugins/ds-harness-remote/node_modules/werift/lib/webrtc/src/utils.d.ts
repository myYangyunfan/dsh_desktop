import { type Address } from "./imports/common";
import { type MediaDirection } from "./media/rtpTransceiver";
import { MediaStreamTrack } from "./media/track";
import type { RTCIceServer } from "./peerConnection";
export declare function fingerprint(file: Buffer, hashName: string): any;
export declare function normalizeFingerprintAlgorithm(algorithm: string): string;
export declare function normalizeFingerprintValue(value: string): string;
export declare function isDtls(buf: Buffer): boolean;
export declare function reverseSimulcastDirection(dir: "recv" | "send"): "send" | "recv";
export declare const andDirection: (a: MediaDirection, b: MediaDirection) => "inactive" | "sendonly" | "recvonly" | "sendrecv";
export declare function reverseDirection(dir: MediaDirection): MediaDirection;
export declare const milliTime: () => number;
export declare const microTime: () => bigint;
export declare const timestampSeconds: () => number;
/**https://datatracker.ietf.org/doc/html/rfc3550#section-4 */
export declare const ntpTime: () => bigint;
export declare const ntpTimeToEpochMs: (ntp: bigint) => any;
/**
 * https://datatracker.ietf.org/doc/html/rfc3550#section-4
 * @param ntp
 * @returns 32bit
 */
export declare const compactNtp: (ntp: bigint) => number;
export declare function parseIceServers(iceServers: RTCIceServer[]): {
    stunServer?: Address;
    turnServer?: Address;
    turnUsername?: string;
    turnPassword?: string;
    turnTransport?: "udp" | "tcp" | "tls";
};
export declare function resolveTurnTransport({ configuredTurnTransport, forceTurnTCP, parsedTurnTransport, }: {
    parsedTurnTransport?: "udp" | "tcp" | "tls";
    configuredTurnTransport?: "udp" | "tcp" | "tls";
    forceTurnTCP: boolean;
}): "tcp" | "tls" | "udp" | undefined;
/**
 *
 * @param signatureHash
 * @param namedCurveAlgorithm necessary when use ecdsa
 */
export declare const createSelfSignedCertificate: (signatureHash: import("./imports/dtls").SignatureHash, namedCurveAlgorithm?: import("./imports/dtls").NamedCurveAlgorithms) => Promise<{
    certPem: string;
    keyPem: string;
    signatureHash: import("./imports/dtls").SignatureHash;
}>;
export declare class MediaStreamTrackFactory {
    static rtpSource({ port, kind, cb, }: {
        port?: number;
        kind: "audio" | "video";
        cb?: (buf: Buffer) => Buffer;
    }): Promise<readonly [MediaStreamTrack, number, () => void]>;
}
/**
 * Merge two objects. If a property value in the source object is undefined or
 * when casted is equal to undefined (== undefined), then it will not overwrite
 * the value of the property in the destination object.
 */
export declare const deepMerge: <T>(dst: T, src: T) => T;
