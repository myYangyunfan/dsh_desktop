'use strict';

const { isUserType, isEncodeType, isType } = require('lib/util');
const symbols = require('internal/symbols');
const Metadata = require('internal/meta');
const BinaryStream = require('lib/binary-stream');

module.exports = {
  encode,
  encodeCommon,
};

/**
 * @param {any} obj
 * @param {any} type
 * @param {BinaryStream} [target]
 * @returns {BinaryStream}
 */
function encode(obj, type, target) {
  const meta = new Metadata();

  // Check for legacy interface.
  if (type instanceof BinaryStream) {
    const tmp = target;
    target = type; // eslint-disable-line no-param-reassign
    type = tmp; // eslint-disable-line no-param-reassign
  }

  if (!(target instanceof BinaryStream)) {
    target = new BinaryStream(); // eslint-disable-line no-param-reassign
  }

  encodeCommon(obj, target, type, meta);

  encode.bytes = meta.bytes;
  Metadata.clean(meta);

  return target;
}

/**
 * @param {any} object
 * @param {EncodeStream} wstream
 * @param {any} typeOrSchema
 * @param {Metadata} context
 */
function encodeCommon(object, wstream, typeOrSchema, context) {
  if (isType(typeOrSchema)) {
    typeOrSchema.encode.call(context, object, wstream);
    context[symbols.bytes] += typeOrSchema.encode.bytes;
  } else {
    encodeSchema(object, wstream, typeOrSchema, context);
  }
}

/**
 * @param {any} object
 * @param {EncodeStream} wstream
 * @param {any} schema
 * @param {Metadata} context
 */
function encodeSchema(object, wstream, schema, context) {
  assertSchema(schema);

  if (context.node === undefined) {
    context.node = object;
    context.current = object;
  } else {
    context.current = object;
  }

  const keys = Object.keys(schema);

  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i];
    const type = schema[key];
    const value = object[key];

    if (!isEncodeType(type)) {
      encodeSchema(value, wstream, type, context);
      context.current = object;

      continue; // eslint-disable-line no-continue
    }

    type.encode.call(context, value, wstream);
    context[symbols.bytes] += type.encode.bytes;
  }
}

/**
 * Check if argument is schema.
 * @param {Object} schema
 * @private
 */
function assertSchema(schema) {
  if (!isUserType(schema)) {
    throw new TypeError('Argument `schema` should be a plain object.');
  }
}
