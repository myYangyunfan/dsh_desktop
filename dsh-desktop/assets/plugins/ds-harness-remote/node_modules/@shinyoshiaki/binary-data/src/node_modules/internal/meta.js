'use strict';

const symbols = require('internal/symbols');

/**
 * Store extended info between encode/decode calls.
 */
module.exports = class Metadata {
  /**
   * @class Metadata
   */
  constructor() {
    // The number of bytes are processed.
    this[symbols.bytes] = 0;

    // Root node.
    this.node = undefined;

    // Current node.
    this.current = undefined;
  }

  /**
   * The number of bytes are processed.
   * @returns {number}
   */
  get bytes() {
    return this[symbols.bytes];
  }

  /**
   * Clone provided metadata.
   * @param {Metadata} metadata
   * @returns {Metadata}
   */
  static clone(metadata) {
    const meta = new Metadata();

    if (metadata instanceof Metadata) {
      meta.node = metadata.node;
      meta.current = metadata.current;
    }

    return meta;
  }

  /**
   * Remove internal references to processed nodes.
   * @param {Metadata} metadata
   */
  static clean(metadata) {
    if (metadata instanceof Metadata) {
      metadata.node = undefined;
      metadata.current = undefined;
    }
  }
};
