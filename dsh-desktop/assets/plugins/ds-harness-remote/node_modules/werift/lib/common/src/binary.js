"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BitStream = exports.dumpBuffer = exports.BufferChain = exports.BitWriter2 = exports.BitWriter = void 0;
exports.random16 = random16;
exports.random32 = random32;
exports.bufferXor = bufferXor;
exports.bufferArrayXor = bufferArrayXor;
exports.getBit = getBit;
exports.paddingByte = paddingByte;
exports.paddingBits = paddingBits;
exports.bufferWriter = bufferWriter;
exports.createBufferWriter = createBufferWriter;
exports.bufferWriterLE = bufferWriterLE;
exports.bufferReader = bufferReader;
exports.buffer2ArrayBuffer = buffer2ArrayBuffer;
const crypto_1 = require("crypto");
function random16() {
    return (0, crypto_1.randomBytes)(2).readUInt16BE(0);
}
function random32() {
    return (0, crypto_1.randomBytes)(4).readUInt32BE(0);
}
function bufferXor(a, b) {
    if (a.length !== b.length) {
        throw new TypeError("[webrtc-stun] You can not XOR buffers which length are different");
    }
    const length = a.length;
    const buffer = Buffer.allocUnsafe(length);
    for (let i = 0; i < length; i++) {
        buffer[i] = a[i] ^ b[i];
    }
    return buffer;
}
function bufferArrayXor(arr) {
    const length = [...arr]
        .sort((a, b) => a.length - b.length)
        .reverse()[0].length;
    const xored = Buffer.allocUnsafe(length);
    for (let i = 0; i < length; i++) {
        xored[i] = 0;
        arr.forEach((buffer) => {
            xored[i] ^= buffer[i] ?? 0;
        });
    }
    return xored;
}
class BitWriter {
    constructor(bitLength) {
        Object.defineProperty(this, "bitLength", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: bitLength
        });
        Object.defineProperty(this, "value", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
    }
    set(size, startIndex, value) {
        value &= (1 << size) - 1;
        this.value |= value << (this.bitLength - size - startIndex);
        return this;
    }
    get buffer() {
        const length = Math.ceil(this.bitLength / 8);
        const buf = Buffer.alloc(length);
        buf.writeUIntBE(this.value, 0, length);
        return buf;
    }
}
exports.BitWriter = BitWriter;
class BitWriter2 {
    /**
     * 各valueがオクテットを跨いではならない
     */
    constructor(
    /**Max 32bit */
    bitLength) {
        Object.defineProperty(this, "bitLength", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: bitLength
        });
        Object.defineProperty(this, "_value", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0n
        });
        Object.defineProperty(this, "offset", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0n
        });
        if (bitLength > 32) {
            throw new Error();
        }
    }
    set(value, size = 1) {
        let value_b = BigInt(value);
        const size_b = BigInt(size);
        value_b &= (1n << size_b) - 1n;
        this._value |= value_b << (BigInt(this.bitLength) - size_b - this.offset);
        this.offset += size_b;
        return this;
    }
    get value() {
        return Number(this._value);
    }
    get buffer() {
        const length = Math.ceil(this.bitLength / 8);
        const buf = Buffer.alloc(length);
        buf.writeUIntBE(this.value, 0, length);
        return buf;
    }
}
exports.BitWriter2 = BitWriter2;
function getBit(bits, startIndex, length = 1) {
    let bin = bits.toString(2).split("");
    bin = [...Array(8 - bin.length).fill("0"), ...bin];
    const s = bin.slice(startIndex, startIndex + length).join("");
    const v = Number.parseInt(s, 2);
    return v;
}
function paddingByte(bits) {
    const dec = bits.toString(2).split("");
    return [...[...Array(8 - dec.length)].map(() => "0"), ...dec].join("");
}
function paddingBits(bits, expectLength) {
    const dec = bits.toString(2);
    return [...[...Array(expectLength - dec.length)].map(() => "0"), ...dec].join("");
}
function bufferWriter(bytes, values) {
    return createBufferWriter(bytes)(values);
}
function createBufferWriter(bytes, singleBuffer) {
    const length = bytes.reduce((acc, cur) => acc + cur, 0);
    const reuseBuffer = singleBuffer ? Buffer.alloc(length) : undefined;
    return (values) => {
        const buf = reuseBuffer || Buffer.alloc(length);
        let offset = 0;
        values.forEach((v, i) => {
            const size = bytes[i];
            if (size === 8)
                buf.writeBigUInt64BE(v, offset);
            else
                buf.writeUIntBE(v, offset, size);
            offset += size;
        });
        return buf;
    };
}
function bufferWriterLE(bytes, values) {
    const length = bytes.reduce((acc, cur) => acc + cur, 0);
    const buf = Buffer.alloc(length);
    let offset = 0;
    values.forEach((v, i) => {
        const size = bytes[i];
        if (size === 8)
            buf.writeBigUInt64LE(v, offset);
        else
            buf.writeUIntLE(v, offset, size);
        offset += size;
    });
    return buf;
}
function bufferReader(buf, bytes) {
    let offset = 0;
    return bytes.map((v) => {
        let read;
        if (v === 8) {
            read = buf.readBigUInt64BE(offset);
        }
        else {
            read = buf.readUIntBE(offset, v);
        }
        offset += v;
        return read;
    });
}
class BufferChain {
    constructor(size) {
        Object.defineProperty(this, "buffer", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        this.buffer = Buffer.alloc(size);
    }
    writeInt16BE(value, offset) {
        this.buffer.writeInt16BE(value, offset);
        return this;
    }
    writeUInt8(value, offset) {
        this.buffer.writeUInt8(value, offset);
        return this;
    }
}
exports.BufferChain = BufferChain;
const dumpBuffer = (data) => "0x" +
    data
        .toString("hex")
        .replace(/(.)(.)/g, "$1$2 ")
        .split(" ")
        .filter((s) => s != undefined && s.length > 0)
        .join(",0x");
exports.dumpBuffer = dumpBuffer;
function buffer2ArrayBuffer(buf) {
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}
class BitStream {
    constructor(uint8Array) {
        Object.defineProperty(this, "uint8Array", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: uint8Array
        });
        Object.defineProperty(this, "position", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "bitsPending", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
    }
    writeBits(bits, value) {
        if (bits == 0) {
            return this;
        }
        value &= 0xffffffff >>> (32 - bits);
        let bitsConsumed;
        if (this.bitsPending > 0) {
            if (this.bitsPending > bits) {
                this.uint8Array[this.position - 1] |=
                    value << (this.bitsPending - bits);
                bitsConsumed = bits;
                this.bitsPending -= bits;
            }
            else if (this.bitsPending == bits) {
                this.uint8Array[this.position - 1] |= value;
                bitsConsumed = bits;
                this.bitsPending = 0;
            }
            else {
                this.uint8Array[this.position - 1] |=
                    value >> (bits - this.bitsPending);
                // ???
                bitsConsumed = this.bitsPending;
                this.bitsPending = 0;
            }
        }
        else {
            bitsConsumed = Math.min(8, bits);
            this.bitsPending = 8 - bitsConsumed;
            this.uint8Array[this.position++] =
                (value >> (bits - bitsConsumed)) << this.bitsPending;
        }
        bits -= bitsConsumed;
        if (bits > 0) {
            this.writeBits(bits, value);
        }
        return this;
    }
    readBits(bits) {
        return this._readBits(bits);
    }
    _readBits(bits, bitBuffer) {
        if (typeof bitBuffer == "undefined") {
            bitBuffer = 0;
        }
        if (bits == 0) {
            return bitBuffer;
        }
        let partial;
        let bitsConsumed;
        if (this.bitsPending > 0) {
            const byte = this.uint8Array[this.position - 1] & (0xff >> (8 - this.bitsPending));
            bitsConsumed = Math.min(this.bitsPending, bits);
            this.bitsPending -= bitsConsumed;
            partial = byte >> this.bitsPending;
        }
        else {
            bitsConsumed = Math.min(8, bits);
            this.bitsPending = 8 - bitsConsumed;
            partial = this.uint8Array[this.position++] >> this.bitsPending;
        }
        bits -= bitsConsumed;
        bitBuffer = (bitBuffer << bitsConsumed) | partial;
        return bits > 0 ? this._readBits(bits, bitBuffer) : bitBuffer;
    }
    seekTo(bitPos) {
        this.position = (bitPos / 8) | 0;
        this.bitsPending = bitPos % 8;
        if (this.bitsPending > 0) {
            this.bitsPending = 8 - this.bitsPending;
            this.position++;
        }
    }
}
exports.BitStream = BitStream;
//# sourceMappingURL=binary.js.map