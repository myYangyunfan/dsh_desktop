import { toUint8Array } from "../bytes/index.js";
import { encode as encodeBinary, decode as decodeBinary } from "./binary.js";
const BASE64_REGEX = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
function nodeBuffer() {
    return globalThis.Buffer;
}
export function normalize(text) {
    return text.replace(/[\n\r\t ]/g, "");
}
export function pad(text) {
    const remainder = text.length % 4;
    return remainder ? text + "=".repeat(4 - remainder) : text;
}
export function is(text) {
    if (typeof text !== "string") {
        return false;
    }
    const normalized = normalize(text);
    return normalized === "" || BASE64_REGEX.test(normalized);
}
export function encode(data, _options) {
    const bytes = toUint8Array(data);
    const buffer = nodeBuffer();
    if (buffer) {
        return buffer.from(bytes).toString("base64");
    }
    return btoa(encodeBinary(bytes));
}
export function decode(text, _options) {
    const normalized = normalize(text);
    if (!is(normalized)) {
        throw new TypeError("Input is not valid Base64 text");
    }
    const buffer = nodeBuffer();
    if (buffer) {
        return new Uint8Array(buffer.from(normalized, "base64"));
    }
    return decodeBinary(atob(normalized));
}
export const base64 = { encode, decode, is, normalize, pad };
