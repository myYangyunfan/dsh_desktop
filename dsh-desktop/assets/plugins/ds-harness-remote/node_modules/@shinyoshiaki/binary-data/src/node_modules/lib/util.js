'use strict';

const isPlainObject = require('is-plain-object');

module.exports = {
  isType,
  isUserType: isPlainObject,
  isFunction,
  isDecodeType,
  isEncodeType,
};

/**
 * Check if argument is data type.
 * @param {*} type
 * @returns {bool}
 */
function isType(type) {
  return isObject(type) && isFunction(type.encode) && isFunction(type.decode);
}

/**
 * Check if argument is function.
 * @param {*} value
 * @returns {bool}
 */
function isFunction(value) {
  return typeof value === 'function';
}

/**
 * Check if argument is object.
 * @param {*} value
 * @returns {bool}
 */
function isObject(value) {
  return typeof value === 'object' && value !== null;
}

/**
 * Check if argument is data type and able to decode data.
 * @param {*} type
 * @returns {bool}
 */
function isDecodeType(type) {
  return isObject(type) && isFunction(type.decode);
}

/**
 * Check if argument is data type and able to encode data.
 * @param {*} type
 * @returns {bool}
 */
function isEncodeType(type) {
  return isObject(type) && isFunction(type.encode);
}
