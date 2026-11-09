'use strict';

const { isUserType, isType } = require('lib/util');
const Metadata = require('internal/meta');
const symbols = require('internal/symbols');

module.exports = {
  encodingLength,
  encodingLengthCommon,
};

/**
 * Get the number of bytes to encode `obj` using `schema`.
 * @param {*} obj Any valid js object.
 * @param {Object} schema
 * @returns {number}
 */
function encodingLength(obj, schema) {
  const context = new Metadata();

  encodingLengthCommon(obj, schema, context);
  Metadata.clean(context);

  return context.bytes;
}

/**
 * @param {any} item
 * @param {Object} typeOrSchema
 * @param {Metadata} context
 */
function encodingLengthCommon(item, typeOrSchema, context) {
  if (isType(typeOrSchema)) {
    context[symbols.bytes] += typeOrSchema.encodingLength.call(context, item);
  } else {
    encodingLengthSchema(item, typeOrSchema, context);
  }
}

/**
 * @param {any} item
 * @param {Object} schema
 * @param {Metadata} context
 */
function encodingLengthSchema(item, schema, context) {
  if (!isUserType(schema)) {
    throw new TypeError('Argument `schema` should be a plain object.');
  }

  if (context.node === undefined) {
    context.node = item;
    context.current = item;
  } else {
    context.current = item;
  }

  const keys = Object.keys(schema);

  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i];
    const type = schema[key];
    const value = item[key];

    if (!isType(type)) {
      encodingLengthSchema(value, type, context);
      context.current = item;
      continue; // eslint-disable-line no-continue
    }

    context[symbols.bytes] += type.encodingLength.call(context, value);
  }
}
