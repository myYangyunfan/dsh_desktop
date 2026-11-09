"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ServerKeyExchange = void 0;
const binary_data_1 = require("@shinyoshiaki/binary-data");
const fragment_1 = require("../../../record/message/fragment");
const binary_1 = require("../../../util/binary");
const const_1 = require("../../const");
class ServerKeyExchange {
    constructor(ellipticCurveType, namedCurve, publicKeyLength, publicKey, hashAlgorithm, signatureAlgorithm, signatureLength, signature) {
        Object.defineProperty(this, "ellipticCurveType", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: ellipticCurveType
        });
        Object.defineProperty(this, "namedCurve", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: namedCurve
        });
        Object.defineProperty(this, "publicKeyLength", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: publicKeyLength
        });
        Object.defineProperty(this, "publicKey", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: publicKey
        });
        Object.defineProperty(this, "hashAlgorithm", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: hashAlgorithm
        });
        Object.defineProperty(this, "signatureAlgorithm", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: signatureAlgorithm
        });
        Object.defineProperty(this, "signatureLength", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: signatureLength
        });
        Object.defineProperty(this, "signature", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: signature
        });
        Object.defineProperty(this, "msgType", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: const_1.HandshakeType.server_key_exchange_12
        });
        Object.defineProperty(this, "messageSeq", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
    }
    static createEmpty() {
        return new ServerKeyExchange(undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined);
    }
    static deSerialize(buf) {
        const res = (0, binary_data_1.decode)(buf, ServerKeyExchange.spec);
        return new ServerKeyExchange(
        //@ts-ignore
        ...Object.values(res));
    }
    serialize() {
        const res = (0, binary_1.encodeBuffer)(this, ServerKeyExchange.spec);
        return res;
    }
    toFragment() {
        const body = this.serialize();
        return new fragment_1.FragmentedHandshake(this.msgType, body.length, this.messageSeq, 0, body.length, body);
    }
}
exports.ServerKeyExchange = ServerKeyExchange;
Object.defineProperty(ServerKeyExchange, "spec", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: {
        ellipticCurveType: binary_data_1.types.uint8,
        namedCurve: binary_data_1.types.uint16be,
        publicKeyLength: binary_data_1.types.uint8,
        publicKey: binary_data_1.types.buffer((ctx) => ctx.current.publicKeyLength),
        hashAlgorithm: binary_data_1.types.uint8,
        signatureAlgorithm: binary_data_1.types.uint8,
        signatureLength: binary_data_1.types.uint16be,
        signature: binary_data_1.types.buffer((ctx) => ctx.current.signatureLength),
    }
});
//# sourceMappingURL=keyExchange.js.map