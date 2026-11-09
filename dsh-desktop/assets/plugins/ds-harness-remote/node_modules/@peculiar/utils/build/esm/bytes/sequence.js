import { toUint8Array, toUint8ArrayCopy } from "./buffer-source.js";
function clampIndex(value, fallback, length) {
    const normalized = Number.isFinite(value) ? Math.trunc(value) : fallback;
    if (normalized <= 0) {
        return 0;
    }
    if (normalized >= length) {
        return length;
    }
    return normalized;
}
function normalizeForwardRange(length, options) {
    const start = clampIndex(options?.start, 0, length);
    const end = clampIndex(options?.end, length, length);
    return end >= start ? [start, end] : [start, start];
}
function normalizeReverseRange(length, options) {
    const start = clampIndex(options?.start, length, length);
    const end = clampIndex(options?.end, 0, length);
    return start >= end ? [end, start] : [start, start];
}
function normalizeSliceIndex(value, fallback, length) {
    const normalized = Number.isFinite(value) ? Math.trunc(value) : fallback;
    if (normalized < 0) {
        return Math.max(length + normalized, 0);
    }
    if (normalized > length) {
        return length;
    }
    return normalized;
}
function encodeAscii(text) {
    const bytes = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i++) {
        bytes[i] = text.charCodeAt(i) & 0xff;
    }
    return bytes;
}
function encodeUtf8(text) {
    return new TextEncoder().encode(text);
}
function toPatternBytes(pattern, options) {
    if (typeof pattern === "string") {
        return options?.encoding === "utf8" ? encodeUtf8(pattern) : encodeAscii(pattern);
    }
    return toUint8Array(pattern);
}
function bytesEqualAt(data, pattern, offset) {
    for (let index = 0; index < pattern.byteLength; index++) {
        if (data[offset + index] !== pattern[index]) {
            return false;
        }
    }
    return true;
}
export function indexOf(data, pattern, options) {
    const bytes = toUint8Array(data);
    const needle = toPatternBytes(pattern, options);
    const [start, end] = normalizeForwardRange(bytes.byteLength, options);
    if (needle.byteLength === 0) {
        return start;
    }
    const lastOffset = end - needle.byteLength;
    if (lastOffset < start) {
        return -1;
    }
    for (let offset = start; offset <= lastOffset; offset++) {
        if (bytesEqualAt(bytes, needle, offset)) {
            return offset;
        }
    }
    return -1;
}
export function lastIndexOf(data, pattern, options) {
    const bytes = toUint8Array(data);
    const needle = toPatternBytes(pattern, options);
    const [end, start] = normalizeReverseRange(bytes.byteLength, options);
    if (needle.byteLength === 0) {
        return start;
    }
    const firstOffset = start - needle.byteLength;
    if (firstOffset < end) {
        return -1;
    }
    for (let offset = firstOffset; offset >= end; offset--) {
        if (bytesEqualAt(bytes, needle, offset)) {
            return offset;
        }
    }
    return -1;
}
export function includes(data, pattern, options) {
    return indexOf(data, pattern, options) !== -1;
}
export function startsWith(data, pattern, options) {
    const bytes = toUint8Array(data);
    const needle = toPatternBytes(pattern, options);
    if (needle.byteLength > bytes.byteLength) {
        return false;
    }
    return bytesEqualAt(bytes, needle, 0);
}
export function endsWith(data, pattern, options) {
    const bytes = toUint8Array(data);
    const needle = toPatternBytes(pattern, options);
    if (needle.byteLength > bytes.byteLength) {
        return false;
    }
    return bytesEqualAt(bytes, needle, bytes.byteLength - needle.byteLength);
}
export function slice(data, start, end) {
    const bytes = toUint8Array(data);
    const normalizedStart = normalizeSliceIndex(start, 0, bytes.byteLength);
    const normalizedEnd = normalizeSliceIndex(end, bytes.byteLength, bytes.byteLength);
    if (normalizedEnd <= normalizedStart) {
        return bytes.subarray(normalizedStart, normalizedStart);
    }
    return bytes.subarray(normalizedStart, normalizedEnd);
}
export function tail(data, length) {
    const bytes = toUint8Array(data);
    const normalizedLength = Number.isFinite(length) ? Math.max(0, Math.trunc(length)) : 0;
    if (normalizedLength >= bytes.byteLength) {
        return bytes;
    }
    return bytes.subarray(bytes.byteLength - normalizedLength);
}
export function copy(data) {
    return toUint8ArrayCopy(data);
}
export function compare(a, b) {
    const left = toUint8Array(a);
    const right = toUint8Array(b);
    const limit = Math.min(left.byteLength, right.byteLength);
    for (let index = 0; index < limit; index++) {
        if (left[index] < right[index]) {
            return -1;
        }
        if (left[index] > right[index]) {
            return 1;
        }
    }
    if (left.byteLength < right.byteLength) {
        return -1;
    }
    if (left.byteLength > right.byteLength) {
        return 1;
    }
    return 0;
}
