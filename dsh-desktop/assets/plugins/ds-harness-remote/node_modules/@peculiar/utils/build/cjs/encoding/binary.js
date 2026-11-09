"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.binary = void 0;
exports.encode = encode;
exports.decode = decode;
exports.is = is;
const index_js_1 = require("../bytes/index.js");
function encode(data) {
    const bytes = (0, index_js_1.toUint8Array)(data);
    let result = "";
    for (const byte of bytes) {
        result += String.fromCharCode(byte);
    }
    return result;
}
function decode(text) {
    const result = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i++) {
        result[i] = text.charCodeAt(i) & 0xff;
    }
    return result;
}
function is(text) {
    return typeof text === "string";
}
exports.binary = { encode, decode, is };
