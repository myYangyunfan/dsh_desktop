'use strict';

const fs = require('fs');
const {
  types: { string },
  createEncodeStream,
} = require('..');

const NetworkPacket = string(null);

const output = createEncodeStream(NetworkPacket);
const file = fs.createWriteStream('./encode.txt');

output.pipe(file);

output.write('hello, world!');
output.write('binary-data works!');
