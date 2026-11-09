"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RtcpPacketConverter = void 0;
exports.isRtcp = isRtcp;
const common_1 = require("../imports/common");
const header_1 = require("./header");
const psfb_1 = require("./psfb");
const rr_1 = require("./rr");
const rtpfb_1 = require("./rtpfb");
const sdes_1 = require("./sdes");
const sr_1 = require("./sr");
const log = (0, common_1.debug)("werift-rtp:packages/rtp/src/rtcp/rtcp.ts");
class RtcpPacketConverter {
    static deSerialize(data) {
        let pos = 0;
        const packets = [];
        while (pos < data.length) {
            const header = header_1.RtcpHeader.deSerialize(data.subarray(pos, pos + header_1.RTCP_HEADER_SIZE));
            pos += header_1.RTCP_HEADER_SIZE;
            let payload = data.subarray(pos);
            pos += header.length * 4;
            if (header.padding) {
                payload = payload.subarray(0, payload.length - payload.subarray(-1)[0]);
            }
            try {
                switch (header.type) {
                    case sr_1.RtcpSrPacket.type:
                        packets.push(sr_1.RtcpSrPacket.deSerialize(payload, header.count));
                        break;
                    case rr_1.RtcpRrPacket.type:
                        packets.push(rr_1.RtcpRrPacket.deSerialize(payload, header.count));
                        break;
                    case sdes_1.RtcpSourceDescriptionPacket.type:
                        packets.push(sdes_1.RtcpSourceDescriptionPacket.deSerialize(payload, header));
                        break;
                    case rtpfb_1.RtcpTransportLayerFeedback.type:
                        packets.push(rtpfb_1.RtcpTransportLayerFeedback.deSerialize(payload, header));
                        break;
                    case psfb_1.RtcpPayloadSpecificFeedback.type:
                        packets.push(psfb_1.RtcpPayloadSpecificFeedback.deSerialize(payload, header));
                        break;
                    default:
                        // log("unknown rtcp packet", header.type);
                        break;
                }
            }
            catch (error) {
                log("deSerialize RTCP", error);
            }
        }
        return packets;
    }
}
exports.RtcpPacketConverter = RtcpPacketConverter;
function isRtcp(buf) {
    return buf.length >= 2 && buf[1] >= 192 && buf[1] <= 208;
}
//# sourceMappingURL=rtcp.js.map