import { concat, equal, isArrayBuffer, isArrayBufferView, isBufferSource, toArrayBuffer, toUint8Array, toView, } from "../bytes/index.js";
export class BufferSourceConverter {
    static isArrayBuffer(data) {
        return isArrayBuffer(data);
    }
    static toArrayBuffer(data) {
        return toArrayBuffer(data);
    }
    static toUint8Array(data) {
        return toUint8Array(data);
    }
    static toView(data, type) {
        return toView(data, type);
    }
    static isBufferSource(data) {
        return isBufferSource(data);
    }
    static isArrayBufferView(data) {
        return isArrayBufferView(data);
    }
    static isEqual(a, b) {
        return equal(a, b);
    }
    static concat(first, second, ...rest) {
        if (Array.isArray(first)) {
            return typeof second === "function"
                ? concat(first, second)
                : concat(first);
        }
        const buffers = [first, second, ...rest].filter(Boolean);
        return concat(buffers);
    }
}
