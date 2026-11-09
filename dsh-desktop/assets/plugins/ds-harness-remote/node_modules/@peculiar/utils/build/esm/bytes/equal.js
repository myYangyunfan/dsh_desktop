import { toUint8Array } from "./buffer-source.js";
export function equal(a, b, options = {}) {
    const left = toUint8Array(a);
    const right = toUint8Array(b);
    if (!options.constantTime && left.byteLength !== right.byteLength) {
        return false;
    }
    const length = Math.max(left.byteLength, right.byteLength);
    let diff = left.byteLength ^ right.byteLength;
    for (let i = 0; i < length; i++) {
        diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
    }
    return diff === 0;
}
