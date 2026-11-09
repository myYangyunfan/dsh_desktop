"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.convert = void 0;
const index_js_1 = require("../bytes/index.js");
const index_js_2 = require("../encoding/index.js");
const defaults_js_1 = require("./defaults.js");
function encode(name, data, ...args) {
    return defaults_js_1.defaultConverterRegistry.encode(name, data, ...args);
}
function decode(name, text, ...args) {
    return defaults_js_1.defaultConverterRegistry.decode(name, text, ...args);
}
function tryDecode(name, text, ...args) {
    return defaults_js_1.defaultConverterRegistry.tryDecode(name, text, ...args);
}
function normalize(name, text, ...args) {
    return defaults_js_1.defaultConverterRegistry.normalize(name, text, ...args);
}
function parse(name, text, ...args) {
    return defaults_js_1.defaultConverterRegistry.parse(name, text, ...args);
}
function format(name, data, value) {
    return defaults_js_1.defaultConverterRegistry.format(name, data, value);
}
function transcode(text, options) {
    return defaults_js_1.defaultConverterRegistry.transcode(text, options);
}
function detect(text, options) {
    return defaults_js_1.defaultConverterRegistry.detect(text, options);
}
function normalizeEncodingName(encoding) {
    return encoding.toLowerCase();
}
exports.convert = {
    encode,
    decode,
    tryDecode,
    normalize,
    parse,
    format,
    transcode,
    detect,
    to(format, data, ...args) {
        return encode(format, data, ...args);
    },
    from(format, text, ...args) {
        return decode(format, text, ...args);
    },
    toString(data, encoding = "utf8") {
        return encode(encoding, data);
    },
    fromString(text, encoding = "utf8") {
        if (normalizeEncodingName(encoding) === "hex") {
            return (0, index_js_1.toArrayBuffer)(index_js_2.hex.decode(text, { allowOddLength: true }));
        }
        return (0, index_js_1.toArrayBuffer)(decode(encoding, text));
    },
    toBase64: index_js_2.base64.encode,
    fromBase64: (text) => (0, index_js_1.toArrayBuffer)(index_js_2.base64.decode(text)),
    toBase64Url: index_js_2.base64url.encode,
    fromBase64Url: (text) => (0, index_js_1.toArrayBuffer)(index_js_2.base64url.decode(text)),
    toHex: index_js_2.hex.encode,
    fromHex: (text) => (0, index_js_1.toArrayBuffer)(index_js_2.hex.decode(text, { allowOddLength: true })),
    toBinary: index_js_2.binary.encode,
    fromBinary: (text) => (0, index_js_1.toArrayBuffer)(index_js_2.binary.decode(text)),
    toUtf8String: index_js_2.utf8.decode,
    fromUtf8String: (text) => (0, index_js_1.toArrayBuffer)(index_js_2.utf8.encode(text)),
    toUtf16String: (data, littleEndian = false) => index_js_2.utf16.decode(data, { littleEndian }),
    fromUtf16String: (text, littleEndian = false) => (0, index_js_1.toArrayBuffer)(index_js_2.utf16.encode(text, { littleEndian })),
    isHex: index_js_2.hex.is,
    isBase64: index_js_2.base64.is,
    isBase64Url: index_js_2.base64url.is,
    formatString: index_js_2.base64.normalize,
};
