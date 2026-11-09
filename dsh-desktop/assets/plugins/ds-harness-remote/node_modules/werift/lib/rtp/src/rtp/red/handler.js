"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedHandler = void 0;
const __1 = require("../..");
// 0                   1                    2                   3
// 0 1 2 3 4 5 6 7 8 9 0 1 2 3  4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
// +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
// |F|   block PT  |  timestamp offset         |   block length    |
// +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
// 0 1 2 3 4 5 6 7
// +-+-+-+-+-+-+-+-+
// |0|   Block PT  |
// +-+-+-+-+-+-+-+-+
class RedHandler {
    constructor() {
        Object.defineProperty(this, "size", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 150
        });
        Object.defineProperty(this, "sequenceNumbers", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
    }
    push(red, base) {
        const packets = [];
        red.blocks.forEach(({ blockPT, timestampOffset, block }, i) => {
            const sequenceNumber = (0, __1.uint16Add)(base.header.sequenceNumber, -(red.blocks.length - (i + 1)));
            if (timestampOffset) {
                packets.push(new __1.RtpPacket(new __1.RtpHeader({
                    timestamp: (0, __1.uint32Add)(base.header.timestamp, -timestampOffset),
                    payloadType: blockPT,
                    ssrc: base.header.ssrc,
                    sequenceNumber,
                    marker: true,
                }), block));
            }
            else {
                packets.push(new __1.RtpPacket(new __1.RtpHeader({
                    timestamp: base.header.timestamp,
                    payloadType: blockPT,
                    ssrc: base.header.ssrc,
                    sequenceNumber,
                    marker: true,
                }), block));
            }
        });
        const filtered = packets.filter((p) => {
            // duplicate
            if (this.sequenceNumbers.includes(p.header.sequenceNumber)) {
                return false;
            }
            else {
                // buffer overflow
                if (this.sequenceNumbers.length > this.size) {
                    this.sequenceNumbers.shift();
                }
                this.sequenceNumbers.push(p.header.sequenceNumber);
                return true;
            }
        });
        return filtered;
    }
}
exports.RedHandler = RedHandler;
//# sourceMappingURL=handler.js.map