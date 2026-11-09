"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ServerHello = void 0;
const binary_data_1 = require("@shinyoshiaki/binary-data");
const fragment_1 = require("../../../record/message/fragment");
const binary_1 = require("../../binary");
const const_1 = require("../../const");
const random_1 = require("../../random");
// 7.4.1.3.  Server Hello
class ServerHello {
    constructor(serverVersion, random, sessionId, cipherSuite, compressionMethod, extensions) {
        Object.defineProperty(this, "serverVersion", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: serverVersion
        });
        Object.defineProperty(this, "random", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: random
        });
        Object.defineProperty(this, "sessionId", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: sessionId
        });
        Object.defineProperty(this, "cipherSuite", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: cipherSuite
        });
        Object.defineProperty(this, "compressionMethod", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: compressionMethod
        });
        Object.defineProperty(this, "extensions", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: extensions
        });
        Object.defineProperty(this, "msgType", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: const_1.HandshakeType.server_hello_2
        });
        Object.defineProperty(this, "messageSeq", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
    }
    static createEmpty() {
        return new ServerHello(undefined, undefined, undefined, undefined, undefined, undefined);
    }
    static deSerialize(buf) {
        const res = (0, binary_data_1.decode)(buf, ServerHello.spec);
        const cls = new ServerHello(
        //@ts-ignore
        ...Object.values(res));
        const expect = cls.serialize();
        if (expect.length < buf.length) {
            return new ServerHello(
            //@ts-ignore
            ...Object.values((0, binary_data_1.decode)(buf, { ...ServerHello.spec, extensions: binary_1.ExtensionList })));
        }
        return cls;
    }
    serialize() {
        const res = this.extensions === undefined
            ? (0, binary_data_1.encode)(this, ServerHello.spec).slice()
            : (0, binary_data_1.encode)(this, {
                ...ServerHello.spec,
                extensions: binary_1.ExtensionList,
            }).slice();
        return Buffer.from(res);
    }
    toFragment() {
        const body = this.serialize();
        return new fragment_1.FragmentedHandshake(this.msgType, body.length, this.messageSeq, 0, body.length, body);
    }
}
exports.ServerHello = ServerHello;
Object.defineProperty(ServerHello, "spec", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: {
        serverVersion: binary_1.ProtocolVersion,
        random: random_1.DtlsRandom.spec,
        sessionId: binary_data_1.types.buffer(binary_data_1.types.uint8),
        cipherSuite: binary_data_1.types.uint16be,
        compressionMethod: binary_data_1.types.uint8,
    }
});
//# sourceMappingURL=hello.js.map