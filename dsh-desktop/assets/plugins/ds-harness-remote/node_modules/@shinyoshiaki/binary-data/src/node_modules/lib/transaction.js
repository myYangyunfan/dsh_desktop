'use strict';

const createFunction = require('generate-function');
const NotEnoughDataError = require('lib/not-enough-data-error');

/**
 * Helps to read the whole data chunk.
 */
class Transaction {
  /**
   * @class Transaction
   * @param {DecodeStream} stream
   */
  constructor(stream) {
    this.stream = stream;
    this.index = 0;
  }

  /**
   * @param {Buffer} buf
   */
  append(buf) {
    this.stream.append(buf);
  }

  /**
   * Confirm reading and removes data from stream.
   */
  commit() {
    this.stream.consume(this.index);
  }

  /**
   * Get byte from stream by index.
   * @param {number} i
   * @returns {number}
   */
  get(i = 0) {
    return this.stream.get(this.index + i);
  }

  /**
   * Get the number of bytes in stream.
   * @returns {number}
   */
  get length() {
    return this.stream.length;
  }

  /**
   * @param {number} [start]
   * @param {number} [end]
   * @returns {Buffer}
   */
  slice(start, end) {
    return this.stream.slice(start, end);
  }

  /**
   * @param {string} encoding
   * @param {number} [start]
   * @param {number} [end]
   * @returns {string}
   */
  toString(encoding, start, end) {
    return this.stream.toString(encoding, start, end);
  }

  /**
   * Read provided amount of bytes from stream.
   * @param {number} size
   * @returns {Buffer}
   */
  readBuffer(size) {
    assertSize(this.index + size, this.length);

    const buf = this.stream.slice(this.index, this.index + size);
    this.index += size;

    return buf;
  }

  /**
   * @param {number} byte
   * @param {number} [offset]
   * @returns {number}
   */
  indexOf(byte, offset = 0) {
    return this.stream.indexOf(byte, this.index + offset) - this.index;
  }
}

const methods = {
  readDoubleBE: 8,
  readDoubleLE: 8,
  readFloatBE: 4,
  readFloatLE: 4,
  readInt32BE: 4,
  readInt32LE: 4,
  readUInt32BE: 4,
  readUInt32LE: 4,
  readInt16BE: 2,
  readInt16LE: 2,
  readUInt16BE: 2,
  readUInt16LE: 2,
  readInt8: 1,
  readUInt8: 1,
};

Object.keys(methods).forEach(method => {
  const gen = createFunction();
  const bytes = methods[method];

  gen(`
    function transaction_${method}() {
      assertSize(this.index + ${gen.formats.d(bytes)}, this.length);
      const value = this.stream.buffer.${method}(this.index);
      this.index += ${gen.formats.d(bytes)};
      return value;
    }
  `);

  Transaction.prototype[method] = gen.toFunction({ assertSize });
});

['readIntBE', 'readIntLE', 'readUIntBE', 'readUIntLE'].forEach(method => {
  const gen = createFunction();

  gen(`
    function transaction_${method}(bytes) {
      assertSize(this.index + bytes, this.length);
      const value = this.stream.buffer.${method}(bytes, this.index);
      this.index += bytes;
      return value;
    }
  `);

  Transaction.prototype[method] = gen.toFunction({ assertSize });
});

module.exports = Transaction;

/**
 * Check if stream is able to read requested amound of data.
 * @param {number} size Requested data size to read.
 * @param {number} length The number of bytes in stream.
 */
function assertSize(size, length) {
  if (size > length) {
    throw new NotEnoughDataError(size, length);
  }
}
