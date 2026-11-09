'use strict';

const { isType, isFunction, isUserType } = require('lib/util');
const symbols = require('internal/symbols');
const { decodeCommon } = require('lib/decode');
const { encodeCommon } = require('lib/encode');
const { encodingLengthCommon } = require('lib/encoding-length');
const Metadata = require('internal/meta');

module.exports = when;

/**
 * Type for conditions.
 * @param {Function|bool} condition
 * @param {Object} type Any builtin type or schema.
 * @returns {Object}
 */
function when(condition, type) {
  if (!isType(type) && !isUserType(type)) {
    throw new TypeError('Argument #2 should be a valid type.');
  }

  const result = {
    encode,
    decode,
    encodingLength,
    [symbols.skip]: false,
  };

  return result;

  /**
   * Encode value if condition is truthy.
   * @param {any} value
   * @param {EncodeStream} wstream
   */
  function encode(value, wstream) {
    const context = Metadata.clone(this);
    encode.bytes = 0;

    const status = isFunction(condition)
      ? Boolean(condition(context))
      : Boolean(condition);

    result[symbols.skip] = !status;

    if (!status) {
      Metadata.clean(context);
      return;
    }

    encodeCommon(value, wstream, type, context);
    encode.bytes = context.bytes;

    Metadata.clean(context);
  }

  /**
   * Decode value if condition is truthy.
   * @param {DecodeStream} rstream
   * @returns {any}
   */
  function decode(rstream) {
    const context = Metadata.clone(this);
    decode.bytes = 0;

    const status = isFunction(condition)
      ? Boolean(condition(context))
      : Boolean(condition);

    result[symbols.skip] = !status;

    if (!status) {
      Metadata.clean(context);
      return;
    }

    const value = decodeCommon(rstream, type, context);

    decode.bytes = context.bytes;
    Metadata.clean(context);

    return value; // eslint-disable-line consistent-return
  }

  /**
   * Get the number bytes of an encoded value
   * when condition is truthy or 0.
   * @param {any} value
   * @returns {number}
   */
  function encodingLength(value) {
    const context = Metadata.clone(this);

    const status = isFunction(condition)
      ? Boolean(condition(context))
      : Boolean(condition);

    if (status) {
      encodingLengthCommon(value, type, context);
    }

    Metadata.clean(context);
    return context.bytes;
  }
}
