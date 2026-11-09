"use strict";
/*
 * Copyright (C) 2016 Bilibili. All Rights Reserved.
 *
 * @author zheng qian <xqq@xqq.im>
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
Object.defineProperty(exports, "__esModule", { value: true });
// Exponential-Golomb buffer decoder
class ExpGolomb {
    constructor(uint8array) {
        Object.defineProperty(this, "uint8array", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: uint8array
        });
        Object.defineProperty(this, "TAG", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: "ExpGolomb"
        });
        Object.defineProperty(this, "_buffer", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "_buffer_index", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "_total_bytes", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "_total_bits", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "_current_word", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "_current_word_bits_left", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        this._buffer = uint8array;
        this._total_bytes = uint8array.byteLength;
        this._total_bits = uint8array.byteLength * 8;
    }
    destroy() {
        this._buffer = null;
    }
    _fillCurrentWord() {
        const buffer_bytes_left = this._total_bytes - this._buffer_index;
        if (buffer_bytes_left <= 0)
            throw new Error("ExpGolomb: _fillCurrentWord() but no bytes available");
        const bytes_read = Math.min(4, buffer_bytes_left);
        const word = new Uint8Array(4);
        word.set(this._buffer.subarray(this._buffer_index, this._buffer_index + bytes_read));
        this._current_word = new DataView(word.buffer).getUint32(0, false);
        this._buffer_index += bytes_read;
        this._current_word_bits_left = bytes_read * 8;
    }
    readBits(bits) {
        if (bits > 32)
            throw new Error("ExpGolomb: readBits() bits exceeded max 32bits!");
        if (bits <= this._current_word_bits_left) {
            const result = this._current_word >>> (32 - bits);
            this._current_word <<= bits;
            this._current_word_bits_left -= bits;
            return result;
        }
        let result = this._current_word_bits_left ? this._current_word : 0;
        result = result >>> (32 - this._current_word_bits_left);
        const bits_need_left = bits - this._current_word_bits_left;
        this._fillCurrentWord();
        const bits_read_next = Math.min(bits_need_left, this._current_word_bits_left);
        const result2 = this._current_word >>> (32 - bits_read_next);
        this._current_word <<= bits_read_next;
        this._current_word_bits_left -= bits_read_next;
        result = (result << bits_read_next) | result2;
        return result;
    }
    readBool() {
        return this.readBits(1) === 1;
    }
    readByte() {
        return this.readBits(8);
    }
    _skipLeadingZero() {
        let zero_count;
        for (zero_count = 0; zero_count < this._current_word_bits_left; zero_count++) {
            if (0 !== (this._current_word & (0x80000000 >>> zero_count))) {
                this._current_word <<= zero_count;
                this._current_word_bits_left -= zero_count;
                return zero_count;
            }
        }
        this._fillCurrentWord();
        return zero_count + this._skipLeadingZero();
    }
    readUEG() {
        // unsigned exponential golomb
        const leading_zeros = this._skipLeadingZero();
        return this.readBits(leading_zeros + 1) - 1;
    }
    readSEG() {
        // signed exponential golomb
        const value = this.readUEG();
        if (value & 0x01) {
            return (value + 1) >>> 1;
        }
        else {
            return -1 * (value >>> 1);
        }
    }
}
exports.default = ExpGolomb;
//# sourceMappingURL=exp-golomb.js.map