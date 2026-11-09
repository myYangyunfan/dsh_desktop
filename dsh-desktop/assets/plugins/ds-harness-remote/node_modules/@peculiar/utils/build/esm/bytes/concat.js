import { isBufferSource, toUint8Array, toView } from "./buffer-source.js";
export function concatToUint8Array(buffers) {
    const views = [];
    let length = 0;
    for (const buffer of buffers) {
        const view = toUint8Array(buffer);
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
export function concat(first, second, ...rest) {
    let buffers;
    let type;
    if (typeof second === "function") {
        buffers = Array.from(first);
        type = second;
    }
    else if (isBufferSource(first)) {
        buffers = [first, second, ...rest].filter(isBufferSource);
    }
    else {
        buffers = Array.from(first);
        if (second) {
            buffers.push(second);
        }
        buffers.push(...rest);
    }
    const bytes = concatToUint8Array(buffers);
    return type ? toView(bytes, type) : bytes.buffer;
}
