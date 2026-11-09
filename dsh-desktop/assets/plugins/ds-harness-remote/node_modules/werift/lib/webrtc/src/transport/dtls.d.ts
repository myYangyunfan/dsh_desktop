import { Event } from "../imports/common";
import { type DtlsSocket, type SignatureHash } from "../imports/dtls";
import { type RtcpPacket, type RtpHeader, RtpPacket, SrtcpSession, type SrtpProfile, SrtpSession } from "../imports/rtp";
import { type RTCStats } from "../media/stats";
import type { DebugConfig } from "../peerConnection";
import type { RTCIceTransport } from "./ice";
export interface DtlsTransportStats {
    bytesSent: number;
    bytesReceived: number;
    packetsSent: number;
    packetsReceived: number;
}
export declare class RTCDtlsTransport implements DtlsTransportStats {
    readonly config: {
        debug?: DebugConfig;
    };
    readonly iceTransport: RTCIceTransport;
    localCertificate?: RTCCertificate | undefined;
    private readonly srtpProfiles;
    id: string;
    state: DtlsState;
    role: DtlsRole;
    srtpStarted: boolean;
    transportSequenceNumber: number;
    bytesSent: number;
    bytesReceived: number;
    packetsSent: number;
    packetsReceived: number;
    dataReceiver: (buf: Buffer) => void;
    dtls?: DtlsSocket;
    srtp: SrtpSession;
    srtcp: SrtcpSession;
    readonly onStateChange: Event<["closed" | "new" | "connected" | "failed" | "connecting"]>;
    readonly onRtcp: Event<[RtcpPacket]>;
    readonly onRtp: Event<[RtpPacket]>;
    private readonly events;
    onstatechange?: () => void;
    static localCertificate?: RTCCertificate;
    static localCertificatePromise?: Promise<RTCCertificate>;
    private remoteParameters?;
    constructor(config: {
        debug?: DebugConfig;
    }, iceTransport: RTCIceTransport, localCertificate?: RTCCertificate | undefined, srtpProfiles?: SrtpProfile[]);
    addEventListener: (type: string, listener: (...args: any[]) => void, options?: boolean | {
        once?: boolean;
    }) => void;
    removeEventListener: (type: string, listener: (...args: any[]) => void) => void;
    dispatchEvent: (event: globalThis.Event) => boolean;
    get localParameters(): RTCDtlsParameters;
    static SetupCertificate(): Promise<RTCCertificate>;
    setRemoteParams(remoteParameters: RTCDtlsParameters): void;
    start(): Promise<void>;
    private verifyRemoteCertificateFingerprint;
    updateSrtpSession(): void;
    startSrtp(): void;
    readonly sendData: (data: Buffer) => Promise<void>;
    sendRtp(payload: Buffer, header: RtpHeader): Promise<number>;
    sendRtcp(packets: RtcpPacket[]): Promise<number | undefined>;
    private setState;
    stop(): Promise<void>;
    getStats(timestamp?: number): Promise<RTCStats[]>;
}
export declare const DtlsStates: readonly ["new", "connecting", "connected", "closed", "failed"];
export type DtlsState = (typeof DtlsStates)[number];
export type DtlsRole = "auto" | "server" | "client";
export declare class RTCCertificate {
    certPem: string;
    signatureHash: SignatureHash;
    publicKey: string;
    privateKey: string;
    constructor(privateKeyPem: string, certPem: string, signatureHash: SignatureHash);
    getFingerprints(): RTCDtlsFingerprint[];
}
export type DtlsKeys = {
    certPem: string;
    keyPem: string;
    signatureHash: SignatureHash;
};
export declare class RTCDtlsFingerprint {
    algorithm: string;
    value: string;
    constructor(algorithm: string, value: string);
}
export declare class RTCDtlsParameters {
    fingerprints: RTCDtlsFingerprint[];
    role: "auto" | "client" | "server";
    constructor(fingerprints: RTCDtlsFingerprint[] | undefined, role: "auto" | "client" | "server");
}
