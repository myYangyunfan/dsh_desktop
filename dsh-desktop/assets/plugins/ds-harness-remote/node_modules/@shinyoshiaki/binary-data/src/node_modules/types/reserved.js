'use strict';

const { decodeCommon } = require('lib/decode');
const { encodeCommon } = require('lib/encode');
const { encodingLengthCommon } = require('lib/encoding-length');
const { isType, isFunction } = require('lib/util');
const symbols = require('internal/symbols');
const Metadata = require('internal/meta');

module.exports = reserved;

/**
 * Type for reserved data.
 * @param {Object} type Any builtin type or schema.
 * @param {number} size The number of reserved items.
 * @returns {Object}
 */
function reserved(type, size = 1) {
  if (!isType(type)) {
    throw new TypeError('Invalid data type.');
  }

  if (!Number.isInteger(size) && !isFunction(size)) {
    throw new TypeError('Argument #2 should be a valid integer or function.');
  }

  return {
    [symbols.skip]: true,
    encodingLength,
    decode,
    encode,
  };

  /**
   * Get the number of bytes to encode value.
   * @param {any} value
   * @returns {number}
   */
  function encodingLength(value) {
    // eslint-disable-next-line no-invalid-this
    const context = Metadata.clone(this);

    const count = isFunction(size) ? size(context) : size;

    encodingLengthCommon(value, type, context);
    Metadata.clean(context);

    return context.bytes * count;
  }

  /**
   * Silently decode items.
   * @param {DecodeStream} rstream
   */
  function decode(rstream) {
    // eslint-disable-next-line no-invalid-this
    const context = Metadata.clone(this);
    decode.bytes = 0;

    const count = isFunction(size) ? size(context) : size;

    if (count === 0) {
      Metadata.clean(context);
      return;
    }

    for (let i = count; i > 0; i -= 1) {
      decodeCommon(rstream, type, context);
    }

    decode.bytes = context.bytes;
    Metadata.clean(context);
  }

  /**
   * Encode reserved data.
   * Fill with zeros the number of required bytes.
   * @param {any} value
   * @param {EncodeStream} wstream
   */
  function encode(value, wstream) {
    encode.bytes = 0;

    // eslint-disable-next-line no-invalid-this
    const context = Metadata.clone(this);

    const count = isFunction(size) ? size(context) : size;

    if (count === 0) {
      Metadata.clean(context);
      return;
    }

    for (let i = count; i > 0; i -= 1) {
      encodeCommon(0, wstream, type, context);
    }

    encode.bytes = context.bytes;
    Metadata.clean(context);
  }
}
