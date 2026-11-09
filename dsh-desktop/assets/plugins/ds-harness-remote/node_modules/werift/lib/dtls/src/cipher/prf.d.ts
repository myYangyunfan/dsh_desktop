import { type NamedCurveAlgorithms } from "./const";
export declare function prfPreMasterSecret(publicKey: Buffer, privateKey: Buffer, curve: NamedCurveAlgorithms): Buffer<ArrayBufferLike>;
export declare function hmac(algorithm: string, secret: Buffer, data: Buffer): Buffer<ArrayBufferLike>;
export declare function prfPHash(secret: Buffer, seed: Buffer, requestedLegth: number, algorithm?: string): Buffer<ArrayBuffer>;
export declare function prfMasterSecret(preMasterSecret: Buffer, clientRandom: Buffer, serverRandom: Buffer): Buffer<ArrayBuffer>;
export declare function prfExtendedMasterSecret(preMasterSecret: Buffer, handshakes: Buffer): Buffer<ArrayBuffer>;
export declare function exportKeyingMaterial(label: string, length: number, masterSecret: Buffer, localRandom: Buffer, remoteRandom: Buffer, isClient: boolean): Buffer<ArrayBuffer>;
export declare function hash(algorithm: string, data: Buffer): Buffer<ArrayBufferLike>;
export declare function prfVerifyData(masterSecret: Buffer, handshakes: Buffer, label: string, size?: number): Buffer<ArrayBuffer>;
export declare function prfVerifyDataClient(masterSecret: Buffer, handshakes: Buffer): Buffer<ArrayBuffer>;
export declare function prfVerifyDataServer(masterSecret: Buffer, handshakes: Buffer): Buffer<ArrayBuffer>;
export declare function prfEncryptionKeys(masterSecret: Buffer, clientRandom: Buffer, serverRandom: Buffer, prfKeyLen: number, prfIvLen: number, prfNonceLen: number, algorithm?: string): {
    clientWriteKey: any;
    serverWriteKey: any;
    clientNonce: Buffer<ArrayBuffer>;
    serverNonce: Buffer<ArrayBuffer>;
};
