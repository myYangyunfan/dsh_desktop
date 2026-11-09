"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NackHandlerBase = void 0;
const common_1 = require("../../imports/common");
const __1 = require("../..");
const log = (0, common_1.debug)("werift-rtp : packages/rtp/src/processor/nack.ts");
const LOST_SIZE = 30 * 5;
class NackHandlerBase {
    constructor(senderSsrc, onNack) {
        Object.defineProperty(this, "senderSsrc", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: senderSsrc
        });
        Object.defineProperty(this, "onNack", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: onNack
        });
        Object.defineProperty(this, "newEstSeqNum", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "_lost", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: {}
        });
        Object.defineProperty(this, "clearNackInterval", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "internalStats", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: {}
        });
        Object.defineProperty(this, "onNackSent", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new common_1.Event()
        });
        Object.defineProperty(this, "onPacketLost", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new common_1.Event()
        });
        Object.defineProperty(this, "mediaSourceSsrc", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "retryCount", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 10
        });
        Object.defineProperty(this, "stopped", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        Object.defineProperty(this, "processInput", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: (input) => {
                if (input.rtp) {
                    this.addPacket(input.rtp);
                    this.internalStats["nackHandler"] = new Date().toISOString();
                    return [input];
                }
                this.stop();
                return [input];
            }
        });
        Object.defineProperty(this, "sendNack", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: () => new Promise((r, f) => {
                if (this.lostSeqNumbers.length > 0 && this.mediaSourceSsrc) {
                    this.internalStats["count"] = (this.internalStats["count"] ?? 0) + 1;
                    const nack = new __1.GenericNack({
                        senderSsrc: this.senderSsrc,
                        mediaSourceSsrc: this.mediaSourceSsrc,
                        lost: this.lostSeqNumbers,
                    });
                    const rtcp = new __1.RtcpTransportLayerFeedback({
                        feedback: nack,
                    });
                    this.onNack(rtcp).then(r).catch(f);
                    this.updateRetryCount();
                    this.onNackSent.execute(nack);
                }
            })
        });
    }
    toJSON() {
        return {
            ...this.internalStats,
            newEstSeqNum: this.newEstSeqNum,
            lostLength: Object.values(this._lost).length,
            senderSsrc: this.senderSsrc,
            mediaSourceSsrc: this.mediaSourceSsrc,
        };
    }
    get lostSeqNumbers() {
        return Object.keys(this._lost).map(Number).sort();
    }
    getLost(seq) {
        return this._lost[seq];
    }
    setLost(seq, count) {
        this._lost[seq] = count;
        if (this.clearNackInterval || this.stopped) {
            return;
        }
        this.clearNackInterval = __1.timer.setInterval(async () => {
            try {
                await this.sendNack();
                if (!Object.keys(this._lost).length) {
                    this.clearNackInterval?.();
                    this.clearNackInterval = undefined;
                }
            }
            catch (error) {
                log("failed to send nack", error);
            }
        }, 5);
    }
    removeLost(sequenceNumber) {
        delete this._lost[sequenceNumber];
    }
    addPacket(packet) {
        const { sequenceNumber, ssrc } = packet.header;
        this.mediaSourceSsrc = ssrc;
        if (this.newEstSeqNum === 0) {
            this.newEstSeqNum = sequenceNumber;
            return;
        }
        if (this.getLost(sequenceNumber)) {
            // log("packetLoss resolved", { sequenceNumber });
            this.removeLost(sequenceNumber);
            return;
        }
        if (sequenceNumber === (0, __1.uint16Add)(this.newEstSeqNum, 1)) {
            this.newEstSeqNum = sequenceNumber;
        }
        else if (sequenceNumber > (0, __1.uint16Add)(this.newEstSeqNum, 1)) {
            // packet lost detected
            for (let seq = (0, __1.uint16Add)(this.newEstSeqNum, 1); seq < sequenceNumber; seq++) {
                this.setLost(seq, 1);
            }
            // this.receiver.sendRtcpPLI(this.mediaSourceSsrc);
            this.newEstSeqNum = sequenceNumber;
            this.pruneLost();
        }
    }
    pruneLost() {
        if (this.lostSeqNumbers.length > LOST_SIZE) {
            this._lost = Object.entries(this._lost)
                .slice(-LOST_SIZE)
                .reduce((acc, [key, v]) => {
                acc[key] = v;
                return acc;
            }, {});
        }
    }
    stop() {
        this.stopped = true;
        this._lost = {};
        this.clearNackInterval?.();
        this.onNackSent.allUnsubscribe();
        this.onPacketLost.allUnsubscribe();
        this.onNack = undefined;
    }
    updateRetryCount() {
        this.lostSeqNumbers.forEach((seq) => {
            const count = this._lost[seq]++;
            if (count > this.retryCount) {
                this.removeLost(seq);
                this.onPacketLost.execute(seq);
            }
        });
    }
}
exports.NackHandlerBase = NackHandlerBase;
//# sourceMappingURL=nack.js.map