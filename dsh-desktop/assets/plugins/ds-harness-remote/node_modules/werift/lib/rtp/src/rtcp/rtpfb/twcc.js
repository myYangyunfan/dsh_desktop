"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PacketResult = exports.PacketStatus = exports.PacketChunk = exports.RecvDelta = exports.StatusVectorChunk = exports.RunLengthChunk = exports.TransportWideCC = void 0;
const common_1 = require("../../imports/common");
const header_1 = require("../header");
const log = (0, common_1.debug)("werift/rtp/rtcp/rtpfb/twcc");
/* RTP Extensions for Transport-wide Congestion Control
 * draft-holmer-rmcat-transport-wide-cc-extensions-01

   0               1               2               3
   0 1 2 3 4 5 6 7 0 1 2 3 4 5 6 7 0 1 2 3 4 5 6 7 0 1 2 3 4 5 6 7
  +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
  |V=2|P|  FMT=15 |    PT=205     |           length              |
  +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
  |                     SSRC of packet sender                     |
  +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
  |                      SSRC of media source                     |
  +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
  |      base sequence number     |      packet status count      |
  +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
  |                 reference time                | fb pkt. count |
  +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
  |          packet chunk         |         packet chunk          |
  +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
  .                                                               .
  .                                                               .
  +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
  |         packet chunk          |  recv delta   |  recv delta   |
  +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
  .                                                               .
  .                                                               .
  +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
  |           recv delta          |  recv delta   | zero padding  |
  +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
 */
