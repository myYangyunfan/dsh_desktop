"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.equal = equal;
const buffer_source_js_1 = require("./buffer-source.js");
function equal(a, b, options = {}) {
    const left = (0, buffer_source_js_1.toUint8Array)(a);
    const right = (0, buffer_source_js_1.toUint8Array)(b);
    if (!options.constantTime && left.byteLength !== right.byteLength) {
        return false;
    }
    const length = Math.max(left.byteLength, right.byteLength);
    let diff = left.byteLength ^ right.byteLength;
    for (let i = 0; i < length; i++) {
        diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
    }
    return diff === 0;
}
