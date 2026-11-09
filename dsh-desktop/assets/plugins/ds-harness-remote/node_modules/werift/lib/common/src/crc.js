"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.crc32 = crc32;
exports.crc32c = crc32c;
const POLY_CRC32 = 0xedb88320;
const POLY_CRC32C = 0x82f63b78;
function isBufferLike(input) {
    return typeof input !== "string";
}
function generateCRCTable(polynomial) {
    const table = new Array(256);
    let c = 0;
    for (let n = 0; n < 256; ++n) {
        c = n;
        c = c & 1 ? polynomial ^ (c >>> 1) : c >>> 1;
        c = c & 1 ? polynomial ^ (c >>> 1) : c >>> 1;
        c = c & 1 ? polynomial ^ (c >>> 1) : c >>> 1;
        c = c & 1 ? polynomial ^ (c >>> 1) : c >>> 1;
        c = c & 1 ? polynomial ^ (c >>> 1) : c >>> 1;
        c = c & 1 ? polynomial ^ (c >>> 1) : c >>> 1;
        c = c & 1 ? polynomial ^ (c >>> 1) : c >>> 1;
        c = c & 1 ? polynomial ^ (c >>> 1) : c >>> 1;
        table[n] = c;
    }
    return new Int32Array(table);
}
function generateSliceBy16Tables(table0) {
    const table = new Int32Array(4096);
    let c = 0;
    let v = 0;
    let n = 0;
    for (n = 0; n < 256; ++n)
        table[n] = table0[n];
    for (n = 0; n < 256; ++n) {
        v = table0[n];
        for (c = 256 + n; c < 4096; c += 256) {
            v = table[c] = (v >>> 8) ^ table0[v & 0xff];
        }
    }
    const out = [];
    for (n = 1; n < 16; ++n) {
        out[n - 1] = table.subarray(n * 256, n * 256 + 256);
    }
    return out;
}
function crcGenericString(value, seed, table0) {
    let crc = seed ^ -1;
    let i = 0;
    const len = value.length;
    let c = 0;
    let d = 0;
    while (i < len) {
        c = value.charCodeAt(i++);
        if (c < 0x80) {
            crc = (crc >>> 8) ^ table0[(crc ^ c) & 0xff];
        }
        else if (c < 0x800) {
            crc = (crc >>> 8) ^ table0[(crc ^ (192 | ((c >> 6) & 31))) & 0xff];
            crc = (crc >>> 8) ^ table0[(crc ^ (128 | (c & 63))) & 0xff];
        }
        else if (c >= 0xd800 && c < 0xe000) {
            c = (c & 1023) + 64;
            d = value.charCodeAt(i++) & 1023;
            crc = (crc >>> 8) ^ table0[(crc ^ (240 | ((c >> 8) & 7))) & 0xff];
            crc = (crc >>> 8) ^ table0[(crc ^ (128 | ((c >> 2) & 63))) & 0xff];
            crc =
                (crc >>> 8) ^
                    table0[(crc ^ (128 | ((d >> 6) & 15) | ((c & 3) << 4))) & 0xff];
            crc = (crc >>> 8) ^ table0[(crc ^ (128 | (d & 63))) & 0xff];
        }
        else {
            crc = (crc >>> 8) ^ table0[(crc ^ (224 | ((c >> 12) & 15))) & 0xff];
            crc = (crc >>> 8) ^ table0[(crc ^ (128 | ((c >> 6) & 63))) & 0xff];
            crc = (crc >>> 8) ^ table0[(crc ^ (128 | (c & 63))) & 0xff];
        }
    }
    return ~crc >>> 0;
}
function crcBuffer(value, seed, table0, tables16) {
    const [t1, t2, t3, t4, t5, t6, t7, t8, t9, ta, tb, tc, td, te, tf] = tables16;
    let crc = seed ^ -1;
    let i = 0;
    let len = value.length - 15;
    while (i < len) {
        crc =
            tf[value[i++] ^ (crc & 255)] ^
                te[value[i++] ^ ((crc >>> 8) & 255)] ^
                td[value[i++] ^ ((crc >>> 16) & 255)] ^
                tc[value[i++] ^ (crc >>> 24)] ^
                tb[value[i++]] ^
                ta[value[i++]] ^
                t9[value[i++]] ^
                t8[value[i++]] ^
                t7[value[i++]] ^
                t6[value[i++]] ^
                t5[value[i++]] ^
                t4[value[i++]] ^
                t3[value[i++]] ^
                t2[value[i++]] ^
                t1[value[i++]] ^
                table0[value[i++]];
    }
    for (len += 15; i < len;) {
        crc = (crc >>> 8) ^ table0[(crc ^ value[i++]) & 0xff];
    }
    return ~crc >>> 0;
}
const table32 = generateCRCTable(POLY_CRC32);
const tables32By16 = generateSliceBy16Tables(table32);
const table32c = generateCRCTable(POLY_CRC32C);
const tables32cBy16 = generateSliceBy16Tables(table32c);
function crc32(input, seed = 0) {
    if (isBufferLike(input)) {
        return crcBuffer(input, seed, table32, tables32By16);
    }
    return crcGenericString(input, seed, table32);
}
function crc32c(input, seed = 0) {
    if (isBufferLike(input)) {
        return crcBuffer(input, seed, table32c, tables32cBy16);
    }
    return crcGenericString(input, seed, table32c);
}
//# sourceMappingURL=crc.js.map