"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.utf8 = void 0;
exports.encode = encode;
exports.decode = decode;
const index_js_1 = require("../bytes/index.js");
function encode(text) {
    return new TextEncoder().encode(text);
}
function decode(data) {
    return new TextDecoder("utf-8", { fatal: false }).decode((0, index_js_1.toUint8Array)(data));
}
exports.utf8 = { encode, decode };
