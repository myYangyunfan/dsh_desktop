# binary-data

[![Build Status](https://travis-ci.org/reklatsmasters/binary-data.svg?branch=master)](https://travis-ci.org/reklatsmasters/binary-data)
[![npm](https://img.shields.io/npm/v/binary-data.svg)](https://npmjs.org/package/binary-data)
[![node](https://img.shields.io/node/v/binary-data.svg)](https://npmjs.org/package/binary-data)
[![license](https://img.shields.io/npm/l/binary-data.svg)](https://npmjs.org/package/binary-data)
[![downloads](https://img.shields.io/npm/dm/binary-data.svg)](https://npmjs.org/package/binary-data)
[![Coverage Status](https://coveralls.io/repos/github/reklatsmasters/binary-data/badge.svg?branch=master)](https://coveralls.io/github/reklatsmasters/binary-data?branch=master)

Declarative binary data encoder / decoder. This module works almost like as [`binary`](https://www.npmjs.com/package/binary) or [`restructure`](https://www.npmjs.com/package/restructure) but provided modern and clean api. It inspired by [abstract-encoding](https://github.com/mafintosh/abstract-encoding) interface.

### Support

[![Buy Me A Coffee](https://www.buymeacoffee.com/assets/img/custom_images/purple_img.png)](https://www.buymeacoffee.com/reklatsmasters)

## Usage

#### decode

```js
const { decode, createDecode, types: { uint8, array, string } } = require('binary-data')

// 1. Define your own schema as plain object
const protocol = {
  type: uint8,
  value: array(string(null), uint8)
}

const message = Buffer.from([1, 2, 3, 4, 5, 6, 0]);

// Just decode message
const packet = decode(message, protocol)

// 2 Also you may decode messages from streams
const net = require('net');

const socket = net.createConnection({ port: 8124 });
const istream = createDecode(protocol);

socket.pipe(istream).on('data', packet => {
  console.log(packet.type, packet.value);
});
```

#### encode

```js
const { encode, createEncode, types: { uint8, string } } = require('binary-data')

const protocol = {
  type: uint8,
  value: string(uint8)
}

const hello = {
  type: 12,
  value: 'my random data'
}

// Just encode message
const ostream = encode(hello, protocol);
const packet = ostream.slice();

// Or you may encode messages into a stream
const net = require('net');

const ostream = createEncode(protocol);
const socket = net.createConnection({ port: 8124 }, () => {
  ostream.write(hello);
});

ostream.pipe(socket);

// You may combine multiple schemes into one stream
const ostream = createEncode();

encode(obj1, ostream, protocol1);
encode(obj2, ostream, protocol2);
encode(obj3, ostream, protocol3);

const packet = ostream.slice();

```

See [stun](https://github.com/nodertc/stun) or [dtls](https://github.com/nodertc/dtls) module for complete example.

## Perfomance

Decoding DTLS ClientHello packet, *nodejs 10.14.1 / Ubuntu 16.04 x64*

|name|time|
|---|---|
|binary data|637.900ms|
|binary|2229.218ms|

## API

* [`encode(obj: any, [target: BinaryStream], type: Object): BinaryStream`](#encode)
* [`decode(source: BinaryStream|Buffer, type: Object): any`](#decode)
* [`encodingLength(item: any, type: Object): Number`](#encoding-length)
* [`createEncodeStream([type: Object]): BinaryStream`](#create-encode-stream)
* [`createDecodeStream([type: Object|Buffer]): BinaryStream`](#create-decode-stream)
* [`createEncode([type: Object]): BinaryStream`](#create-encode-stream)
* [`createDecode([type: Object|Buffer]): BinaryStream`](#create-decode-stream)
* [Types](#types)
  * [`(u)int(8, 16, 24, 32, 40, 48)(be, le)`](#types-int)
  * [`(double, float)(be, le)`](#types-float)
  * [`array(type: Object, length: number|Object|Function, lengthType: string)`](#types-array)
  * [`string(length)`](#types-string)
  * [`bool(type: any)`](#types-bool)
  * [`buffer(length)`](#types-buffer)
  * [`reserved(type, count)`](#types-reserved)
  * [`when(fn: function(context): boolean, type)`](#types-when)

<a name='decode' />

#### `decode(source: BinaryStream|Buffer, type: Object): any`

Reads any data from stream `rstream` using data type `type`. See examples above.

<a name='encode' />

#### `encode(obj: any, [target: BinaryStream], type: Object): BinaryStream`

Writes any data `obj` to stream `target` using data type `type`. See examples above.

<a name='encoding-length' />

#### `encodingLength(item: any, type: Object): Number`

Return the amount of bytes needed to encode `item` using `type`.

<a name='create-encode-stream' />

#### `createEncodeStream([type: Object]): BinaryStream`
#### `createEncode([type: Object]): BinaryStream`

Create instance of BinaryStream.

<a name='create-decode-stream' />

#### `createDecodeStream([type: Object|Buffer]): BinaryStream`
#### `createDecode([type: Object|Buffer]): BinaryStream`

Create instance of BinaryStream.

<a name='types' />

#### `types: Object`

Contains all primitive data types.

### Types

<a name='types-int' />

#### `(u)int(8, 16, 24, 32, 40, 48)(be, le)`

Low-level integer types.

```js
const schema = {
  type: int8
}

// define int64 as buffer and use your loved library for big numbers
const int64 = buffer(8)
```

<a name='types-float' />

#### `(double, float)(be, le)`

Low-level floating-point types.

```js
const schema = {
  size: doublele
}
```

<a name='types-array' />

#### `array(type: Object, length: number|Object|Function, lengthType: string)`

Array of low-level or user defined types. Argument `type` should be primitive type or user defined scheme. Argument `length` should be a number, number type or function. Argument `lengthType` should be `bytes` or `count` (default).

```js
array(uint8, 3) // 3 x uint8

const schema = {
  length: uint8,
  type: uint32be,
  items: array(uint16, ({node}) => node.length, 'bytes')
}

// difference between `bytes` or `count`

array(uint16, uint8)
// |   0x2  | 0x0 0x1 | 0x0 0x2 |
// | length | item 1  |  item 2 |
// bytes = 1 + 4, length = 2

array(uint16, uint8, 'bytes')
// |   0x4  | 0x0 0x1 | 0x0 0x2 |
// | length | item 1  |  item 2 |
// bytes = 1 + 4, length = 4
```

<a name='types-string' />

#### `string(length)`

Low-level string type. Argument `length` can be _number_, _null_ for C - strings, _type_ for size-prefixed data or _function_.

<a name='types-bool' />

#### `bool(type: any)`

Convert provided type to / from boolean. Argument `type` should be an number type.

```js
const schema = bool(uint8)
const rstream = createDecodeStream(buf) // 0x01 0

decode(rstream, schema) // return true
decode(rstream, schema) // return false
```

<a name='types-buffer' />

#### `buffer(length: Object|null|number)`

Low-level buffer type. Argument `length` can be _number_, number _type_ for size-prefixed data, _function_ or _null_.

```js
buffer(5) // buffer should be 5 bytes

buffer(uint8) // length prefixed buffer
// |   0x3  | 0xa 0xb 0xc
// | length | data

const packet = {
  header: {
    length: uint16be
  },
  data: buffer(({node}) => node.header.length % 2) // function should return actual length
}
```

<a name='types-reserved' />

#### `reserved(type, count)`

Special type to skip any data. Argument `count` should be a number, number type or function.

```js
const packet = {
  type: uint8,
  _padding: reserved(uint8, 3)
}

decode(rstream, packet) // return { type }
```

<a name='types-when' />

#### `when(fn: function(context): boolean, type)`

Special type for conditions. Argument `fn` should be a function and should return boolean value. The `type`
argument will be evaluated when the first one returns positive value.

```js
const schema = {
  type: uint8,
  bytes: when(({ node }) => node.type === 1, string(uint16be)),
  list: when(({ node }) => node.type === 2, array(uint32be, uint8))
}
```

### `select(when, ..., defaultType)`

The second type for conditions. The same as `switch` operator in js. Argument `defaultType` may be any known
*type* excluding user *schemas*.

```js
const schema = {
  id: uint8,
  payload: select(when(({ node }) => node.id === 1, string(uint16be)), buffer(uint16be))
}
```

## License

MIT, 2017 (c) Dmitriy Tsvettsikh
