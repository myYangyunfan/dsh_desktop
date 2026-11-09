"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseSrtpRtpHeader = parseSrtpRtpHeader;
exports.parseSrtcpHeader = parseSrtcpHeader;
exports.finalizeSrtpRtpHeader = finalizeSrtpRtpHeader;
const header_1 = require("../rtcp/header");
const rtp_1 = require("../rtp/rtp");
const error_1 = require("./error");
const minRtpHeaderSize = 12;
const minRtcpPacketSize = 8;
function parseSrtpRtpHeader(packet, authTagLength, message = "Failed to authenticate SRTP packet") {
    const authTagOffset = packet.length - authTagLength;
    assertAuthenticatedPacketLength(packet.length >= minRtpHeaderSize + authTagLength, message);
    const header = wrapAuthenticationError(() => rtp_1.RtpHeader.deSerialize(packet.subarray(0, authTagOffset)), message);
    header.paddingSize = 0;
    assertAuthenticatedPacketLength(header.payloadOffset >= minRtpHeaderSize &&
        header.payloadOffset <= authTagOffset, message);
    return header;
}
function parseSrtcpHeader(packet, authTagLength, srtcpIndexSize, message = "Failed to authenticate SRTCP packet") {
    assertAuthenticatedPacketLength(packet.length >= minRtcpPacketSize + authTagLength + srtcpIndexSize, message);
    return wrapAuthenticationError(() => header_1.RtcpHeader.deSerialize(packet.subarray(0, header_1.RTCP_HEADER_SIZE)), message);
}
function assertAuthenticatedPacketLength(condition, message) {
    if (!condition) {
        throw new error_1.SrtpAuthenticationError(message);
    }
}
function wrapAuthenticationError(parse, message) {
    try {
        return parse();
    }
    catch {
        throw new error_1.SrtpAuthenticationError(message);
    }
}
function finalizeSrtpRtpHeader(header, packet, message = "Failed to authenticate SRTP packet") {
    if (!header.padding) {
        header.paddingSize = 0;
        return header;
    }
    assertAuthenticatedPacketLength(packet.length > header.payloadOffset, message);
    const paddingSize = packet[packet.length - 1];
    assertAuthenticatedPacketLength(paddingSize > 0 && paddingSize <= packet.length - header.payloadOffset, message);
    header.paddingSize = paddingSize;
    return header;
}
//# sourceMappingURL=packet.js.map