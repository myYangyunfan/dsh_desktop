"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RenegotiationIndication = void 0;
const binary_data_1 = require("@shinyoshiaki/binary-data");
class RenegotiationIndication {
    constructor(props = {}) {
        Object.defineProperty(this, "type", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: RenegotiationIndication.type
        });
        Object.defineProperty(this, "data", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.assign(this, props);
    }
    static createEmpty() {
        const v = new RenegotiationIndication();
        return v;
    }
    static deSerialize(buf) {
        return new RenegotiationIndication((0, binary_data_1.decode)(buf, RenegotiationIndication.spec));
    }
    serialize() {
        const res = (0, binary_data_1.encode)(this, RenegotiationIndication.spec).slice();
        return Buffer.from(res);
    }
    get extension() {
        return {
            type: this.type,
            data: this.serialize().slice(2),
        };
    }
}
exports.RenegotiationIndication = RenegotiationIndication;
Object.defineProperty(RenegotiationIndication, "type", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: 65281
});
Object.defineProperty(RenegotiationIndication, "spec", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: {
        type: binary_data_1.types.uint16be,
        data: binary_data_1.types.uint8,
    }
});
//# sourceMappingURL=renegotiationIndication.js.map