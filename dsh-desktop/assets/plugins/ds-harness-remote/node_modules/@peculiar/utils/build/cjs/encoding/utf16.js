"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.utf16 = void 0;
exports.encode = encode;
exports.decode = decode;
const index_js_1 = require("../bytes/index.js");
function encode(text, options = {}) {
    const result = new ArrayBuffer(text.length * 2);
    const view = new DataView(result);
    for (let i = 0; i < text.length; i++) {
        view.setUint16(i * 2, text.charCodeAt(i), options.littleEndian ?? false);
    }
    return new Uint8Array(result);
}
function decode(data, options = {}) {
    const buffer = (0, index_js_1.toArrayBuffer)(data);
    const view = new DataView(buffer);
    let result = "";
    for (let i = 0; i < buffer.byteLength; i += 2) {
        result += String.fromCharCode(view.getUint16(i, options.littleEndian ?? false));
    }
    return result;
}
exports.utf16 = { encode, decode };
