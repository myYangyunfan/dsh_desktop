"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.unwrapRtx = unwrapRtx;
exports.wrapRtx = wrapRtx;
const rtp_1 = require("./rtp");
function unwrapRtx(rtx, payloadType, ssrc) {
    const packet = new rtp_1.RtpPacket(new rtp_1.RtpHeader({
        payloadType,
        marker: rtx.header.marker,
        sequenceNumber: rtx.payload.readUInt16BE(0),
        timestamp: rtx.header.timestamp,
        ssrc,
    }), rtx.payload.subarray(2));
    return packet;
}
function wrapRtx(packet, payloadType, sequenceNumber, ssrc) {
    const originalSequence = Buffer.allocUnsafe(2);
    originalSequence.writeUInt16BE(packet.header.sequenceNumber, 0);
    const rtx = new rtp_1.RtpPacket(new rtp_1.RtpHeader({
        payloadType,
        marker: packet.header.marker,
        sequenceNumber,
        timestamp: packet.header.timestamp,
        ssrc,
        csrc: packet.header.csrc,
        extensions: packet.header.extensions,
    }), Buffer.concat([originalSequence, packet.payload]));
    return rtx;
}
//# sourceMappingURL=rtx.js.map