"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Alert = void 0;
const binary_data_1 = require("@shinyoshiaki/binary-data");
class Alert {
    constructor(level, description) {
        Object.defineProperty(this, "level", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: level
        });
        Object.defineProperty(this, "description", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: description
        });
    }
    static deSerialize(buf) {
        return new Alert(
        //@ts-ignore
        ...Object.values((0, binary_data_1.decode)(buf, Alert.spec)));
    }
    serialize() {
        const res = (0, binary_data_1.encode)(this, Alert.spec).slice();
        return Buffer.from(res);
    }
}
exports.Alert = Alert;
Object.defineProperty(Alert, "spec", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: {
        level: binary_data_1.types.uint8,
        description: binary_data_1.types.uint8,
    }
});
//# sourceMappingURL=alert.js.map