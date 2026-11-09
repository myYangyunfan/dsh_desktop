"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Signature = void 0;
const binary_data_1 = require("@shinyoshiaki/binary-data");
class Signature {
    constructor(props = {}) {
        Object.defineProperty(this, "type", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: Signature.type
        });
        Object.defineProperty(this, "data", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        Object.assign(this, props);
    }
    static createEmpty() {
        const v = new Signature();
        return v;
    }
    static deSerialize(buf) {
        return new Signature((0, binary_data_1.decode)(buf, Signature.spec));
    }
    serialize() {
        const res = (0, binary_data_1.encode)(this, Signature.spec).slice();
        return Buffer.from(res);
    }
    static fromData(buf) {
        const type = Buffer.alloc(2);
        type.writeUInt16BE(Signature.type);
        return Signature.deSerialize(Buffer.concat([type, buf]));
    }
    get extension() {
        return {
            type: this.type,
            data: this.serialize().slice(2),
        };
    }
}
exports.Signature = Signature;
Object.defineProperty(Signature, "type", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: 13
});
Object.defineProperty(Signature, "spec", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: {
        type: binary_data_1.types.uint16be,
        data: binary_data_1.types.array({ hash: binary_data_1.types.uint8, signature: binary_data_1.types.uint8 }, binary_data_1.types.uint16be, "bytes"),
    }
});
//# sourceMappingURL=signature.js.map