"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.JitterBufferBase = void 0;
const __1 = require("../..");
class JitterBufferBase {
    get expectNextSeqNum() {
        return (0, __1.uint16Add)(this.presentSeqNum, 1);
    }
    constructor(clockRate, options = {}) {
        Object.defineProperty(this, "clockRate", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: clockRate
        });
        Object.defineProperty(this, "options", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        /**uint16 */
        Object.defineProperty(this, "presentSeqNum", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "rtpBuffer", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: {}
        });
        Object.defineProperty(this, "internalStats", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: {}
        });
        this.options = {
            latency: options.latency ?? 200,
            bufferSize: options.bufferSize ?? 10000,
        };
    }
    toJSON() {
        return {
            ...this.internalStats,
            rtpBufferLength: Object.values(this.rtpBuffer).length,
            presentSeqNum: this.presentSeqNum,
            expectNextSeqNum: this.expectNextSeqNum,
        };
    }
    stop() {
        this.rtpBuffer = {};
    }
    processInput(input) {
        const output = [];
        if (!input.rtp) {
            if (input.eol) {
                const packets = this.sortAndClearBuffer(this.rtpBuffer);
                for (const rtp of packets) {
                    output.push({ rtp });
                }
                output.push({ eol: true });
                this.stop();
            }
            return output;
        }
        const { packets, timeoutSeqNum } = this.processRtp(input.rtp);
        if (timeoutSeqNum != undefined) {
            const isPacketLost = {
                from: this.expectNextSeqNum,
                to: timeoutSeqNum,
            };
            this.presentSeqNum = input.rtp.header.sequenceNumber;
            output.push({ isPacketLost });
            if (packets) {
                for (const rtp of [...packets, input.rtp]) {
                    output.push({ rtp });
                }
            }
            this.internalStats["jitterBuffer"] = new Date().toISOString();
            return output;
        }
        else {
            if (packets) {
                for (const rtp of packets) {
                    output.push({ rtp });
                }
                this.internalStats["jitterBuffer"] = new Date().toISOString();
                return output;
            }
            return [];
        }
    }
    processRtp(rtp) {
        const { sequenceNumber, timestamp } = rtp.header;
        // init
        if (this.presentSeqNum == undefined) {
            this.presentSeqNum = sequenceNumber;
            return { packets: [rtp] };
        }
        // duplicate
        if ((0, __1.uint16Gte)(this.presentSeqNum, sequenceNumber)) {
            this.internalStats["duplicate"] = {
                count: (this.internalStats["duplicate"]?.count ?? 0) + 1,
                sequenceNumber,
                timestamp: new Date().toISOString(),
            };
            return { nothing: undefined };
        }
        // expect
        if (sequenceNumber === this.expectNextSeqNum) {
            this.presentSeqNum = sequenceNumber;
            const rtpBuffer = this.resolveBuffer((0, __1.uint16Add)(sequenceNumber, 1));
            this.presentSeqNum =
                rtpBuffer.at(-1)?.header.sequenceNumber ?? this.presentSeqNum;
            this.disposeTimeoutPackets(timestamp);
            return { packets: [rtp, ...rtpBuffer] };
        }
        this.pushRtpBuffer(rtp);
        const { latestTimeoutSeqNum, sorted } = this.disposeTimeoutPackets(timestamp);
        if (latestTimeoutSeqNum) {
            return { timeoutSeqNum: latestTimeoutSeqNum, packets: sorted };
        }
        else {
            return { nothing: undefined };
        }
    }
    pushRtpBuffer(rtp) {
        if (Object.values(this.rtpBuffer).length > this.options.bufferSize) {
            this.internalStats["buffer_overflow"] = {
                count: (this.internalStats["buffer_overflow"]?.count ?? 0) + 1,
                timestamp: new Date().toISOString(),
            };
            return;
        }
        this.rtpBuffer[rtp.header.sequenceNumber] = rtp;
    }
    resolveBuffer(seqNumFrom) {
        const resolve = [];
        for (let index = seqNumFrom;; index = (0, __1.uint16Add)(index, 1)) {
            const rtp = this.rtpBuffer[index];
            if (rtp) {
                resolve.push(rtp);
                delete this.rtpBuffer[index];
            }
            else {
                break;
            }
        }
        return resolve;
    }
    sortAndClearBuffer(rtpBuffer) {
        const buffer = [];
        for (let index = this.presentSeqNum ?? 0;; index = (0, __1.uint16Add)(index, 1)) {
            const rtp = rtpBuffer[index];
            if (rtp) {
                buffer.push(rtp);
                delete rtpBuffer[index];
            }
            if (Object.values(rtpBuffer).length === 0) {
                break;
            }
        }
        return buffer;
    }
    disposeTimeoutPackets(baseTimestamp) {
        let latestTimeoutSeqNum;
        const packets = Object.values(this.rtpBuffer)
            .map((rtp) => {
            const { timestamp, sequenceNumber } = rtp.header;
            if ((0, __1.uint32Gt)(timestamp, baseTimestamp)) {
                return;
            }
            const elapsedSec = (0, __1.uint32Add)(baseTimestamp, -timestamp) / this.clockRate;
            if (elapsedSec * 1000 > this.options.latency) {
                this.internalStats["timeout_packet"] = {
                    count: (this.internalStats["timeout_packet"]?.count ?? 0) + 1,
                    at: new Date().toISOString(),
                    sequenceNumber,
                    elapsedSec,
                    baseTimestamp,
                    timestamp,
                };
                if (latestTimeoutSeqNum == undefined) {
                    latestTimeoutSeqNum = sequenceNumber;
                }
                // 現在のSeqNumとの差が最も大きいSeqNumを探す
                if ((0, __1.uint16Add)(sequenceNumber, -this.presentSeqNum) >
                    (0, __1.uint16Add)(latestTimeoutSeqNum, -this.presentSeqNum)) {
                    latestTimeoutSeqNum = sequenceNumber;
                }
                const packet = this.rtpBuffer[sequenceNumber];
                delete this.rtpBuffer[sequenceNumber];
                return packet;
            }
        })
            .flatMap((p) => p)
            .filter((p) => p);
        const sorted = this.sortAndClearBuffer(packets.reduce((acc, cur) => {
            acc[cur.header.sequenceNumber] = cur;
            return acc;
        }, {}));
        return { latestTimeoutSeqNum, sorted };
    }
}
exports.JitterBufferBase = JitterBufferBase;
//# sourceMappingURL=jitterBuffer.js.map