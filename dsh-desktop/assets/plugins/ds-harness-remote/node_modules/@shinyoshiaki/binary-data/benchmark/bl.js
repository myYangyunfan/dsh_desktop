'use strict';

const bl = require('bl'); // eslint-disable-line node/no-unpublished-require
const BufferList = require('../src/node_modules/internal/buffer-list');

const buffers = [];

for (let i = 0; i < 10; ++i) {
  buffers.push(Buffer.allocUnsafe(4));
}

const count = 5e5;

function testReadNumber(buf) {
  let res = 0;

  buf.append(buffers);

  for (let i = 0; i < count; ++i) {
    for (let j = 0; j < buffers.length; ++j) {
      res += buf.readUInt32BE(j * 4);
    }

    res = ~res; // eslint-disable-line no-bitwise
  }

  return res;
}

function testReadNumberConsume(buf) {
  let res = 0;

  for (let i = 0; i < count; ++i) {
    buf.consume(buf.length);
    buf.append(buffers);

    for (let j = 0; j < buffers.length; ++j) {
      res += buf.readUInt16BE(0);
      buf.consume(2);
      res += buf.readUInt16BE(0);
      buf.consume(2);
    }

    res = ~res; // eslint-disable-line no-bitwise
  }

  return res;
}

function testSlice(buf) {
  let res = 0;

  buf.append(buffers);

  for (let i = 0; i < count; ++i) {
    res += buf.slice().length;

    res = ~res; // eslint-disable-line no-bitwise
  }

  return res;
}

function test(name, target, caller) {
  console.time(name);
  target(caller);
  console.timeEnd(name);
}

test('bl          | read number', testReadNumber, bl());
test('binary-data | read number', testReadNumber, new BufferList());
test('bl          | read + consume', testReadNumberConsume, bl());
test('binary-data | read + consume', testReadNumberConsume, new BufferList());
test('bl          | slice', testSlice, bl());
test('binary-data | slice', testSlice, new BufferList());
