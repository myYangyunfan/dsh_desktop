"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BufferSourceConverter = void 0;
const index_js_1 = require("../bytes/index.js");
class BufferSourceConverter {
    static isArrayBuffer(data) {
        return (0, index_js_1.isArrayBuffer)(data);
    }
    static toArrayBuffer(data) {
        return (0, index_js_1.toArrayBuffer)(data);
    }
    static toUint8Array(data) {
        return (0, index_js_1.toUint8Array)(data);
    }
    static toView(data, type) {
        return (0, index_js_1.toView)(data, type);
    }
    static isBufferSource(data) {
        return (0, index_js_1.isBufferSource)(data);
    }
    static isArrayBufferView(data) {
        return (0, index_js_1.isArrayBufferView)(data);
    }
    static isEqual(a, b) {
        return (0, index_js_1.equal)(a, b);
    }
    static concat(first, second, ...rest) {
        if (Array.isArray(first)) {
            return typeof second === "function"
                ? (0, index_js_1.concat)(first, second)
                : (0, index_js_1.concat)(first);
        }
        const buffers = [first, second, ...rest].filter(Boolean);
        return (0, index_js_1.concat)(buffers);
    }
}
exports.BufferSourceConverter = BufferSourceConverter;
