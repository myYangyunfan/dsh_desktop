"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Flight3 = void 0;
const common_1 = require("../../imports/common");
const flight_1 = require("../flight");
const log = (0, common_1.debug)("werift-dtls : packages/dtls/src/flight/client/flight3.ts : log");
class Flight3 extends flight_1.Flight {
    constructor(udp, dtls) {
        super(udp, dtls, 3, 5);
    }
    async exec(verifyReq) {
        if (this.dtls.flight === 3)
            throw new Error();
        this.dtls.flight = 3;
        this.dtls.handshakeCache = [];
        const [clientHello] = this.dtls.lastFlight;
        log("dtls version", clientHello.clientVersion);
        clientHello.cookie = verifyReq.cookie;
        this.dtls.cookie = verifyReq.cookie;
        const packets = this.createPacket([clientHello]);
        const buf = Buffer.concat(packets.map((v) => v.serialize()));
        await this.transmit([buf]);
    }
}
exports.Flight3 = Flight3;
//# sourceMappingURL=flight3.js.map