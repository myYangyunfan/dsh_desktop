'use strict';

const { Transform } = require('stream');
const createFunction = require('generate-function');
const BufferList = require('internal/buffer-list');
const NotEnoughDataError = require('lib/not-enough-data-error');

const kbuffer = Symbol('buffer');

/**
 * Binary data queue.
 * Also represent a part of BufferList API.
 */
class BinaryStream extends Transform {
  /**
   * @class Binary
   * @param {Object} options
   */
  constructor(options = {}) {
    super(options);

    this[kbuffer] = new BufferList();
  }

  /**
   * @returns {BufferList}
   */
  get buffer() {
    return this[kbuffer];
  }

  /**
   * @returns {number}
   */
  get length() {
    return this.buffer.length;
  }

  /**
   * @param {Buffer} buf
   */
  append(buf) {
    this.buffer.append(buf);
  }

  /**
   * @param {number} i
   * @returns {number}
   */
  get(i) {
    return this.buffer.get(i);
  }

  /**
   * @param {number} [start]
   * @param {number} [end]
   * @returns {Buffer}
   */
  slice(start, end) {
    return this.buffer.slice(start, end);
  }

  /**
   * @param {number} bytes
   */
  consume(bytes) {
    this.buffer.consume(bytes);
  }

  /**
   * @param {string} encoding
   * @param {number} [start]
   * @param {number} [end]
   * @returns {string}
   */
  toString(encoding, start, end) {
    return this.buffer.toString(encoding, start, end);
  }

  /**
   * Returns the first (least) index of an element
   * within the list equal to the specified value,
   * or -1 if none is found.
   * @param {number} byte
   * @param {number} [offset]
   * @returns {number}
   */
  indexOf(byte, offset = 0) {
    return this.buffer.indexOf(byte, offset);
  }

  /**
   * Read provided amount of bytes from stream.
   * @param {number} size
   * @returns {Buffer}
   */
  readBuffer(size) {
    assertSize(size, this.length);

    const buf = this.slice(0, size);
    this.consume(size);

    return buf;
  }

  /**
   * Write provided chunk to the stream.
   * @param {Buffer} chunk
   */
  writeBuffer(chunk) {
    this.append(chunk);
  }
}

const fixedReadMethods = {
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

const metaReadMethods = ['readIntBE', 'readIntLE', 'readUIntBE', 'readUIntLE'];

Object.keys(fixedReadMethods).forEach(method => {
  const gen = createFunction();

  gen(`
    function binary_${method}() {
      const bytes = ${gen.formats.d(fixedReadMethods[method])};
      assertSize(bytes, this.length);

      const res = this.buffer.${method}(0);
      this.consume(bytes);

      return res;
    }
  `);

  BinaryStream.prototype[method] = gen.toFunction({ assertSize });
});

metaReadMethods.forEach(method => {
  const gen = createFunction();

  gen(`
    function binary_${method}(size) {
      assertSize(size, this.length);

      const res = this.buffer.${method}(size, 0);
      this.consume(size);
      return res;
    }
  `);

  BinaryStream.prototype[method] = gen.toFunction({ assertSize });
});

const fixedWriteMethods = [
  'writeDoubleBE',
  'writeDoubleLE',
  'writeFloatBE',
  'writeFloatLE',
  'writeInt32BE',
  'writeInt32LE',
  'writeUInt32BE',
  'writeUInt32LE',
  'writeInt16BE',
  'writeInt16LE',
  'writeUInt16BE',
  'writeUInt16LE',
  'writeInt8',
  'writeUInt8',
];

fixedWriteMethods.forEach(method => {
  const gen = createFunction();

  gen(`
    function binary_${method}(value) {
      this.buffer.${method}(value);
    }
  `);

  BinaryStream.prototype[method] = gen.toFunction();
});

const metaWriteMethods = [
  'writeIntBE',
  'writeIntLE',
  'writeUIntBE',
  'writeUIntLE',
];

metaWriteMethods.forEach(method => {
  const gen = createFunction();

  gen(`
    function binary_${method}(value, size) {
      this.buffer.${method}(value, size);
    }
  `);

  BinaryStream.prototype[method] = gen.toFunction();
});

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

module.exports = BinaryStream;
