'use strict';

const { decodeCommon } = require('lib/decode');
const { encodeCommon } = require('lib/encode');
const { encodingLengthCommon } = require('lib/encoding-length');
const { isType, isUserType, isFunction } = require('lib/util');
const Metadata = require('internal/meta');

module.exports = array;

/**
 * Array type.
 * @param {Object} type Any builtin type or schema.
 * @param {Object|number} length Number type or number.
 * @param {string} lengthType Method of calculate the length of array.
 * @returns {Object}
 */
function array(type, length, lengthType = 'count') {
  if (!isType(type) && !isUserType(type)) {
    throw new TypeError('Argument #1 should be a valid type.');
  }

  const isLengthInBytes = lengthType === 'bytes';
  const isnum = typeof length === 'number';
  const istype = isType(length);
  const isfunc = isFunction(length);

  if (!isnum && !istype && !isfunc) {
    throw new TypeError('Unknown type of argument #1.');
  }

  return {
    encode,
    decode,
    encodingLength,
  };

  /**
   * Encode array's items.
   * @param {any[]} items Array of items to encode.
   * @param {EncodeStream} wstream
   */
  function encode(items, wstream) {
    checkArray(items);

    // eslint-disable-next-line no-invalid-this
    const context = Metadata.clone(this);

    encode.bytes = 0;
    let expectedSize = 0;

    if (istype) {
      expectedSize = items.length;
    } else if (isnum) {
      expectedSize = length;
    } else if (isfunc) {
      expectedSize = length(context);

      checkArraySizeType(expectedSize);
    }

    if (!isLengthInBytes) {
      checkArraySize(expectedSize, items.length);
    }

    if (isLengthInBytes) {
      const lengthContext = Metadata.clone(context);

      for (const item of items) {
        encodingLengthCommon(item, type, lengthContext);
      }

      if (istype) {
        expectedSize = lengthContext.bytes;
      }

      checkArraySize(lengthContext.bytes, expectedSize);
      Metadata.clean(lengthContext);
    }

    if (istype) {
      length.encode.call(context, expectedSize, wstream);
      encode.bytes += length.encode.bytes;
    }

    items.forEach(item => {
      encodeCommon(item, wstream, type, context);
    });

    encode.bytes += context.bytes;
    Metadata.clean(context);
  }

  /**
   * Decode array from stream.
   * @param {DecodeStream} rstream
   * @returns {any[]}
   */
  function decode(rstream) {
    let expectedSize = 0;
    decode.bytes = 0;

    // eslint-disable-next-line no-invalid-this
    const context = Metadata.clone(this);

    if (isnum) {
      expectedSize = length;
    } else if (istype) {
      expectedSize = length.decode.call(context, rstream);
      decode.bytes += length.decode.bytes;
    } else if (isfunc) {
      expectedSize = length(context);
    }

    checkArraySizeType(expectedSize);

    let values;

    if (isLengthInBytes) {
      values = decodeBytes(type, expectedSize, rstream, context);
    } else {
      values = decodeCount(type, expectedSize, rstream, context);
    }

    decode.bytes += context.bytes;
    Metadata.clean(context);
    return values;
  }

  /**
   * Returns the number of bytes of an encoded items.
   * @param {any[]} items
   * @returns {number}
   */
  function encodingLength(items) {
    checkArray(items);

    // eslint-disable-next-line no-invalid-this
    const context = Metadata.clone(this);

    let size = 0;

    if (isnum && isLengthInBytes) {
      return length;
    }

    if (istype && !isLengthInBytes) {
      size = length.encodingLength(items.length);
    }

    for (const item of items) {
      encodingLengthCommon(item, type, context);
    }

    Metadata.clean(context);
    size += context.bytes;

    if (istype && isLengthInBytes) {
      size += length.encodingLength(size);
    }

    return size;
  }
}

/**
 * Check if argument is an Array.
 * @param {*} items
 * @private
 */
function checkArray(items) {
  if (!Array.isArray(items)) {
    throw new TypeError('Argument #1 should be an Array.');
  }
}

/**
 * Check if argument is a number.
 * @param {*} length
 * @private
 */
function checkArraySizeType(length) {
  if (typeof length !== 'number') {
    throw new TypeError('Length of an array should be a number.');
  }
}

/**
 * Check the number of items in an Array.
 * @param {number} requiredSize
 * @param {number} havingSize
 * @private
 */
function checkArraySize(requiredSize, havingSize) {
  if (requiredSize !== havingSize) {
    throw new Error(
      `Argument #1 required length ${requiredSize} instead of ${havingSize}`
    );
  }
}

/**
 * Decode items of an array when length is the number of bytes.
 * @param {Object} type Type of each array's item - user schema builtin type.
 * @param {number} lengthBytes
 * @param {DecodeStream} rstream
 * @param {Metadata} context
 * @returns {any[]}
 * @private
 */
function decodeBytes(type, lengthBytes, rstream, context) {
  const items = [];
  const before = context.bytes;
  let bytes = 0;

  while (bytes < lengthBytes) {
    items.push(decodeCommon(rstream, type, context));
    bytes = context.bytes - before;
  }

  if (bytes > lengthBytes) {
    throw new Error('Incorrect length of an array.');
  }

  return items;
}

/**
 * Decode items of an array when length is the number of items.
 * @param {Object} type Type of each array's item - user schema builtin type.
 * @param {number} length
 * @param {DecodeStream} rstream
 * @param {Metadata} context
 * @returns {any[]}
 * @private
 */
function decodeCount(type, length, rstream, context) {
  const items = new Array(length);

  for (let i = 0; i < length; i += 1) {
    items[i] = decodeCommon(rstream, type, context);
  }

  return items;
}
