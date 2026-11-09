import { PrivateKey } from "@fidm/x509";
import { type CipherSuites, type NamedCurveAlgorithms, type SignatureHash } from "../cipher/const";
import type { NamedCurveKeyPair } from "../cipher/namedCurve";
import { type SessionTypes } from "../cipher/suites/abstract";
import type AEADCipher from "../cipher/suites/aead";
import type { DtlsRandom } from "../handshake/random";
import type { DtlsPlaintext } from "../record/message/plaintext";
export declare class CipherContext {
    sessionType: SessionTypes;
    certPem?: string | undefined;
    keyPem?: string | undefined;
    localRandom: DtlsRandom;
    remoteRandom: DtlsRandom;
    cipherSuite: CipherSuites;
    remoteCertificate?: Buffer;
    remoteKeyPair: Partial<NamedCurveKeyPair>;
    localKeyPair: NamedCurveKeyPair;
    masterSecret: Buffer;
    cipher: AEADCipher;
    namedCurve: NamedCurveAlgorithms;
    signatureHashAlgorithm?: SignatureHash;
    localCert: Buffer;
    localPrivateKey: PrivateKey;
    constructor(sessionType: SessionTypes, certPem?: string | undefined, keyPem?: string | undefined, signatureHashAlgorithm?: SignatureHash);
    /**
     *
     * @param signatureHash
     * @param namedCurveAlgorithm necessary when use ecdsa
     */
    static createSelfSignedCertificateWithKey: (signatureHash: SignatureHash, namedCurveAlgorithm?: NamedCurveAlgorithms) => Promise<{
        certPem: string;
        keyPem: string;
        signatureHash: SignatureHash;
    }>;
    encryptPacket(pkt: DtlsPlaintext): DtlsPlaintext;
    decryptPacket(pkt: DtlsPlaintext): Buffer<ArrayBufferLike>;
    verifyData(buf: Buffer): Buffer<ArrayBuffer>;
    signatureData(data: Buffer, hash: string): Buffer<ArrayBufferLike>;
    generateKeySignature(hashAlgorithm: string): Buffer<ArrayBufferLike>;
    parseX509(certPem: string, keyPem: string, signatureHash: SignatureHash): void;
    private valueKeySignature;
}
