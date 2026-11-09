"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CumulativeResult = void 0;
const rtp_1 = require("../../imports/rtp");
// refer by mediasoup
class CumulativeResult {
    constructor() {
        Object.defineProperty(this, "numPackets", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        /**byte */
        Object.defineProperty(this, "totalSize", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "firstPacketSentAtMs", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "lastPacketSentAtMs", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "firstPacketReceivedAtMs", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "lastPacketReceivedAtMs", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
    }
    /**
     *
     * @param size byte
     * @param sentAtMs
     * @param receivedAtMs
     */
    addPacket(size, sentAtMs, receivedAtMs) {
        if (this.numPackets === 0) {
            this.firstPacketSentAtMs = sentAtMs;
            this.firstPacketReceivedAtMs = receivedAtMs;
            this.lastPacketSentAtMs = sentAtMs;
            this.lastPacketReceivedAtMs = receivedAtMs;
        }
        else {
            if (sentAtMs < this.firstPacketSentAtMs)
                this.firstPacketSentAtMs = sentAtMs;
            if (receivedAtMs < this.firstPacketReceivedAtMs)
                this.firstPacketReceivedAtMs = receivedAtMs;
            if (sentAtMs > this.lastPacketSentAtMs)
                this.lastPacketSentAtMs = sentAtMs;
            if (receivedAtMs > this.lastPacketReceivedAtMs)
                this.lastPacketReceivedAtMs = receivedAtMs;
        }
        this.numPackets++;
        this.totalSize += size;
    }
    reset() {
        this.numPackets = 0;
        this.totalSize = 0;
        this.firstPacketSentAtMs = 0;
        this.lastPacketSentAtMs = 0;
        this.firstPacketReceivedAtMs = 0;
        this.lastPacketReceivedAtMs = 0;
    }
    get receiveBitrate() {
        const recvIntervalMs = this.lastPacketReceivedAtMs - this.firstPacketReceivedAtMs;
        const bitrate = (this.totalSize / recvIntervalMs) * 8 * 1000;
        return (0, rtp_1.Int)(bitrate);
    }
    get sendBitrate() {
        const sendIntervalMs = this.lastPacketSentAtMs - this.firstPacketSentAtMs;
        const bitrate = (this.totalSize / sendIntervalMs) * 8 * 1000;
        return (0, rtp_1.Int)(bitrate);
    }
}
exports.CumulativeResult = CumulativeResult;
//# sourceMappingURL=cumulativeResult.js.map