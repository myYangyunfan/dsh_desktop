"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChangeCipherSpec = void 0;
const binary_data_1 = require("@shinyoshiaki/binary-data");
// 7.1.  Change Cipher Spec Protocol
class ChangeCipherSpec {
    constructor(type = 1) {
        Object.defineProperty(this, "type", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: type
        });
    }
    static createEmpty() {
        return new ChangeCipherSpec();
    }
    static deSerialize(buf) {
        return new ChangeCipherSpec(
        //@ts-ignore
        ...Object.values((0, binary_data_1.decode)(buf, ChangeCipherSpec.spec)));
    }
    serialize() {
        const res = (0, binary_data_1.encode)(this, ChangeCipherSpec.spec).slice();
        return Buffer.from(res);
    }
}
exports.ChangeCipherSpec = ChangeCipherSpec;
Object.defineProperty(ChangeCipherSpec, "spec", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: {
        type: binary_data_1.types.uint8,
    }
});
//# sourceMappingURL=changeCipherSpec.js.map