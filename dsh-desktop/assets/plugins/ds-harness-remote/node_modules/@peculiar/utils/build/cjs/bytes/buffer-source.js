"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isArrayBuffer = isArrayBuffer;
exports.isSharedArrayBuffer = isSharedArrayBuffer;
exports.isArrayBufferLike = isArrayBufferLike;
exports.isArrayBufferView = isArrayBufferView;
exports.isBufferSource = isBufferSource;
exports.assertBufferSource = assertBufferSource;
exports.toUint8Array = toUint8Array;
exports.toUint8ArrayCopy = toUint8ArrayCopy;
exports.toArrayBuffer = toArrayBuffer;
exports.toArrayBufferLike = toArrayBufferLike;
exports.toView = toView;
exports.toViewCopy = toViewCopy;
const ARRAY_BUFFER_TAG = "[object ArrayBuffer]";
const SHARED_ARRAY_BUFFER_TAG = "[object SharedArrayBuffer]";
function tagOf(value) {
    return Object.prototype.toString.call(value);
}
function isDataViewConstructor(type) {
    return type === DataView || type.prototype instanceof DataView;
}
function bytesPerElement(type) {
    if (isDataViewConstructor(type)) {
        return 1;
    }
    const value = type.BYTES_PER_ELEMENT;
    return value ?? 1;
}
function isArrayBufferViewLike(value) {
    if (ArrayBuffer.isView(value)) {
        return true;
    }
    if (!value || typeof value !== "object") {
        return false;
    }
    const view = value;
    return typeof view.byteOffset === "number"
        && typeof view.byteLength === "number"
        && isArrayBufferLike(view.buffer);
}
function copyBytes(data) {
    const view = toUint8Array(data);
    const copy = new Uint8Array(view.byteLength);
    copy.set(view);
    return copy;
}
function isArrayBuffer(value) {
    return tagOf(value) === ARRAY_BUFFER_TAG;
}
function isSharedArrayBuffer(value) {
    return typeof SharedArrayBuffer !== "undefined" && tagOf(value) === SHARED_ARRAY_BUFFER_TAG;
}
function isArrayBufferLike(value) {
    return isArrayBuffer(value) || isSharedArrayBuffer(value);
}
function isArrayBufferView(value) {
    return isArrayBufferViewLike(value);
}
function isBufferSource(value) {
    return isArrayBufferLike(value) || isArrayBufferView(value);
}
function assertBufferSource(value) {
    if (!isBufferSource(value)) {
        throw new TypeError("Expected ArrayBuffer, SharedArrayBuffer, or ArrayBufferView");
    }
}
function toUint8Array(data) {
    assertBufferSource(data);
    if (isArrayBufferLike(data)) {
        return new Uint8Array(data);
    }
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
}
function toUint8ArrayCopy(data) {
    return copyBytes(data);
}
function toArrayBuffer(data) {
    assertBufferSource(data);
    if (isArrayBuffer(data)) {
        return data;
    }
    const buffer = new ArrayBuffer(data.byteLength);
    new Uint8Array(buffer).set(toUint8Array(data));
    return buffer;
}
function toArrayBufferLike(data) {
    assertBufferSource(data);
    if (isArrayBufferLike(data)) {
        return data;
    }
    if (data.byteOffset === 0 && data.byteLength === data.buffer.byteLength) {
        return data.buffer;
    }
    return copyBytes(data).buffer;
}
function toView(data, type) {
    assertBufferSource(data);
    if (ArrayBuffer.isView(data) && data.constructor === type) {
        return data;
    }
    const view = toUint8Array(data);
    const elementSize = bytesPerElement(type);
    if (view.byteOffset % elementSize !== 0 || view.byteLength % elementSize !== 0) {
        throw new RangeError(`Cannot create ${type.name} over unaligned byte range`);
    }
    if (isDataViewConstructor(type)) {
        return new type(view.buffer, view.byteOffset, view.byteLength);
    }
    return new type(view.buffer, view.byteOffset, view.byteLength / elementSize);
}
function toViewCopy(data, type) {
    const copy = toUint8ArrayCopy(data);
    return toView(copy, type);
}
