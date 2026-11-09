'use strict';

const { isType } = require('lib/util');
const NotEnoughDataError = require('lib/not-enough-data-error');

module.exports = string;

/**
 * Type for strings.
 * @param {Object|number|null} length The number of bytes or type for size-prefixed strings.
 * @param {string} encoding
 * @returns {Object}
 */
function string(length, encoding = 'ascii') {
  if (!Buffer.isEncoding(encoding)) {
    throw new Error('Argument #2 should be an encoding name.');
  }

  if (typeof length === 'number') {
    return {
      encode: encodeFixedString(length, encoding),
      decode: decodeFixedString(length, encoding),
      encodingLength: () => length,
    };
  }

  if (isType(length)) {
    return {
      encode: encodeSizePrefixedString(length, encoding),
      decode: decodeSizePrefixedString(length, encoding),
      encodingLength: encodingLengthSizePrefixedString(length, encoding),
    };
  }

  if (length === null) {
    return {
      encode: encodeNullString(encoding),
      decode: decodeNullString(encoding),

      /**
       * Get the number bytes to encode provided string.
       * @param {string} value
       * @returns {number}
       */
      encodingLength(value) {
        return Buffer.byteLength(value, encoding) + 1;
      },
    };
  }

  if (typeof length === 'function') {
    return {
      encode: encodeCallback(length, encoding),
      decode: decodeCallback(length, encoding),

      /**
       * Get the number bytes to encode provided string.
       * @param {string} value
       * @returns {number}
       */
      encodingLength(value) {
        return Buffer.byteLength(value, encoding);
      },
    };
  }

  throw new TypeError('Unknown type of argument #1.');
}

/**
 * Encode null-terminated string.
 * @param {string} encoding
 * @returns {Function}
 */
function encodeNullString(encoding) {
  return function encode(value, wstream) {
    const buf = Buffer.from(value.toString(), encoding);

    wstream.writeBuffer(buf);
    wstream.writeInt8(0);

    encode.bytes = buf.length + 1;
  };
}

/**
 * Decode null-terminated string.
 * @param {string} encoding
 * @returns {Function}
 */
function decodeNullString(encoding) {
  return function decode(rstream) {
    const bytes = rstream.indexOf(0);

    if (bytes === -1) {
      throw new NotEnoughDataError(rstream.length + 1, rstream.length);
    }

    const bytesWithNull = bytes + 1;
    const buf = rstream.readBuffer(bytesWithNull);
    decode.bytes = bytesWithNull;

    return buf.toString(encoding, 0, bytes);
  };
}

/**
 * Encode fixed-length string.
 * @param {number} size The length of the string.
 * @param {string} encoding
 * @returns {Function}
 */
function encodeFixedString(size, encoding) {
  return function encode(value, wstream) {
    value = value.toString(); // eslint-disable-line no-param-reassign

    if (Buffer.byteLength(value, encoding) !== size) {
      throw new Error(`Size of string should be ${size} in bytes.`);
    }

    const buf = Buffer.from(value, encoding);

    wstream.writeBuffer(buf);
    encode.bytes = buf.length;
  };
}

/**
 * Decode fixed-length string.
 * @param {number} size The length of the string.
 * @param {string} encoding
 * @returns {Function}
 */
function decodeFixedString(size, encoding) {
  return function decode(rstream) {
    const buf = rstream.readBuffer(size);
    decode.bytes = size;

    return buf.toString(encoding);
  };
}

/**
 * Encode size-prefixed string.
 * @param {Object} type Number type.
 * @param {string} encoding
 * @returns {number}
 */
function encodeSizePrefixedString(type, encoding) {
  return function encode(value, wstream) {
    value = value.toString(); // eslint-disable-line no-param-reassign

    const context = this;

    type.encode.call(context, Buffer.byteLength(value, encoding), wstream);
    encode.bytes = type.encode.bytes;

    const buf = Buffer.from(value, encoding);

    wstream.writeBuffer(buf);
    encode.bytes += buf.length;
  };
}

/**
 * Decode size-prefixed string.
 * @param {Object} type Number type.
 * @param {string} encoding
 * @returns {number}
 */
function decodeSizePrefixedString(type, encoding) {
  return function decode(rstream) {
    const size = type.decode.call(this, rstream);

    if (typeof size !== 'number') {
      throw new TypeError('Size of a string should be a number.');
    }

    const buf = rstream.readBuffer(size);
    decode.bytes = type.decode.bytes + buf.length;

    return buf.toString(encoding);
  };
}

/**
 * Get the number of bytes of size-prefixed string.
 * @param {Object} type Number type.
 * @param {string} encoding
 * @returns {number}
 */
function encodingLengthSizePrefixedString(type, encoding) {
  return function encodingLength(value) {
    const size = Buffer.byteLength(value, encoding);

    return type.encodingLength(size) + size;
  };
}

/**
 * Encode the string with dynamic evaluated size.
 * @param {Function} callback Function that returns a number.
 * @param {string} encoding
 * @returns {number}
 */
function encodeCallback(callback, encoding) {
  return function encode(value, wstream) {
    encode.bytes = 0;

    const context = this;

    const expectedLength = callback(context);
    const buf = Buffer.from(value.toString(), encoding);

    checkLengthType(expectedLength);
    checkLength(expectedLength, buf.length);

    wstream.writeBuffer(buf);
    encode.bytes += buf.length;
  };
}

/**
 * Decode the string with dynamic evaluated size.
 * @param {Function} callback Function that returns a number.
 * @param {string} encoding
 * @returns {number}
 */
function decodeCallback(callback, encoding) {
  return function decode(rstream) {
    const size = callback(this);
    checkLengthType(size);

    const buf = rstream.readBuffer(size);
    decode.bytes = size;

    return buf.toString(encoding);
  };
}

/**
 * @param {any} length
 */
function checkLengthType(length) {
  if (typeof length !== 'number') {
    throw new TypeError('Length of a buffer should be a number.');
  }
}

/**
 * @param {number} requiredSize
 * @param {number} havingSize
 */
function checkLength(requiredSize, havingSize) {
  if (requiredSize !== havingSize) {
    throw new Error(
      `Buffer required length ${requiredSize} instead of ${havingSize}`
    );
  }
}
