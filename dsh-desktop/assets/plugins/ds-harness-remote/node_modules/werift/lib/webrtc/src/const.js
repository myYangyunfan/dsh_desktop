"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SignatureAlgorithm = exports.ReceiverDirection = exports.SenderDirections = exports.SRTP_PROFILE = exports.SSRC_INFO_ATTRS = exports.FMTP_INT_PARAMETERS = exports.DTLS_SETUP_ROLE = exports.DTLS_ROLE_SETUP = exports.DIRECTIONS = exports.MEDIA_KINDS = exports.DISCARD_PORT = exports.DISCARD_HOST = exports.WEBRTC_BINARY_EMPTY = exports.WEBRTC_STRING_EMPTY = exports.WEBRTC_BINARY = exports.WEBRTC_STRING = exports.WEBRTC_DCEP = exports.DATA_CHANNEL_PARTIAL_RELIABLE_TIMED_UNORDERED = exports.DATA_CHANNEL_PARTIAL_RELIABLE_REXMIT_UNORDERED = exports.DATA_CHANNEL_RELIABLE_UNORDERED = exports.DATA_CHANNEL_PARTIAL_RELIABLE_TIMED = exports.DATA_CHANNEL_PARTIAL_RELIABLE_REXMIT = exports.DATA_CHANNEL_RELIABLE = exports.DATA_CHANNEL_OPEN = exports.DATA_CHANNEL_ACK = void 0;
const dtls_1 = require("./imports/dtls");
Object.defineProperty(exports, "SignatureAlgorithm", { enumerable: true, get: function () { return dtls_1.SignatureAlgorithm; } });
const rtp_1 = require("./imports/rtp");
// data channel export constants
exports.DATA_CHANNEL_ACK = 2;
exports.DATA_CHANNEL_OPEN = 3;
// 5.1.  DATA_CHANNEL_OPEN Message
exports.DATA_CHANNEL_RELIABLE = 0x00;
exports.DATA_CHANNEL_PARTIAL_RELIABLE_REXMIT = 0x01;
exports.DATA_CHANNEL_PARTIAL_RELIABLE_TIMED = 0x02;
exports.DATA_CHANNEL_RELIABLE_UNORDERED = 0x80;
exports.DATA_CHANNEL_PARTIAL_RELIABLE_REXMIT_UNORDERED = 0x81;
exports.DATA_CHANNEL_PARTIAL_RELIABLE_TIMED_UNORDERED = 0x82;
exports.WEBRTC_DCEP = 50;
exports.WEBRTC_STRING = 51;
exports.WEBRTC_BINARY = 53;
exports.WEBRTC_STRING_EMPTY = 56;
exports.WEBRTC_BINARY_EMPTY = 57;
exports.DISCARD_HOST = "0.0.0.0";
exports.DISCARD_PORT = 9;
exports.MEDIA_KINDS = ["audio", "video"];
exports.DIRECTIONS = ["inactive", "sendonly", "recvonly", "sendrecv"];
exports.DTLS_ROLE_SETUP = {
    auto: "actpass",
    client: "active",
    server: "passive",
};
exports.DTLS_SETUP_ROLE = Object.keys(exports.DTLS_ROLE_SETUP).reduce((acc, cur) => {
    const key = exports.DTLS_ROLE_SETUP[cur];
    acc[key] = cur;
    return acc;
}, {});
exports.FMTP_INT_PARAMETERS = [
    "apt",
    "max-fr",
    "max-fs",
    "maxplaybackrate",
    "minptime",
    "stereo",
    "useinbandfec",
];
exports.SSRC_INFO_ATTRS = ["cname", "msid", "mslabel", "label"];
exports.SRTP_PROFILE = {
    SRTP_AES128_CM_HMAC_SHA1_80: rtp_1.ProtectionProfileAes128CmHmacSha1_80,
    SRTP_AEAD_AES_128_GCM: rtp_1.ProtectionProfileAeadAes128Gcm,
};
exports.SenderDirections = ["sendonly", "sendrecv"];
exports.ReceiverDirection = ["sendrecv", "recvonly"];
//# sourceMappingURL=const.js.map