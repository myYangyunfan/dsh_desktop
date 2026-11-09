"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RtcpTransportLayerFeedback = void 0;
const common_1 = require("../../imports/common");
const const_1 = require("./const");
const nack_1 = require("./nack");
const twcc_1 = require("./twcc");
const log = (0, common_1.debug)("werift-rtp:packages/rtp/rtcp/rtpfb/index");
class RtcpTransportLayerFeedback {
    constructor(props = {}) {
        Object.defineProperty(this, "type", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: RtcpTransportLayerFeedback.type
        });
        Object.defineProperty(this, "feedback", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "header", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.assign(this, props);
    }
    serialize() {
        const payload = this.feedback.serialize();
        return payload;
    }
    static deSerialize(data, header) {
        let feedback;
        switch (header.count) {
            case nack_1.GenericNack.count:
                feedback = nack_1.GenericNack.deSerialize(data, header);
                break;
            case twcc_1.TransportWideCC.count:
                feedback = twcc_1.TransportWideCC.deSerialize(data, header);
                break;
            default:
                log("unknown rtpfb packet", header.count);
                break;
        }
        return new RtcpTransportLayerFeedback({ feedback, header });
    }
}
exports.RtcpTransportLayerFeedback = RtcpTransportLayerFeedback;
Object.defineProperty(RtcpTransportLayerFeedback, "type", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: const_1.RtcpTransportLayerFeedbackType
});
//# sourceMappingURL=index.js.map