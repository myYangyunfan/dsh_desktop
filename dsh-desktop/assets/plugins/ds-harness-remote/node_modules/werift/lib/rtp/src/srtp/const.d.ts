export declare const ProtectionProfileAes128CmHmacSha1_80: 1;
export declare const ProtectionProfileAeadAes128Gcm: 7;
export declare const Profiles: readonly [1, 7];
export type SrtpProfile = (typeof Profiles)[number];
export declare const keyLength: (profile: SrtpProfile) => number;
export declare const saltLength: (profile: SrtpProfile) => 12 | 14;
