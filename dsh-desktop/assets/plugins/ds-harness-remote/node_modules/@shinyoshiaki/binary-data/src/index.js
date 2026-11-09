'use strict';

const BinaryStream = require('lib/binary-stream');
const array = require('types/array');
const buffer = require('types/buffer');
const bool = require('types/bool');
const reserved = require('types/reserved');
const string = require('types/string');
const numbers = require('types/numbers');
const when = require('types/when');
const select = require('types/select');
const { encode } = require('lib/encode');
const { decode } = require('lib/decode');
const { encodingLength } = require('lib/encoding-length');
const Transaction = require('lib/transaction');
const NotEnoughDataError = require('lib/not-enough-data-error');

const types = {
  array,
  bool,
  buffer,
  reserved,
  string,
  when,
  select,
};

for (const type of Object.keys(numbers)) {
  types[type] = numbers[type]; // eslint-disable-line security/detect-object-injection
}

const kschema = Symbol('schema');

/**
 * Create transform stream to encode objects into Buffer.
 * @param {Object} [schema]
 * @returns {EncodeStream}
 */
function createEncodeStream(schema) {
  const stream = new BinaryStream({
    readableObjectMode: false,
    writableObjectMode: true,
    transform: transformEncode,
  });

  stream[kschema] = schema;
  return stream;
}

/**
 * Create transform stream to decode binary data into object.
 * @param {Buffer|Object} [bufOrSchema]
 * @returns {DecodeStream}
 */
function createDecodeStream(bufOrSchema) {
  let schema = null;
  const isBuffer = Buffer.isBuffer(bufOrSchema);

  if (!isBuffer) {
    schema = bufOrSchema;
  }

  const stream = new BinaryStream({
    transform: transformDecode,
    readableObjectMode: true,
    writableObjectMode: false,
  });

  stream[kschema] = schema;

  if (isBuffer) {
    stream.append(bufOrSchema);
  }

  return stream;
}

/**
 * The `transform` function for transform stream.
 * @param {*} chunk Any valid js data type.
 * @param {string} encoding
 * @param {Function} cb
 */
function transformEncode(chunk, encoding, cb) {
  try {
    encode(chunk, this[kschema], this);

    const buf = this.slice();
    this.consume(buf.length);

    cb(null, buf);
  } catch (error) {
    cb(error);
  }
}

/**
 * The `transform` function for transform stream.
 * @param {*} chunk Any valid js data type.
 * @param {string} encoding
 * @param {Function} cb
 */
function transformDecode(chunk, encoding, cb) {
  this.append(chunk);

  try {
    while (this.length > 0) {
      const transaction = new Transaction(this);
      const data = decode(transaction, this[kschema]);

      transaction.commit();
      this.push(data);
    }

    cb();
  } catch (error) {
    if (error instanceof NotEnoughDataError) {
      cb();
    } else {
      cb(error);
    }
  }
}

module.exports = {
  /* Main api */
  createEncodeStream,
  createDecodeStream,
  encode,
  decode,
  encodingLength,

  /* aliases */
  createEncode: createEncodeStream,
  createDecode: createDecodeStream,

  /* Data types */
  types,

  /* Re-export utils */
  BinaryStream,
  NotEnoughDataError,
};