class TransportWideCC {
    constructor(props = {}) {
        Object.defineProperty(this, "count", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: TransportWideCC.count
        });
        Object.defineProperty(this, "length", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 2
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
        Object.defineProperty(this, "baseSequenceNumber", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "packetStatusCount", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        /** 24bit multiples of 64ms */
        Object.defineProperty(this, "referenceTime", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "fbPktCount", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "packetChunks", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        Object.defineProperty(this, "recvDeltas", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        Object.defineProperty(this, "header", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.assign(this, props);
        if (!this.header) {
            this.header = new header_1.RtcpHeader({
                type: 205,
                count: this.count,
                version: 2,
            });
        }
    }
    static deSerialize(data, header) {
        const [senderSsrc, mediaSsrc, baseSequenceNumber, packetStatusCount, referenceTime, fbPktCount,] = (0, common_1.bufferReader)(data, [4, 4, 2, 2, 3, 1]);
        const packetChunks = [];
        const recvDeltas = [];
        let packetStatusPos = 16;
        for (let processedPacketNum = 0; processedPacketNum < packetStatusCount;) {
            const type = (0, common_1.getBit)(data.slice(packetStatusPos, packetStatusPos + 1)[0], 0, 1);
            let iPacketStatus;
            switch (type) {
                case PacketChunk.TypeTCCRunLengthChunk:
                    {
                        const packetStatus = RunLengthChunk.deSerialize(data.slice(packetStatusPos, packetStatusPos + 2));
                        iPacketStatus = packetStatus;
                        const packetNumberToProcess = Math.min(packetStatusCount - processedPacketNum, packetStatus.runLength);
                        if (packetStatus.packetStatus ===
                            PacketStatus.TypeTCCPacketReceivedSmallDelta ||
                            packetStatus.packetStatus ===
                                PacketStatus.TypeTCCPacketReceivedLargeDelta) {
                            for (let _ = 0; _ < packetNumberToProcess; _++) {
                                recvDeltas.push(new RecvDelta({ type: packetStatus.packetStatus }));
                            }
                        }
                        processedPacketNum += packetNumberToProcess;
                    }
                    break;
                case PacketChunk.TypeTCCStatusVectorChunk:
                    {
                        const packetStatus = StatusVectorChunk.deSerialize(data.slice(packetStatusPos, packetStatusPos + 2));
                        iPacketStatus = packetStatus;
                        if (packetStatus.symbolSize === 0) {
                            packetStatus.symbolList.forEach((v) => {
                                if (v === PacketStatus.TypeTCCPacketReceivedSmallDelta) {
                                    recvDeltas.push(new RecvDelta({
                                        type: PacketStatus.TypeTCCPacketReceivedSmallDelta,
                                    }));
                                }
                            });
                        }
                        if (packetStatus.symbolSize === 1) {
                            packetStatus.symbolList.forEach((v) => {
                                if (v === PacketStatus.TypeTCCPacketReceivedSmallDelta ||
                                    v === PacketStatus.TypeTCCPacketReceivedLargeDelta) {
                                    recvDeltas.push(new RecvDelta({
                                        type: v,
                                    }));
                                }
                            });
                        }
                        processedPacketNum += packetStatus.symbolList.length;
                    }
                    break;
            }
            if (!iPacketStatus)
                throw new Error();
            packetStatusPos += 2;
            packetChunks.push(iPacketStatus);
        }
        let recvDeltaPos = packetStatusPos;
        recvDeltas.forEach((delta) => {
            if (delta.type === PacketStatus.TypeTCCPacketReceivedSmallDelta) {
                delta.deSerialize(data.slice(recvDeltaPos, recvDeltaPos + 1));
                recvDeltaPos++;
            }
            if (delta.type === PacketStatus.TypeTCCPacketReceivedLargeDelta) {
                delta.deSerialize(data.slice(recvDeltaPos, recvDeltaPos + 2));
                recvDeltaPos += 2;
            }
        });
        return new TransportWideCC({
            senderSsrc,
            mediaSourceSsrc: mediaSsrc,
            baseSequenceNumber,
            packetStatusCount,
            referenceTime,
            fbPktCount,
            recvDeltas,
            packetChunks,
            header,
        });
    }
    serialize() {
        const constBuf = (0, common_1.bufferWriter)([4, 4, 2, 2, 3, 1], [
            this.senderSsrc,
            this.mediaSourceSsrc,
            this.baseSequenceNumber,
            this.packetStatusCount,
            this.referenceTime,
            this.fbPktCount,
        ]);
        const chunks = Buffer.concat(this.packetChunks.map((chunk) => chunk.serialize()));
        const deltas = Buffer.concat(this.recvDeltas
            .map((delta) => {
            try {
                return delta.serialize();
            }
            catch (error) {
                log(error?.message);
                return undefined;
            }
        })
            .filter((v) => v));
        const buf = Buffer.concat([constBuf, chunks, deltas]);
        if (this.header.padding && buf.length % 4 !== 0) {
            const rest = 4 - (buf.length % 4);
            const padding = Buffer.alloc(rest);
            padding[padding.length - 1] = padding.length;
            this.header.length = Math.floor((buf.length + padding.length) / 4);
            return Buffer.concat([this.header.serialize(), buf, padding]);
        }
        this.header.length = Math.floor(buf.length / 4);
        return Buffer.concat([this.header.serialize(), buf]);
    }
    get packetResults() {
        const currentSequenceNumber = this.baseSequenceNumber - 1;
        const results = this.packetChunks
            .filter((v) => v instanceof RunLengthChunk)
            .flatMap((chunk) => chunk.results(currentSequenceNumber));
        let deltaIdx = 0;
        const referenceTime = BigInt(this.referenceTime) * 64n;
        let currentReceivedAtMs = referenceTime;
        for (const result of results) {
            const recvDelta = this.recvDeltas[deltaIdx];
            if (!result.received || !recvDelta) {
                continue;
            }
            currentReceivedAtMs += BigInt(recvDelta.delta) / 1000n;
            result.delta = recvDelta.delta;
            result.receivedAtMs = Number(currentReceivedAtMs);
            deltaIdx++;
        }
        return results;
    }
}
exports.TransportWideCC = TransportWideCC;
Object.defineProperty(TransportWideCC, "count", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: 15
});
//  0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5
// +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
// |T| S |       Run Length        |
// +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
class RunLengthChunk {
    constructor(props = {}) {
        Object.defineProperty(this, "type", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "packetStatus", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        /** 13bit */
        Object.defineProperty(this, "runLength", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.assign(this, props);
        this.type = PacketChunk.TypeTCCRunLengthChunk;
    }
    static deSerialize(data) {
        const packetStatus = (0, common_1.getBit)(data[0], 1, 2);
        const runLength = ((0, common_1.getBit)(data[0], 3, 5) << 8) + data[1];
        return new RunLengthChunk({ type: 0, packetStatus, runLength });
    }
    serialize() {
        const buf = new common_1.BitWriter2(16)
            .set(0)
            .set(this.packetStatus, 2)
            .set(this.runLength, 13).buffer;
        return buf;
    }
    results(currentSequenceNumber) {
        const received = this.packetStatus === PacketStatus.TypeTCCPacketReceivedSmallDelta ||
            this.packetStatus === PacketStatus.TypeTCCPacketReceivedLargeDelta;
        const results = [];
        for (let i = 0; i <= this.runLength; ++i) {
            results.push(new PacketResult({ sequenceNumber: ++currentSequenceNumber, received }));
        }
        return results;
    }
}
exports.RunLengthChunk = RunLengthChunk;
//  0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5
// +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
// |T|S|       symbol list         |
// +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
class StatusVectorChunk {
    constructor(props = {}) {
        Object.defineProperty(this, "type", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "symbolSize", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "symbolList", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        Object.assign(this, props);
    }
    static deSerialize(data) {
        const type = PacketChunk.TypeTCCStatusVectorChunk;
        let symbolSize = (0, common_1.getBit)(data[0], 1, 1);
        const symbolList = [];
        function range(n, cb) {
            for (let i = 0; i < n; i++) {
                cb(i);
            }
        }
        switch (symbolSize) {
            case 0:
                range(6, (i) => symbolList.push((0, common_1.getBit)(data[0], 2 + i, 1)));
                range(8, (i) => symbolList.push((0, common_1.getBit)(data[1], i, 1)));
                break;
            case 1:
                range(3, (i) => symbolList.push((0, common_1.getBit)(data[0], 2 + i * 2, 2)));
                range(4, (i) => symbolList.push((0, common_1.getBit)(data[1], i * 2, 2)));
                break;
            default:
                symbolSize = ((0, common_1.getBit)(data[0], 2, 6) << 8) + data[1];
        }
        return new StatusVectorChunk({ type, symbolSize, symbolList });
    }
    serialize() {
        const buf = Buffer.alloc(2);
        const writer = new common_1.BitWriter2(16).set(1).set(this.symbolSize);
        const bits = this.symbolSize === 0 ? 1 : 2;
        this.symbolList.forEach((v) => {
            writer.set(v, bits);
        });
        buf.writeUInt16BE(writer.value);
        return buf;
    }
}
exports.StatusVectorChunk = StatusVectorChunk;
class RecvDelta {
    constructor(props = {}) {
        /**optional (If undefined, it will be set automatically.)*/
        Object.defineProperty(this, "type", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        /**micro sec */
        Object.defineProperty(this, "delta", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "parsed", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        }); // todo refactor
        Object.assign(this, props);
    }
    static deSerialize(data) {
        let type;
        let delta;
        if (data.length === 1) {
            type = PacketStatus.TypeTCCPacketReceivedSmallDelta;
            delta = 250 * data[0];
        }
        else if (data.length === 2) {
            type = PacketStatus.TypeTCCPacketReceivedLargeDelta;
            delta = 250 * data.readInt16BE();
        }
        if (type === undefined || delta === undefined)
            throw new Error();
        return new RecvDelta({ type, delta });
    }
    deSerialize(data) {
        const res = RecvDelta.deSerialize(data);
        this.delta = res.delta;
    }
    parseDelta() {
        this.delta = Math.floor(this.delta / 250);
        if (this.delta < 0 || this.delta > 255) {
            if (this.delta > 32767)
                this.delta = 32767; // maxInt16
            if (this.delta < -32768)
                this.delta = -32768; // minInt16
            if (!this.type)
                this.type = PacketStatus.TypeTCCPacketReceivedLargeDelta;
        }
        else {
            if (!this.type)
                this.type = PacketStatus.TypeTCCPacketReceivedSmallDelta;
        }
        this.parsed = true;
    }
    serialize() {
        if (!this.parsed)
            this.parseDelta();
        if (this.type === PacketStatus.TypeTCCPacketReceivedSmallDelta) {
            const buf = Buffer.alloc(1);
            buf.writeUInt8(this.delta);
            return buf;
        }
        else if (this.type === PacketStatus.TypeTCCPacketReceivedLargeDelta) {
            const buf = Buffer.alloc(2);
            buf.writeInt16BE(this.delta);
            return buf;
        }
        throw new Error("errDeltaExceedLimit " + this.delta + " " + this.type);
    }
}
exports.RecvDelta = RecvDelta;
var PacketChunk;
(function (PacketChunk) {
    PacketChunk[PacketChunk["TypeTCCRunLengthChunk"] = 0] = "TypeTCCRunLengthChunk";
    PacketChunk[PacketChunk["TypeTCCStatusVectorChunk"] = 1] = "TypeTCCStatusVectorChunk";
    PacketChunk[PacketChunk["packetStatusChunkLength"] = 2] = "packetStatusChunkLength";
})(PacketChunk || (exports.PacketChunk = PacketChunk = {}));
var PacketStatus;
(function (PacketStatus) {
    PacketStatus[PacketStatus["TypeTCCPacketNotReceived"] = 0] = "TypeTCCPacketNotReceived";
    PacketStatus[PacketStatus["TypeTCCPacketReceivedSmallDelta"] = 1] = "TypeTCCPacketReceivedSmallDelta";
    PacketStatus[PacketStatus["TypeTCCPacketReceivedLargeDelta"] = 2] = "TypeTCCPacketReceivedLargeDelta";
    PacketStatus[PacketStatus["TypeTCCPacketReceivedWithoutDelta"] = 3] = "TypeTCCPacketReceivedWithoutDelta";
})(PacketStatus || (exports.PacketStatus = PacketStatus = {}));
class PacketResult {
    constructor(props) {
        Object.defineProperty(this, "sequenceNumber", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "delta", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "received", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        Object.defineProperty(this, "receivedAtMs", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.assign(this, props);
    }
}
exports.PacketResult = PacketResult;
//# sourceMappingURL=twcc.js.map