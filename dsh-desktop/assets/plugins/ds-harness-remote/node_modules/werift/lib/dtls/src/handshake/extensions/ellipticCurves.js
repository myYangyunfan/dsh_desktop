"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EllipticCurves = void 0;
const binary_data_1 = require("@shinyoshiaki/binary-data");
// rfc4492
class EllipticCurves {
    constructor(props = {}) {
        Object.defineProperty(this, "type", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: EllipticCurves.type
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
        return new EllipticCurves();
    }
    static fromData(buf) {
        return new EllipticCurves({
            type: EllipticCurves.type,
            data: (0, binary_data_1.decode)(buf, EllipticCurves.spec.data),
        });
    }
    static deSerialize(buf) {
        return new EllipticCurves((0, binary_data_1.decode)(buf, EllipticCurves.spec));
    }
    serialize() {
        return Buffer.from((0, binary_data_1.encode)(this, EllipticCurves.spec).slice());
    }
    get extension() {
        return {
            type: this.type,
            data: this.serialize().slice(2),
        };
    }
}
exports.EllipticCurves = EllipticCurves;
Object.defineProperty(EllipticCurves, "type", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: 10
});
Object.defineProperty(EllipticCurves, "spec", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: {
        type: binary_data_1.types.uint16be,
        data: binary_data_1.types.array(binary_data_1.types.uint16be, binary_data_1.types.uint16be, "bytes"),
    }
});
//# sourceMappingURL=ellipticCurves.js.map