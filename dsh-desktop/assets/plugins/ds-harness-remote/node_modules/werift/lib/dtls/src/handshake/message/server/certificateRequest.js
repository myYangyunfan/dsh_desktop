"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ServerCertificateRequest = void 0;
const binary_data_1 = require("@shinyoshiaki/binary-data");
const fragment_1 = require("../../../record/message/fragment");
const binary_1 = require("../../binary");
const const_1 = require("../../const");
// 7.4.4.  Certificate Request
class ServerCertificateRequest {
    constructor(certificateTypes, signatures, authorities) {
        Object.defineProperty(this, "certificateTypes", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: certificateTypes
        });
        Object.defineProperty(this, "signatures", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: signatures
        });
        Object.defineProperty(this, "authorities", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: authorities
        });
        Object.defineProperty(this, "msgType", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: const_1.HandshakeType.certificate_request_13
        });
        Object.defineProperty(this, "messageSeq", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
    }
    static createEmpty() {
        return new ServerCertificateRequest(undefined, undefined, undefined);
    }
    static deSerialize(buf) {
        return new ServerCertificateRequest(
        //@ts-ignore
        ...Object.values((0, binary_data_1.decode)(buf, ServerCertificateRequest.spec)));
    }
    serialize() {
        const res = (0, binary_data_1.encode)(this, ServerCertificateRequest.spec).slice();
        return Buffer.from(res);
    }
    toFragment() {
        const body = this.serialize();
        return new fragment_1.FragmentedHandshake(this.msgType, body.length, this.messageSeq, 0, body.length, body);
    }
}
exports.ServerCertificateRequest = ServerCertificateRequest;
Object.defineProperty(ServerCertificateRequest, "spec", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: {
        certificateTypes: binary_data_1.types.array(binary_1.ClientCertificateType, binary_data_1.types.uint8, "bytes"),
        signatures: binary_data_1.types.array(binary_1.SignatureHashAlgorithm, binary_data_1.types.uint16be, "bytes"),
        authorities: binary_data_1.types.array(binary_1.DistinguishedName, binary_data_1.types.uint16be, "bytes"),
    }
});
//# sourceMappingURL=certificateRequest.js.map