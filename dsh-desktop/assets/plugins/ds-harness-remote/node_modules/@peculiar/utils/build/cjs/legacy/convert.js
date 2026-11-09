"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Convert = void 0;
const index_js_1 = require("../converters/index.js");
function normalizeTextEncoding(encoding) {
    return encoding === "ascii" ? "binary" : encoding;
}
class Convert {
    static DEFAULT_UTF8_ENCODING = "utf8";
    static isHex(data) {
        return index_js_1.convert.isHex(data);
    }
    static isBase64(data) {
        return index_js_1.convert.isBase64(data);
    }
    static isBase64Url(data) {
        return index_js_1.convert.isBase64Url(data);
    }
    static ToString(buffer, enc = "utf8") {
        return index_js_1.convert.toString(buffer, enc);
    }
    static FromString(str, enc = "utf8") {
        if (!str) {
            return new ArrayBuffer(0);
        }
        return index_js_1.convert.fromString(str, enc);
    }
    static ToBase64(buffer) {
        return index_js_1.convert.toBase64(buffer);
    }
    static FromBase64(base64) {
        return index_js_1.convert.fromBase64(base64);
    }
    static FromBase64Url(base64url) {
        return index_js_1.convert.fromBase64Url(base64url);
    }
    static ToBase64Url(data) {
        return index_js_1.convert.toBase64Url(data);
    }
    static FromUtf8String(text, encoding = Convert.DEFAULT_UTF8_ENCODING) {
        return index_js_1.convert.fromString(text, normalizeTextEncoding(encoding));
    }
    static ToUtf8String(buffer, encoding = Convert.DEFAULT_UTF8_ENCODING) {
        return index_js_1.convert.toString(buffer, normalizeTextEncoding(encoding));
    }
    static FromBinary(text) {
        return index_js_1.convert.fromBinary(text);
    }
    static ToBinary(buffer) {
        return index_js_1.convert.toBinary(buffer);
    }
    static ToHex(buffer) {
        return index_js_1.convert.toHex(buffer);
    }
    static FromHex(hexString) {
        return index_js_1.convert.fromHex(hexString);
    }
    static ToUtf16String(buffer, littleEndian = false) {
        return index_js_1.convert.toUtf16String(buffer, littleEndian);
    }
    static FromUtf16String(text, littleEndian = false) {
        return index_js_1.convert.fromUtf16String(text, littleEndian);
    }
    static Base64Padding(base64) {
        const padCount = 4 - (base64.length % 4);
        return padCount < 4 ? base64 + "=".repeat(padCount) : base64;
    }
    static formatString(data) {
        return index_js_1.convert.formatString(data);
    }
}
exports.Convert = Convert;
