'use strict';

// Helps to "skip" field in result.
const skip = Symbol('skip');

// Private field `bytes` in Metadata.
const bytes = Symbol('bytes');

module.exports = {
  skip,
  bytes,
};
