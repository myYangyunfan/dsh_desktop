"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReceiverEstimatedMaxBitrate = void 0;
const src_1 = require("../../../../common/src");
class ReceiverEstimatedMaxBitrate {
    constructor(props = {}) {
        Object.defineProperty(this, "length", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "count", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: ReceiverEstimatedMaxBitrate.count
        });
        Object.defineProperty(this, "senderSsrc", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "mediaSsrc", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "uniqueID", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: "REMB"
        });
        Object.defineProperty(this, "ssrcNum", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "brExp", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "brMantissa", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "bitrate", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "ssrcFeedbacks", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        Object.assign(this, props);
    }
    static deSerialize(data) {
        const [senderSsrc, mediaSsrc, uniqueID, ssrcNum, e_m] = (0, src_1.bufferReader)(data, [4, 4, 4, 1, 1]);
        const brExp = (0, src_1.getBit)(e_m, 0, 6);
        const brMantissa = ((0, src_1.getBit)(e_m, 6, 2) << 16) + (data[14] << 8) + data[15];
        const bitrate = brExp > 46 ? 18446744073709551615n : BigInt(brMantissa) << BigInt(brExp);
        const ssrcFeedbacks = [];
        for (let i = 16; i < data.length; i += 4) {
            const feedback = data.slice(i).readUIntBE(0, 4);
            ssrcFeedbacks.push(feedback);
        }
        return new ReceiverEstimatedMaxBitrate({
            senderSsrc,
            mediaSsrc,
            uniqueID: (0, src_1.bufferWriter)([4], [uniqueID]).toString(),
            ssrcNum,
            brExp,
            brMantissa,
            ssrcFeedbacks,
            bitrate,
        });
    }
    serialize() {
        const constant = Buffer.concat([
            (0, src_1.bufferWriter)([4, 4], [this.senderSsrc, this.mediaSsrc]),
            Buffer.from(this.uniqueID),
            (0, src_1.bufferWriter)([1], [this.ssrcNum]),
        ]);
        const writer = new src_1.BitWriter(24);
        writer.set(6, 0, this.brExp).set(18, 6, this.brMantissa);
        const feedbacks = Buffer.concat(this.ssrcFeedbacks.map((feedback) => (0, src_1.bufferWriter)([4], [feedback])));
        const buf = Buffer.concat([
            constant,
            (0, src_1.bufferWriter)([3], [writer.value]),
            feedbacks,
        ]);
        this.length = buf.length / 4;
        return buf;
    }
}
exports.ReceiverEstimatedMaxBitrate = ReceiverEstimatedMaxBitrate;
Object.defineProperty(ReceiverEstimatedMaxBitrate, "count", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: 15
});
//# sourceMappingURL=remb.js.map