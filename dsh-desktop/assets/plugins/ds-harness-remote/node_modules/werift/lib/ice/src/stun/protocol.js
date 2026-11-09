"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StunProtocol = void 0;
const common_1 = require("../imports/common");
const const_1 = require("./const");
const message_1 = require("./message");
const transaction_1 = require("./transaction");
const log = (0, common_1.debug)("werift-ice : packages/ice/src/stun/protocol.ts");
class StunProtocol {
    get transactionsKeys() {
        return Object.keys(this.transactions);
    }
    constructor() {
        Object.defineProperty(this, "type", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: StunProtocol.type
        });
        Object.defineProperty(this, "transport", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "transactions", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: {}
        });
        Object.defineProperty(this, "localCandidate", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "sentMessage", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "localIp", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "onRequestReceived", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new common_1.Event()
        });
        Object.defineProperty(this, "onDataReceived", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new common_1.Event()
        });
        Object.defineProperty(this, "connectionMade", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: async (useIpv4, portRange, interfaceAddresses) => {
                if (useIpv4) {
                    this.transport = await common_1.UdpTransport.init("udp4", {
                        portRange,
                        interfaceAddresses,
                    });
                }
                else {
                    this.transport = await common_1.UdpTransport.init("udp6", {
                        portRange,
                        interfaceAddresses,
                    });
                }
                this.transport.onData = (data, addr) => {
                    this.datagramReceived(data, addr);
                };
            }
        });
    }
    datagramReceived(data, addr) {
        try {
            const message = (0, message_1.parseMessage)(data);
            if (!message) {
                if (this.localCandidate) {
                    this.onDataReceived.execute(data);
                }
                return;
            }
            // log("parseMessage", addr, message.toJSON());
            if ((message.messageClass === const_1.classes.RESPONSE ||
                message.messageClass === const_1.classes.ERROR) &&
                this.transactionsKeys.includes(message.transactionIdHex)) {
                const transaction = this.transactions[message.transactionIdHex];
                // Re-parse with integrity key so unauthenticated responses are dropped.
                const verified = transaction.integrityKey
                    ? (0, message_1.parseMessage)(data, transaction.integrityKey)
                    : message;
                if (!verified) {
                    log("STUN response failed MESSAGE-INTEGRITY check");
                    return;
                }
                transaction.responseReceived(verified, addr);
            }
            else if (message.messageClass === const_1.classes.REQUEST) {
                this.onRequestReceived.execute(message, addr, data);
            }
        }
        catch (error) {
            log("datagramReceived error", error);
        }
    }
    getExtraInfo() {
        const { address: host, port } = this.transport.address;
        return [host, port];
    }
    async sendStun(message, addr) {
        if (this.transport.closed) {
            return;
        }
        const data = message.bytes;
        await this.transport.send(data, addr).catch(() => {
            log("sendStun failed", addr, message);
        });
    }
    async sendData(data, addr) {
        if (this.transport.closed) {
            return;
        }
        await this.transport.send(data, addr);
    }
    async request(request, addr, integrityKey, retransmissionsOrOptions, onRequestSent) {
        // """
        // Execute a STUN transaction and return the response.
        // """
        if (this.transactionsKeys.includes(request.transactionIdHex))
            throw new Error("already request ed");
        if (integrityKey) {
            request.addMessageIntegrity(integrityKey);
            request.addFingerprint();
        }
        // Match DNS family to the bound socket so STUN hostname targets resolve correctly.
        const socketType = this.transport
            .socketType;
        const family = socketType === "udp6" ? 6 : 4;
        const resolvedAddr = await (0, transaction_1.resolveRequestAddress)(addr, family);
        const options = (0, transaction_1.buildTransactionOptions)(integrityKey, retransmissionsOrOptions, onRequestSent);
        const transaction = new transaction_1.Transaction(request, resolvedAddr, this, options);
        this.transactions[request.transactionIdHex] = transaction;
        try {
            return await transaction.run();
        }
        catch (e) {
            throw e;
        }
        finally {
            delete this.transactions[request.transactionIdHex];
        }
    }
    async close() {
        Object.values(this.transactions).forEach((transaction) => {
            transaction.cancel();
        });
        await this.transport.close();
        this.onRequestReceived.complete();
        this.onDataReceived.complete();
    }
}
exports.StunProtocol = StunProtocol;
Object.defineProperty(StunProtocol, "type", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: "stun"
});
//# sourceMappingURL=protocol.js.map