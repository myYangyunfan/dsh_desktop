import { toArrayBuffer } from "../bytes/index.js";
export function encode(text, options = {}) {
    const result = new ArrayBuffer(text.length * 2);
    const view = new DataView(result);
    for (let i = 0; i < text.length; i++) {
        view.setUint16(i * 2, text.charCodeAt(i), options.littleEndian ?? false);
    }
    return new Uint8Array(result);
}
export function decode(data, options = {}) {
    const buffer = toArrayBuffer(data);
    const view = new DataView(buffer);
    let result = "";
    for (let i = 0; i < buffer.byteLength; i += 2) {
        result += String.fromCharCode(view.getUint16(i, options.littleEndian ?? false));
    }
    return result;
}
export const utf16 = { encode, decode };
