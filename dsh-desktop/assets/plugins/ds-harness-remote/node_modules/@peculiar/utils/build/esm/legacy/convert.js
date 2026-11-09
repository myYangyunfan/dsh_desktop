import { convert } from "../converters/index.js";
function normalizeTextEncoding(encoding) {
    return encoding === "ascii" ? "binary" : encoding;
}
export class Convert {
    static DEFAULT_UTF8_ENCODING = "utf8";
    static isHex(data) {
        return convert.isHex(data);
    }
    static isBase64(data) {
        return convert.isBase64(data);
    }
    static isBase64Url(data) {
        return convert.isBase64Url(data);
    }
    static ToString(buffer, enc = "utf8") {
        return convert.toString(buffer, enc);
    }
    static FromString(str, enc = "utf8") {
        if (!str) {
            return new ArrayBuffer(0);
        }
        return convert.fromString(str, enc);
    }
    static ToBase64(buffer) {
        return convert.toBase64(buffer);
    }
    static FromBase64(base64) {
        return convert.fromBase64(base64);
    }
    static FromBase64Url(base64url) {
        return convert.fromBase64Url(base64url);
    }
    static ToBase64Url(data) {
        return convert.toBase64Url(data);
    }
    static FromUtf8String(text, encoding = Convert.DEFAULT_UTF8_ENCODING) {
        return convert.fromString(text, normalizeTextEncoding(encoding));
    }
    static ToUtf8String(buffer, encoding = Convert.DEFAULT_UTF8_ENCODING) {
        return convert.toString(buffer, normalizeTextEncoding(encoding));
    }
    static FromBinary(text) {
        return convert.fromBinary(text);
    }
    static ToBinary(buffer) {
        return convert.toBinary(buffer);
    }
    static ToHex(buffer) {
        return convert.toHex(buffer);
    }
    static FromHex(hexString) {
        return convert.fromHex(hexString);
    }
    static ToUtf16String(buffer, littleEndian = false) {
        return convert.toUtf16String(buffer, littleEndian);
    }
    static FromUtf16String(text, littleEndian = false) {
        return convert.fromUtf16String(text, littleEndian);
    }
    static Base64Padding(base64) {
        const padCount = 4 - (base64.length % 4);
        return padCount < 4 ? base64 + "=".repeat(padCount) : base64;
    }
    static formatString(data) {
        return convert.formatString(data);
    }
}
