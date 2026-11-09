"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Flight = void 0;
const promises_1 = require("timers/promises");
const common_1 = require("../imports/common");
const builder_1 = require("../record/builder");
const const_1 = require("../record/const");
const warn = (0, common_1.debug)("werift-dtls : packages/dtls/src/flight/flight.ts : warn");
const err = (0, common_1.debug)("werift-dtls : packages/dtls/src/flight/flight.ts : err");
const flightTypes = ["PREPARING", "SENDING", "WAITING", "FINISHED"];
class Flight {
    constructor(transport, dtls, flight, nextFlight) {
        Object.defineProperty(this, "transport", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: transport
        });
        Object.defineProperty(this, "dtls", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: dtls
        });
        Object.defineProperty(this, "flight", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: flight
        });
        Object.defineProperty(this, "nextFlight", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: nextFlight
        });
        Object.defineProperty(this, "state", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: "PREPARING"
        });
        Object.defineProperty(this, "send", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: (buf) => Promise.all(buf.map((v) => this.transport.send(v)))
        });
    }
    createPacket(handshakes) {
        const fragments = (0, builder_1.createFragments)(this.dtls)(handshakes);
        this.dtls.bufferHandshakeCache(fragments, true, this.flight);
        const packets = (0, builder_1.createPlaintext)(this.dtls)(fragments.map((fragment) => ({
            type: const_1.ContentType.handshake,
            fragment: fragment.serialize(),
        })), ++this.dtls.recordSequenceNumber);
        return packets;
    }
    async transmit(buffers) {
        let retransmitCount = 0;
        for (; retransmitCount <= Flight.RetransmitCount; retransmitCount++) {
            this.setState("SENDING");
            this.send(buffers).catch((e) => {
                err("fail to send", err);
            });
            this.setState("WAITING");
            if (this.nextFlight === undefined) {
                this.setState("FINISHED");
                break;
            }
            await (0, promises_1.setTimeout)(1000 * ((retransmitCount + 1) / 2));
            if (this.dtls.flight >= this.nextFlight) {
                this.setState("FINISHED");
                break;
            }
            else {
                warn(this.dtls.sessionId, "retransmit", retransmitCount, this.dtls.flight);
            }
        }
        if (retransmitCount > Flight.RetransmitCount) {
            err(this.dtls.sessionId, "retransmit failed", retransmitCount);
            throw new Error(`over retransmitCount : ${this.flight} ${this.nextFlight}`);
        }
    }
    setState(state) {
        this.state = state;
    }
}
exports.Flight = Flight;
Object.defineProperty(Flight, "RetransmitCount", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: 10
});
//# sourceMappingURL=flight.js.map