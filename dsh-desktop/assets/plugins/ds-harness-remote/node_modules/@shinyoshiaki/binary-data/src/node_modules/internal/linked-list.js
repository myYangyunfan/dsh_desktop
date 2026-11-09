'use strict';

/**
 * A Leaf in a linked list.
 */
class Chunk {
  /**
   * @class Chunk
   */
  constructor() {
    /** @type {Chunk} */
    this.next = null;
    /** @type {Buffer} */
    this.buffer = null;
  }
}

/**
 * Linked list for buffers.
 */
module.exports = class LinkedList {
  /**
   * @class LinkedList
   */
  constructor() {
    /** @type {Chunk} */
    this.head = null;
    /** @type {Chunk} */
    this.tail = null;

    this.length = 0;
    this.count = 0;
  }

  /**
   * Add a buffer to the end of the list.
   * @param {Buffer} buf
   */
  push(buf) {
    const entry = new Chunk();
    entry.buffer = buf;

    if (this.length > 0) {
      this.tail.next = entry;
    } else {
      this.head = entry;
    }

    this.tail = entry;
    this.length += buf.length;
    this.count += 1;
  }

  /**
   * Add a buffer to the start of the list.
   * @param {Buffer} buf
   */
  unshift(buf) {
    const entry = new Chunk();
    entry.buffer = buf;
    entry.next = this.head;

    if (this.isEmpty()) {
      this.tail = entry;
    }

    this.head = entry;
    this.length += buf.length;
    this.count += 1;
  }

  /**
   * Remove and return first element's buffer.
   * @returns {Buffer|null}
   */
  shift() {
    if (this.isEmpty()) {
      return null;
    }

    const ret = this.head.buffer;

    if (this.head === this.tail) {
      this.head = null;
      this.tail = null;
    } else {
      this.head = this.head.next;
    }

    this.length -= ret.length;
    this.length = Math.max(this.length, 0);
    this.count -= 1;

    return ret;
  }

  /**
   * Get buffer of first element or null.
   * @returns {Buffer|null}
   */
  get first() {
    if (this.isEmpty()) {
      return null;
    }

    return this.head.buffer;
  }

  /**
   * Get buffer of last element or null.
   * @returns {Buffer|null}
   */
  get last() {
    if (this.isEmpty()) {
      return null;
    }

    return this.tail.buffer;
  }

  /**
   * Check if a list is empty.
   * @returns {bool}
   */
  isEmpty() {
    return this.length === 0;
  }

  /**
   * Remove all elements from a list.
   */
  clear() {
    this.head = null;
    this.tail = null;
    this.length = 0;
    this.count = 0;
  }

  /**
   * Return a subset of linked list.
   * @param {number} start Offset bytes from start.
   * @param {number} end Bytes count.
   * @returns {LinkedList}
   */
  slice(start, end) {
    if (start < 0 || start >= this.length) {
      return new LinkedList();
    }

    if (end < 0 || end > this.length || end < start) {
      return new LinkedList();
    }

    const list = new LinkedList();

    let leaf = this.head;
    let offsetStart = start;
    let offsetEnd = end;

    // Find head of slice.
    while (leaf) {
      if (leaf.buffer.length > offsetStart) {
        if (offsetStart === 0 && leaf.buffer.length <= offsetEnd) {
          list.push(leaf.buffer);
        } else if (leaf.buffer.length >= offsetEnd) {
          list.push(leaf.buffer.slice(offsetStart, offsetEnd));
        } else {
          list.push(leaf.buffer.slice(offsetStart));
        }

        break;
      }

      offsetStart -= leaf.buffer.length;
      offsetEnd -= leaf.buffer.length;
      leaf = leaf.next;
    }

    // Find tail of slice
    if (leaf.buffer.length < offsetEnd) {
      while (leaf) {
        if (leaf.buffer.length === offsetEnd) {
          list.push(leaf.buffer);
          break;
        } else if (leaf.buffer.length > offsetEnd) {
          list.push(leaf.buffer.slice(0, offsetEnd));
          break;
        } else if (offsetStart < 0 && leaf.buffer.length < offsetEnd) {
          list.push(leaf.buffer);
        }

        offsetStart -= leaf.buffer.length;
        offsetEnd -= leaf.buffer.length;
        leaf = leaf.next;
      }
    }

    return list;
  }
};
