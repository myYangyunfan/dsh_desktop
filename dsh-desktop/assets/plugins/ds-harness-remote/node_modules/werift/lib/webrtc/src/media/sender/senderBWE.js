"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SenderBandwidthEstimator = void 0;
const common_1 = require("../../imports/common");
const rtp_1 = require("../../imports/rtp");
const utils_1 = require("../../utils");
const cumulativeResult_1 = require("./cumulativeResult");
const COUNTER_MAX = 20;
const SCORE_MAX = 10;
class SenderBandwidthEstimator {
    /**1~10 big is worth*/
    get congestionScore() {
        return this._congestionScore;
    }
    set congestionScore(v) {
        this._congestionScore = v;
        this.onCongestionScore.execute(v);
    }
    get availableBitrate() {
        return this._availableBitrate;
    }
    set availableBitrate(v) {
        this._availableBitrate = v;
        this.onAvailableBitrate.execute(v);
    }
    constructor() {
        Object.defineProperty(this, "congestion", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        Object.defineProperty(this, "onAvailableBitrate", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new common_1.Event()
        });
        /**congestion occur or not */
        Object.defineProperty(this, "onCongestion", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new common_1.Event()
        });
        Object.defineProperty(this, "onCongestionScore", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new common_1.Event()
        });
        Object.defineProperty(this, "congestionCounter", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "cumulativeResult", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new cumulativeResult_1.CumulativeResult()
        });
        Object.defineProperty(this, "sentInfos", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: {}
        });
        Object.defineProperty(this, "_congestionScore", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 1
        });
        Object.defineProperty(this, "_availableBitrate", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
    }
    receiveTWCC(feedback) {
        const nowMs = (0, utils_1.milliTime)();
        const elapsedMs = nowMs - this.cumulativeResult.firstPacketSentAtMs;
        if (elapsedMs > 1000) {
            this.cumulativeResult.reset();
            // Congestion may be occurring.
            if (this.congestionCounter < COUNTER_MAX) {
                this.congestionCounter++;
            }
            else if (this.congestionScore < SCORE_MAX) {
                this.congestionScore++;
            }
            if (this.congestionCounter >= COUNTER_MAX && !this.congestion) {
                this.congestion = true;
                this.onCongestion.execute(this.congestion);
            }
        }
        for (const result of feedback.packetResults) {
            if (!result.received)
                continue;
            const wideSeq = result.sequenceNumber;
            const info = this.sentInfos[wideSeq];
            if (!info)
                continue;
            if (!result.receivedAtMs)
                continue;
            this.cumulativeResult.addPacket(info.size, info.sendingAtMs, result.receivedAtMs);
        }
        if (elapsedMs >= 100 && this.cumulativeResult.numPackets >= 20) {
            this.availableBitrate = Math.min(this.cumulativeResult.sendBitrate, this.cumulativeResult.receiveBitrate);
            this.cumulativeResult.reset();
            if (this.congestionCounter > -COUNTER_MAX) {
                const maxBonus = (0, rtp_1.Int)(COUNTER_MAX / 2) + 1;
                const minBonus = (0, rtp_1.Int)(COUNTER_MAX / 4) + 1;
                const bonus = maxBonus - ((maxBonus - minBonus) / 10) * this.congestionScore;
                this.congestionCounter = this.congestionCounter - bonus;
            }
            if (this.congestionCounter <= -COUNTER_MAX) {
                if (this.congestionScore > 1) {
                    this.congestionScore--;
                    this.onCongestion.execute(false);
                }
                this.congestionCounter = 0;
            }
            if (this.congestionCounter <= 0 && this.congestion) {
                this.congestion = false;
                this.onCongestion.execute(this.congestion);
            }
        }
    }
    rtpPacketSent(sentInfo) {
        Object.keys(sentInfo)
            .map((v) => Number(v))
            .sort()
            .filter((seq) => seq < sentInfo.wideSeq)
            .forEach((seq) => {
            delete this.sentInfos[seq];
        });
        this.sentInfos[sentInfo.wideSeq] = sentInfo;
    }
}
exports.SenderBandwidthEstimator = SenderBandwidthEstimator;
//# sourceMappingURL=senderBWE.js.map