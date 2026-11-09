import { toUint8Array } from "../bytes/index.js";
export function encode(data) {
    const bytes = toUint8Array(data);
    let result = "";
    for (const byte of bytes) {
        result += String.fromCharCode(byte);
    }
    return result;
}
export function decode(text) {
    const result = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i++) {
        result[i] = text.charCodeAt(i) & 0xff;
    }
    return result;
}
export function is(text) {
    return typeof text === "string";
}
export const binary = { encode, decode, is };
