export declare const SignatureAlgorithm: {
    readonly rsa_1: 1;
    readonly ecdsa_3: 3;
};
export type SignatureAlgorithms = (typeof SignatureAlgorithm)[keyof typeof SignatureAlgorithm];
export declare const HashAlgorithm: {
    readonly sha256_4: 4;
};
export type HashAlgorithms = (typeof HashAlgorithm)[keyof typeof HashAlgorithm];
export type SignatureHash = {
    hash: HashAlgorithms;
    signature: SignatureAlgorithms;
};
export declare const CipherSuite: {
    readonly TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256_49195: 49195;
    readonly TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256_49199: 49199;
};
export type CipherSuites = (typeof CipherSuite)[keyof typeof CipherSuite];
export declare const CipherSuiteList: CipherSuites[];
export declare const NamedCurveAlgorithm: {
    readonly x25519_29: 29;
    readonly secp256r1_23: 23;
};
export type NamedCurveAlgorithms = (typeof NamedCurveAlgorithm)[keyof typeof NamedCurveAlgorithm];
export declare const NamedCurveAlgorithmList: NamedCurveAlgorithms[];
export declare const CurveType: {
    readonly named_curve_3: 3;
};
export type CurveTypes = (typeof CurveType)[keyof typeof CurveType];
export declare const SignatureScheme: {
    readonly rsa_pkcs1_sha256: 1025;
    readonly ecdsa_secp256r1_sha256: 1027;
};
export type SignatureSchemes = (typeof SignatureScheme)[keyof typeof SignatureScheme];
export declare const certificateTypes: number[];
export declare const signatures: ({
    hash: 4;
    signature: 1;
} | {
    hash: 4;
    signature: 3;
})[];
