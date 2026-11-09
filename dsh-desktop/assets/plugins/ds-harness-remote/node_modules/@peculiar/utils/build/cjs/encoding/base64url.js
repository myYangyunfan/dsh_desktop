"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.base64url = void 0;
exports.normalize = normalize;
exports.is = is;
exports.encode = encode;
exports.decode = decode;
const base64_js_1 = require("./base64.js");
const BASE64URL_REGEX = /^[A-Za-z0-9_-]*$/;
function normalize(text) {
    return text.replace(/[\n\r\t ]/g, "");
}
function is(text) {
    return typeof text === "string" && BASE64URL_REGEX.test(normalize(text));
}
function encode(data, _options) {
    return base64_js_1.base64.encode(data).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function decode(text, _options) {
    const normalized = normalize(text);
    if (!is(normalized)) {
        throw new TypeError("Input is not valid Base64Url text");
    }
    return base64_js_1.base64.decode(base64_js_1.base64.pad(normalized.replace(/-/g, "+").replace(/_/g, "/")));
}
exports.base64url = { encode, decode, is, normalize };
