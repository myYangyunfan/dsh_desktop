import { Event } from "./imports/common";
import type { Address, Transport } from "./imports/common";
import { type SignatureHash } from "./cipher/const";
import { type SessionTypes } from "./cipher/suites/abstract";
import { CipherContext } from "./context/cipher";
import { DtlsContext } from "./context/dtls";
import { SrtpContext } from "./context/srtp";
import { TransportContext } from "./context/transport";
import type { SrtpProfile } from "./imports/rtp";
import { FragmentedHandshake } from "./record/message/fragment";
import type { Extension } from "./typings/domain";
export declare class DtlsSocket {
    options: Options;
    sessionType: SessionTypes;
    readonly onConnect: Event<any[]>;
    readonly onData: Event<[Buffer<ArrayBufferLike>]>;
    readonly onError: Event<[Error]>;
    readonly onClose: Event<any[]>;
    readonly transport: TransportContext;
    cipher: CipherContext;
    dtls: DtlsContext;
    srtp: SrtpContext;
    connected: boolean;
    extensions: Extension[];
    onHandleHandshakes: (assembled: FragmentedHandshake[]) => Promise<void>;
    private bufferFragmentedHandshakes;
    constructor(options: Options, sessionType: SessionTypes);
    renegotiation(): void;
    private udpOnMessage;
    private setupExtensions;
    protected waitForReady: (condition: () => boolean) => Promise<void>;
    handleFragmentHandshake(messages: FragmentedHandshake[]): FragmentedHandshake[];
    /**send application data */
    send: (buf: Buffer, addr?: Address) => Promise<void>;
    close(): void;
    extractSessionKeys(keyLength: number, saltLength: number): {
        localKey: any;
        localSalt: any;
        remoteKey: any;
        remoteSalt: any;
    };
    exportKeyingMaterial(label: string, length: number): Buffer<ArrayBuffer>;
    get remoteCertificate(): Buffer<ArrayBufferLike> | undefined;
}
export interface Options {
    transport: Transport;
    srtpProfiles?: SrtpProfile[];
    cert?: string;
    key?: string;
    signatureHash?: SignatureHash;
    certificateRequest?: boolean;
    extendedMasterSecret?: boolean;
}
