export declare const COOKIE = 554869826;
export declare const FINGERPRINT_LENGTH = 8;
export declare const FINGERPRINT_XOR = 1398035790;
export declare const HEADER_LENGTH = 20;
export declare const INTEGRITY_LENGTH = 24;
export declare const IPV4_PROTOCOL = 1;
export declare const IPV6_PROTOCOL = 2;
export declare const RETRY_MAX = 6;
export declare const RETRY_RTO = 50;
export declare const AttributeKeys: readonly ["FINGERPRINT", "MESSAGE-INTEGRITY", "MESSAGE-INTEGRITY-SHA256", "CHANGE-REQUEST", "PRIORITY", "USERNAME", "USERHASH", "ICE-CONTROLLING", "SOURCE-ADDRESS", "USE-CANDIDATE", "ICE-CONTROLLED", "ERROR-CODE", "UNKNOWN-ATTRIBUTES", "XOR-MAPPED-ADDRESS", "CHANGED-ADDRESS", "LIFETIME", "REQUESTED-TRANSPORT", "NONCE", "REALM", "REQUESTED-ADDRESS-FAMILY", "EVEN-PORT", "PASSWORD-ALGORITHM", "PASSWORD-ALGORITHMS", "XOR-RELAYED-ADDRESS", "RESERVATION-TOKEN", "CHANNEL-NUMBER", "XOR-PEER-ADDRESS", "DATA", "SOFTWARE", "MAPPED-ADDRESS", "ALTERNATE-DOMAIN", "ALTERNATE-SERVER", "RESPONSE-ORIGIN", "OTHER-ADDRESS"];
export declare enum classes {
    REQUEST = 0,
    INDICATION = 16,
    RESPONSE = 256,
    ERROR = 272
}
export declare enum methods {
    BINDING = 1,
    SHARED_SECRET = 2,
    ALLOCATE = 3,
    REFRESH = 4,
    SEND = 6,
    DATA = 7,
    CREATE_PERMISSION = 8,
    CHANNEL_BIND = 9
}
export declare function isComprehensionRequiredAttribute(type: number): boolean;
export declare function isStunMessage(data: Buffer): boolean;
