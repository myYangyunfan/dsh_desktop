"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReceiverTWCC = void 0;
const promises_1 = require("timers/promises");
const common_1 = require("../../imports/common");
const rtp_1 = require("../../imports/rtp");
const utils_1 = require("../../utils");
const log = (0, rtp_1.debug)("werift:packages/webrtc/media/receiver/receiverTwcc");
class ReceiverTWCC {
    constructor(dtlsTransport, rtcpSsrc, mediaSourceSsrc) {
        Object.defineProperty(this, "dtlsTransport", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: dtlsTransport
        });
        Object.defineProperty(this, "rtcpSsrc", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: rtcpSsrc
        });
        Object.defineProperty(this, "mediaSourceSsrc", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: mediaSourceSsrc
        });
        Object.defineProperty(this, "extensionInfo", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: {}
        });
        Object.defineProperty(this, "twccRunning", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        /** uint8 */
        Object.defineProperty(this, "fbPktCount", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "lastTimestamp", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        this.runTWCC();
    }
    handleTWCC(transportSequenceNumber) {
        this.extensionInfo[transportSequenceNumber] = {
            tsn: transportSequenceNumber,
            timestamp: (0, utils_1.microTime)(),
        };
        if (Object.keys(this.extensionInfo).length > 10) {
            this.sendTWCC();
        }
    }
    async runTWCC() {
        while (this.twccRunning) {
            this.sendTWCC();
            await (0, promises_1.setTimeout)(100);
        }
    }
    sendTWCC() {
        if (Object.keys(this.extensionInfo).length === 0)
            return;
        const extensionsArr = Object.values(this.extensionInfo).sort((a, b) => a.tsn - b.tsn);
        const minTSN = extensionsArr[0].tsn;
        const maxTSN = extensionsArr.slice(-1)[0].tsn;
        const packetChunks = [];
        const baseSequenceNumber = extensionsArr[0].tsn;
        const packetStatusCount = (0, common_1.uint16Add)(maxTSN - minTSN, 1);
        /**micro sec */
        let referenceTime;
        let lastPacketStatus;
        const recvDeltas = [];
        for (let i = minTSN; i <= maxTSN; i++) {
            /**micro sec */
            const timestamp = this.extensionInfo[i]?.timestamp;
            if (timestamp) {
                if (!this.lastTimestamp) {
                    this.lastTimestamp = timestamp;
                }
                if (!referenceTime) {
                    referenceTime = this.lastTimestamp;
                }
                const delta = timestamp - this.lastTimestamp;
                this.lastTimestamp = timestamp;
                const recvDelta = new rtp_1.RecvDelta({
                    delta: Number(delta),
                });
                recvDelta.parseDelta();
                recvDeltas.push(recvDelta);
                // when status changed
                if (lastPacketStatus != undefined &&
                    lastPacketStatus.status !== recvDelta.type) {
                    packetChunks.push(new rtp_1.RunLengthChunk({
                        packetStatus: lastPacketStatus.status,
                        runLength: i - lastPacketStatus.minTSN,
                    }));
                    lastPacketStatus = { minTSN: i, status: recvDelta.type };
                }
                // last status
                if (i === maxTSN) {
                    if (lastPacketStatus != undefined) {
                        packetChunks.push(new rtp_1.RunLengthChunk({
                            packetStatus: lastPacketStatus.status,
                            runLength: i - lastPacketStatus.minTSN + 1,
                        }));
                    }
                    else {
                        packetChunks.push(new rtp_1.RunLengthChunk({
                            packetStatus: recvDelta.type,
                            runLength: 1,
                        }));
                    }
                }
                if (lastPacketStatus == undefined) {
                    lastPacketStatus = { minTSN: i, status: recvDelta.type };
                }
            }
        }
        if (!referenceTime) {
            return;
        }
        const packet = new rtp_1.RtcpTransportLayerFeedback({
            feedback: new rtp_1.TransportWideCC({
                senderSsrc: this.rtcpSsrc,
                mediaSourceSsrc: this.mediaSourceSsrc,
                baseSequenceNumber,
                packetStatusCount,
                referenceTime: (0, common_1.uint24)(Math.floor(Number(referenceTime / 1000n / 64n))),
                fbPktCount: this.fbPktCount,
                recvDeltas,
                packetChunks,
            }),
        });
        this.dtlsTransport.sendRtcp([packet]).catch((err) => {
            log(err);
        });
        this.extensionInfo = {};
        this.fbPktCount = (0, common_1.uint8Add)(this.fbPktCount, 1);
    }
}
exports.ReceiverTWCC = ReceiverTWCC;
//# sourceMappingURL=receiverTwcc.js.map