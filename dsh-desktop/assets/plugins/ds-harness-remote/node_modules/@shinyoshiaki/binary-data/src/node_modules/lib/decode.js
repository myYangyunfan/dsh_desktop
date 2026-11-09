'use strict';

const { isType, isUserType, isDecodeType } = require('lib/util');
const BinaryStream = require('lib/binary-stream');
const symbols = require('internal/symbols');
const Metadata = require('internal/meta');

module.exports = {
  decode,
  decodeCommon,
};

/**
 * Decode any data from provided stream using schema.
 * @param {BinaryStream} rstream Read stream to decode.
 * @param {Object} typeOrSchema Builtin data type or schema.
 * @returns {*}
 */
function decode(rstream, typeOrSchema) {
  let decodeStream = rstream;

  if (Buffer.isBuffer(rstream)) {
    decodeStream = new BinaryStream();
    decodeStream.append(rstream);
  }

  const meta = new Metadata();
  const value = decodeCommon(decodeStream, typeOrSchema, meta);

  decode.bytes = meta.bytes;
  Metadata.clean(meta);

  return value;
}

/**
 * @private
 * @param {BinaryStream|Buffer} rstream
 * @param {Object} typeOrSchema
 * @param {Metadata} meta
 * @returns {*}
 */
function decodeCommon(rstream, typeOrSchema, meta) {
  if (isType(typeOrSchema)) {
    const value = typeOrSchema.decode.call(meta, rstream);
    meta[symbols.bytes] += typeOrSchema.decode.bytes;
    return value;
  }

  return decodeSchema(rstream, typeOrSchema, meta);
}

/**
 * @private
 * @param {BinaryStream} rstream
 * @param {Object} schema
 * @param {Metadata} meta
 * @returns {Object}
 */
function decodeSchema(rstream, schema, meta) {
  assertSchema(schema);

  const node = Object.create(null);

  if (meta.node === undefined) {
    meta.node = node;
    meta.current = node;
  } else {
    meta.current = node;
  }

  const keys = Object.keys(schema);

  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i];
    const type = schema[key];

    if (!isDecodeType(type)) {
      node[key] = decodeSchema(rstream, type, meta);
      meta.current = node;
      continue; // eslint-disable-line no-continue
    }

    const value = type.decode.call(meta, rstream);
    meta[symbols.bytes] += type.decode.bytes;

    if (type[symbols.skip] === true) {
      continue; // eslint-disable-line no-continue
    }

    node[key] = value;
  }

  return node;
}

/**
 * Check if argument is schema.
 * @param {Object} schema
 * @private
 */
function assertSchema(schema) {
  if (!isUserType(schema)) {
    throw new TypeError('Argument #2 should be a plain object.');
  }
}
