"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClientKeyExchange = void 0;
const binary_data_1 = require("@shinyoshiaki/binary-data");
const fragment_1 = require("../../../record/message/fragment");
const const_1 = require("../../const");
class ClientKeyExchange {
    constructor(publicKey) {
        Object.defineProperty(this, "publicKey", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: publicKey
        });
        Object.defineProperty(this, "msgType", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: const_1.HandshakeType.client_key_exchange_16
        });
        Object.defineProperty(this, "messageSeq", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
    }
    static createEmpty() {
        return new ClientKeyExchange(undefined);
    }
    static deSerialize(buf) {
        const res = (0, binary_data_1.decode)(buf, ClientKeyExchange.spec);
        return new ClientKeyExchange(
        //@ts-ignore
        ...Object.values(res));
    }
    serialize() {
        const res = (0, binary_data_1.encode)(this, ClientKeyExchange.spec).slice();
        return Buffer.from(res);
    }
    toFragment() {
        const body = this.serialize();
        return new fragment_1.FragmentedHandshake(this.msgType, body.length, this.messageSeq, 0, body.length, body);
    }
}
exports.ClientKeyExchange = ClientKeyExchange;
Object.defineProperty(ClientKeyExchange, "spec", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: {
        publicKey: binary_data_1.types.buffer(binary_data_1.types.uint8),
    }
});
//# sourceMappingURL=keyExchange.js.map