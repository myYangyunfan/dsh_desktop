"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DtlsContext = void 0;
const common_1 = require("../imports/common");
const log = (0, common_1.debug)("werift-dtls : packages/dtls/src/context/dtls.ts : log");
class DtlsContext {
    constructor(options, sessionType) {
        Object.defineProperty(this, "options", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: options
        });
        Object.defineProperty(this, "sessionType", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: sessionType
        });
        Object.defineProperty(this, "version", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: { major: 255 - 1, minor: 255 - 2 }
        });
        Object.defineProperty(this, "lastFlight", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        Object.defineProperty(this, "lastMessage", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        Object.defineProperty(this, "recordSequenceNumber", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "sequenceNumber", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "epoch", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "flight", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "handshakeCache", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: {}
        });
        Object.defineProperty(this, "cookie", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "requestedCertificateTypes", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        Object.defineProperty(this, "requestedSignatureAlgorithms", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        Object.defineProperty(this, "remoteExtendedMasterSecret", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        Object.defineProperty(this, "checkHandshakesExist", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: (handshakes) => !handshakes.find((type) => this.sortedHandshakeCache.find((h) => h.msg_type === type) == undefined)
        });
    }
    get sessionId() {
        return this.cookie ? this.cookie.toString("hex").slice(0, 10) : "";
    }
    get sortedHandshakeCache() {
        return Object.entries(this.handshakeCache)
            .sort(([a], [b]) => Number(a) - Number(b))
            .flatMap(([, { data }]) => data.sort((a, b) => a.message_seq - b.message_seq));
    }
    bufferHandshakeCache(handshakes, isLocal, flight) {
        if (!this.handshakeCache[flight]) {
            this.handshakeCache[flight] = { data: [], isLocal, flight };
        }
        const filtered = handshakes.filter((h) => {
            const exist = this.handshakeCache[flight].data.find((t) => t.msg_type === h.msg_type);
            if (exist) {
                log(this.sessionId, "exist", exist.summary, isLocal, flight);
                return false;
            }
            return true;
        });
        this.handshakeCache[flight].data = [
            ...this.handshakeCache[flight].data,
            ...filtered,
        ];
    }
}
exports.DtlsContext = DtlsContext;
//# sourceMappingURL=dtls.js.map