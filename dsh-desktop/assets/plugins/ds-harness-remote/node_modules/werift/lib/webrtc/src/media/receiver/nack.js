"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NackHandler = void 0;
const common_1 = require("../../imports/common");
const common_2 = require("../../imports/common");
const rtp_1 = require("../../imports/rtp");
const log = (0, rtp_1.debug)("werift:packages/webrtc/src/media/receiver/nack.ts");
const LOST_SIZE = 30 * 5;
class NackHandler {
    constructor(receiver) {
        Object.defineProperty(this, "receiver", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: receiver
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
        Object.defineProperty(this, "nackLoop", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
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
        Object.defineProperty(this, "closed", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        Object.defineProperty(this, "sendNack", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: () => new Promise((r, f) => {
                if (this.lostSeqNumbers.length > 0 && this.mediaSourceSsrc) {
                    const nack = new rtp_1.GenericNack({
                        senderSsrc: this.receiver.rtcpSsrc,
                        mediaSourceSsrc: this.mediaSourceSsrc,
                        lost: this.lostSeqNumbers,
                    });
                    const rtcp = new rtp_1.RtcpTransportLayerFeedback({
                        feedback: nack,
                    });
                    this.receiver.dtlsTransport.sendRtcp([rtcp]).then(r).catch(f);
                    this.updateRetryCount();
                    this.onPacketLost.execute(nack);
                }
            })
        });
    }
    get lostSeqNumbers() {
        return Object.keys(this._lost).map(Number).sort();
    }
    getLost(seq) {
        return this._lost[seq];
    }
    setLost(seq, count) {
        this._lost[seq] = count;
        if (this.nackLoop || this.closed) {
            return;
        }
        this.nackLoop = setInterval(async () => {
            try {
                await this.sendNack();
                if (!Object.keys(this._lost).length) {
                    clearInterval(this.nackLoop);
                    this.nackLoop = undefined;
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
        if (sequenceNumber === (0, common_2.uint16Add)(this.newEstSeqNum, 1)) {
            this.newEstSeqNum = sequenceNumber;
        }
        else if (sequenceNumber > (0, common_2.uint16Add)(this.newEstSeqNum, 1)) {
            // packet lost detected
            for (let i = (0, common_2.uint16Add)(this.newEstSeqNum, 1); i < sequenceNumber; i = (0, common_2.uint16Add)(i, 1)) {
                this.setLost(i, 1);
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
    close() {
        this.closed = true;
        clearInterval(this.nackLoop);
        this._lost = {};
    }
    updateRetryCount() {
        this.lostSeqNumbers.forEach((seq) => {
            const count = this._lost[seq]++;
            if (count > this.retryCount) {
                this.removeLost(seq);
                return seq;
            }
        });
    }
}
exports.NackHandler = NackHandler;
//# sourceMappingURL=nack.js.map