import { toUint8Array } from "../bytes/index.js";
export function encode(text) {
    return new TextEncoder().encode(text);
}
export function decode(data) {
    return new TextDecoder("utf-8", { fatal: false }).decode(toUint8Array(data));
}
export const utf8 = { encode, decode };
