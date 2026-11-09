"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.base64 = void 0;
exports.normalize = normalize;
exports.pad = pad;
exports.is = is;
exports.encode = encode;
exports.decode = decode;
const index_js_1 = require("../bytes/index.js");
const binary_js_1 = require("./binary.js");
const BASE64_REGEX = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
function nodeBuffer() {
    return globalThis.Buffer;
}
function normalize(text) {
    return text.replace(/[\n\r\t ]/g, "");
}
function pad(text) {
    const remainder = text.length % 4;
    return remainder ? text + "=".repeat(4 - remainder) : text;
}
function is(text) {
    if (typeof text !== "string") {
        return false;
    }
    const normalized = normalize(text);
    return normalized === "" || BASE64_REGEX.test(normalized);
}
function encode(data, _options) {
    const bytes = (0, index_js_1.toUint8Array)(data);
    const buffer = nodeBuffer();
    if (buffer) {
        return buffer.from(bytes).toString("base64");
    }
    return btoa((0, binary_js_1.encode)(bytes));
}
function decode(text, _options) {
    const normalized = normalize(text);
    if (!is(normalized)) {
        throw new TypeError("Input is not valid Base64 text");
    }
    const buffer = nodeBuffer();
    if (buffer) {
        return new Uint8Array(buffer.from(normalized, "base64"));
    }
    return (0, binary_js_1.decode)(atob(normalized));
}
exports.base64 = { encode, decode, is, normalize, pad };
