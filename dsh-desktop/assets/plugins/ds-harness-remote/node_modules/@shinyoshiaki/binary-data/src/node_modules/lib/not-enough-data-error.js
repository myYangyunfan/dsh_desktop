'use strict';

/**
 * Represent an unexpected end of decode stream.
 */
module.exports = class NotEnoughDataError extends Error {
  /**
   * @class NotEnoughDataError
   * @param {number} expected The number of expected bytes.
   * @param {number} received The number of received bytes.
   */
  constructor(expected, received) {
    const message = `requested ${expected} bytes but only ${received} available`;

    super(message);
    this.name = 'NotEnoughDataError';
  }
};
