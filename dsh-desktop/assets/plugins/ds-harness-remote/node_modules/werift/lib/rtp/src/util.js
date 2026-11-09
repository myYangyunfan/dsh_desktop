"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RtpBuilder = void 0;
const src_1 = require("../../common/src");
const rtp_1 = require("./rtp/rtp");
class RtpBuilder {
    constructor(props) {
        Object.defineProperty(this, "props", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: props
        });
        Object.defineProperty(this, "sequenceNumber", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: (0, src_1.random16)()
        });
        Object.defineProperty(this, "timestamp", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: (0, src_1.random32)()
        });
    }
    create(payload) {
        this.sequenceNumber = (0, src_1.uint16Add)(this.sequenceNumber, 1);
        const elapsed = (this.props.between * this.props.clockRate) / 1000;
        this.timestamp = (0, src_1.uint32Add)(this.timestamp, elapsed);
        const header = new rtp_1.RtpHeader({
            sequenceNumber: this.sequenceNumber,
            timestamp: Number(this.timestamp),
            payloadType: 96,
            extension: true,
            marker: false,
            padding: false,
        });
        const rtp = new rtp_1.RtpPacket(header, payload);
        return rtp;
    }
}
exports.RtpBuilder = RtpBuilder;
//# sourceMappingURL=util.js.map