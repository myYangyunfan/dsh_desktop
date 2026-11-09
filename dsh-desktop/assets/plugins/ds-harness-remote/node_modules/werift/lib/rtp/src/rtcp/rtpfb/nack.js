"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GenericNack = void 0;
const src_1 = require("../../../../common/src");
const header_1 = require("../header");
const const_1 = require("./const");
// 0                   1                   2                   3
// 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
// +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
// |            PID                |             BLP               |
// +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
// Packet ID (PID)
// bitmask of following lost packets (BLP):
class GenericNack {
    toJSON() {
        return {
            lost: this.lost,
            senderSsrc: this.senderSsrc,
            mediaSourceSsrc: this.mediaSourceSsrc,
        };
    }
    constructor(props = {}) {
        Object.defineProperty(this, "count", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: GenericNack.count
        });
        Object.defineProperty(this, "header", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "senderSsrc", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "mediaSourceSsrc", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "lost", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        Object.assign(this, props);
        if (!this.header) {
            this.header = new header_1.RtcpHeader({
                type: const_1.RtcpTransportLayerFeedbackType,
                count: this.count,
                version: 2,
            });
        }
    }
    static deSerialize(data, header) {
        const [senderSsrc, mediaSourceSsrc] = (0, src_1.bufferReader)(data, [4, 4]);
        const lost = [];
        for (let pos = 8; pos < data.length; pos += 4) {
            const [pid, blp] = (0, src_1.bufferReader)(data.subarray(pos), [2, 2]);
            lost.push(pid);
            for (let diff = 0; diff < 16; diff++) {
                if ((blp >> diff) & 1) {
                    lost.push(pid + diff + 1);
                }
            }
        }
        return new GenericNack({
            header,
            senderSsrc,
            mediaSourceSsrc,
            lost,
        });
    }
    serialize() {
        const ssrcPair = (0, src_1.bufferWriter)([4, 4], [this.senderSsrc, this.mediaSourceSsrc]);
        const fci = [];
        if (this.lost.length > 0) {
            let headPid = this.lost[0], blp = 0;
            this.lost.slice(1).forEach((pid) => {
                const diff = pid - headPid - 1;
                if (diff >= 0 && diff < 16) {
                    blp |= 1 << diff;
                }
                else {
                    fci.push((0, src_1.bufferWriter)([2, 2], [headPid, blp]));
                    headPid = pid;
                    blp = 0;
                }
            });
            fci.push((0, src_1.bufferWriter)([2, 2], [headPid, blp]));
        }
        const buf = Buffer.concat([ssrcPair, Buffer.concat(fci)]);
        this.header.length = buf.length / 4;
        return Buffer.concat([this.header.serialize(), buf]);
    }
}
exports.GenericNack = GenericNack;
Object.defineProperty(GenericNack, "count", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: 1
});
//# sourceMappingURL=nack.js.map