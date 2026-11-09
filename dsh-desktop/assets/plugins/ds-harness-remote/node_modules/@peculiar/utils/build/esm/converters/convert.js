import { toArrayBuffer } from "../bytes/index.js";
import { base64, base64url, binary, hex, utf8, utf16 } from "../encoding/index.js";
import { defaultConverterRegistry } from "./defaults.js";
function encode(name, data, ...args) {
    return defaultConverterRegistry.encode(name, data, ...args);
}
function decode(name, text, ...args) {
    return defaultConverterRegistry.decode(name, text, ...args);
}
function tryDecode(name, text, ...args) {
    return defaultConverterRegistry.tryDecode(name, text, ...args);
}
function normalize(name, text, ...args) {
    return defaultConverterRegistry.normalize(name, text, ...args);
}
function parse(name, text, ...args) {
    return defaultConverterRegistry.parse(name, text, ...args);
}
function format(name, data, value) {
    return defaultConverterRegistry.format(name, data, value);
}
function transcode(text, options) {
    return defaultConverterRegistry.transcode(text, options);
}
function detect(text, options) {
    return defaultConverterRegistry.detect(text, options);
}
function normalizeEncodingName(encoding) {
    return encoding.toLowerCase();
}
export const convert = {
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
            return toArrayBuffer(hex.decode(text, { allowOddLength: true }));
        }
        return toArrayBuffer(decode(encoding, text));
    },
    toBase64: base64.encode,
    fromBase64: (text) => toArrayBuffer(base64.decode(text)),
    toBase64Url: base64url.encode,
    fromBase64Url: (text) => toArrayBuffer(base64url.decode(text)),
    toHex: hex.encode,
    fromHex: (text) => toArrayBuffer(hex.decode(text, { allowOddLength: true })),
    toBinary: binary.encode,
    fromBinary: (text) => toArrayBuffer(binary.decode(text)),
    toUtf8String: utf8.decode,
    fromUtf8String: (text) => toArrayBuffer(utf8.encode(text)),
    toUtf16String: (data, littleEndian = false) => utf16.decode(data, { littleEndian }),
    fromUtf16String: (text, littleEndian = false) => toArrayBuffer(utf16.encode(text, { littleEndian })),
    isHex: hex.is,
    isBase64: base64.is,
    isBase64Url: base64url.is,
    formatString: base64.normalize,
};
