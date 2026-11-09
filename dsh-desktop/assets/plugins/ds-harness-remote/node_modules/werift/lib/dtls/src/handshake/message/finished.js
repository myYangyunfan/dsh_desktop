"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Finished = void 0;
const fragment_1 = require("../../record/message/fragment");
const const_1 = require("../const");
// 7.4.9.  Finished
class Finished {
    constructor(verifyData) {
        Object.defineProperty(this, "verifyData", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: verifyData
        });
        Object.defineProperty(this, "msgType", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: const_1.HandshakeType.finished_20
        });
        Object.defineProperty(this, "messageSeq", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
    }
    static createEmpty() {
        return new Finished(undefined);
    }
    static deSerialize(buf) {
        return new Finished(buf);
    }
    serialize() {
        return this.verifyData;
    }
    toFragment() {
        const body = this.serialize();
        return new fragment_1.FragmentedHandshake(this.msgType, body.length, this.messageSeq, 0, body.length, body);
    }
}
exports.Finished = Finished;
//# sourceMappingURL=finished.js.map