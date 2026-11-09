import type { HashAlgorithms, SignatureAlgorithms } from "../cipher/const";
import type { SessionTypes } from "../cipher/suites/abstract";
import type { FragmentedHandshake } from "../record/message/fragment";
import type { Options } from "../socket";
import type { Handshake } from "../typings/domain";
export declare class DtlsContext {
    options: Options;
    sessionType: SessionTypes;
    version: {
        major: number;
        minor: number;
    };
    lastFlight: Handshake[];
    lastMessage: Buffer[];
    recordSequenceNumber: number;
    sequenceNumber: number;
    epoch: number;
    flight: number;
    handshakeCache: {
        [flight: number]: {
            isLocal: boolean;
            data: FragmentedHandshake[];
            flight: number;
        };
    };
    cookie?: Buffer;
    requestedCertificateTypes: number[];
    requestedSignatureAlgorithms: {
        hash: HashAlgorithms;
        signature: SignatureAlgorithms;
    }[];
    remoteExtendedMasterSecret: boolean;
    constructor(options: Options, sessionType: SessionTypes);
    get sessionId(): string;
    get sortedHandshakeCache(): FragmentedHandshake[];
    checkHandshakesExist: (handshakes: number[]) => boolean;
    bufferHandshakeCache(handshakes: FragmentedHandshake[], isLocal: boolean, flight: number): void;
}
