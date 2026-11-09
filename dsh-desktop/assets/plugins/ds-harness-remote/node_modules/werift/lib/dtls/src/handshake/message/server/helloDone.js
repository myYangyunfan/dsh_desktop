"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ServerHelloDone = void 0;
const binary_data_1 = require("@shinyoshiaki/binary-data");
const fragment_1 = require("../../../record/message/fragment");
const const_1 = require("../../const");
// 7.4.5.  Server Hello Done
class ServerHelloDone {
    constructor() {
        Object.defineProperty(this, "msgType", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: const_1.HandshakeType.server_hello_done_14
        });
        Object.defineProperty(this, "messageSeq", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
    }
    static createEmpty() {
        return new ServerHelloDone();
    }
    static deSerialize(buf) {
        return new ServerHelloDone(
        //@ts-ignore
        ...Object.values((0, binary_data_1.decode)(buf, ServerHelloDone.spec)));
    }
    serialize() {
        const res = (0, binary_data_1.encode)(this, ServerHelloDone.spec).slice();
        return Buffer.from(res);
    }
    toFragment() {
        const body = this.serialize();
        return new fragment_1.FragmentedHandshake(this.msgType, body.length, this.messageSeq, 0, body.length, body);
    }
}
exports.ServerHelloDone = ServerHelloDone;
Object.defineProperty(ServerHelloDone, "spec", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: {}
});
//# sourceMappingURL=helloDone.js.map