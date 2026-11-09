import { base64 } from "./base64.js";
const BASE64URL_REGEX = /^[A-Za-z0-9_-]*$/;
export function normalize(text) {
    return text.replace(/[\n\r\t ]/g, "");
}
export function is(text) {
    return typeof text === "string" && BASE64URL_REGEX.test(normalize(text));
}
export function encode(data, _options) {
    return base64.encode(data).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
export function decode(text, _options) {
    const normalized = normalize(text);
    if (!is(normalized)) {
        throw new TypeError("Input is not valid Base64Url text");
    }
    return base64.decode(base64.pad(normalized.replace(/-/g, "+").replace(/_/g, "/")));
}
export const base64url = { encode, decode, is, normalize };
