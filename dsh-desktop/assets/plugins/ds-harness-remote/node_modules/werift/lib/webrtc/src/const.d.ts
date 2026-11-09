import { type HashAlgorithms, SignatureAlgorithm } from "./imports/dtls";
import type { DtlsRole } from "./transport/dtls";
export declare const DATA_CHANNEL_ACK = 2;
export declare const DATA_CHANNEL_OPEN = 3;
export declare const DATA_CHANNEL_RELIABLE = 0;
export declare const DATA_CHANNEL_PARTIAL_RELIABLE_REXMIT = 1;
export declare const DATA_CHANNEL_PARTIAL_RELIABLE_TIMED = 2;
export declare const DATA_CHANNEL_RELIABLE_UNORDERED = 128;
export declare const DATA_CHANNEL_PARTIAL_RELIABLE_REXMIT_UNORDERED = 129;
export declare const DATA_CHANNEL_PARTIAL_RELIABLE_TIMED_UNORDERED = 130;
export declare const WEBRTC_DCEP = 50;
export declare const WEBRTC_STRING = 51;
export declare const WEBRTC_BINARY = 53;
export declare const WEBRTC_STRING_EMPTY = 56;
export declare const WEBRTC_BINARY_EMPTY = 57;
export declare const DISCARD_HOST = "0.0.0.0";
export declare const DISCARD_PORT = 9;
export declare const MEDIA_KINDS: string[];
export declare const DIRECTIONS: string[];
export declare const DTLS_ROLE_SETUP: {
    auto: string;
    client: string;
    server: string;
};
export declare const DTLS_SETUP_ROLE: {
    [key: string]: DtlsRole;
};
export declare const FMTP_INT_PARAMETERS: string[];
export declare const SSRC_INFO_ATTRS: string[];
export declare const SRTP_PROFILE: {
    readonly SRTP_AES128_CM_HMAC_SHA1_80: 1;
    readonly SRTP_AEAD_AES_128_GCM: 7;
};
export declare const SenderDirections: string[];
export declare const ReceiverDirection: string[];
export { type HashAlgorithms, SignatureAlgorithm };
