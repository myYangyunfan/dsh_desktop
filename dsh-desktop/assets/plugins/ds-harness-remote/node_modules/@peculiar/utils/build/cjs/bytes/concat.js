"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.concatToUint8Array = concatToUint8Array;
exports.concat = concat;
const buffer_source_js_1 = require("./buffer-source.js");
function concatToUint8Array(buffers) {
    const views = [];
    let length = 0;
    for (const buffer of buffers) {
        const view = (0, buffer_source_js_1.toUint8Array)(buffer);
        views.push(view);
        length += view.byteLength;
    }
    const result = new Uint8Array(length);
    let offset = 0;
    for (const view of views) {
        result.set(view, offset);
        offset += view.byteLength;
    }
    return result;
}
function concat(first, second, ...rest) {
    let buffers;
    let type;
    if (typeof second === "function") {
        buffers = Array.from(first);
        type = second;
    }
    else if ((0, buffer_source_js_1.isBufferSource)(first)) {
        buffers = [first, second, ...rest].filter(buffer_source_js_1.isBufferSource);
    }
    else {
        buffers = Array.from(first);
        if (second) {
            buffers.push(second);
        }
        buffers.push(...rest);
    }
    const bytes = concatToUint8Array(buffers);
    return type ? (0, buffer_source_js_1.toView)(bytes, type) : bytes.buffer;
}
