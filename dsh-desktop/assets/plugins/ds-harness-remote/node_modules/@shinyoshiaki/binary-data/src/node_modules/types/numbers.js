'use strict';

const createFunction = require('generate-function');

module.exports = {
  doublebe: createFastStub(8, 'writeDoubleBE', 'readDoubleBE'),
  doublele: createFastStub(8, 'writeDoubleLE', 'readDoubleLE'),
  floatbe: createFastStub(4, 'writeFloatBE', 'readFloatBE'),
  floatle: createFastStub(4, 'writeFloatLE', 'readFloatLE'),
  int8: createFastStub(1, 'writeInt8', 'readInt8'),
  uint8: createFastStub(1, 'writeUInt8', 'readUInt8'),
  int16be: createFastStub(2, 'writeInt16BE', 'readInt16BE'),
  uint16be: createFastStub(2, 'writeUInt16BE', 'readUInt16BE'),
  int16le: createFastStub(2, 'writeInt16LE', 'readInt16LE'),
  uint16le: createFastStub(2, 'writeUInt16LE', 'readUInt16LE'),
  int32be: createFastStub(4, 'writeInt32BE', 'readInt32BE'),
  uint32be: createFastStub(4, 'writeUInt32BE', 'readUInt32BE'),
  int32le: createFastStub(4, 'writeInt32LE', 'readInt32LE'),
  uint32le: createFastStub(4, 'writeUInt32LE', 'readUInt32LE'),
  int24be: createFastStubGeneric(3, 'writeIntBE', 'readIntBE'),
  uint24be: createFastStubGeneric(3, 'writeUIntBE', 'readUIntBE'),
  int24le: createFastStubGeneric(3, 'writeIntLE', 'readIntLE'),
  uint24le: createFastStubGeneric(3, 'writeUIntLE', 'readUIntLE'),
  int40be: createFastStubGeneric(5, 'writeIntBE', 'readIntBE'),
  uint40be: createFastStubGeneric(5, 'writeUIntBE', 'readUIntBE'),
  int40le: createFastStubGeneric(5, 'writeIntLE', 'readIntLE'),
  uint40le: createFastStubGeneric(5, 'writeUIntLE', 'readUIntLE'),
  int48be: createFastStubGeneric(6, 'writeIntBE', 'readIntBE'),
  uint48be: createFastStubGeneric(6, 'writeUIntBE', 'readUIntBE'),
  int48le: createFastStubGeneric(6, 'writeIntLE', 'readIntLE'),
  uint48le: createFastStubGeneric(6, 'writeUIntLE', 'readUIntLE'),
};

/**
 * Generate number type for provided the number of bytes.
 * @param {number} size
 * @param {string} write
 * @param {string} read
 * @returns {Object}
 * @private
 */
function createFastStub(size, write, read) {
  const genread = createFunction();
  const genwrite = createFunction();

  genread(`
    function decode_${read}(rstream) {
      decode_${read}.bytes = ${genread.formats.d(size)};
      return rstream.${read}()
    }
  `);

  genwrite(`
    function encode_${write}(value, wstream) {
      wstream.${write}(value);
      encode_${write}.bytes = ${genread.formats.d(size)};
    }
  `);

  return {
    encodingLength: () => size,
    encode: genwrite.toFunction(),
    decode: genread.toFunction(),
  };
}

/**
 * Generate number type for provided the number of bytes.
 * @param {number} size
 * @param {string} write
 * @param {string} read
 * @returns {Object}
 * @private
 */
function createFastStubGeneric(size, write, read) {
  const genread = createFunction();
  const genwrite = createFunction();

  genread(`
    function decode_${read}(rstream) {
      decode_${read}.bytes = ${genread.formats.d(size)};
      return rstream.${read}(${genread.formats.d(size)})
    }
  `);

  genwrite(`
    function encode_${write}(value, wstream) {
      wstream.${write}(value, ${genread.formats.d(size)});
      encode_${write}.bytes = ${genread.formats.d(size)};
    }
  `);

  return {
    encodingLength: () => size,
    encode: genwrite.toFunction(),
    decode: genread.toFunction(),
  };
}
