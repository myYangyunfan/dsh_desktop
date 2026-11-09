"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ServerHelloVerifyRequest = void 0;
const binary_data_1 = require("@shinyoshiaki/binary-data");
const fragment_1 = require("../../../record/message/fragment");
const binary_1 = require("../../binary");
const const_1 = require("../../const");
// 4.2.1.  Denial-of-Service Countermeasures
class ServerHelloVerifyRequest {
    constructor(serverVersion, cookie) {
        Object.defineProperty(this, "serverVersion", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: serverVersion
        });
        Object.defineProperty(this, "cookie", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: cookie
        });
        Object.defineProperty(this, "msgType", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: const_1.HandshakeType.hello_verify_request_3
        });
        Object.defineProperty(this, "messageSeq", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
    }
    static createEmpty() {
        return new ServerHelloVerifyRequest(undefined, undefined);
    }
    static deSerialize(buf) {
        return new ServerHelloVerifyRequest(
        //@ts-ignore
        ...Object.values((0, binary_data_1.decode)(buf, ServerHelloVerifyRequest.spec)));
    }
    serialize() {
        const res = (0, binary_data_1.encode)(this, ServerHelloVerifyRequest.spec).slice();
        return Buffer.from(res);
    }
    get version() {
        return {
            major: 255 - this.serverVersion.major,
            minor: 255 - this.serverVersion.minor,
        };
    }
    toFragment() {
        const body = this.serialize();
        return new fragment_1.FragmentedHandshake(this.msgType, body.length, this.messageSeq, 0, body.length, body);
    }
}
exports.ServerHelloVerifyRequest = ServerHelloVerifyRequest;
Object.defineProperty(ServerHelloVerifyRequest, "spec", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: {
        serverVersion: binary_1.ProtocolVersion,
        cookie: binary_data_1.types.buffer(binary_data_1.types.uint8),
    }
});
//# sourceMappingURL=helloVerifyRequest.js.map