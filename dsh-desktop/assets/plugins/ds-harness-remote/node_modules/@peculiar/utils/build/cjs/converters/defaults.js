"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultConverterRegistry = exports.defaultConverters = exports.utf16leConverter = exports.utf16beConverter = exports.utf8Converter = exports.base64urlConverter = exports.base64Converter = exports.hexConverter = exports.binaryConverter = exports.pemConverter = void 0;
const index_js_1 = require("../encoding/index.js");
const index_js_2 = require("../pem/index.js");
var index_js_3 = require("../pem/index.js");
Object.defineProperty(exports, "pemConverter", { enumerable: true, get: function () { return index_js_3.pemConverter; } });
const registry_js_1 = require("./registry.js");
exports.binaryConverter = {
    name: "binary",
    aliases: ["latin1"],
    encode: index_js_1.binary.encode,
    decode: index_js_1.binary.decode,
    is: index_js_1.binary.is,
};
exports.hexConverter = {
    name: "hex",
    encode: index_js_1.hex.encode,
    decode: index_js_1.hex.decode,
    format: index_js_1.hex.format,
    is: index_js_1.hex.is,
    normalize: index_js_1.hex.normalize,
    parse: index_js_1.hex.parse,
};
exports.base64Converter = {
    name: "base64",
    aliases: ["b64"],
    encode: index_js_1.base64.encode,
    decode: index_js_1.base64.decode,
    is: index_js_1.base64.is,
    normalize: index_js_1.base64.normalize,
};
exports.base64urlConverter = {
    name: "base64url",
    aliases: ["base64-url", "b64url"],
    encode: index_js_1.base64url.encode,
    decode: index_js_1.base64url.decode,
    is: index_js_1.base64url.is,
    normalize: index_js_1.base64url.normalize,
};
exports.utf8Converter = {
    name: "utf8",
    aliases: ["utf-8"],
    encode: (data) => index_js_1.utf8.decode(data),
    decode: (text) => index_js_1.utf8.encode(text),
    is: (text) => typeof text === "string",
};
exports.utf16beConverter = {
    name: "utf16be",
    aliases: ["utf16", "utf-16", "utf-16be"],
    encode: (data) => index_js_1.utf16.decode(data),
    decode: (text) => index_js_1.utf16.encode(text),
    is: (text) => typeof text === "string",
};
exports.utf16leConverter = {
    name: "utf16le",
    aliases: ["utf-16le", "ucs2", "usc2"],
    encode: (data) => index_js_1.utf16.decode(data, { littleEndian: true }),
    decode: (text) => index_js_1.utf16.encode(text, { littleEndian: true }),
    is: (text) => typeof text === "string",
};
exports.defaultConverters = [
    exports.binaryConverter,
    exports.hexConverter,
    exports.base64Converter,
    exports.base64urlConverter,
    exports.utf8Converter,
    exports.utf16beConverter,
    exports.utf16leConverter,
    index_js_2.pemConverter,
];
exports.defaultConverterRegistry = (0, registry_js_1.createConverterRegistry)(exports.defaultConverters);
