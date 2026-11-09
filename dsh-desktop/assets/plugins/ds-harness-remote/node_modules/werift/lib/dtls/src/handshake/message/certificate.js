"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Certificate = void 0;
const binary_data_1 = require("@shinyoshiaki/binary-data");
const fragment_1 = require("../../record/message/fragment");
const binary_1 = require("../binary");
const const_1 = require("../const");
// 7.4.2.  Server Certificate
// 7.4.6.  Client Certificate
class Certificate {
    constructor(certificateList) {
        Object.defineProperty(this, "certificateList", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: certificateList
        });
        Object.defineProperty(this, "msgType", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: const_1.HandshakeType.certificate_11
        });
        Object.defineProperty(this, "messageSeq", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
    }
    static createEmpty() {
        return new Certificate(undefined);
    }
    static deSerialize(buf) {
        return new Certificate(
        //@ts-ignore
        ...Object.values((0, binary_data_1.decode)(buf, Certificate.spec)));
    }
    serialize() {
        const res = (0, binary_data_1.encode)(this, Certificate.spec).slice();
        return Buffer.from(res);
    }
    toFragment() {
        const body = this.serialize();
        return new fragment_1.FragmentedHandshake(this.msgType, body.length, this.messageSeq, 0, body.length, body);
    }
}
exports.Certificate = Certificate;
Object.defineProperty(Certificate, "spec", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: {
        certificateList: binary_data_1.types.array(binary_1.ASN11Cert, binary_data_1.types.uint24be, "bytes"),
    }
});
//# sourceMappingURL=certificate.js.map