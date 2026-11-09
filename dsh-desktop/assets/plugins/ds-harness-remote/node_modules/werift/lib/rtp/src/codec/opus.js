"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpusRtpPayload = void 0;
const src_1 = require("../../../common/src");
class OpusRtpPayload {
    constructor() {
        Object.defineProperty(this, "payload", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
    }
    static deSerialize(buf) {
        const opus = new OpusRtpPayload();
        opus.payload = buf;
        return opus;
    }
    static isDetectedFinalPacketInSequence(header) {
        return true;
    }
    get isKeyframe() {
        return true;
    }
    static createCodecPrivate(samplingFrequency = 48000) {
        return Buffer.concat([
            Buffer.from("OpusHead"),
            (0, src_1.bufferWriter)([1, 1], [1, 2]),
            (0, src_1.bufferWriterLE)([2, 4, 2, 1], [312, samplingFrequency, 0, 0]),
        ]);
    }
}
exports.OpusRtpPayload = OpusRtpPayload;
//# sourceMappingURL=opus.js.map