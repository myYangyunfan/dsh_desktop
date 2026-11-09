"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StreamStatistics = void 0;
const common_1 = require("../../imports/common");
const stats_1 = require("../stats");
// from aiortc
class StreamStatistics {
    constructor(clockRate) {
        Object.defineProperty(this, "base_seq", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "max_seq", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "cycles", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "packets_received", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "bytesReceived", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "headerBytesReceived", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "lastPacketReceivedTimestamp", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        // # jitter
        Object.defineProperty(this, "clockRate", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "jitter_q4", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "last_arrival", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "last_timestamp", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        // # fraction lost
        Object.defineProperty(this, "expected_prior", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "received_prior", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        this.clockRate = clockRate;
    }
    add(packet, now = Date.now() / 1000) {
        const inOrder = this.max_seq == undefined ||
            (0, common_1.uint16Gt)(packet.header.sequenceNumber, this.max_seq);
        this.packets_received++;
        this.bytesReceived += packet.payload.length;
        this.headerBytesReceived += packet.header.serializeSize;
        this.lastPacketReceivedTimestamp = (0, stats_1.getStatsTimestamp)();
        if (this.base_seq == undefined) {
            this.base_seq = packet.header.sequenceNumber;
        }
        if (inOrder) {
            const arrival = (0, common_1.int)(now * this.clockRate);
            if (this.max_seq != undefined &&
                packet.header.sequenceNumber < this.max_seq) {
                this.cycles += 1 << 16;
            }
            this.max_seq = packet.header.sequenceNumber;
            if (packet.header.timestamp !== this.last_timestamp &&
                this.packets_received > 1) {
                const diff = Math.abs(arrival -
                    (this.last_arrival ?? 0) -
                    (packet.header.timestamp - (this.last_timestamp ?? 0)));
                this.jitter_q4 += diff - ((this.jitter_q4 + 8) >> 4);
            }
            this.last_arrival = arrival;
            this.last_timestamp = packet.header.timestamp;
        }
    }
    get fraction_lost() {
        const expected_interval = this.packets_expected - this.expected_prior;
        this.expected_prior = this.packets_expected;
        const received_interval = this.packets_received - this.received_prior;
        this.received_prior = this.packets_received;
        const lost_interval = expected_interval - received_interval;
        if (expected_interval == 0 || lost_interval <= 0) {
            return 0;
        }
        else {
            return Math.floor((lost_interval << 8) / expected_interval);
        }
    }
    get jitter() {
        return this.jitter_q4 >> 4;
    }
    get packets_expected() {
        return this.cycles + (this.max_seq ?? 0) - (this.base_seq ?? 0) + 1;
    }
    get packets_lost() {
        const lost = this.packets_expected - this.packets_received;
        return lost < 0 ? 0 : lost;
    }
}
exports.StreamStatistics = StreamStatistics;
//# sourceMappingURL=statistics.js.map