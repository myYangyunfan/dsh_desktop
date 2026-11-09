"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ntpTime2Sec = exports.RtcpSenderInfo = exports.RtcpSrPacket = void 0;
const src_1 = require("../../../common/src");
const header_1 = require("./header");
const rr_1 = require("./rr");
// https://datatracker.ietf.org/doc/html/rfc3550#section-6.4.1
//         0                   1                   2                   3
//         0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
//        +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
// header |V=2|P|    RC   |   PT=SR=200   |             length            |
//        +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
//        |                         SSRC of sender                        |
//        +=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+
// sender |              NTP timestamp, most significant word             |
// info   +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
//        |             NTP timestamp, least significant word             |
//        +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
//        |                         RTP timestamp                         |
//        +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
//        |                     sender's packet count                     |
//        +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
//        |                      sender's octet count                     |
//        +=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+
// report |                 SSRC_1 (SSRC of first source)                 |
// block  +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
//   1    | fraction lost |       cumulative number of packets lost       |
//        +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
//        |           extended highest sequence number received           |
//        +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
//        |                      interarrival jitter                      |
//        +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
//        |                         last SR (LSR)                         |
//        +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
//        |                   delay since last SR (DLSR)                  |
//        +=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+
// report |                 SSRC_2 (SSRC of second source)                |
// block  +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
//   2    :                               ...                             :
//        +=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+
//        |                  profile-specific extensions                  |
//        +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
class RtcpSrPacket {
    constructor(props) {
        Object.defineProperty(this, "ssrc", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "senderInfo", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "reports", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        Object.defineProperty(this, "type", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: RtcpSrPacket.type
        });
        Object.assign(this, props);
    }
    toJSON() {
        return {
            ssrc: this.ssrc,
            senderInfo: this.senderInfo.toJSON(),
            reports: this.reports.map((r) => r.toJSON()),
        };
    }
    serialize() {
        let payload = Buffer.alloc(4);
        payload.writeUInt32BE(this.ssrc);
        payload = Buffer.concat([payload, this.senderInfo.serialize()]);
        payload = Buffer.concat([
            payload,
            ...this.reports.map((report) => report.serialize()),
        ]);
        return header_1.RtcpHeader.serialize(RtcpSrPacket.type, this.reports.length, payload, Math.floor(payload.length / 4));
    }
    static deSerialize(payload, count) {
        const ssrc = payload.readUInt32BE();
        const senderInfo = RtcpSenderInfo.deSerialize(payload.subarray(4, 24));
        let pos = 24;
        const reports = [];
        for (let _ = 0; _ < count; _++) {
            reports.push(rr_1.RtcpReceiverInfo.deSerialize(payload.subarray(pos, pos + 24)));
            pos += 24;
        }
        const packet = new RtcpSrPacket({ ssrc, senderInfo, reports });
        return packet;
    }
}
exports.RtcpSrPacket = RtcpSrPacket;
Object.defineProperty(RtcpSrPacket, "type", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: 200
});
class RtcpSenderInfo {
    constructor(props = {}) {
        Object.defineProperty(this, "ntpTimestamp", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "rtpTimestamp", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "packetCount", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "octetCount", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.assign(this, props);
    }
    toJSON() {
        return {
            ntpTimestamp: (0, exports.ntpTime2Sec)(this.ntpTimestamp),
            rtpTimestamp: this.rtpTimestamp,
        };
    }
    serialize() {
        return (0, src_1.bufferWriter)([8, 4, 4, 4], [this.ntpTimestamp, this.rtpTimestamp, this.packetCount, this.octetCount]);
    }
    static deSerialize(data) {
        const [ntpTimestamp, rtpTimestamp, packetCount, octetCount] = (0, src_1.bufferReader)(data, [8, 4, 4, 4]);
        return new RtcpSenderInfo({
            ntpTimestamp,
            rtpTimestamp,
            packetCount,
            octetCount,
        });
    }
}
exports.RtcpSenderInfo = RtcpSenderInfo;
const ntpTime2Sec = (ntp) => {
    const [ntpSec, ntpMsec] = (0, src_1.bufferReader)((0, src_1.bufferWriter)([8], [ntp]), [4, 4]);
    return Number(`${ntpSec}.${ntpMsec}`);
};
exports.ntpTime2Sec = ntpTime2Sec;
//# sourceMappingURL=sr.js.map