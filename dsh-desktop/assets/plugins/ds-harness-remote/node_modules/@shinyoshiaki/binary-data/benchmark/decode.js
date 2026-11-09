'use strict';

const { types, decode } = require('..');
const binary = require('binary'); // eslint-disable-line node/no-unpublished-require

/* eslint-disable no-useless-concat */

// DTLS ClientHello packet.
const packet = Buffer.from(
  '16fefd000000000000000000a60100009a000000000000009a' +
    'fefd64c68aa8e21aff34409893f5016cd3dd0f682582d7ce38' +
    'fcecb08ba7740120e500000014c02bc02fcca9cca8c00ac009' +
    'c013c014003300390100005cff01000100000a00080006001d' +
    '00170018000b00020100001000120010067765627274630863' +
    '2d776562727463000e000700040001000200000d0020001e04' +
    '03050306030203080408050806040105010601020104020502' +
    '06020202',
  'hex'
);

const BinaryDataPacket = {
  contentType: types.uint8,
  version: types.uint16be,
  epoch: types.uint16be,
  sequenceNumber: types.uint48be,
  length: types.uint16be,
  body: {
    type: types.uint8,
    length: types.uint24be,
    messageSeq: types.uint16be,
    fragment: {
      offset: types.uint24be,
      length: types.uint24be,
    },
    clientVersion: types.uint16be,
    random: {
      gmtunixtime: types.uint32be,
      randomBytes: types.buffer(28),
    },
    sessionId: types.buffer(types.uint8),
    cookie: types.buffer(types.uint8),
    cipherSuites: types.array(types.uint16be, types.uint16be, 'bytes'),
    compressionMethods: types.array(types.uint8, types.uint8, 'bytes'),
    extensions: types.array(
      {
        type: types.uint16be,
        data: types.buffer(types.uint16be),
      },
      types.uint16be,
      'bytes'
    ),
  },
};

const count = 1e5;

function test(i) {
  while (--i > 0) {
    decode(packet, BinaryDataPacket);
  }
}

function testBinary(i) {
  while (--i > 0) {
    parseBinary();
  }
}

function parseBinary() {
  // Incomplete ClientHello packet
  const record = binary
    .parse(packet)
    .word8u('contentType')
    .word16bu('version')
    .word16bu('epoch')
    .buffer('sequenceNumber', 6)
    .word16bu('length')
    .buffer('body', 'length').vars;
  const handshake = binary
    .parse(record.body)
    .word8u('type')
    .buffer('length', 3)
    .word16bu('messageSeq')
    .buffer('fragment_offset', 3)
    .buffer('fragment_length', 3)
    .word16bu('clientVersion')
    .word32bu('gmtunixtime')
    .buffer('randomBytes', 28)
    .word8u('sessionId_length')
    .buffer('sessionId', 'sessionId_length')
    .word8u('cookie_length')
    .buffer('cookie', 'cookie_length').vars;
  return [record, handshake];
}

console.time('binary data');
test(count);
console.timeEnd('binary data');

console.time('binary');
testBinary(count);
console.timeEnd('binary');
