'use strict';

const createFunction = require('generate-function');
const LinkedList = require('internal/linked-list');

/**
 * An optimised partial implementation of Buffer list from `bl`.
 */
class BufferList {
  /**
   * @class
   */
  constructor() {
    this.queue = new LinkedList();
    this.offset = 0;
  }

  /**
   * The number of bytes in list.
   * @returns {number}
   */
  get length() {
    return this.queue.length - this.offset;
  }

  /**
   * Adds an additional buffer or BufferList to the internal list.
   * @param {Buffer|Buffer[]|BufferList|BufferList[]} buf
   */
  append(buf) {
    if (Buffer.isBuffer(buf)) {
      if (this.offset > 0) {
        const head = this.queue.shift();
        this.queue.unshift(head.slice(this.offset));

        this.offset = 0;
      }

      this.queue.push(buf);
    } else if (Array.isArray(buf)) {
      for (let i = 0; i < buf.length; i += 1) {
        this.append(buf[i]);
      }
    } else if (buf instanceof BufferList) {
      if (this.offset > 0) {
        const head = this.queue.shift();
        this.queue.unshift(head.slice(this.offset));

        this.offset = 0;
      }

      if (buf.offset > 0) {
        const head = buf.queue.shift();
        buf.queue.unshift(head.slice(buf.offset));

        buf.offset = 0;
      }

      let leaf = buf.queue.head;

      while (leaf) {
        this.queue.push(leaf.buffer);
        leaf = leaf.next;
      }
    }
  }

  /* eslint-disable consistent-return */
  /**
   * Return the byte at the specified index.
   * @param {number} index Index of the byte in the Buffer list.
   * @returns {number}
   */
  get(index) {
    let i = index;

    while (i >= this.length) {
      i -= this.length;
    }

    while (i < 0) {
      i += this.length;
    }

    let leaf = this.queue.head;
    let { offset } = this;

    while (leaf) {
      if (leaf.buffer.length - offset > i) {
        return leaf.buffer[i + offset];
      }

      i -= leaf.buffer.length - offset;
      offset = 0;
      leaf = leaf.next;
    }
  }
  /* eslint-enable consistent-return */

  /**
   * Returns a new Buffer object containing the bytes within the range specified.
   * @param {number} start
   * @param {number} end
   * @returns {Buffer}
   */
  slice(start, end) {
    /* eslint-disable no-param-reassign */
    if (typeof start !== 'number') {
      start = 0;
    }

    if (typeof end !== 'number') {
      end = this.length;
    }

    while (start < 0) {
      start += this.length;
    }

    while (end < 0) {
      end += this.length;
    }

    end = Math.min(end, this.length);

    if (start >= this.length || end === 0) {
      return Buffer.alloc(0);
    }

    const tmpStart = start;
    start = Math.min(tmpStart, end);
    end = Math.max(tmpStart, end);

    const subset = this.queue.slice(start + this.offset, end + this.offset);

    // Buffer.concat() doesn't have optimization for count == 1
    if (subset.count === 1) {
      return subset.first;
    }

    let leaf = subset.head;
    const target = Buffer.allocUnsafe(subset.length);
    let offset = 0;

    for (let i = 0; i < subset.count; i += 1) {
      target.set(leaf.buffer, offset);
      offset += leaf.buffer.length;
      leaf = leaf.next;
    }

    return target;
    /* eslint-enable no-param-reassign */
  }

  /**
   * Return a string representation of the buffer.
   * @param {string} encoding
   * @param {number} start
   * @param {number} end
   * @returns {string}
   */
  toString(encoding, start, end) {
    return this.slice(start, end).toString(encoding);
  }

  /**
   * Shift bytes off the start of the list.
   * @param {number} bytes
   */
  consume(bytes) {
    let remainder = bytes;

    while (this.length > 0) {
      const firstLength = this.queue.first.length - this.offset;

      if (remainder >= firstLength) {
        this.queue.shift();

        remainder -= firstLength;
        this.offset = 0;
      } else {
        this.offset += remainder;
        break;
      }
    }
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
    /* eslint-disable no-param-reassign */
    if (!Number.isInteger(byte)) {
      throw new TypeError('Invalid argument 1');
    }

    if (byte < 0 || byte > 0xff) {
      throw new Error('Invalid argument 1');
    }

    if (!Number.isInteger(offset)) {
      offset = 0;
    }

    while (offset >= this.length) {
      offset -= this.length;
    }

    while (offset < 0) {
      offset += this.length;
    }

    let leaf = this.queue.head;
    let bias = 0;

    const next = () => {
      bias += leaf.buffer.length;
      leaf = leaf.next;
    };

    while (leaf) {
      let byteOffset = 0;

      if (leaf === this.queue.head) {
        byteOffset += this.offset;
      }

      // `offset` is point to next chunk
      if (offset >= leaf.buffer.length - byteOffset) {
        offset -= leaf.buffer.length - byteOffset;
        next();
        continue; // eslint-disable-line no-continue
      }

      // `offset` is point to current chunk
      if (offset < leaf.buffer.length) {
        byteOffset += offset;
      }

      const index = leaf.buffer.indexOf(byte, byteOffset);

      if (index > -1) {
        return index + bias - this.offset;
      }

      next();

      if (byteOffset > this.offset) {
        offset = 0;
      }
    }

    return -1;
    /* eslint-enable no-param-reassign */
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

Object.keys(fixedReadMethods).forEach(method => {
  const gen = createFunction();

  gen(`
    function bufferlist_${method}(offset = 0) {
      const start = offset + this.offset;
      const head = this.queue.first;
      const size = ${gen.formats.d(fixedReadMethods[method])};
      const isFirtsChunkEnough = head.length - start >= size;

      return isFirtsChunkEnough
        ? head.${method}(start)
        : this.slice(offset, offset + size).${method}(0)
    }
  `);

  BufferList.prototype[method] = gen.toFunction();
});

const metaReadMethods = ['readIntBE', 'readIntLE', 'readUIntBE', 'readUIntLE'];

metaReadMethods.forEach(method => {
  const gen = createFunction();

  gen(`
    function bufferlist_${method}(size, offset = 0) {
      const start = offset + this.offset;
      const head = this.queue.first;
      const isFirtsChunkEnough = head.length - start >= size;

      return isFirtsChunkEnough
        ? head.${method}(start, size)
        : this.slice(offset, offset + size).${method}(0, size)
    }
  `);

  BufferList.prototype[method] = gen.toFunction();
});

const fixedWriteMethods = {
  writeDoubleBE: 8,
  writeDoubleLE: 8,
  writeFloatBE: 4,
  writeFloatLE: 4,
  writeInt32BE: 4,
  writeInt32LE: 4,
  writeUInt32BE: 4,
  writeUInt32LE: 4,
  writeInt16BE: 2,
  writeInt16LE: 2,
  writeUInt16BE: 2,
  writeUInt16LE: 2,
  writeInt8: 1,
  writeUInt8: 1,
};

Object.keys(fixedWriteMethods).forEach(method => {
  const gen = createFunction();

  gen(`
    function bufferlist_${method}(value) {
      const size = ${gen.formats.d(fixedWriteMethods[method])};
      const buf = Buffer.allocUnsafe(size);
      buf.${method}(value, 0);
      this.append(buf);
    }
  `);

  BufferList.prototype[method] = gen.toFunction();
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
    function bufferlist_${method}(value, size) {
      const buf = Buffer.allocUnsafe(size);
      buf.${method}(value, 0, size);
      this.append(buf);
    }
  `);

  BufferList.prototype[method] = gen.toFunction();
});

module.exports = BufferList;
