'use strict';

const symbols = require('internal/symbols');
const { decodeCommon } = require('lib/decode');
const Metadata = require('internal/meta');

module.exports = select;

/**
 * Type for multiple conditions.
 * Works almost like `switch` operator.
 * @param {...any} whenTypes The `when` type.
 * @returns {Object}
 */
function select(...whenTypes) {
  if (whenTypes.length === 0) {
    throw new TypeError('You should set at least one condition type.');
  }

  const result = {
    decode,
    encode: () => {},
    [symbols.skip]: true,
  };

  return result;

  /* eslint-disable consistent-return */
  /**
   * Decode data using a first success contifion.
   * @param {DecodeStream} rstream
   * @returns {any}
   */
  function decode(rstream) {
    decode.bytes = 0;
    const context = Metadata.clone(this); // eslint-disable-line no-invalid-this

    for (const when of whenTypes) {
      // eslint-disable-next-line no-invalid-this
      const probalyValue = decodeCommon(rstream, when, context);

      if (when[symbols.skip] === true) {
        continue; // eslint-disable-line no-continue
      }

      decode.bytes = context.bytes;
      Metadata.clean(context);

      result[symbols.skip] = false;
      return probalyValue;
    }

    result[symbols.skip] = true;
  }
  /* eslint-enable consistent-return */
}
