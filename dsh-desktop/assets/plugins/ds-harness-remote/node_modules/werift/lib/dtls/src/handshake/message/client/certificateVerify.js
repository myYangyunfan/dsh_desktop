"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CertificateVerify = void 0;
const binary_data_1 = require("@shinyoshiaki/binary-data");
const fragment_1 = require("../../../record/message/fragment");
const const_1 = require("../../const");
class CertificateVerify {
    constructor(algorithm, signature) {
        Object.defineProperty(this, "algorithm", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: algorithm
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
            value: const_1.HandshakeType.certificate_verify_15
        });
        Object.defineProperty(this, "messageSeq", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
    }
    static createEmpty() {
        return new CertificateVerify(undefined, undefined);
    }
    static deSerialize(buf) {
        const res = (0, binary_data_1.decode)(buf, CertificateVerify.spec);
        return new CertificateVerify(
        //@ts-ignore
        ...Object.values(res));
    }
    serialize() {
        const res = (0, binary_data_1.encode)(this, CertificateVerify.spec).slice();
        return Buffer.from(res);
    }
    toFragment() {
        const body = this.serialize();
        return new fragment_1.FragmentedHandshake(this.msgType, body.length, this.messageSeq, 0, body.length, body);
    }
}
exports.CertificateVerify = CertificateVerify;
Object.defineProperty(CertificateVerify, "spec", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: {
        algorithm: binary_data_1.types.uint16be,
        signature: binary_data_1.types.buffer(binary_data_1.types.uint16be),
    }
});
//# sourceMappingURL=certificateVerify.js.map