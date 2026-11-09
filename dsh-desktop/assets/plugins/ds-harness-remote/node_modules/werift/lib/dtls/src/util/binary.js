"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.encodeBuffer = encodeBuffer;
const binary_data_1 = require("@shinyoshiaki/binary-data");
function encodeBuffer(obj, spec) {
    return Buffer.from((0, binary_data_1.encode)(obj, spec).slice());
}
//# sourceMappingURL=binary.js.map