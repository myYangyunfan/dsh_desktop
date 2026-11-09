"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DepacketizeBase = void 0;
const common_1 = require("../../imports/common");
const __1 = require("../..");
const path = `werift-rtp : packages/rtp/src/processor/depacketizer.ts`;
const log = (0, common_1.debug)(path);
class DepacketizeBase {
    constructor(codec, options = {}) {
        Object.defineProperty(this, "codec", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: codec
        });
        Object.defineProperty(this, "options", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: options
        });
        Object.defineProperty(this, "rtpBuffer", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        Object.defineProperty(this, "frameFragmentBuffer", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "lastSeqNum", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "frameBroken", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        Object.defineProperty(this, "keyframeReceived", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        Object.defineProperty(this, "count", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "onNeedKeyFrame", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new common_1.Event()
        });
        Object.defineProperty(this, "internalStats", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: {}
        });
    }
    toJSON() {
        return {
            ...this.internalStats,
            codec: this.codec,
            bufferingLength: this.rtpBuffer.length,
            lastSeqNum: this.lastSeqNum,
            count: this.count,
        };
    }
    processInput(input) {
        const output = [];
        if (!input.rtp) {
            if (input.eol) {
                output.push({ eol: true });
                this.stop();
            }
            return output;
        }
        if (this.options.isFinalPacketInSequence) {
            const isFinal = this.checkFinalPacket(input);
            if (isFinal) {
                try {
                    const { data, isKeyframe, sequence, timestamp, frameFragmentBuffer } = (0, __1.dePacketizeRtpPackets)(this.codec, this.rtpBuffer.map((b) => b.rtp), this.frameFragmentBuffer);
                    this.frameFragmentBuffer = frameFragmentBuffer;
                    if (isKeyframe) {
                        this.keyframeReceived = true;
                    }
                    if (this.options.waitForKeyframe && this.keyframeReceived === false) {
                        this.onNeedKeyFrame.execute();
                        return [];
                    }
                    if (!this.frameBroken && data.length > 0) {
                        const time = this.rtpBuffer.at(-1)?.time ?? 0;
                        output.push({
                            frame: {
                                data,
                                isKeyframe,
                                time,
                                sequence: this.count++,
                                rtpSeq: sequence,
                                timestamp,
                            },
                        });
                        this.internalStats["depacketizer"] = new Date().toISOString();
                    }
                    if (this.frameBroken) {
                        this.frameBroken = false;
                    }
                    this.clearBuffer();
                    return output;
                }
                catch (error) {
                    log("error", error, { input, codec: this.codec });
                    this.clearBuffer();
                }
            }
        }
        else {
            try {
                const { data, isKeyframe, sequence, timestamp, frameFragmentBuffer } = (0, __1.dePacketizeRtpPackets)(this.codec, [input.rtp], this.frameFragmentBuffer);
                this.frameFragmentBuffer = frameFragmentBuffer;
                output.push({
                    frame: {
                        data,
                        isKeyframe,
                        time: input.time,
                        sequence: this.count++,
                        rtpSeq: sequence,
                        timestamp,
                    },
                });
                this.internalStats["depacketizer"] = new Date().toISOString();
                return output;
            }
            catch (error) {
                log("error", error, { input, codec: this.codec });
            }
        }
        return [];
    }
    stop() {
        this.clearBuffer();
        this.onNeedKeyFrame.allUnsubscribe();
    }
    clearBuffer() {
        this.rtpBuffer.forEach((b) => b.rtp.clear());
        this.rtpBuffer = [];
        this.frameFragmentBuffer = undefined;
    }
    checkFinalPacket({ rtp, time }) {
        var _a, _b;
        if (!this.options.isFinalPacketInSequence) {
            throw new Error("isFinalPacketInSequence not exist");
        }
        const { sequenceNumber } = rtp.header;
        if (this.lastSeqNum != undefined) {
            const expect = (0, __1.uint16Add)(this.lastSeqNum, 1);
            if ((0, __1.uint16Gt)(expect, sequenceNumber)) {
                this.internalStats["unExpect"] = {
                    expect,
                    sequenceNumber,
                    codec: this.codec,
                    at: new Date().toISOString(),
                    count: (this.internalStats["unExpect"]?.count ?? 0) + 1,
                };
                return false;
            }
            if ((0, __1.uint16Gt)(sequenceNumber, expect)) {
                (_a = this.internalStats)["packetLost"] ?? (_a["packetLost"] = []);
                if (this.internalStats["packetLost"].length > 10) {
                    this.internalStats["packetLost"].shift();
                }
                this.internalStats["packetLost"].push({
                    expect,
                    sequenceNumber,
                    codec: this.codec,
                    at: new Date().toISOString(),
                });
                (_b = this.internalStats)["packetLostCount"] ?? (_b["packetLostCount"] = 0);
                this.internalStats["packetLostCount"]++;
                this.frameBroken = true;
                this.clearBuffer();
            }
        }
        this.rtpBuffer.push({ rtp, time });
        this.lastSeqNum = sequenceNumber;
        let finalPacket;
        for (const [i, { rtp }] of (0, __1.enumerate)(this.rtpBuffer)) {
            if (this.options.isFinalPacketInSequence(rtp.header)) {
                finalPacket = i;
                break;
            }
        }
        if (finalPacket == undefined) {
            return false;
        }
        return true;
    }
}
exports.DepacketizeBase = DepacketizeBase;
//# sourceMappingURL=depacketizer.js.map