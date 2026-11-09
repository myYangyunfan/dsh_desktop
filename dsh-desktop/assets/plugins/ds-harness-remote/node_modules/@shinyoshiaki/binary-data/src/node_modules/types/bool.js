'use strict';

const { isType } = require('lib/util');

module.exports = bool;

/**
 * Boolean type.
 * @param {Object} type Any builtin type or schema.
 * @returns {Object}
 */
function bool(type) {
  if (!isType(type)) {
    throw new TypeError('Argument #1 should be valid type.');
  }

  /**
   * Decode element as boolean.
   * @param {DecodeStream} rstream
   * @returns {bool}
   */
  function decode(rstream) {
    // eslint-disable-next-line no-invalid-this
    const context = this;

    const value = type.decode.call(context, rstream);
    decode.bytes = type.decode.bytes;

    return Boolean(value);
  }

  /**
   * Encode boolean item.
   * @param {bool} value
   * @param {EncodeStream} wstream
   */
  function encode(value, wstream) {
    // eslint-disable-next-line no-invalid-this
    const context = this;

    type.encode.call(context, value ? 1 : 0, wstream);
    encode.bytes = type.encode.bytes;
  }

  return {
    encode,
    decode,
    encodingLength: type.encodingLength,
  };
}
