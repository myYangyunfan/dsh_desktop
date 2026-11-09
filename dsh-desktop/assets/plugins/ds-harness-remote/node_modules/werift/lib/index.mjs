// ../common/src/binary.ts
import { randomBytes } from "crypto";
function random16() {
  return randomBytes(2).readUInt16BE(0);
}
function random32() {
  return randomBytes(4).readUInt32BE(0);
}
function bufferXor(a, b) {
  if (a.length !== b.length) {
    throw new TypeError(
      "[webrtc-stun] You can not XOR buffers which length are different"
    );
  }
  const length = a.length;
  const buffer2 = Buffer.allocUnsafe(length);
  for (let i = 0; i < length; i++) {
    buffer2[i] = a[i] ^ b[i];
  }
  return buffer2;
}
function bufferArrayXor(arr) {
  const length = [...arr].sort((a, b) => a.length - b.length).reverse()[0].length;
  const xored = Buffer.allocUnsafe(length);
  for (let i = 0; i < length; i++) {
    xored[i] = 0;
    arr.forEach((buffer2) => {
      xored[i] ^= buffer2[i] ?? 0;
    });
  }
  return xored;
}
var BitWriter = class {
  constructor(bitLength) {
    this.bitLength = bitLength;
  }
  value = 0;
  set(size, startIndex, value) {
    value &= (1 << size) - 1;
    this.value |= value << this.bitLength - size - startIndex;
    return this;
  }
  get buffer() {
    const length = Math.ceil(this.bitLength / 8);
    const buf = Buffer.alloc(length);
    buf.writeUIntBE(this.value, 0, length);
    return buf;
  }
};
var BitWriter2 = class {
  /**
   * 各valueがオクテットを跨いではならない
   */
  constructor(bitLength) {
    this.bitLength = bitLength;
    if (bitLength > 32) {
      throw new Error();
    }
  }
  _value = 0n;
  offset = 0n;
  set(value, size = 1) {
    let value_b = BigInt(value);
    const size_b = BigInt(size);
    value_b &= (1n << size_b) - 1n;
    this._value |= value_b << BigInt(this.bitLength) - size_b - this.offset;
    this.offset += size_b;
    return this;
  }
  get value() {
    return Number(this._value);
  }
  get buffer() {
    const length = Math.ceil(this.bitLength / 8);
    const buf = Buffer.alloc(length);
    buf.writeUIntBE(this.value, 0, length);
    return buf;
  }
};
function getBit(bits, startIndex, length = 1) {
  let bin = bits.toString(2).split("");
  bin = [...Array(8 - bin.length).fill("0"), ...bin];
  const s = bin.slice(startIndex, startIndex + length).join("");
  const v = Number.parseInt(s, 2);
  return v;
}
function paddingByte(bits) {
  const dec = bits.toString(2).split("");
  return [...[...Array(8 - dec.length)].map(() => "0"), ...dec].join("");
}
function paddingBits(bits, expectLength) {
  const dec = bits.toString(2);
  return [...[...Array(expectLength - dec.length)].map(() => "0"), ...dec].join(
    ""
  );
}
function bufferWriter(bytes, values) {
  return createBufferWriter(bytes)(values);
}
function createBufferWriter(bytes, singleBuffer) {
  const length = bytes.reduce((acc, cur) => acc + cur, 0);
  const reuseBuffer = singleBuffer ? Buffer.alloc(length) : void 0;
  return (values) => {
    const buf = reuseBuffer || Buffer.alloc(length);
    let offset = 0;
    values.forEach((v, i) => {
      const size = bytes[i];
      if (size === 8) buf.writeBigUInt64BE(v, offset);
      else buf.writeUIntBE(v, offset, size);
      offset += size;
    });
    return buf;
  };
}
function bufferWriterLE(bytes, values) {
  const length = bytes.reduce((acc, cur) => acc + cur, 0);
  const buf = Buffer.alloc(length);
  let offset = 0;
  values.forEach((v, i) => {
    const size = bytes[i];
    if (size === 8) buf.writeBigUInt64LE(v, offset);
    else buf.writeUIntLE(v, offset, size);
    offset += size;
  });
  return buf;
}
function bufferReader(buf, bytes) {
  let offset = 0;
  return bytes.map((v) => {
    let read;
    if (v === 8) {
      read = buf.readBigUInt64BE(offset);
    } else {
      read = buf.readUIntBE(offset, v);
    }
    offset += v;
    return read;
  });
}
var BufferChain = class {
  buffer;
  constructor(size) {
    this.buffer = Buffer.alloc(size);
  }
  writeInt16BE(value, offset) {
    this.buffer.writeInt16BE(value, offset);
    return this;
  }
  writeUInt8(value, offset) {
    this.buffer.writeUInt8(value, offset);
    return this;
  }
};
var dumpBuffer = (data) => "0x" + data.toString("hex").replace(/(.)(.)/g, "$1$2 ").split(" ").filter((s) => s != void 0 && s.length > 0).join(",0x");
function buffer2ArrayBuffer(buf) {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}
var BitStream = class {
  constructor(uint8Array) {
    this.uint8Array = uint8Array;
  }
  position = 0;
  bitsPending = 0;
  writeBits(bits, value) {
    if (bits == 0) {
      return this;
    }
    value &= 4294967295 >>> 32 - bits;
    let bitsConsumed;
    if (this.bitsPending > 0) {
      if (this.bitsPending > bits) {
        this.uint8Array[this.position - 1] |= value << this.bitsPending - bits;
        bitsConsumed = bits;
        this.bitsPending -= bits;
      } else if (this.bitsPending == bits) {
        this.uint8Array[this.position - 1] |= value;
        bitsConsumed = bits;
        this.bitsPending = 0;
      } else {
        this.uint8Array[this.position - 1] |= value >> bits - this.bitsPending;
        bitsConsumed = this.bitsPending;
        this.bitsPending = 0;
      }
    } else {
      bitsConsumed = Math.min(8, bits);
      this.bitsPending = 8 - bitsConsumed;
      this.uint8Array[this.position++] = value >> bits - bitsConsumed << this.bitsPending;
    }
    bits -= bitsConsumed;
    if (bits > 0) {
      this.writeBits(bits, value);
    }
    return this;
  }
  readBits(bits) {
    return this._readBits(bits);
  }
  _readBits(bits, bitBuffer) {
    if (typeof bitBuffer == "undefined") {
      bitBuffer = 0;
    }
    if (bits == 0) {
      return bitBuffer;
    }
    let partial;
    let bitsConsumed;
    if (this.bitsPending > 0) {
      const byte = this.uint8Array[this.position - 1] & 255 >> 8 - this.bitsPending;
      bitsConsumed = Math.min(this.bitsPending, bits);
      this.bitsPending -= bitsConsumed;
      partial = byte >> this.bitsPending;
    } else {
      bitsConsumed = Math.min(8, bits);
      this.bitsPending = 8 - bitsConsumed;
      partial = this.uint8Array[this.position++] >> this.bitsPending;
    }
    bits -= bitsConsumed;
    bitBuffer = bitBuffer << bitsConsumed | partial;
    return bits > 0 ? this._readBits(bits, bitBuffer) : bitBuffer;
  }
  seekTo(bitPos) {
    this.position = bitPos / 8 | 0;
    this.bitsPending = bitPos % 8;
    if (this.bitsPending > 0) {
      this.bitsPending = 8 - this.bitsPending;
      this.position++;
    }
  }
};

// ../common/src/crc.ts
var POLY_CRC32 = 3988292384;
var POLY_CRC32C = 2197175160;
function isBufferLike(input) {
  return typeof input !== "string";
}
function generateCRCTable(polynomial) {
  const table = new Array(256);
  let c = 0;
  for (let n = 0; n < 256; ++n) {
    c = n;
    c = c & 1 ? polynomial ^ c >>> 1 : c >>> 1;
    c = c & 1 ? polynomial ^ c >>> 1 : c >>> 1;
    c = c & 1 ? polynomial ^ c >>> 1 : c >>> 1;
    c = c & 1 ? polynomial ^ c >>> 1 : c >>> 1;
    c = c & 1 ? polynomial ^ c >>> 1 : c >>> 1;
    c = c & 1 ? polynomial ^ c >>> 1 : c >>> 1;
    c = c & 1 ? polynomial ^ c >>> 1 : c >>> 1;
    c = c & 1 ? polynomial ^ c >>> 1 : c >>> 1;
    table[n] = c;
  }
  return new Int32Array(table);
}
function generateSliceBy16Tables(table0) {
  const table = new Int32Array(4096);
  let c = 0;
  let v = 0;
  let n = 0;
  for (n = 0; n < 256; ++n) table[n] = table0[n];
  for (n = 0; n < 256; ++n) {
    v = table0[n];
    for (c = 256 + n; c < 4096; c += 256) {
      v = table[c] = v >>> 8 ^ table0[v & 255];
    }
  }
  const out = [];
  for (n = 1; n < 16; ++n) {
    out[n - 1] = table.subarray(n * 256, n * 256 + 256);
  }
  return out;
}
function crcGenericString(value, seed, table0) {
  let crc = seed ^ -1;
  let i = 0;
  const len = value.length;
  let c = 0;
  let d = 0;
  while (i < len) {
    c = value.charCodeAt(i++);
    if (c < 128) {
      crc = crc >>> 8 ^ table0[(crc ^ c) & 255];
    } else if (c < 2048) {
      crc = crc >>> 8 ^ table0[(crc ^ (192 | c >> 6 & 31)) & 255];
      crc = crc >>> 8 ^ table0[(crc ^ (128 | c & 63)) & 255];
    } else if (c >= 55296 && c < 57344) {
      c = (c & 1023) + 64;
      d = value.charCodeAt(i++) & 1023;
      crc = crc >>> 8 ^ table0[(crc ^ (240 | c >> 8 & 7)) & 255];
      crc = crc >>> 8 ^ table0[(crc ^ (128 | c >> 2 & 63)) & 255];
      crc = crc >>> 8 ^ table0[(crc ^ (128 | d >> 6 & 15 | (c & 3) << 4)) & 255];
      crc = crc >>> 8 ^ table0[(crc ^ (128 | d & 63)) & 255];
    } else {
      crc = crc >>> 8 ^ table0[(crc ^ (224 | c >> 12 & 15)) & 255];
      crc = crc >>> 8 ^ table0[(crc ^ (128 | c >> 6 & 63)) & 255];
      crc = crc >>> 8 ^ table0[(crc ^ (128 | c & 63)) & 255];
    }
  }
  return ~crc >>> 0;
}
function crcBuffer(value, seed, table0, tables16) {
  const [t1, t2, t3, t4, t5, t6, t7, t8, t9, ta, tb, tc, td, te, tf] = tables16;
  let crc = seed ^ -1;
  let i = 0;
  let len = value.length - 15;
  while (i < len) {
    crc = tf[value[i++] ^ crc & 255] ^ te[value[i++] ^ crc >>> 8 & 255] ^ td[value[i++] ^ crc >>> 16 & 255] ^ tc[value[i++] ^ crc >>> 24] ^ tb[value[i++]] ^ ta[value[i++]] ^ t9[value[i++]] ^ t8[value[i++]] ^ t7[value[i++]] ^ t6[value[i++]] ^ t5[value[i++]] ^ t4[value[i++]] ^ t3[value[i++]] ^ t2[value[i++]] ^ t1[value[i++]] ^ table0[value[i++]];
  }
  for (len += 15; i < len; ) {
    crc = crc >>> 8 ^ table0[(crc ^ value[i++]) & 255];
  }
  return ~crc >>> 0;
}
var table32 = generateCRCTable(POLY_CRC32);
var tables32By16 = generateSliceBy16Tables(table32);
var table32c = generateCRCTable(POLY_CRC32C);
var tables32cBy16 = generateSliceBy16Tables(table32c);
function crc32(input, seed = 0) {
  if (isBufferLike(input)) {
    return crcBuffer(input, seed, table32, tables32By16);
  }
  return crcGenericString(input, seed, table32);
}
function crc32c(input, seed = 0) {
  if (isBufferLike(input)) {
    return crcBuffer(input, seed, table32c, tables32cBy16);
  }
  return crcGenericString(input, seed, table32c);
}

// ../common/src/number.ts
function uint8Add(a, b) {
  return a + b & 255;
}
function uint16Add(a, b) {
  return a + b & 65535;
}
function uint32Add(a, b) {
  return Number(BigInt(a) + BigInt(b) & 0xffffffffn);
}
function uint24(v) {
  return v & 16777215;
}
function uint16Gt(a, b) {
  const halfMod = 32768;
  return a < b && b - a > halfMod || a > b && a - b < halfMod;
}
function uint16Gte(a, b) {
  return a === b || uint16Gt(a, b);
}
function uint32Gt(a, b) {
  const halfMod = 2147483648;
  return a < b && b - a > halfMod || a > b && a - b < halfMod;
}
function uint32Gte(a, b) {
  return a === b || uint32Gt(a, b);
}
var int = (n) => Number.parseInt(n, 10);

// ../common/src/promise.ts
var PromiseQueue = class {
  queue = [];
  running = false;
  push = (promise) => new Promise((r, f) => {
    this.queue.push({ promise, done: r, failed: f });
    if (!this.running) {
      this.run();
    }
  });
  async run() {
    const task = this.queue.shift();
    if (task) {
      this.running = true;
      try {
        const res = await task.promise();
        task.done(res);
      } catch (error) {
        task.failed(error);
      }
      this.run();
    } else {
      this.running = false;
    }
  }
  cancel() {
    this.queue = [];
  }
};

// ../common/src/network.ts
import { createSocket } from "dgram";
var interfaceAddress = (type, interfaceAddresses) => interfaceAddresses ? interfaceAddresses[type] : void 0;
async function randomPort(protocol = "udp4", interfaceAddresses) {
  const socket = createSocket(protocol);
  setImmediate(
    () => socket.bind({
      port: 0,
      address: interfaceAddress(protocol, interfaceAddresses)
    })
  );
  await new Promise((r) => {
    socket.once("error", r);
    socket.once("listening", r);
  });
  const port = socket.address()?.port;
  await new Promise((r) => socket.close(() => r()));
  return port;
}
async function randomPorts(num, protocol = "udp4", interfaceAddresses) {
  return Promise.all(
    [...Array(num)].map(() => randomPort(protocol, interfaceAddresses))
  );
}
async function findPort(min, max, protocol = "udp4", interfaceAddresses) {
  let port;
  for (let i = min; i <= max; i++) {
    const socket = createSocket(protocol);
    setImmediate(
      () => socket.bind({
        port: i,
        address: interfaceAddress(protocol, interfaceAddresses)
      })
    );
    const err5 = await new Promise((r) => {
      socket.once("error", (e) => r(e));
      socket.once("listening", () => r());
    });
    if (err5) {
      await new Promise((r) => socket.close(() => r()));
      continue;
    }
    port = socket.address()?.port;
    await new Promise((r) => socket.close(() => r()));
    if (min <= port && port <= max) {
      break;
    }
  }
  if (!port) throw new Error("port not found");
  return port;
}
function normalizeFamilyNodeV18(family) {
  if (family === "IPv4") return 4;
  if (family === "IPv6") return 6;
  return family;
}

// ../common/src/log.ts
import Debug from "debug";
var WeriftError = class extends Error {
  message;
  payload;
  path;
  constructor(props) {
    super(props.message);
  }
  toJSON() {
    return {
      message: this.message,
      payload: JSON.parse(JSON.stringify(this.payload)),
      path: this.path
    };
  }
};
var debug = Debug.debug;

// ../common/src/event.ts
var Event2 = class {
  event = {
    stack: [],
    promiseStack: [],
    eventId: 0
  };
  ended = false;
  onended;
  onerror = (e) => {
  };
  execute = (...args) => {
    if (this.ended) {
      return;
    }
    for (const item of this.event.stack) {
      item.execute(...args);
    }
    (async () => {
      for (const item of this.event.promiseStack) {
        await item.execute(...args);
      }
    })().catch((e) => {
      this.onerror(e);
    });
  };
  complete = () => {
    if (this.ended) {
      return;
    }
    for (const item of this.event.stack) {
      if (item.complete) {
        item.complete();
      }
    }
    this.allUnsubscribe();
    this.ended = true;
    if (this.onended) {
      this.onended();
      this.onended = void 0;
    }
  };
  error = (e) => {
    if (this.ended) {
      return;
    }
    for (const item of this.event.stack) {
      if (item.error) {
        item.error(e);
      }
    }
    this.allUnsubscribe();
  };
  allUnsubscribe = () => {
    if (this.ended) {
      return;
    }
    this.event = {
      stack: [],
      promiseStack: [],
      eventId: 0
    };
  };
  subscribe = (execute, complete, error) => {
    const id = this.event.eventId;
    this.event.stack.push({ execute, id, complete, error });
    this.event.eventId++;
    const unSubscribe = () => {
      this.event.stack = this.event.stack.filter(
        (item) => item.id !== id && item
      );
    };
    const disposer = (disposer2) => {
      disposer2.push(unSubscribe);
    };
    return { unSubscribe, disposer };
  };
  pipe(e) {
    this.subscribe((...args) => {
      e.execute(...args);
    });
  }
  queuingSubscribe = (execute, complete, error) => {
    if (this.ended) throw new Error("event completed");
    const id = this.event.eventId;
    this.event.promiseStack.push({ execute, id, complete, error });
    this.event.eventId++;
    const unSubscribe = () => {
      this.event.stack = this.event.stack.filter(
        (item) => item.id !== id && item
      );
    };
    const disposer = (disposer2) => {
      disposer2.push(unSubscribe);
    };
    return { unSubscribe, disposer };
  };
  once = (execute, complete, error) => {
    const off = this.subscribe(
      (...args) => {
        off.unSubscribe();
        execute(...args);
      },
      complete,
      error
    );
  };
  watch = (cb, timeLimit) => new Promise((resolve, reject) => {
    const timeout = timeLimit && setTimeout(() => {
      reject("Event watch timeout");
    }, timeLimit);
    const { unSubscribe } = this.subscribe((...args) => {
      const done = cb(...args);
      if (done) {
        if (timeout) clearTimeout(timeout);
        unSubscribe();
        resolve(args);
      }
    });
  });
  asPromise = (timeLimit) => new Promise((resolve, reject) => {
    const timeout = timeLimit && setTimeout(() => {
      reject("Event asPromise timeout");
    }, timeLimit);
    this.once(
      (...args) => {
        if (timeout) clearTimeout(timeout);
        resolve(args);
      },
      () => {
        if (timeout) clearTimeout(timeout);
        resolve([]);
      },
      (err5) => {
        if (timeout) clearTimeout(timeout);
        reject(err5);
      }
    );
  });
  get returnTrigger() {
    const { execute, error, complete } = this;
    return { execute, error, complete };
  }
  get returnListener() {
    const { subscribe, once, asPromise } = this;
    return { subscribe, once, asPromise };
  }
  get length() {
    return this.event.stack.length;
  }
};
var EventDisposer = class {
  _disposer = [];
  push(disposer) {
    this._disposer.push(disposer);
  }
  dispose() {
    this._disposer.forEach((d) => d());
    this._disposer = [];
  }
};

// ../common/src/transport.ts
import {
  createSocket as createSocket2
} from "dgram";
import * as net from "node:net";
import * as tls from "node:tls";
import { connect as connect2 } from "node:net";
var log = debug("werift-ice:packages/ice/src/transport.ts");
var UdpTransport = class _UdpTransport {
  constructor(socketType, options = {}) {
    this.socketType = socketType;
    this.options = options;
    this.socket = createSocket2(socketType);
    this.socket.on("message", (data, info) => {
      if (normalizeFamilyNodeV18(info.family) === 6) {
        [info.address] = info.address.split("%");
      }
      this.rinfo = info;
      try {
        this.onData(data, [info.address, info.port]);
      } catch (error) {
        log("onData error", error);
      }
    });
  }
  type = "udp";
  socket;
  rinfo;
  onData = () => {
  };
  closed = false;
  static async init(type, options = {}) {
    const transport = new _UdpTransport(type, options);
    await transport.init();
    return transport;
  }
  async init() {
    const address = interfaceAddress(
      this.socketType,
      this.options.interfaceAddresses
    );
    if (this.options.port) {
      this.socket.bind({ port: this.options.port, address });
    } else if (this.options.portRange) {
      const port = await findPort(
        this.options.portRange[0],
        this.options.portRange[1],
        this.socketType,
        this.options.interfaceAddresses
      );
      this.socket.bind({ port, address });
    } else {
      this.socket.bind({ address });
    }
    await new Promise((r) => this.socket.once("listening", r));
  }
  send = async (data, addr) => {
    if (addr && !net.isIP(addr[0])) {
      return new Promise((r, f) => {
        this.socket.send(data, addr[1], addr[0], (error) => {
          if (error) {
            log("send error", addr, data);
            f(error);
          } else {
            r();
          }
        });
      });
    } else {
      addr = addr ?? [this.rinfo?.address, this.rinfo?.port];
      this.socket.send(data, addr[1], addr[0]);
    }
  };
  get address() {
    return this.socket.address();
  }
  get host() {
    return this.socket.address().address;
  }
  get port() {
    return this.socket.address().port;
  }
  close = () => new Promise((r) => {
    this.closed = true;
    this.socket.once("close", r);
    try {
      this.socket.close();
    } catch (error) {
      r();
    }
  });
};
var TcpTransport = class _TcpTransport {
  type = "tcp";
  stream;
  constructor(addr) {
    this.stream = new StreamTransport(
      "tcp",
      () => connect2({ port: addr[1], host: addr[0] })
    );
  }
  static async init(addr) {
    const transport = new _TcpTransport(addr);
    await transport.init();
    return transport;
  }
  async init() {
    await this.stream.waitForConnect();
  }
  get address() {
    return this.stream.address;
  }
  get closed() {
    return this.stream.closed;
  }
  get onData() {
    return this.stream.onData;
  }
  set onData(handler) {
    this.stream.onData = handler;
  }
  send = async (data, addr) => {
    await this.stream.send(data, addr);
  };
  close = async () => {
    await this.stream.close();
  };
};
var TlsTransport = class _TlsTransport {
  type = "tls";
  stream;
  constructor(addr, options = {}) {
    this.stream = new StreamTransport(
      "tls",
      () => tls.connect({
        ...options,
        host: addr[0],
        port: addr[1]
      })
    );
  }
  static async init(addr, options = {}) {
    const transport = new _TlsTransport(addr, options);
    await transport.init();
    return transport;
  }
  async init() {
    await this.stream.waitForConnect();
  }
  get address() {
    return this.stream.address;
  }
  get closed() {
    return this.stream.closed;
  }
  get onData() {
    return this.stream.onData;
  }
  set onData(handler) {
    this.stream.onData = handler;
  }
  send = async (data, addr) => {
    await this.stream.send(data, addr);
  };
  close = async () => {
    await this.stream.close();
  };
};
var StreamTransport = class {
  constructor(type, createClient, connectEvent = type === "tls" ? "secureConnect" : "connect") {
    this.createClient = createClient;
    this.connectEvent = connectEvent;
    this.type = type;
    this.connect();
  }
  type;
  connecting;
  client;
  onData = () => {
  };
  closed = false;
  connect() {
    if (this.closed) {
      return;
    }
    if (this.client) {
      this.client.destroy();
    }
    const client = this.createClient();
    this.client = client;
    this.connecting = new Promise((r, f) => {
      const onConnect = () => {
        client.off("error", onConnectError);
        r();
      };
      const onConnectError = (error) => {
        client.off(this.connectEvent, onConnect);
        f(error);
      };
      client.once(this.connectEvent, onConnect);
      client.once("error", onConnectError);
    });
    client.on("data", (data) => {
      const addr = [
        this.client.remoteAddress,
        this.client.remotePort
      ];
      this.onData(data, addr);
    });
    client.on("end", () => {
      this.connect();
    });
    client.on("error", (error) => {
      log(`${this.type} transport error`, error);
    });
  }
  async waitForConnect() {
    await this.connecting;
  }
  get address() {
    return {};
  }
  send = async (data, addr) => {
    void addr;
    await this.connecting;
    await new Promise((resolve, reject) => {
      this.client.write(data, (err5) => {
        if (err5) {
          reject(err5);
          return;
        }
        resolve();
      });
    });
  };
  close = async () => {
    this.closed = true;
    this.client?.destroy();
  };
};

// ../dtls/src/context/cipher.ts
import { createSign, randomBytes as randomBytes2, webcrypto } from "crypto";
import { Certificate, PrivateKey } from "@fidm/x509";
import * as x509 from "@peculiar/x509";
import { encode, types } from "@shinyoshiaki/binary-data";

// ../dtls/src/cipher/const.ts
var SignatureAlgorithm = {
  rsa_1: 1,
  ecdsa_3: 3
};
var HashAlgorithm = {
  sha256_4: 4
};
var CipherSuite = {
  TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256_49195: 49195,
  //49195,
  TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256_49199: 49199
  //49199
};
var CipherSuiteList = Object.values(CipherSuite);
var NamedCurveAlgorithm = {
  x25519_29: 29,
  secp256r1_23: 23
};
var NamedCurveAlgorithmList = Object.values(NamedCurveAlgorithm);
var CurveType = { named_curve_3: 3 };
var SignatureScheme = {
  rsa_pkcs1_sha256: 1025,
  ecdsa_secp256r1_sha256: 1027
};
var certificateTypes = [
  1,
  // clientCertificateTypeRSASign
  64
  // clientCertificateTypeECDSASign
];
var signatures = [
  { hash: HashAlgorithm.sha256_4, signature: SignatureAlgorithm.rsa_1 },
  { hash: HashAlgorithm.sha256_4, signature: SignatureAlgorithm.ecdsa_3 }
];

// ../dtls/src/cipher/prf.ts
import { createHash, createHmac } from "crypto";
import { createDecode } from "@shinyoshiaki/binary-data";
import nacl from "tweetnacl";

// ../dtls/src/cipher/ec.ts
import { p256 } from "@noble/curves/p256";
var p256Keypair = () => {
  const priv = p256.utils.randomPrivateKey();
  const pub = p256.getPublicKey(priv, false);
  const privateKey = Buffer.from(priv);
  const publicKey = Buffer.from(pub);
  return {
    privateKey,
    publicKey
  };
};
var p256PreMasterSecret = ({
  publicKey,
  privateKey
}) => {
  const res = p256.getSharedSecret(privateKey, publicKey);
  const secret = Buffer.from(res).subarray(1);
  return secret;
};

// ../dtls/src/cipher/prf.ts
function prfPreMasterSecret(publicKey, privateKey, curve) {
  switch (curve) {
    case NamedCurveAlgorithm.secp256r1_23:
      return p256PreMasterSecret({ publicKey, privateKey });
    case NamedCurveAlgorithm.x25519_29:
      return Buffer.from(nacl.scalarMult(privateKey, publicKey));
    default:
      throw new Error();
  }
}
function hmac(algorithm, secret, data) {
  const hash2 = createHmac(algorithm, secret);
  hash2.update(data);
  return hash2.digest();
}
function prfPHash(secret, seed, requestedLegth, algorithm = "sha256") {
  const totalLength = requestedLegth;
  const bufs = [];
  let Ai = seed;
  do {
    Ai = hmac(algorithm, secret, Ai);
    const output = hmac(algorithm, secret, Buffer.concat([Ai, seed]));
    bufs.push(output);
    requestedLegth -= output.length;
  } while (requestedLegth > 0);
  return Buffer.concat(bufs, totalLength);
}
function prfMasterSecret(preMasterSecret, clientRandom, serverRandom) {
  const seed = Buffer.concat([
    Buffer.from("master secret"),
    clientRandom,
    serverRandom
  ]);
  return prfPHash(preMasterSecret, seed, 48);
}
function prfExtendedMasterSecret(preMasterSecret, handshakes) {
  const sessionHash = hash("sha256", handshakes);
  const label = "extended master secret";
  return prfPHash(
    preMasterSecret,
    Buffer.concat([Buffer.from(label), sessionHash]),
    48
  );
}
function exportKeyingMaterial(label, length, masterSecret, localRandom, remoteRandom, isClient) {
  const clientRandom = isClient ? localRandom : remoteRandom;
  const serverRandom = isClient ? remoteRandom : localRandom;
  const seed = Buffer.concat([Buffer.from(label), clientRandom, serverRandom]);
  return prfPHash(masterSecret, seed, length);
}
function hash(algorithm, data) {
  return createHash(algorithm).update(data).digest();
}
function prfVerifyData(masterSecret, handshakes, label, size = 12) {
  const bytes = hash("sha256", handshakes);
  return prfPHash(
    masterSecret,
    Buffer.concat([Buffer.from(label), bytes]),
    size
  );
}
function prfVerifyDataClient(masterSecret, handshakes) {
  return prfVerifyData(masterSecret, handshakes, "client finished");
}
function prfVerifyDataServer(masterSecret, handshakes) {
  return prfVerifyData(masterSecret, handshakes, "server finished");
}
function prfEncryptionKeys(masterSecret, clientRandom, serverRandom, prfKeyLen, prfIvLen, prfNonceLen, algorithm = "sha256") {
  const size = prfKeyLen * 2 + prfIvLen * 2;
  const secret = masterSecret;
  const seed = Buffer.concat([serverRandom, clientRandom]);
  const keyBlock = prfPHash(
    secret,
    Buffer.concat([Buffer.from("key expansion"), seed]),
    size,
    algorithm
  );
  const stream = createDecode(keyBlock);
  const clientWriteKey = stream.readBuffer(prfKeyLen);
  const serverWriteKey = stream.readBuffer(prfKeyLen);
  const clientNonceImplicit = stream.readBuffer(prfIvLen);
  const serverNonceImplicit = stream.readBuffer(prfIvLen);
  const clientNonce = Buffer.alloc(prfNonceLen, 0);
  const serverNonce = Buffer.alloc(prfNonceLen, 0);
  clientNonceImplicit.copy(clientNonce, 0);
  serverNonceImplicit.copy(serverNonce, 0);
  return { clientWriteKey, serverWriteKey, clientNonce, serverNonce };
}

// ../dtls/src/cipher/suites/abstract.ts
var SessionType = {
  CLIENT: 1,
  SERVER: 2
};
var AbstractCipher = class {
  id = 0;
  name;
  hashAlgorithm;
  verifyDataLength = 12;
  blockAlgorithm;
  kx;
  /**
   * Init cipher.
   * @abstract
   */
  init(...args) {
    throw new Error("not implemented");
  }
  /**
   * Encrypts data.
   * @abstract
   */
  encrypt(...args) {
    throw new Error("not implemented");
  }
  /**
   * Decrypts data.
   * @abstract
   */
  decrypt(...args) {
    throw new Error("not implemented");
  }
  /**
   * @returns {string}
   */
  toString() {
    return this.name;
  }
};

// ../dtls/src/context/cipher.ts
var crypto = webcrypto;
x509.cryptoProvider.set(crypto);
var CipherContext = class {
  constructor(sessionType, certPem, keyPem, signatureHashAlgorithm) {
    this.sessionType = sessionType;
    this.certPem = certPem;
    this.keyPem = keyPem;
    if (certPem && keyPem && signatureHashAlgorithm) {
      this.parseX509(certPem, keyPem, signatureHashAlgorithm);
    }
  }
  localRandom;
  remoteRandom;
  cipherSuite;
  remoteCertificate;
  remoteKeyPair;
  localKeyPair;
  masterSecret;
  cipher;
  namedCurve;
  signatureHashAlgorithm;
  localCert;
  localPrivateKey;
  /**
   *
   * @param signatureHash
   * @param namedCurveAlgorithm necessary when use ecdsa
   */
  static createSelfSignedCertificateWithKey = async (signatureHash, namedCurveAlgorithm) => {
    const signatureAlgorithmName = (() => {
      switch (signatureHash.signature) {
        case SignatureAlgorithm.rsa_1:
          return "RSASSA-PKCS1-v1_5";
        case SignatureAlgorithm.ecdsa_3:
          return "ECDSA";
      }
    })();
    const hash2 = (() => {
      switch (signatureHash.hash) {
        case HashAlgorithm.sha256_4:
          return "SHA-256";
      }
    })();
    const namedCurve = (() => {
      switch (namedCurveAlgorithm) {
        case NamedCurveAlgorithm.secp256r1_23:
          return "P-256";
        case NamedCurveAlgorithm.x25519_29:
          if (signatureAlgorithmName === "ECDSA") {
            return "P-256";
          }
          return "X25519";
        default: {
          if (signatureAlgorithmName === "ECDSA") return "P-256";
          if (signatureAlgorithmName === "RSASSA-PKCS1-v1_5") return "X25519";
        }
      }
    })();
    const alg = (() => {
      switch (signatureAlgorithmName) {
        case "ECDSA":
          return { name: signatureAlgorithmName, hash: hash2, namedCurve };
        case "RSASSA-PKCS1-v1_5":
          return {
            name: signatureAlgorithmName,
            hash: hash2,
            publicExponent: new Uint8Array([1, 0, 1]),
            modulusLength: 2048
          };
      }
    })();
    const keys = await crypto.subtle.generateKey(alg, true, [
      "sign",
      "verify"
    ]);
    const cert = await x509.X509CertificateGenerator.createSelfSigned({
      serialNumber: randomBytes2(8).toString("hex"),
      name: "C=AU, ST=Some-State, O=Internet Widgits Pty Ltd",
      notBefore: /* @__PURE__ */ new Date(),
      notAfter: new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1e3),
      signingAlgorithm: alg,
      keys
    });
    const certPem = cert.toString("pem");
    const keyPem = x509.PemConverter.encode(
      await crypto.subtle.exportKey("pkcs8", keys.privateKey),
      "private key"
    );
    return { certPem, keyPem, signatureHash };
  };
  encryptPacket(pkt) {
    const header = pkt.recordLayerHeader;
    const version = header.protocolVersion.major << 8 | header.protocolVersion.minor;
    const enc = this.cipher.encrypt(this.sessionType, pkt.fragment, {
      type: header.contentType,
      version,
      epoch: header.epoch,
      sequenceNumber: header.sequenceNumber
    });
    pkt.fragment = enc;
    pkt.recordLayerHeader.contentLen = enc.length;
    return pkt;
  }
  decryptPacket(pkt) {
    const header = pkt.recordLayerHeader;
    const version = header.protocolVersion.major << 8 | header.protocolVersion.minor;
    const dec = this.cipher.decrypt(this.sessionType, pkt.fragment, {
      type: header.contentType,
      version,
      epoch: header.epoch,
      sequenceNumber: header.sequenceNumber
    });
    return dec;
  }
  verifyData(buf) {
    if (this.sessionType === SessionType.CLIENT)
      return prfVerifyDataClient(this.masterSecret, buf);
    else return prfVerifyDataServer(this.masterSecret, buf);
  }
  signatureData(data, hash2) {
    const signature = createSign(hash2).update(data);
    const key = this.localPrivateKey.toPEM().toString();
    const signed = signature.sign(key);
    return signed;
  }
  generateKeySignature(hashAlgorithm) {
    const clientRandom = this.sessionType === SessionType.CLIENT ? this.localRandom : this.remoteRandom;
    const serverRandom = this.sessionType === SessionType.SERVER ? this.localRandom : this.remoteRandom;
    const sig = this.valueKeySignature(
      clientRandom.serialize(),
      serverRandom.serialize(),
      this.localKeyPair.publicKey,
      this.namedCurve
    );
    const enc = this.localPrivateKey.sign(sig, hashAlgorithm);
    return enc;
  }
  parseX509(certPem, keyPem, signatureHash) {
    const cert = Certificate.fromPEM(Buffer.from(certPem));
    const sec = PrivateKey.fromPEM(Buffer.from(keyPem));
    this.localCert = cert.raw;
    this.localPrivateKey = sec;
    this.signatureHashAlgorithm = signatureHash;
  }
  valueKeySignature(clientRandom, serverRandom, publicKey, namedCurve) {
    const serverParams = Buffer.from(
      encode(
        {
          type: CurveType.named_curve_3,
          curve: namedCurve,
          len: publicKey.length
        },
        { type: types.uint8, curve: types.uint16be, len: types.uint8 }
      ).slice()
    );
    return Buffer.concat([clientRandom, serverRandom, serverParams, publicKey]);
  }
};

// ../dtls/src/context/srtp.ts
var SrtpContext = class {
  srtpProfile;
  static findMatchingSRTPProfile(remote, local) {
    for (const v of local) {
      if (remote.includes(v)) return v;
    }
  }
};

// ../dtls/src/handshake/message/client/hello.ts
import { decode as decode3, encode as encode4, types as types5 } from "@shinyoshiaki/binary-data";

// ../dtls/src/record/message/fragment.ts
import { decode, encode as encode2, types as types2 } from "@shinyoshiaki/binary-data";

// ../dtls/src/helper.ts
var dumpBuffer2 = (data) => "0x" + data.toString("hex").replace(/(.)(.)/g, "$1$2 ").split(" ").filter((s) => s != void 0 && s.length > 0).join(",0x");
var getObjectSummary = (obj) => Object.entries({ ...obj }).reduce((acc, [key, value]) => {
  if (typeof value === "number" || typeof value === "string") {
    acc[key] = value;
  }
  if (Buffer.isBuffer(value)) {
    acc[key] = dumpBuffer2(value);
  }
  return acc;
}, {});

// ../dtls/src/record/message/fragment.ts
var FragmentedHandshake = class _FragmentedHandshake {
  constructor(msg_type, length, message_seq, fragment_offset, fragment_length, fragment) {
    this.msg_type = msg_type;
    this.length = length;
    this.message_seq = message_seq;
    this.fragment_offset = fragment_offset;
    this.fragment_length = fragment_length;
    this.fragment = fragment;
  }
  static spec = {
    msg_type: types2.uint8,
    length: types2.uint24be,
    message_seq: types2.uint16be,
    fragment_offset: types2.uint24be,
    fragment_length: types2.uint24be,
    fragment: types2.buffer((context) => context.current.fragment_length)
  };
  get summary() {
    return getObjectSummary(this);
  }
  static createEmpty() {
    return new _FragmentedHandshake(
      void 0,
      void 0,
      void 0,
      void 0,
      void 0,
      void 0
    );
  }
  static deSerialize(buf) {
    return new _FragmentedHandshake(
      ...Object.values(decode(buf, _FragmentedHandshake.spec))
    );
  }
  serialize() {
    const res = encode2(this, _FragmentedHandshake.spec).slice();
    return Buffer.from(res);
  }
  chunk(maxFragmentLength) {
    let start = 0;
    const totalLength = this.fragment.length;
    if (totalLength === 0)
      return [
        new _FragmentedHandshake(
          this.msg_type,
          totalLength,
          this.message_seq,
          start,
          0,
          this.fragment
        )
      ];
    const fragments = [];
    if (!maxFragmentLength) {
      maxFragmentLength = 1280 - (20 + 8) - (1 + 3 + 2 + 3 + 3);
    }
    while (start < totalLength) {
      const fragmentLength = Math.min(maxFragmentLength, totalLength - start);
      const data = Buffer.from(
        this.fragment.slice(start, start + fragmentLength)
      );
      if (data.length <= 0) {
        throw new Error(
          `Zero or less bytes processed while fragmenting handshake message.`
        );
      }
      fragments.push(
        new _FragmentedHandshake(
          this.msg_type,
          totalLength,
          this.message_seq,
          start,
          data.length,
          data
        )
      );
      start += data.length;
    }
    return fragments;
  }
  static assemble(messages) {
    if (!messages?.length) {
      throw new Error("cannot reassemble handshake from empty array");
    }
    messages = messages.sort((a, b) => a.fragment_offset - b.fragment_offset);
    const combined = Buffer.alloc(messages[0].length);
    for (const msg of messages) {
      msg.fragment.copy(combined, msg.fragment_offset);
    }
    return new _FragmentedHandshake(
      messages[0].msg_type,
      messages[0].length,
      messages[0].message_seq,
      0,
      combined.length,
      combined
    );
  }
  static findAllFragments(fragments, type) {
    const reference = fragments.find((v) => v.msg_type === type);
    if (!reference) return [];
    if (!fragments?.length) return [];
    return fragments.filter((f) => {
      return f.msg_type === reference.msg_type && f.message_seq === reference.message_seq && f.length === reference.length;
    });
  }
};

// ../dtls/src/handshake/binary.ts
import { types as types3 } from "@shinyoshiaki/binary-data";
var { uint16be, uint24be, buffer, array, uint8, string } = types3;
var Extension = {
  type: uint16be,
  data: buffer(uint16be)
};
var ExtensionList = array(Extension, uint16be, "bytes");
var ASN11Cert = buffer(uint24be);
var ClientCertificateType = uint8;
var DistinguishedName = string(uint16be);
var SignatureHashAlgorithm = { hash: uint8, signature: uint8 };
var ProtocolVersion = { major: uint8, minor: uint8 };

// ../dtls/src/handshake/random.ts
import { randomBytes as randomBytes3 } from "crypto";
import { decode as decode2, encode as encode3, types as types4 } from "@shinyoshiaki/binary-data";
var DtlsRandom = class _DtlsRandom {
  constructor(gmt_unix_time = Math.floor(Date.now() / 1e3), random_bytes = randomBytes3(28)) {
    this.gmt_unix_time = gmt_unix_time;
    this.random_bytes = random_bytes;
  }
  static spec = {
    gmt_unix_time: types4.uint32be,
    random_bytes: types4.buffer(28)
  };
  static deSerialize(buf) {
    return new _DtlsRandom(
      ...Object.values(decode2(buf, _DtlsRandom.spec))
    );
  }
  static from(spec) {
    return new _DtlsRandom(...Object.values(spec));
  }
  serialize() {
    const res = encode3(this, _DtlsRandom.spec).slice();
    return Buffer.from(res);
  }
};

// ../dtls/src/handshake/message/client/hello.ts
var ClientHello = class _ClientHello {
  constructor(clientVersion, random, sessionId, cookie, cipherSuites2, compressionMethods, extensions) {
    this.clientVersion = clientVersion;
    this.random = random;
    this.sessionId = sessionId;
    this.cookie = cookie;
    this.cipherSuites = cipherSuites2;
    this.compressionMethods = compressionMethods;
    this.extensions = extensions;
  }
  msgType = 1 /* client_hello_1 */;
  messageSeq = 0;
  static spec = {
    clientVersion: { major: types5.uint8, minor: types5.uint8 },
    random: DtlsRandom.spec,
    sessionId: types5.buffer(types5.uint8),
    cookie: types5.buffer(types5.uint8),
    cipherSuites: types5.array(types5.uint16be, types5.uint16be, "bytes"),
    compressionMethods: types5.array(types5.uint8, types5.uint8, "bytes"),
    extensions: ExtensionList
  };
  static createEmpty() {
    return new _ClientHello(
      void 0,
      void 0,
      void 0,
      void 0,
      void 0,
      void 0,
      void 0
    );
  }
  static deSerialize(buf) {
    return new _ClientHello(
      ...Object.values(decode3(buf, _ClientHello.spec))
    );
  }
  serialize() {
    const res = encode4(this, _ClientHello.spec).slice();
    return Buffer.from(res);
  }
  toFragment() {
    const body = this.serialize();
    return new FragmentedHandshake(
      this.msgType,
      body.length,
      this.messageSeq,
      0,
      body.length,
      body
    );
  }
};

// ../dtls/src/flight/flight.ts
import { setTimeout as setTimeout2 } from "timers/promises";

// ../dtls/src/record/message/header.ts
import { decode as decode4, encode as encode5, types as types6 } from "@shinyoshiaki/binary-data";
var MACHeader = class _MACHeader {
  constructor(epoch, sequenceNumber, contentType, protocolVersion, contentLen) {
    this.epoch = epoch;
    this.sequenceNumber = sequenceNumber;
    this.contentType = contentType;
    this.protocolVersion = protocolVersion;
    this.contentLen = contentLen;
  }
  static spec = {
    epoch: types6.uint16be,
    sequenceNumber: types6.uint48be,
    contentType: types6.uint8,
    protocolVersion: ProtocolVersion,
    contentLen: types6.uint16be
  };
  static createEmpty() {
    return new _MACHeader(
      void 0,
      void 0,
      void 0,
      void 0,
      void 0
    );
  }
  static deSerialize(buf) {
    return new _MACHeader(
      ...Object.values(decode4(buf, _MACHeader.spec))
    );
  }
  serialize() {
    const res = encode5(this, _MACHeader.spec).slice();
    return Buffer.from(res);
  }
};

// ../dtls/src/record/message/plaintext.ts
var DtlsPlaintext = class _DtlsPlaintext {
  constructor(recordLayerHeader, fragment) {
    this.recordLayerHeader = recordLayerHeader;
    this.fragment = fragment;
  }
  get summary() {
    return {
      header: this.recordLayerHeader,
      fragment: dumpBuffer2(this.fragment)
    };
  }
  static createEmpty() {
    return new _DtlsPlaintext(void 0, void 0);
  }
  static deSerialize(buf) {
    if (buf.length < 13) {
      throw new Error("Invalid DTLS record: buffer is too short");
    }
    const contentType = buf.readUInt8(0);
    const majorVersion = buf.readUInt8(1);
    const minorVersion = buf.readUInt8(2);
    const epoch = buf.readUInt16BE(3);
    const sequenceNumber = buf.slice(5, 11).readUIntBE(0, 6);
    const contentLen = buf.readUInt16BE(11);
    if (buf.length < 13 + contentLen) {
      throw new Error("Invalid DTLS record: fragment length exceeds buffer");
    }
    const fragment = buf.slice(13, 13 + contentLen);
    const r = new _DtlsPlaintext(
      {
        contentType,
        protocolVersion: { major: majorVersion, minor: minorVersion },
        epoch,
        sequenceNumber,
        contentLen
      },
      fragment
    );
    return r;
  }
  serialize() {
    const fragmentLength = this.fragment.length;
    const totalLength = 13 + fragmentLength;
    const buffer2 = Buffer.alloc(totalLength);
    buffer2.writeUInt8(this.recordLayerHeader.contentType, 0);
    buffer2.writeUInt8(this.recordLayerHeader.protocolVersion.major, 1);
    buffer2.writeUInt8(this.recordLayerHeader.protocolVersion.minor, 2);
    buffer2.writeUInt16BE(this.recordLayerHeader.epoch, 3);
    buffer2.writeUIntBE(this.recordLayerHeader.sequenceNumber, 5, 6);
    buffer2.writeUInt16BE(fragmentLength, 11);
    this.fragment.copy(buffer2, 13);
    return buffer2;
  }
  computeMACHeader() {
    return new MACHeader(
      this.recordLayerHeader.epoch,
      this.recordLayerHeader.sequenceNumber,
      this.recordLayerHeader.contentType,
      this.recordLayerHeader.protocolVersion,
      this.recordLayerHeader.contentLen
    ).serialize();
  }
};

// ../dtls/src/record/builder.ts
var createFragments = (dtls) => (handshakes) => {
  dtls.lastFlight = handshakes;
  return handshakes.flatMap((handshake) => {
    handshake.messageSeq = dtls.sequenceNumber++;
    const fragment = handshake.toFragment();
    const fragments = fragment.chunk();
    return fragments;
  });
};
var createPlaintext = (dtls) => (fragments, recordSequenceNumber) => {
  return fragments.map((msg) => {
    const plaintext = new DtlsPlaintext(
      {
        contentType: msg.type,
        protocolVersion: dtls.version,
        epoch: dtls.epoch,
        sequenceNumber: recordSequenceNumber,
        contentLen: msg.fragment.length
      },
      msg.fragment
    );
    return plaintext;
  });
};

// ../dtls/src/record/const.ts
var AlertDesc = /* @__PURE__ */ ((AlertDesc2) => {
  AlertDesc2[AlertDesc2["CloseNotify"] = 0] = "CloseNotify";
  AlertDesc2[AlertDesc2["UnexpectedMessage"] = 10] = "UnexpectedMessage";
  AlertDesc2[AlertDesc2["BadRecordMac"] = 20] = "BadRecordMac";
  AlertDesc2[AlertDesc2["DecryptionFailed"] = 21] = "DecryptionFailed";
  AlertDesc2[AlertDesc2["RecordOverflow"] = 22] = "RecordOverflow";
  AlertDesc2[AlertDesc2["DecompressionFailure"] = 30] = "DecompressionFailure";
  AlertDesc2[AlertDesc2["HandshakeFailure"] = 40] = "HandshakeFailure";
  AlertDesc2[AlertDesc2["NoCertificate"] = 41] = "NoCertificate";
  AlertDesc2[AlertDesc2["BadCertificate"] = 42] = "BadCertificate";
  AlertDesc2[AlertDesc2["UnsupportedCertificate"] = 43] = "UnsupportedCertificate";
  AlertDesc2[AlertDesc2["CertificateRevoked"] = 44] = "CertificateRevoked";
  AlertDesc2[AlertDesc2["CertificateExpired"] = 45] = "CertificateExpired";
  AlertDesc2[AlertDesc2["CertificateUnknown"] = 46] = "CertificateUnknown";
  AlertDesc2[AlertDesc2["IllegalParameter"] = 47] = "IllegalParameter";
  AlertDesc2[AlertDesc2["UnknownCa"] = 48] = "UnknownCa";
  AlertDesc2[AlertDesc2["AccessDenied"] = 49] = "AccessDenied";
  AlertDesc2[AlertDesc2["DecodeError"] = 50] = "DecodeError";
  AlertDesc2[AlertDesc2["DecryptError"] = 51] = "DecryptError";
  AlertDesc2[AlertDesc2["ExportRestriction"] = 60] = "ExportRestriction";
  AlertDesc2[AlertDesc2["ProtocolVersion"] = 70] = "ProtocolVersion";
  AlertDesc2[AlertDesc2["InsufficientSecurity"] = 71] = "InsufficientSecurity";
  AlertDesc2[AlertDesc2["InternalError"] = 80] = "InternalError";
  AlertDesc2[AlertDesc2["UserCanceled"] = 90] = "UserCanceled";
  AlertDesc2[AlertDesc2["NoRenegotiation"] = 100] = "NoRenegotiation";
  AlertDesc2[AlertDesc2["UnsupportedExtension"] = 110] = "UnsupportedExtension";
  return AlertDesc2;
})(AlertDesc || {});

// ../dtls/src/flight/flight.ts
var warn = debug("werift-dtls : packages/dtls/src/flight/flight.ts : warn");
var err = debug("werift-dtls : packages/dtls/src/flight/flight.ts : err");
var Flight = class _Flight {
  constructor(transport, dtls, flight, nextFlight) {
    this.transport = transport;
    this.dtls = dtls;
    this.flight = flight;
    this.nextFlight = nextFlight;
  }
  state = "PREPARING";
  static RetransmitCount = 10;
  createPacket(handshakes) {
    const fragments = createFragments(this.dtls)(handshakes);
    this.dtls.bufferHandshakeCache(fragments, true, this.flight);
    const packets = createPlaintext(this.dtls)(
      fragments.map((fragment) => ({
        type: 22 /* handshake */,
        fragment: fragment.serialize()
      })),
      ++this.dtls.recordSequenceNumber
    );
    return packets;
  }
  async transmit(buffers) {
    let retransmitCount = 0;
    for (; retransmitCount <= _Flight.RetransmitCount; retransmitCount++) {
      this.setState("SENDING");
      this.send(buffers).catch((e) => {
        err("fail to send", err);
      });
      this.setState("WAITING");
      if (this.nextFlight === void 0) {
        this.setState("FINISHED");
        break;
      }
      await setTimeout2(1e3 * ((retransmitCount + 1) / 2));
      if (this.dtls.flight >= this.nextFlight) {
        this.setState("FINISHED");
        break;
      } else {
        warn(
          this.dtls.sessionId,
          "retransmit",
          retransmitCount,
          this.dtls.flight
        );
      }
    }
    if (retransmitCount > _Flight.RetransmitCount) {
      err(this.dtls.sessionId, "retransmit failed", retransmitCount);
      throw new Error(
        `over retransmitCount : ${this.flight} ${this.nextFlight}`
      );
    }
  }
  send = (buf) => Promise.all(buf.map((v) => this.transport.send(v)));
  setState(state) {
    this.state = state;
  }
};

// ../dtls/src/flight/client/flight1.ts
var Flight1 = class extends Flight {
  constructor(udp, dtls, cipher) {
    super(udp, dtls, 1, 3);
    this.cipher = cipher;
  }
  async exec(extensions) {
    if (this.dtls.flight === 1) throw new Error();
    this.dtls.flight = 1;
    const hello = new ClientHello(
      { major: 255 - 1, minor: 255 - 2 },
      new DtlsRandom(),
      Buffer.from([]),
      Buffer.from([]),
      CipherSuiteList,
      [0],
      // don't compress
      extensions
    );
    this.dtls.version = hello.clientVersion;
    this.cipher.localRandom = DtlsRandom.from(hello.random);
    const packets = this.createPacket([hello]);
    const buf = Buffer.concat(packets.map((v) => v.serialize()));
    await this.transmit([buf]);
  }
};

// ../dtls/src/flight/client/flight3.ts
var log2 = debug(
  "werift-dtls : packages/dtls/src/flight/client/flight3.ts : log"
);
var Flight3 = class extends Flight {
  constructor(udp, dtls) {
    super(udp, dtls, 3, 5);
  }
  async exec(verifyReq) {
    if (this.dtls.flight === 3) throw new Error();
    this.dtls.flight = 3;
    this.dtls.handshakeCache = [];
    const [clientHello] = this.dtls.lastFlight;
    log2("dtls version", clientHello.clientVersion);
    clientHello.cookie = verifyReq.cookie;
    this.dtls.cookie = verifyReq.cookie;
    const packets = this.createPacket([clientHello]);
    const buf = Buffer.concat(packets.map((v) => v.serialize()));
    await this.transmit([buf]);
  }
};

// ../dtls/src/cipher/key-exchange.ts
var signTypes = {
  NULL: 0,
  ECDHE: 1
};
var keyTypes = {
  NULL: 0,
  RSA: 1,
  ECDSA: 2,
  PSK: 3
};
var kxTypes = {
  NULL: 0,
  RSA: 1,
  ECDHE_RSA: 2,
  ECDHE_ECDSA: 3,
  PSK: 4,
  ECDHE_PSK: 5
};
var KeyExchange = class {
  id = 0;
  name;
  signType;
  keyType;
  /**
   * @returns {string}
   */
  toString() {
    return this.name;
  }
};
function createRSAKeyExchange() {
  const exchange = new KeyExchange();
  exchange.id = kxTypes.RSA;
  exchange.name = "RSA";
  exchange.keyType = keyTypes.RSA;
  return exchange;
}
function createECDHERSAKeyExchange() {
  const exchange = new KeyExchange();
  exchange.id = kxTypes.ECDHE_RSA;
  exchange.name = "ECDHE_RSA";
  exchange.signType = signTypes.ECDHE;
  exchange.keyType = keyTypes.RSA;
  return exchange;
}
function createECDHEECDSAKeyExchange() {
  const exchange = new KeyExchange();
  exchange.id = kxTypes.ECDHE_ECDSA;
  exchange.name = "ECDHE_ECDSA";
  exchange.signType = signTypes.ECDHE;
  exchange.keyType = keyTypes.ECDSA;
  return exchange;
}
function createPSKKeyExchange() {
  const exchange = new KeyExchange();
  exchange.id = kxTypes.PSK;
  exchange.name = "PSK";
  exchange.signType = signTypes.NULL;
  exchange.keyType = keyTypes.PSK;
  return exchange;
}
function createECDHEPSKKeyExchange() {
  const exchange = new KeyExchange();
  exchange.id = kxTypes.ECDHE_PSK;
  exchange.name = "ECDHE_PSK";
  exchange.signType = signTypes.ECDHE;
  exchange.keyType = keyTypes.PSK;
  return exchange;
}

// ../dtls/src/cipher/suites/aead.ts
import { createCipheriv, createDecipheriv } from "crypto";
var err2 = debug(
  "werift-dtls : packages/dtls/src/cipher/suites/aead.ts : err"
);
var AEADCipher = class extends AbstractCipher {
  keyLength = 0;
  nonceLength = 0;
  ivLength = 0;
  authTagLength = 0;
  nonceImplicitLength = 0;
  nonceExplicitLength = 0;
  clientWriteKey;
  serverWriteKey;
  clientNonce;
  serverNonce;
  constructor() {
    super();
  }
  get summary() {
    return getObjectSummary(this);
  }
  init(masterSecret, serverRandom, clientRandom) {
    const keys = prfEncryptionKeys(
      masterSecret,
      clientRandom,
      serverRandom,
      this.keyLength,
      this.ivLength,
      this.nonceLength,
      this.hashAlgorithm
    );
    this.clientWriteKey = keys.clientWriteKey;
    this.serverWriteKey = keys.serverWriteKey;
    this.clientNonce = keys.clientNonce;
    this.serverNonce = keys.serverNonce;
  }
  /**
   * Encrypt message.
   */
  encrypt(type, data, header) {
    const isClient = type === SessionType.CLIENT;
    const iv = isClient ? this.clientNonce : this.serverNonce;
    const writeKey = isClient ? this.clientWriteKey : this.serverWriteKey;
    if (!iv || !writeKey) throw new Error();
    iv.writeUInt16BE(header.epoch, this.nonceImplicitLength);
    iv.writeUIntBE(header.sequenceNumber, this.nonceImplicitLength + 2, 6);
    const explicitNonce = iv.slice(this.nonceImplicitLength);
    const additionalBuffer = this.encodeAdditionalBuffer(header, data.length);
    const cipher = createCipheriv(this.blockAlgorithm, writeKey, iv, {
      authTagLength: this.authTagLength
    });
    cipher.setAAD(additionalBuffer, {
      plaintextLength: data.length
    });
    const headPart = cipher.update(data);
    const finalPart = cipher.final();
    const authTag = cipher.getAuthTag();
    return Buffer.concat([explicitNonce, headPart, finalPart, authTag]);
  }
  encodeAdditionalBuffer(header, dataLength) {
    const additionalBuffer = Buffer.alloc(13);
    additionalBuffer.writeUInt16BE(header.epoch, 0);
    additionalBuffer.writeUintBE(header.sequenceNumber, 2, 6);
    additionalBuffer.writeUInt8(header.type, 8);
    additionalBuffer.writeUInt16BE(header.version, 9);
    additionalBuffer.writeUInt16BE(dataLength, 11);
    return additionalBuffer;
  }
  /**
   * Decrypt message.
   */
  decrypt(type, data, header) {
    const isClient = type === SessionType.CLIENT;
    const iv = isClient ? this.serverNonce : this.clientNonce;
    const writeKey = isClient ? this.serverWriteKey : this.clientWriteKey;
    if (!iv || !writeKey) throw new Error();
    const explicitNonce = data.subarray(0, this.nonceExplicitLength);
    explicitNonce.copy(iv, this.nonceImplicitLength);
    const encrypted = data.subarray(
      this.nonceExplicitLength,
      data.length - this.authTagLength
    );
    const authTag = data.subarray(data.length - this.authTagLength);
    const additionalBuffer = this.encodeAdditionalBuffer(
      header,
      encrypted.length
    );
    const decipher = createDecipheriv(this.blockAlgorithm, writeKey, iv, {
      authTagLength: this.authTagLength
    });
    decipher.setAuthTag(authTag);
    decipher.setAAD(additionalBuffer, {
      plaintextLength: encrypted.length
    });
    const headPart = decipher.update(encrypted);
    try {
      const finalPart = decipher.final();
      return finalPart.length > 0 ? Buffer.concat([headPart, finalPart]) : headPart;
    } catch (error) {
      err2(
        "decrypt failed",
        error,
        type,
        dumpBuffer2(data),
        header,
        this.summary
      );
      throw error;
    }
  }
};

// ../dtls/src/cipher/create.ts
var cipherSuites = {
  TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256: 49195,
  TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384: 49196,
  TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256: 49199,
  TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384: 49200,
  TLS_RSA_WITH_AES_128_GCM_SHA256: 156,
  TLS_RSA_WITH_AES_256_GCM_SHA384: 157,
  TLS_PSK_WITH_AES_128_GCM_SHA256: 168,
  TLS_PSK_WITH_AES_256_GCM_SHA384: 169,
  TLS_ECDHE_PSK_WITH_AES_128_GCM_SHA256: 53249,
  TLS_ECDHE_PSK_WITH_AES_256_GCM_SHA384: 53250,
  TLS_ECDHE_PSK_WITH_CHACHA20_POLY1305_SHA256: 52396,
  TLS_ECDHE_ECDSA_WITH_CHACHA20_POLY1305_SHA256: 52393,
  TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256: 52392,
  TLS_PSK_WITH_CHACHA20_POLY1305_SHA256: 52395
};
var AEAD_AES_128_GCM = {
  K_LEN: 16,
  // Length of a key.
  N_MIN: 12,
  // Min nonce length.
  N_MAX: 12,
  // Max nonce length.
  P_MAX: 2 ** 36 - 31,
  // Max length of a plaintext.
  // Max safe int in js is 2 ** 53. So, use this value
  // instead of 2 ** 61 as described in rfc5116.
  A_MAX: 2 ** 53 - 1,
  // Max length of an additional data.
  C_MAX: 2 ** 36 - 15
  // Cipher text length.
};
var AEAD_AES_256_GCM = {
  K_LEN: 32,
  // Length of a key.
  N_MIN: 12,
  // Min nonce length.
  N_MAX: 12,
  // Max nonce length.
  P_MAX: 2 ** 36 - 31,
  // Max length of a plaintext.
  // Note: see above.
  A_MAX: 2 ** 53 - 1,
  // Max length of an additional data.
  C_MAX: 2 ** 36 - 15
  // Cipher text length.
};
var RSA_KEY_EXCHANGE = createRSAKeyExchange();
var ECDHE_RSA_KEY_EXCHANGE = createECDHERSAKeyExchange();
var ECDHE_ECDSA_KEY_EXCHANGE = createECDHEECDSAKeyExchange();
var PSK_KEY_EXCHANGE = createPSKKeyExchange();
var ECDHE_PSK_KEY_EXCHANGE = createECDHEPSKKeyExchange();
function createCipher(cipher) {
  switch (cipher) {
    case cipherSuites.TLS_RSA_WITH_AES_128_GCM_SHA256:
      return createAEADCipher(
        cipherSuites.TLS_RSA_WITH_AES_128_GCM_SHA256,
        "TLS_RSA_WITH_AES_128_GCM_SHA256",
        "aes-128-gcm",
        RSA_KEY_EXCHANGE,
        AEAD_AES_128_GCM
      );
    case cipherSuites.TLS_RSA_WITH_AES_256_GCM_SHA384:
      return createAEADCipher(
        cipherSuites.TLS_RSA_WITH_AES_256_GCM_SHA384,
        "TLS_RSA_WITH_AES_256_GCM_SHA384",
        "aes-256-gcm",
        RSA_KEY_EXCHANGE,
        AEAD_AES_256_GCM,
        "sha384"
      );
    case cipherSuites.TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256:
      return createAEADCipher(
        cipherSuites.TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256,
        "TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256",
        "aes-128-gcm",
        ECDHE_RSA_KEY_EXCHANGE,
        AEAD_AES_128_GCM
      );
    case cipherSuites.TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384:
      return createAEADCipher(
        cipherSuites.TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384,
        "TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384",
        "aes-256-gcm",
        ECDHE_RSA_KEY_EXCHANGE,
        AEAD_AES_256_GCM,
        "sha384"
      );
    case cipherSuites.TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256:
      return createAEADCipher(
        cipherSuites.TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256,
        "TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256",
        "aes-128-gcm",
        ECDHE_ECDSA_KEY_EXCHANGE,
        AEAD_AES_128_GCM
      );
    case cipherSuites.TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384:
      return createAEADCipher(
        cipherSuites.TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384,
        "TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384",
        "aes-256-gcm",
        ECDHE_ECDSA_KEY_EXCHANGE,
        AEAD_AES_256_GCM,
        "sha384"
      );
    case cipherSuites.TLS_PSK_WITH_AES_128_GCM_SHA256:
      return createAEADCipher(
        cipherSuites.TLS_PSK_WITH_AES_128_GCM_SHA256,
        "TLS_PSK_WITH_AES_128_GCM_SHA256",
        "aes-128-gcm",
        PSK_KEY_EXCHANGE,
        AEAD_AES_128_GCM,
        "sha256"
      );
    case cipherSuites.TLS_PSK_WITH_AES_256_GCM_SHA384:
      return createAEADCipher(
        cipherSuites.TLS_PSK_WITH_AES_256_GCM_SHA384,
        "TLS_PSK_WITH_AES_256_GCM_SHA384",
        "aes-256-gcm",
        PSK_KEY_EXCHANGE,
        AEAD_AES_256_GCM,
        "sha384"
      );
    case cipherSuites.TLS_ECDHE_PSK_WITH_AES_128_GCM_SHA256:
      return createAEADCipher(
        cipherSuites.TLS_ECDHE_PSK_WITH_AES_128_GCM_SHA256,
        "TLS_ECDHE_PSK_WITH_AES_128_GCM_SHA256",
        "aes-128-gcm",
        ECDHE_PSK_KEY_EXCHANGE,
        AEAD_AES_128_GCM,
        "sha256"
      );
    case cipherSuites.TLS_ECDHE_PSK_WITH_AES_256_GCM_SHA384:
      return createAEADCipher(
        cipherSuites.TLS_ECDHE_PSK_WITH_AES_256_GCM_SHA384,
        "TLS_ECDHE_PSK_WITH_AES_256_GCM_SHA384",
        "aes-256-gcm",
        ECDHE_PSK_KEY_EXCHANGE,
        AEAD_AES_256_GCM,
        "sha384"
      );
    default:
      break;
  }
  return null;
}
function createAEADCipher(id, name, block, kx, constants, hash2 = "sha256") {
  const cipher = new AEADCipher();
  cipher.id = id;
  cipher.name = name;
  cipher.blockAlgorithm = block;
  cipher.kx = kx;
  cipher.hashAlgorithm = hash2;
  cipher.keyLength = constants.K_LEN;
  cipher.nonceLength = constants.N_MAX;
  cipher.nonceImplicitLength = 4;
  cipher.nonceExplicitLength = 8;
  cipher.ivLength = cipher.nonceImplicitLength;
  cipher.authTagLength = 16;
  return cipher;
}

// ../dtls/src/cipher/namedCurve.ts
import nacl2 from "tweetnacl";
function generateKeyPair(namedCurve) {
  switch (namedCurve) {
    case NamedCurveAlgorithm.secp256r1_23: {
      const { privateKey, publicKey } = p256Keypair();
      return {
        curve: namedCurve,
        privateKey,
        publicKey
      };
    }
    case NamedCurveAlgorithm.x25519_29: {
      const keys = nacl2.box.keyPair();
      return {
        curve: namedCurve,
        privateKey: Buffer.from(keys.secretKey.buffer),
        publicKey: Buffer.from(keys.publicKey.buffer)
      };
    }
    default:
      throw new Error();
  }
}

// ../dtls/src/handshake/extensions/extendedMasterSecret.ts
var ExtendedMasterSecret = class {
  static type = 23;
};

// ../dtls/src/handshake/extensions/renegotiationIndication.ts
import { decode as decode5, encode as encode6, types as types7 } from "@shinyoshiaki/binary-data";
var RenegotiationIndication = class _RenegotiationIndication {
  static type = 65281;
  static spec = {
    type: types7.uint16be,
    data: types7.uint8
  };
  type = _RenegotiationIndication.type;
  data = 0;
  constructor(props = {}) {
    Object.assign(this, props);
  }
  static createEmpty() {
    const v = new _RenegotiationIndication();
    return v;
  }
  static deSerialize(buf) {
    return new _RenegotiationIndication(
      decode5(buf, _RenegotiationIndication.spec)
    );
  }
  serialize() {
    const res = encode6(this, _RenegotiationIndication.spec).slice();
    return Buffer.from(res);
  }
  get extension() {
    return {
      type: this.type,
      data: this.serialize().slice(2)
    };
  }
};

// ../dtls/src/handshake/extensions/useSrtp.ts
import { decode as decode6, encode as encode7, types as types8 } from "@shinyoshiaki/binary-data";
var UseSRTP = class _UseSRTP {
  static type = 14;
  // 9.  IANA Considerations
  static spec = {
    type: types8.uint16be,
    data: types8.buffer(types8.uint16be)
  };
  type = _UseSRTP.type;
  data = Buffer.from([]);
  profiles = [];
  mki = Buffer.from([0]);
  constructor(props = {}) {
    Object.assign(this, props);
  }
  static create(profiles, mki) {
    const v = new _UseSRTP({
      profiles,
      mki
    });
    return v;
  }
  static deSerialize(buf) {
    const useSrtp = new _UseSRTP(decode6(buf, _UseSRTP.spec));
    const profileLength = useSrtp.data.readUInt16BE();
    const profiles = new Array(profileLength / 2);
    for (let i = 0; i < profiles.length; i++) {
      profiles[i] = useSrtp.data.readUInt16BE(i * 2 + 2);
    }
    useSrtp.profiles = profiles;
    useSrtp.mki = useSrtp.data.slice(profileLength + 2);
    return useSrtp;
  }
  serialize() {
    const profileLength = Buffer.alloc(2);
    profileLength.writeUInt16BE(this.profiles.length * 2);
    const data = Buffer.concat([
      profileLength,
      ...this.profiles.map((profile) => {
        const buf = Buffer.alloc(2);
        buf.writeUInt16BE(profile);
        return buf;
      }),
      this.mki
    ]);
    this.data = data;
    const res = encode7(this, _UseSRTP.spec).slice();
    return Buffer.from(res);
  }
  static fromData(buf) {
    const head = Buffer.alloc(4);
    head.writeUInt16BE(_UseSRTP.type);
    head.writeUInt16BE(buf.length, 2);
    return _UseSRTP.deSerialize(Buffer.concat([head, buf]));
  }
  get extension() {
    return {
      type: this.type,
      data: this.serialize().slice(4)
    };
  }
};

// ../dtls/src/handshake/message/certificate.ts
import { decode as decode7, encode as encode8, types as types9 } from "@shinyoshiaki/binary-data";
var Certificate2 = class _Certificate {
  constructor(certificateList) {
    this.certificateList = certificateList;
  }
  msgType = 11 /* certificate_11 */;
  messageSeq;
  static spec = {
    certificateList: types9.array(ASN11Cert, types9.uint24be, "bytes")
  };
  static createEmpty() {
    return new _Certificate(void 0);
  }
  static deSerialize(buf) {
    return new _Certificate(
      ...Object.values(decode7(buf, _Certificate.spec))
    );
  }
  serialize() {
    const res = encode8(this, _Certificate.spec).slice();
    return Buffer.from(res);
  }
  toFragment() {
    const body = this.serialize();
    return new FragmentedHandshake(
      this.msgType,
      body.length,
      this.messageSeq,
      0,
      body.length,
      body
    );
  }
};

// ../dtls/src/handshake/message/changeCipherSpec.ts
import { decode as decode8, encode as encode9, types as types10 } from "@shinyoshiaki/binary-data";
var ChangeCipherSpec = class _ChangeCipherSpec {
  constructor(type = 1) {
    this.type = type;
  }
  static spec = {
    type: types10.uint8
  };
  static createEmpty() {
    return new _ChangeCipherSpec();
  }
  static deSerialize(buf) {
    return new _ChangeCipherSpec(
      ...Object.values(decode8(buf, _ChangeCipherSpec.spec))
    );
  }
  serialize() {
    const res = encode9(this, _ChangeCipherSpec.spec).slice();
    return Buffer.from(res);
  }
};

// ../dtls/src/handshake/message/client/certificateVerify.ts
import { decode as decode9, encode as encode10, types as types11 } from "@shinyoshiaki/binary-data";
var CertificateVerify = class _CertificateVerify {
  constructor(algorithm, signature) {
    this.algorithm = algorithm;
    this.signature = signature;
  }
  msgType = 15 /* certificate_verify_15 */;
  messageSeq;
  static spec = {
    algorithm: types11.uint16be,
    signature: types11.buffer(types11.uint16be)
  };
  static createEmpty() {
    return new _CertificateVerify(void 0, void 0);
  }
  static deSerialize(buf) {
    const res = decode9(buf, _CertificateVerify.spec);
    return new _CertificateVerify(
      ...Object.values(res)
    );
  }
  serialize() {
    const res = encode10(this, _CertificateVerify.spec).slice();
    return Buffer.from(res);
  }
  toFragment() {
    const body = this.serialize();
    return new FragmentedHandshake(
      this.msgType,
      body.length,
      this.messageSeq,
      0,
      body.length,
      body
    );
  }
};

// ../dtls/src/handshake/message/client/keyExchange.ts
import { decode as decode10, encode as encode11, types as types12 } from "@shinyoshiaki/binary-data";
var ClientKeyExchange = class _ClientKeyExchange {
  constructor(publicKey) {
    this.publicKey = publicKey;
  }
  msgType = 16 /* client_key_exchange_16 */;
  messageSeq;
  static spec = {
    publicKey: types12.buffer(types12.uint8)
  };
  static createEmpty() {
    return new _ClientKeyExchange(void 0);
  }
  static deSerialize(buf) {
    const res = decode10(buf, _ClientKeyExchange.spec);
    return new _ClientKeyExchange(
      ...Object.values(res)
    );
  }
  serialize() {
    const res = encode11(this, _ClientKeyExchange.spec).slice();
    return Buffer.from(res);
  }
  toFragment() {
    const body = this.serialize();
    return new FragmentedHandshake(
      this.msgType,
      body.length,
      this.messageSeq,
      0,
      body.length,
      body
    );
  }
};

// ../dtls/src/handshake/message/finished.ts
var Finished = class _Finished {
  constructor(verifyData) {
    this.verifyData = verifyData;
  }
  msgType = 20 /* finished_20 */;
  messageSeq;
  static createEmpty() {
    return new _Finished(void 0);
  }
  static deSerialize(buf) {
    return new _Finished(buf);
  }
  serialize() {
    return this.verifyData;
  }
  toFragment() {
    const body = this.serialize();
    return new FragmentedHandshake(
      this.msgType,
      body.length,
      this.messageSeq,
      0,
      body.length,
      body
    );
  }
};

// ../dtls/src/handshake/message/server/certificateRequest.ts
import { decode as decode11, encode as encode12, types as types13 } from "@shinyoshiaki/binary-data";
var ServerCertificateRequest = class _ServerCertificateRequest {
  constructor(certificateTypes2, signatures2, authorities) {
    this.certificateTypes = certificateTypes2;
    this.signatures = signatures2;
    this.authorities = authorities;
  }
  msgType = 13 /* certificate_request_13 */;
  messageSeq;
  static spec = {
    certificateTypes: types13.array(ClientCertificateType, types13.uint8, "bytes"),
    signatures: types13.array(SignatureHashAlgorithm, types13.uint16be, "bytes"),
    authorities: types13.array(DistinguishedName, types13.uint16be, "bytes")
  };
  static createEmpty() {
    return new _ServerCertificateRequest(
      void 0,
      void 0,
      void 0
    );
  }
  static deSerialize(buf) {
    return new _ServerCertificateRequest(
      ...Object.values(decode11(buf, _ServerCertificateRequest.spec))
    );
  }
  serialize() {
    const res = encode12(this, _ServerCertificateRequest.spec).slice();
    return Buffer.from(res);
  }
  toFragment() {
    const body = this.serialize();
    return new FragmentedHandshake(
      this.msgType,
      body.length,
      this.messageSeq,
      0,
      body.length,
      body
    );
  }
};

// ../dtls/src/handshake/message/server/hello.ts
import { decode as decode12, encode as encode13, types as types14 } from "@shinyoshiaki/binary-data";
var ServerHello = class _ServerHello {
  constructor(serverVersion, random, sessionId, cipherSuite, compressionMethod, extensions) {
    this.serverVersion = serverVersion;
    this.random = random;
    this.sessionId = sessionId;
    this.cipherSuite = cipherSuite;
    this.compressionMethod = compressionMethod;
    this.extensions = extensions;
  }
  msgType = 2 /* server_hello_2 */;
  messageSeq;
  static spec = {
    serverVersion: ProtocolVersion,
    random: DtlsRandom.spec,
    sessionId: types14.buffer(types14.uint8),
    cipherSuite: types14.uint16be,
    compressionMethod: types14.uint8
  };
  static createEmpty() {
    return new _ServerHello(
      void 0,
      void 0,
      void 0,
      void 0,
      void 0,
      void 0
    );
  }
  static deSerialize(buf) {
    const res = decode12(buf, _ServerHello.spec);
    const cls = new _ServerHello(
      ...Object.values(res)
    );
    const expect = cls.serialize();
    if (expect.length < buf.length) {
      return new _ServerHello(
        ...Object.values(
          decode12(buf, { ..._ServerHello.spec, extensions: ExtensionList })
        )
      );
    }
    return cls;
  }
  serialize() {
    const res = this.extensions === void 0 ? encode13(this, _ServerHello.spec).slice() : encode13(this, {
      ..._ServerHello.spec,
      extensions: ExtensionList
    }).slice();
    return Buffer.from(res);
  }
  toFragment() {
    const body = this.serialize();
    return new FragmentedHandshake(
      this.msgType,
      body.length,
      this.messageSeq,
      0,
      body.length,
      body
    );
  }
};

// ../dtls/src/handshake/message/server/helloDone.ts
import { decode as decode13, encode as encode14 } from "@shinyoshiaki/binary-data";
var ServerHelloDone = class _ServerHelloDone {
  msgType = 14 /* server_hello_done_14 */;
  messageSeq;
  static spec = {};
  static createEmpty() {
    return new _ServerHelloDone();
  }
  static deSerialize(buf) {
    return new _ServerHelloDone(
      ...Object.values(decode13(buf, _ServerHelloDone.spec))
    );
  }
  serialize() {
    const res = encode14(this, _ServerHelloDone.spec).slice();
    return Buffer.from(res);
  }
  toFragment() {
    const body = this.serialize();
    return new FragmentedHandshake(
      this.msgType,
      body.length,
      this.messageSeq,
      0,
      body.length,
      body
    );
  }
};

// ../dtls/src/handshake/message/server/keyExchange.ts
import { decode as decode14, types as types15 } from "@shinyoshiaki/binary-data";

// ../dtls/src/util/binary.ts
import { encode as encode15 } from "@shinyoshiaki/binary-data";
function encodeBuffer(obj, spec) {
  return Buffer.from(encode15(obj, spec).slice());
}

// ../dtls/src/handshake/message/server/keyExchange.ts
var ServerKeyExchange = class _ServerKeyExchange {
  constructor(ellipticCurveType, namedCurve, publicKeyLength, publicKey, hashAlgorithm, signatureAlgorithm, signatureLength, signature) {
    this.ellipticCurveType = ellipticCurveType;
    this.namedCurve = namedCurve;
    this.publicKeyLength = publicKeyLength;
    this.publicKey = publicKey;
    this.hashAlgorithm = hashAlgorithm;
    this.signatureAlgorithm = signatureAlgorithm;
    this.signatureLength = signatureLength;
    this.signature = signature;
  }
  msgType = 12 /* server_key_exchange_12 */;
  messageSeq;
  static spec = {
    ellipticCurveType: types15.uint8,
    namedCurve: types15.uint16be,
    publicKeyLength: types15.uint8,
    publicKey: types15.buffer((ctx) => ctx.current.publicKeyLength),
    hashAlgorithm: types15.uint8,
    signatureAlgorithm: types15.uint8,
    signatureLength: types15.uint16be,
    signature: types15.buffer((ctx) => ctx.current.signatureLength)
  };
  static createEmpty() {
    return new _ServerKeyExchange(
      void 0,
      void 0,
      void 0,
      void 0,
      void 0,
      void 0,
      void 0,
      void 0
    );
  }
  static deSerialize(buf) {
    const res = decode14(buf, _ServerKeyExchange.spec);
    return new _ServerKeyExchange(
      ...Object.values(res)
    );
  }
  serialize() {
    const res = encodeBuffer(this, _ServerKeyExchange.spec);
    return res;
  }
  toFragment() {
    const body = this.serialize();
    return new FragmentedHandshake(
      this.msgType,
      body.length,
      this.messageSeq,
      0,
      body.length,
      body
    );
  }
};

// ../rtp/src/srtp/const.ts
var ProtectionProfileAes128CmHmacSha1_80 = 1;
var ProtectionProfileAeadAes128Gcm = 7;
var Profiles = [
  ProtectionProfileAes128CmHmacSha1_80,
  ProtectionProfileAeadAes128Gcm
];
var keyLength = (profile) => {
  switch (profile) {
    case ProtectionProfileAes128CmHmacSha1_80:
    case ProtectionProfileAeadAes128Gcm:
      return 16;
  }
};
var saltLength = (profile) => {
  switch (profile) {
    case ProtectionProfileAes128CmHmacSha1_80:
      return 14;
    case ProtectionProfileAeadAes128Gcm:
      return 12;
  }
};

// ../rtp/src/codec/leb128.ts
function leb128encode(value) {
  if (!Number.isInteger(value) || value < 0 || !Number.isSafeInteger(value)) {
    throw new Error("LEB128 encode requires a non-negative safe integer");
  }
  const bytes = [];
  let remaining = value;
  do {
    let byte = remaining & 127;
    remaining = Math.floor(remaining / 128);
    if (remaining !== 0) {
      byte |= 128;
    }
    bytes.push(byte);
  } while (remaining !== 0);
  return Buffer.from(bytes);
}

// ../rtp/src/codec/av1.ts
var log3 = debug("werift-rtp : packages/rtp/src/codec/av1.ts");
var AV1RtpPayload = class _AV1RtpPayload {
  /**
   * RtpStartsWithFragment
   * MUST be set to 1 if the first OBU element is an OBU fragment that is a continuation of an OBU fragment from the previous packet, and MUST be set to 0 otherwise.
   */
  zBit_RtpStartsWithFragment;
  /**
   * RtpEndsWithFragment
   * MUST be set to 1 if the last OBU element is an OBU fragment that will continue in the next packet, and MUST be set to 0 otherwise.
   */
  yBit_RtpEndsWithFragment;
  /**
   * RtpNumObus
   * two bit field that describes the number of OBU elements in the packet. This field MUST be set equal to 0 or equal to the number of OBU elements contained in the packet. If set to 0, each OBU element MUST be preceded by a length field.
   */
  w_RtpNumObus;
  /**
   * RtpStartsNewCodedVideoSequence
   * MUST be set to 1 if the packet is the first packet of a coded video sequence, and MUST be set to 0 otherwise.
   */
  nBit_RtpStartsNewCodedVideoSequence;
  obu_or_fragment = [];
  static deSerialize = (buf) => {
    const p = new _AV1RtpPayload();
    let offset = 0;
    p.zBit_RtpStartsWithFragment = getBit(buf[offset], 0);
    p.yBit_RtpEndsWithFragment = getBit(buf[offset], 1);
    p.w_RtpNumObus = getBit(buf[offset], 2, 2);
    p.nBit_RtpStartsNewCodedVideoSequence = getBit(buf[offset], 4);
    offset++;
    if (p.nBit_RtpStartsNewCodedVideoSequence && p.zBit_RtpStartsWithFragment) {
      throw new Error();
    }
    [...Array(p.w_RtpNumObus - 1).keys()].forEach((i) => {
      const [elementSize, bytes] = leb128decode(buf.subarray(offset));
      const start = offset + bytes;
      const end = start + elementSize;
      let isFragment2 = false;
      if (p.zBit_RtpStartsWithFragment && i === 0) {
        isFragment2 = true;
      }
      p.obu_or_fragment.push({ data: buf.subarray(start, end), isFragment: isFragment2 });
      offset += bytes + elementSize;
    });
    let isFragment = false;
    if (p.yBit_RtpEndsWithFragment || p.w_RtpNumObus === 1 && p.zBit_RtpStartsWithFragment) {
      isFragment = true;
    }
    p.obu_or_fragment.push({
      data: buf.subarray(offset),
      isFragment
    });
    return p;
  };
  static isDetectedFinalPacketInSequence(header) {
    return header.marker;
  }
  get isKeyframe() {
    return this.nBit_RtpStartsNewCodedVideoSequence === 1;
  }
  static getFrame(payloads) {
    const frames = [];
    const objects = payloads.flatMap((p) => p.obu_or_fragment).reduce(
      (acc, cur, i) => {
        acc[i] = cur;
        return acc;
      },
      {}
    );
    const length = Object.keys(objects).length;
    for (const i of Object.keys(objects).map(Number)) {
      const exist = objects[i];
      if (!exist) continue;
      const { data, isFragment } = exist;
      if (isFragment) {
        let fragments = [];
        for (let head = i; head < length; head++) {
          const target = objects[head];
          if (target.isFragment) {
            fragments.push(target.data);
            delete objects[head];
          } else {
            break;
          }
        }
        if (fragments.length <= 1) {
          log3("fragment lost, maybe packet lost");
          fragments = [];
        }
        frames.push(Buffer.concat(fragments));
      } else {
        frames.push(data);
      }
    }
    const obus = frames.map((f) => AV1Obu.deSerialize(f));
    const lastObu = obus.pop();
    return Buffer.concat([
      ...obus.map((o) => {
        o.obu_has_size_field = 1;
        return o.serialize();
      }),
      lastObu.serialize()
    ]);
  }
};
var AV1Obu = class _AV1Obu {
  obu_forbidden_bit;
  obu_type;
  obu_extension_flag;
  obu_has_size_field;
  obu_reserved_1bit;
  payload;
  static deSerialize(buf) {
    const obu = new _AV1Obu();
    let offset = 0;
    obu.obu_forbidden_bit = getBit(buf[offset], 0);
    obu.obu_type = OBU_TYPES[getBit(buf[offset], 1, 4)];
    obu.obu_extension_flag = getBit(buf[offset], 5);
    obu.obu_has_size_field = getBit(buf[offset], 6);
    obu.obu_reserved_1bit = getBit(buf[offset], 7);
    offset++;
    obu.payload = buf.subarray(offset);
    return obu;
  }
  serialize() {
    const header = new BitWriter2(8).set(this.obu_forbidden_bit).set(OBU_TYPE_IDS[this.obu_type], 4).set(this.obu_extension_flag).set(this.obu_has_size_field).set(this.obu_reserved_1bit).buffer;
    let obuSize = Buffer.alloc(0);
    if (this.obu_has_size_field) {
      obuSize = leb128encode(this.payload.length);
    }
    return Buffer.concat([header, obuSize, this.payload]);
  }
};
function leb128decode(buf) {
  let value = 0;
  let leb128bytes = 0;
  for (let i = 0; i < 8; i++) {
    if (i >= buf.length) {
      throw new Error("LEB128 decode incomplete");
    }
    const leb128byte = buf.readUInt8(i);
    value += (leb128byte & 127) * 128 ** i;
    leb128bytes++;
    if (!(leb128byte & 128)) {
      if (!Number.isSafeInteger(value)) {
        throw new Error("LEB128 value exceeds safe integer");
      }
      return [value, leb128bytes];
    }
  }
  throw new Error("LEB128 decode incomplete");
}
var OBU_TYPES = {
  0: "Reserved",
  1: "OBU_SEQUENCE_HEADER",
  2: "OBU_TEMPORAL_DELIMITER",
  3: "OBU_FRAME_HEADER",
  4: "OBU_TILE_GROUP",
  5: "OBU_METADATA",
  6: "OBU_FRAME",
  7: "OBU_REDUNDANT_FRAME_HEADER",
  8: "OBU_TILE_LIST",
  15: "OBU_PADDING"
};
var OBU_TYPE_IDS = Object.entries(OBU_TYPES).reduce(
  (acc, [key, value]) => {
    acc[value] = Number(key);
    return acc;
  },
  {}
);

// ../rtp/src/codec/h264.ts
var H264RtpPayload = class _H264RtpPayload {
  /**forbidden_zero_bit */
  f;
  /**nal_ref_idc */
  nri;
  /**nal_unit_types */
  nalUnitType;
  /**start of a fragmented NAL unit */
  s;
  /**end of a fragmented NAL unit */
  e;
  r;
  nalUnitPayloadType;
  payload;
  fragment;
  static deSerialize(buf, fragment) {
    const h264 = new _H264RtpPayload();
    let offset = 0;
    const naluHeader = buf[offset];
    h264.f = getBit(naluHeader, 0);
    h264.nri = getBit(naluHeader, 1, 2);
    h264.nalUnitType = getBit(naluHeader, 3, 5);
    offset++;
    h264.s = getBit(buf[offset], 0);
    h264.e = getBit(buf[offset], 1);
    h264.r = getBit(buf[offset], 2);
    h264.nalUnitPayloadType = getBit(buf[offset], 3, 5);
    offset++;
    if (0 < h264.nalUnitType && h264.nalUnitType < NalUnitType.stap_a) {
      h264.payload = this.packaging(buf);
    } else if (h264.nalUnitType === NalUnitType.stap_a) {
      let offset2 = stap_aHeaderSize;
      let result = Buffer.alloc(0);
      while (offset2 < buf.length) {
        const naluSize = buf.readUInt16BE(offset2);
        offset2 += stap_aNALULengthSize;
        result = Buffer.concat([
          result,
          this.packaging(buf.subarray(offset2, offset2 + naluSize))
        ]);
        offset2 += naluSize;
      }
      h264.payload = result;
    } else if (h264.nalUnitType === NalUnitType.fu_a) {
      if (!fragment) {
        fragment = Buffer.alloc(0);
      }
      const fu = buf.subarray(offset);
      h264.fragment = Buffer.concat([fragment, fu]);
      if (h264.e) {
        const bitStream = new BitStream(Buffer.alloc(1)).writeBits(1, 0).writeBits(2, h264.nri).writeBits(5, h264.nalUnitPayloadType);
        const nalu = Buffer.concat([bitStream.uint8Array, h264.fragment]);
        h264.fragment = void 0;
        h264.payload = this.packaging(nalu);
      }
    }
    return h264;
  }
  static packaging(buf) {
    return Buffer.concat([annex_bNALUStartCode, buf]);
  }
  static isDetectedFinalPacketInSequence(header) {
    return header.marker;
  }
  get isKeyframe() {
    return this.nalUnitType === NalUnitType.idrSlice || this.nalUnitPayloadType === NalUnitType.idrSlice;
  }
  get isPartitionHead() {
    if (this.nalUnitType === NalUnitType.fu_a || this.nalUnitType === NalUnitType.fu_b) {
      return this.s !== 0;
    }
    return true;
  }
};
var NalUnitType = {
  idrSlice: 5,
  stap_a: 24,
  stap_b: 25,
  mtap16: 26,
  mtap24: 27,
  fu_a: 28,
  fu_b: 29
};
var annex_bNALUStartCode = Buffer.from([0, 0, 0, 1]);
var stap_aHeaderSize = 1;
var stap_aNALULengthSize = 2;

// ../rtp/src/codec/opus.ts
var OpusRtpPayload = class _OpusRtpPayload {
  payload;
  static deSerialize(buf) {
    const opus = new _OpusRtpPayload();
    opus.payload = buf;
    return opus;
  }
  static isDetectedFinalPacketInSequence(header) {
    return true;
  }
  get isKeyframe() {
    return true;
  }
  static createCodecPrivate(samplingFrequency = 48e3) {
    return Buffer.concat([
      Buffer.from("OpusHead"),
      bufferWriter([1, 1], [1, 2]),
      bufferWriterLE([2, 4, 2, 1], [312, samplingFrequency, 0, 0])
    ]);
  }
};

// ../rtp/src/codec/vp8.ts
var Vp8RtpPayload = class _Vp8RtpPayload {
  xBit;
  nBit;
  sBit;
  pid;
  iBit;
  lBit;
  tBit;
  kBit;
  mBit;
  pictureId;
  payload;
  size0 = 0;
  hBit;
  ver;
  pBit;
  size1 = 0;
  size2 = 0;
  static deSerialize(buf) {
    const p = new _Vp8RtpPayload();
    let offset = 0;
    p.xBit = getBit(buf[offset], 0);
    p.nBit = getBit(buf[offset], 2);
    p.sBit = getBit(buf[offset], 3);
    p.pid = getBit(buf[offset], 5, 3);
    offset++;
    if (p.xBit) {
      p.iBit = getBit(buf[offset], 0);
      p.lBit = getBit(buf[offset], 1);
      p.tBit = getBit(buf[offset], 2);
      p.kBit = getBit(buf[offset], 3);
      offset++;
    }
    if (p.iBit) {
      p.mBit = getBit(buf[offset], 0);
      if (p.mBit) {
        const _7 = paddingByte(getBit(buf[offset], 1, 7));
        const _8 = paddingByte(buf[offset + 1]);
        p.pictureId = Number.parseInt(_7 + _8, 2);
        offset += 2;
      } else {
        p.pictureId = getBit(buf[offset], 1, 7);
        offset++;
      }
    }
    if (p.lBit) {
      offset++;
    }
    if (p.lBit || p.kBit) {
      if (p.tBit) {
      }
      if (p.kBit) {
      }
      offset++;
    }
    p.payload = buf.subarray(offset);
    if (p.payloadHeaderExist) {
      p.size0 = getBit(buf[offset], 0, 3);
      p.hBit = getBit(buf[offset], 3);
      p.ver = getBit(buf[offset], 4, 3);
      p.pBit = getBit(buf[offset], 7);
      offset++;
      p.size1 = buf[offset];
      offset++;
      p.size2 = buf[offset];
    }
    return p;
  }
  static isDetectedFinalPacketInSequence(header) {
    return header.marker;
  }
  get isKeyframe() {
    return this.pBit === 0;
  }
  get isPartitionHead() {
    return this.sBit === 1;
  }
  get payloadHeaderExist() {
    return this.sBit === 1 && this.pid === 0;
  }
  get size() {
    if (this.payloadHeaderExist) {
      const size = this.size0 + 8 * this.size1 + 2048 * this.size2;
      return size;
    }
    return 0;
  }
};

// ../rtp/src/codec/vp9.ts
var Vp9RtpPayload = class _Vp9RtpPayload {
  /**Picture ID (PID) present */
  iBit;
  /**Inter-picture predicted frame */
  pBit;
  /**Layer indices present */
  lBit;
  /**Flexible mode */
  fBit;
  /**Start of a frame */
  bBit;
  /**End of a frame */
  eBit;
  /**Scalability structure */
  vBit;
  zBit;
  m;
  pictureId;
  tid;
  u;
  sid;
  /**inter_layer_predicted */
  d;
  tl0PicIdx;
  pDiff = [];
  n_s;
  y;
  g;
  width = [];
  height = [];
  n_g = 0;
  pgT = [];
  pgU = [];
  pgP_Diff = [];
  payload;
  static deSerialize(buf) {
    const { p, offset } = this.parseRtpPayload(buf);
    p.payload = buf.subarray(offset);
    return p;
  }
  static parseRtpPayload(buf) {
    const p = new _Vp9RtpPayload();
    let offset = 0;
    p.iBit = getBit(buf[offset], 0);
    p.pBit = getBit(buf[offset], 1);
    p.lBit = getBit(buf[offset], 2);
    p.fBit = getBit(buf[offset], 3);
    p.bBit = getBit(buf[offset], 4);
    p.eBit = getBit(buf[offset], 5);
    p.vBit = getBit(buf[offset], 6);
    p.zBit = getBit(buf[offset], 7);
    offset++;
    if (p.iBit) {
      p.m = getBit(buf[offset], 0);
      if (p.m) {
        const _7 = paddingByte(getBit(buf[offset], 1, 7));
        const _8 = paddingByte(buf[offset + 1]);
        p.pictureId = Number.parseInt(_7 + _8, 2);
        offset += 2;
      } else {
        p.pictureId = getBit(buf[offset], 1, 7);
        offset++;
      }
    }
    if (p.lBit) {
      p.tid = getBit(buf[offset], 0, 3);
      p.u = getBit(buf[offset], 3);
      p.sid = getBit(buf[offset], 4, 3);
      p.d = getBit(buf[offset], 7);
      offset++;
      if (p.fBit === 0) {
        p.tl0PicIdx = buf[offset];
        offset++;
      }
    }
    if (p.fBit && p.pBit) {
      for (; ; ) {
        p.pDiff = [...p.pDiff, getBit(buf[offset], 0, 7)];
        const n = getBit(buf[offset], 7);
        offset++;
        if (n === 0) break;
      }
    }
    if (p.vBit) {
      p.n_s = getBit(buf[offset], 0, 3);
      p.y = getBit(buf[offset], 3);
      p.g = getBit(buf[offset], 4);
      offset++;
      if (p.y) {
        [...Array(p.n_s + 1)].forEach(() => {
          p.width.push(buf.readUInt16BE(offset));
          offset += 2;
          p.height.push(buf.readUInt16BE(offset));
          offset += 2;
        });
      }
      if (p.g) {
        p.n_g = buf[offset];
        offset++;
      }
      if (p.n_g > 0) {
        [...Array(p.n_g).keys()].forEach((i) => {
          p.pgT.push(getBit(buf[offset], 0, 3));
          p.pgU.push(getBit(buf[offset], 3));
          const r = getBit(buf[offset], 4, 2);
          offset++;
          p.pgP_Diff[i] = [];
          if (r > 0) {
            [...Array(r)].forEach(() => {
              p.pgP_Diff[i].push(buf[offset]);
              offset++;
            });
          }
        });
      }
    }
    return { offset, p };
  }
  static isDetectedFinalPacketInSequence(header) {
    return header.marker;
  }
  get isKeyframe() {
    return !!(!this.pBit && this.bBit && (!this.sid || !this.lBit));
  }
  get isPartitionHead() {
    return this.bBit && (!this.lBit || !this.d);
  }
};

// ../rtp/src/codec/base.ts
var DePacketizerBase = class {
  payload;
  fragment;
  static deSerialize(buf, fragment) {
    return {};
  }
  static isDetectedFinalPacketInSequence(header) {
    return true;
  }
  get isKeyframe() {
    return true;
  }
};

// ../rtp/src/codec/index.ts
function dePacketizeRtpPackets(codec, packets, frameFragmentBuffer) {
  const basicCodecParser = (Depacketizer) => {
    const partitions = [];
    for (const p of packets) {
      const codec2 = Depacketizer.deSerialize(p.payload, frameFragmentBuffer);
      if (codec2.fragment) {
        frameFragmentBuffer ??= Buffer.alloc(0);
        frameFragmentBuffer = codec2.fragment;
      } else if (codec2.payload) {
        frameFragmentBuffer = void 0;
      }
      partitions.push(codec2);
    }
    const isKeyframe = !!partitions.find((f) => f.isKeyframe);
    const data = Buffer.concat(
      partitions.map((f) => f.payload).filter((p) => p)
    );
    return {
      isKeyframe,
      data,
      sequence: packets.at(-1)?.header.sequenceNumber ?? 0,
      timestamp: packets.at(-1)?.header.timestamp ?? 0,
      frameFragmentBuffer
    };
  };
  switch (codec.toUpperCase()) {
    case "AV1": {
      const chunks = packets.map((p) => AV1RtpPayload.deSerialize(p.payload));
      const isKeyframe = !!chunks.find((f) => f.isKeyframe);
      const data = AV1RtpPayload.getFrame(chunks);
      return {
        isKeyframe,
        data,
        sequence: packets.at(-1)?.header.sequenceNumber ?? 0,
        timestamp: packets.at(-1)?.header.timestamp ?? 0
      };
    }
    case "MPEG4/ISO/AVC":
      return basicCodecParser(H264RtpPayload);
    case "VP8":
      return basicCodecParser(Vp8RtpPayload);
    case "VP9":
      return basicCodecParser(Vp9RtpPayload);
    case "OPUS":
      return basicCodecParser(OpusRtpPayload);
    default:
      throw new Error();
  }
}
var depacketizerCodecs = [
  "MPEG4/ISO/AVC",
  "VP8",
  "VP9",
  "OPUS",
  "AV1"
];

// ../rtp/src/helper.ts
function enumerate(arr) {
  return arr.map((v, i) => [i, v]);
}
function growBufferSize(buf, size) {
  const glow = Buffer.alloc(size);
  buf.copy(glow);
  return glow;
}
function Int(v) {
  return Number.parseInt(v.toString(), 10);
}
var timer = {
  setTimeout: (...args) => {
    const id = setTimeout(...args);
    return () => clearTimeout(id);
  },
  setInterval: (...args) => {
    const id = setInterval(
      () => {
        args[0]();
      },
      ...args.slice(1)
    );
    return () => clearInterval(id);
  }
};
function isMedia(buf) {
  const firstByte = buf[0];
  return firstByte > 127 && firstByte < 192;
}

// ../rtp/src/rtcp/header.ts
var RTCP_HEADER_SIZE = 4;
var RtcpHeader = class _RtcpHeader {
  version = 2;
  padding = false;
  count = 0;
  type = 0;
  /**このパケットの長さは、ヘッダーと任意のパディングを含む32ビットワードから 1を引いたものである */
  length = 0;
  constructor(props = {}) {
    Object.assign(this, props);
  }
  static serialize(type, count, payload, length) {
    const header = new _RtcpHeader({
      type,
      count,
      version: 2,
      length
    });
    const buf = header.serialize();
    return Buffer.concat([buf, payload]);
  }
  serialize() {
    const v_p_rc = new BitWriter(8);
    v_p_rc.set(2, 0, this.version);
    if (this.padding) v_p_rc.set(1, 2, 1);
    v_p_rc.set(5, 3, this.count);
    const buf = bufferWriter([1, 1, 2], [v_p_rc.value, this.type, this.length]);
    return buf;
  }
  static deSerialize(buf) {
    const [v_p_rc, type, length] = bufferReader(buf, [1, 1, 2]);
    const version = getBit(v_p_rc, 0, 2);
    const padding = getBit(v_p_rc, 2, 1) > 0;
    const count = getBit(v_p_rc, 3, 5);
    return new _RtcpHeader({ version, padding, count, type, length });
  }
};

// ../rtp/src/rtcp/psfb/fullIntraRequest.ts
var FullIntraRequest = class _FullIntraRequest {
  static count = 4;
  count = _FullIntraRequest.count;
  senderSsrc;
  mediaSsrc;
  fir = [];
  constructor(props = {}) {
    Object.assign(this, props);
  }
  get length() {
    return Math.floor(this.serialize().length / 4 - 1);
  }
  static deSerialize(data) {
    const [senderSsrc, mediaSsrc] = bufferReader(data, [4, 4]);
    const fir = [];
    for (let i = 8; i < data.length; i += 8) {
      fir.push({ ssrc: data.readUInt32BE(i), sequenceNumber: data[i + 4] });
    }
    return new _FullIntraRequest({ senderSsrc, mediaSsrc, fir });
  }
  serialize() {
    const ssrcs = bufferWriter([4, 4], [this.senderSsrc, this.mediaSsrc]);
    const fir = Buffer.alloc(this.fir.length * 8);
    this.fir.forEach(({ ssrc, sequenceNumber }, i) => {
      fir.writeUInt32BE(ssrc, i * 8);
      fir[i * 8 + 4] = sequenceNumber;
    });
    return Buffer.concat([ssrcs, fir]);
  }
};

// ../rtp/src/rtcp/psfb/pictureLossIndication.ts
var PictureLossIndication = class _PictureLossIndication {
  static count = 1;
  count = _PictureLossIndication.count;
  length = 2;
  senderSsrc;
  mediaSsrc;
  constructor(props = {}) {
    Object.assign(this, props);
  }
  static deSerialize(data) {
    const [senderSsrc, mediaSsrc] = bufferReader(data, [4, 4]);
    return new _PictureLossIndication({ senderSsrc, mediaSsrc });
  }
  serialize() {
    return bufferWriter([4, 4], [this.senderSsrc, this.mediaSsrc]);
  }
};

// ../rtp/src/rtcp/psfb/remb.ts
var ReceiverEstimatedMaxBitrate = class _ReceiverEstimatedMaxBitrate {
  static count = 15;
  length;
  count = _ReceiverEstimatedMaxBitrate.count;
  senderSsrc;
  mediaSsrc;
  uniqueID = "REMB";
  ssrcNum = 0;
  brExp;
  brMantissa;
  bitrate;
  ssrcFeedbacks = [];
  constructor(props = {}) {
    Object.assign(this, props);
  }
  static deSerialize(data) {
    const [senderSsrc, mediaSsrc, uniqueID, ssrcNum, e_m] = bufferReader(
      data,
      [4, 4, 4, 1, 1]
    );
    const brExp = getBit(e_m, 0, 6);
    const brMantissa = (getBit(e_m, 6, 2) << 16) + (data[14] << 8) + data[15];
    const bitrate = brExp > 46 ? 18446744073709551615n : BigInt(brMantissa) << BigInt(brExp);
    const ssrcFeedbacks = [];
    for (let i = 16; i < data.length; i += 4) {
      const feedback = data.slice(i).readUIntBE(0, 4);
      ssrcFeedbacks.push(feedback);
    }
    return new _ReceiverEstimatedMaxBitrate({
      senderSsrc,
      mediaSsrc,
      uniqueID: bufferWriter([4], [uniqueID]).toString(),
      ssrcNum,
      brExp,
      brMantissa,
      ssrcFeedbacks,
      bitrate
    });
  }
  serialize() {
    const constant = Buffer.concat([
      bufferWriter([4, 4], [this.senderSsrc, this.mediaSsrc]),
      Buffer.from(this.uniqueID),
      bufferWriter([1], [this.ssrcNum])
    ]);
    const writer = new BitWriter(24);
    writer.set(6, 0, this.brExp).set(18, 6, this.brMantissa);
    const feedbacks = Buffer.concat(
      this.ssrcFeedbacks.map((feedback) => bufferWriter([4], [feedback]))
    );
    const buf = Buffer.concat([
      constant,
      bufferWriter([3], [writer.value]),
      feedbacks
    ]);
    this.length = buf.length / 4;
    return buf;
  }
};

// ../rtp/src/rtcp/psfb/index.ts
var log4 = debug("werift-rtp: /rtcp/psfb/index");
var RtcpPayloadSpecificFeedback = class _RtcpPayloadSpecificFeedback {
  static type = 206;
  type = _RtcpPayloadSpecificFeedback.type;
  feedback;
  constructor(props = {}) {
    Object.assign(this, props);
  }
  serialize() {
    const payload = this.feedback.serialize();
    return RtcpHeader.serialize(
      this.type,
      this.feedback.count,
      payload,
      this.feedback.length
    );
  }
  static deSerialize(data, header) {
    let feedback;
    switch (header.count) {
      case FullIntraRequest.count:
        feedback = FullIntraRequest.deSerialize(data);
        break;
      case PictureLossIndication.count:
        feedback = PictureLossIndication.deSerialize(data);
        break;
      case ReceiverEstimatedMaxBitrate.count:
        feedback = ReceiverEstimatedMaxBitrate.deSerialize(data);
        break;
      default:
        log4("unknown psfb packet", header.count);
        break;
    }
    return new _RtcpPayloadSpecificFeedback({ feedback });
  }
};

// ../rtp/src/rtcp/rr.ts
var RtcpRrPacket = class _RtcpRrPacket {
  ssrc = 0;
  reports = [];
  static type = 201;
  type = _RtcpRrPacket.type;
  constructor(props = {}) {
    Object.assign(this, props);
  }
  serialize() {
    let payload = bufferWriter([4], [this.ssrc]);
    payload = Buffer.concat([
      payload,
      ...this.reports.map((report) => report.serialize())
    ]);
    return RtcpHeader.serialize(
      _RtcpRrPacket.type,
      this.reports.length,
      payload,
      Math.floor(payload.length / 4)
    );
  }
  static deSerialize(data, count) {
    const [ssrc] = bufferReader(data, [4]);
    let pos = 4;
    const reports = [];
    for (let _ = 0; _ < count; _++) {
      reports.push(RtcpReceiverInfo.deSerialize(data.slice(pos, pos + 24)));
      pos += 24;
    }
    return new _RtcpRrPacket({ ssrc, reports });
  }
};
var RtcpReceiverInfo = class _RtcpReceiverInfo {
  ssrc;
  fractionLost;
  packetsLost;
  highestSequence;
  jitter;
  /**last SR */
  lsr;
  /**delay since last SR */
  dlsr;
  constructor(props = {}) {
    Object.assign(this, props);
  }
  toJSON() {
    return {
      ssrc: this.ssrc,
      fractionLost: this.fractionLost,
      packetsLost: this.packetsLost,
      highestSequence: this.highestSequence,
      jitter: this.jitter,
      lsr: this.lsr,
      dlsr: this.dlsr
    };
  }
  serialize() {
    return bufferWriter(
      [4, 1, 3, 4, 4, 4, 4],
      [
        this.ssrc,
        this.fractionLost,
        this.packetsLost,
        this.highestSequence,
        this.jitter,
        this.lsr,
        this.dlsr
      ]
    );
  }
  static deSerialize(data) {
    const [
      ssrc,
      fractionLost,
      packetsLost,
      highestSequence,
      jitter,
      lsr,
      dlsr
    ] = bufferReader(data, [4, 1, 3, 4, 4, 4, 4]);
    return new _RtcpReceiverInfo({
      ssrc,
      fractionLost,
      packetsLost,
      highestSequence,
      jitter,
      lsr,
      dlsr
    });
  }
};

// ../rtp/src/rtcp/rtpfb/const.ts
var RtcpTransportLayerFeedbackType = 205;

// ../rtp/src/rtcp/rtpfb/nack.ts
var GenericNack = class _GenericNack {
  static count = 1;
  count = _GenericNack.count;
  header;
  senderSsrc;
  mediaSourceSsrc;
  lost = [];
  toJSON() {
    return {
      lost: this.lost,
      senderSsrc: this.senderSsrc,
      mediaSourceSsrc: this.mediaSourceSsrc
    };
  }
  constructor(props = {}) {
    Object.assign(this, props);
    if (!this.header) {
      this.header = new RtcpHeader({
        type: RtcpTransportLayerFeedbackType,
        count: this.count,
        version: 2
      });
    }
  }
  static deSerialize(data, header) {
    const [senderSsrc, mediaSourceSsrc] = bufferReader(data, [4, 4]);
    const lost = [];
    for (let pos = 8; pos < data.length; pos += 4) {
      const [pid, blp] = bufferReader(data.subarray(pos), [2, 2]);
      lost.push(pid);
      for (let diff = 0; diff < 16; diff++) {
        if (blp >> diff & 1) {
          lost.push(pid + diff + 1);
        }
      }
    }
    return new _GenericNack({
      header,
      senderSsrc,
      mediaSourceSsrc,
      lost
    });
  }
  serialize() {
    const ssrcPair = bufferWriter(
      [4, 4],
      [this.senderSsrc, this.mediaSourceSsrc]
    );
    const fci = [];
    if (this.lost.length > 0) {
      let headPid = this.lost[0], blp = 0;
      this.lost.slice(1).forEach((pid) => {
        const diff = pid - headPid - 1;
        if (diff >= 0 && diff < 16) {
          blp |= 1 << diff;
        } else {
          fci.push(bufferWriter([2, 2], [headPid, blp]));
          headPid = pid;
          blp = 0;
        }
      });
      fci.push(bufferWriter([2, 2], [headPid, blp]));
    }
    const buf = Buffer.concat([ssrcPair, Buffer.concat(fci)]);
    this.header.length = buf.length / 4;
    return Buffer.concat([this.header.serialize(), buf]);
  }
};

// ../rtp/src/rtcp/rtpfb/twcc.ts
var log5 = debug("werift/rtp/rtcp/rtpfb/twcc");
var TransportWideCC = class _TransportWideCC {
  static count = 15;
  count = _TransportWideCC.count;
  length = 2;
  senderSsrc;
  mediaSourceSsrc;
  baseSequenceNumber;
  packetStatusCount;
  /** 24bit multiples of 64ms */
  referenceTime;
  fbPktCount;
  packetChunks = [];
  recvDeltas = [];
  header;
  constructor(props = {}) {
    Object.assign(this, props);
    if (!this.header) {
      this.header = new RtcpHeader({
        type: 205,
        count: this.count,
        version: 2
      });
    }
  }
  static deSerialize(data, header) {
    const [
      senderSsrc,
      mediaSsrc,
      baseSequenceNumber,
      packetStatusCount,
      referenceTime,
      fbPktCount
    ] = bufferReader(data, [4, 4, 2, 2, 3, 1]);
    const packetChunks = [];
    const recvDeltas = [];
    let packetStatusPos = 16;
    for (let processedPacketNum = 0; processedPacketNum < packetStatusCount; ) {
      const type = getBit(
        data.slice(packetStatusPos, packetStatusPos + 1)[0],
        0,
        1
      );
      let iPacketStatus;
      switch (type) {
        case 0 /* TypeTCCRunLengthChunk */:
          {
            const packetStatus = RunLengthChunk.deSerialize(
              data.slice(packetStatusPos, packetStatusPos + 2)
            );
            iPacketStatus = packetStatus;
            const packetNumberToProcess = Math.min(
              packetStatusCount - processedPacketNum,
              packetStatus.runLength
            );
            if (packetStatus.packetStatus === 1 /* TypeTCCPacketReceivedSmallDelta */ || packetStatus.packetStatus === 2 /* TypeTCCPacketReceivedLargeDelta */) {
              for (let _ = 0; _ < packetNumberToProcess; _++) {
                recvDeltas.push(
                  new RecvDelta({ type: packetStatus.packetStatus })
                );
              }
            }
            processedPacketNum += packetNumberToProcess;
          }
          break;
        case 1 /* TypeTCCStatusVectorChunk */:
          {
            const packetStatus = StatusVectorChunk.deSerialize(
              data.slice(packetStatusPos, packetStatusPos + 2)
            );
            iPacketStatus = packetStatus;
            if (packetStatus.symbolSize === 0) {
              packetStatus.symbolList.forEach((v) => {
                if (v === 1 /* TypeTCCPacketReceivedSmallDelta */) {
                  recvDeltas.push(
                    new RecvDelta({
                      type: 1 /* TypeTCCPacketReceivedSmallDelta */
                    })
                  );
                }
              });
            }
            if (packetStatus.symbolSize === 1) {
              packetStatus.symbolList.forEach((v) => {
                if (v === 1 /* TypeTCCPacketReceivedSmallDelta */ || v === 2 /* TypeTCCPacketReceivedLargeDelta */) {
                  recvDeltas.push(
                    new RecvDelta({
                      type: v
                    })
                  );
                }
              });
            }
            processedPacketNum += packetStatus.symbolList.length;
          }
          break;
      }
      if (!iPacketStatus) throw new Error();
      packetStatusPos += 2;
      packetChunks.push(iPacketStatus);
    }
    let recvDeltaPos = packetStatusPos;
    recvDeltas.forEach((delta) => {
      if (delta.type === 1 /* TypeTCCPacketReceivedSmallDelta */) {
        delta.deSerialize(data.slice(recvDeltaPos, recvDeltaPos + 1));
        recvDeltaPos++;
      }
      if (delta.type === 2 /* TypeTCCPacketReceivedLargeDelta */) {
        delta.deSerialize(data.slice(recvDeltaPos, recvDeltaPos + 2));
        recvDeltaPos += 2;
      }
    });
    return new _TransportWideCC({
      senderSsrc,
      mediaSourceSsrc: mediaSsrc,
      baseSequenceNumber,
      packetStatusCount,
      referenceTime,
      fbPktCount,
      recvDeltas,
      packetChunks,
      header
    });
  }
  serialize() {
    const constBuf = bufferWriter(
      [4, 4, 2, 2, 3, 1],
      [
        this.senderSsrc,
        this.mediaSourceSsrc,
        this.baseSequenceNumber,
        this.packetStatusCount,
        this.referenceTime,
        this.fbPktCount
      ]
    );
    const chunks = Buffer.concat(
      this.packetChunks.map((chunk) => chunk.serialize())
    );
    const deltas = Buffer.concat(
      this.recvDeltas.map((delta) => {
        try {
          return delta.serialize();
        } catch (error) {
          log5(error?.message);
          return void 0;
        }
      }).filter((v) => v)
    );
    const buf = Buffer.concat([constBuf, chunks, deltas]);
    if (this.header.padding && buf.length % 4 !== 0) {
      const rest = 4 - buf.length % 4;
      const padding = Buffer.alloc(rest);
      padding[padding.length - 1] = padding.length;
      this.header.length = Math.floor((buf.length + padding.length) / 4);
      return Buffer.concat([this.header.serialize(), buf, padding]);
    }
    this.header.length = Math.floor(buf.length / 4);
    return Buffer.concat([this.header.serialize(), buf]);
  }
  get packetResults() {
    const currentSequenceNumber = this.baseSequenceNumber - 1;
    const results = this.packetChunks.filter((v) => v instanceof RunLengthChunk).flatMap(
      (chunk) => chunk.results(currentSequenceNumber)
    );
    let deltaIdx = 0;
    const referenceTime = BigInt(this.referenceTime) * 64n;
    let currentReceivedAtMs = referenceTime;
    for (const result of results) {
      const recvDelta = this.recvDeltas[deltaIdx];
      if (!result.received || !recvDelta) {
        continue;
      }
      currentReceivedAtMs += BigInt(recvDelta.delta) / 1000n;
      result.delta = recvDelta.delta;
      result.receivedAtMs = Number(currentReceivedAtMs);
      deltaIdx++;
    }
    return results;
  }
};
var RunLengthChunk = class _RunLengthChunk {
  type;
  packetStatus;
  /** 13bit */
  runLength;
  constructor(props = {}) {
    Object.assign(this, props);
    this.type = 0 /* TypeTCCRunLengthChunk */;
  }
  static deSerialize(data) {
    const packetStatus = getBit(data[0], 1, 2);
    const runLength = (getBit(data[0], 3, 5) << 8) + data[1];
    return new _RunLengthChunk({ type: 0, packetStatus, runLength });
  }
  serialize() {
    const buf = new BitWriter2(16).set(0).set(this.packetStatus, 2).set(this.runLength, 13).buffer;
    return buf;
  }
  results(currentSequenceNumber) {
    const received = this.packetStatus === 1 /* TypeTCCPacketReceivedSmallDelta */ || this.packetStatus === 2 /* TypeTCCPacketReceivedLargeDelta */;
    const results = [];
    for (let i = 0; i <= this.runLength; ++i) {
      results.push(
        new PacketResult({ sequenceNumber: ++currentSequenceNumber, received })
      );
    }
    return results;
  }
};
var StatusVectorChunk = class _StatusVectorChunk {
  type;
  symbolSize;
  symbolList = [];
  constructor(props = {}) {
    Object.assign(this, props);
  }
  static deSerialize(data) {
    const type = 1 /* TypeTCCStatusVectorChunk */;
    let symbolSize = getBit(data[0], 1, 1);
    const symbolList = [];
    function range(n, cb) {
      for (let i = 0; i < n; i++) {
        cb(i);
      }
    }
    switch (symbolSize) {
      case 0:
        range(6, (i) => symbolList.push(getBit(data[0], 2 + i, 1)));
        range(8, (i) => symbolList.push(getBit(data[1], i, 1)));
        break;
      case 1:
        range(3, (i) => symbolList.push(getBit(data[0], 2 + i * 2, 2)));
        range(4, (i) => symbolList.push(getBit(data[1], i * 2, 2)));
        break;
      default:
        symbolSize = (getBit(data[0], 2, 6) << 8) + data[1];
    }
    return new _StatusVectorChunk({ type, symbolSize, symbolList });
  }
  serialize() {
    const buf = Buffer.alloc(2);
    const writer = new BitWriter2(16).set(1).set(this.symbolSize);
    const bits = this.symbolSize === 0 ? 1 : 2;
    this.symbolList.forEach((v) => {
      writer.set(v, bits);
    });
    buf.writeUInt16BE(writer.value);
    return buf;
  }
};
var RecvDelta = class _RecvDelta {
  /**optional (If undefined, it will be set automatically.)*/
  type;
  /**micro sec */
  delta;
  constructor(props = {}) {
    Object.assign(this, props);
  }
  static deSerialize(data) {
    let type;
    let delta;
    if (data.length === 1) {
      type = 1 /* TypeTCCPacketReceivedSmallDelta */;
      delta = 250 * data[0];
    } else if (data.length === 2) {
      type = 2 /* TypeTCCPacketReceivedLargeDelta */;
      delta = 250 * data.readInt16BE();
    }
    if (type === void 0 || delta === void 0) throw new Error();
    return new _RecvDelta({ type, delta });
  }
  deSerialize(data) {
    const res = _RecvDelta.deSerialize(data);
    this.delta = res.delta;
  }
  parsed = false;
  // todo refactor
  parseDelta() {
    this.delta = Math.floor(this.delta / 250);
    if (this.delta < 0 || this.delta > 255) {
      if (this.delta > 32767) this.delta = 32767;
      if (this.delta < -32768) this.delta = -32768;
      if (!this.type) this.type = 2 /* TypeTCCPacketReceivedLargeDelta */;
    } else {
      if (!this.type) this.type = 1 /* TypeTCCPacketReceivedSmallDelta */;
    }
    this.parsed = true;
  }
  serialize() {
    if (!this.parsed) this.parseDelta();
    if (this.type === 1 /* TypeTCCPacketReceivedSmallDelta */) {
      const buf = Buffer.alloc(1);
      buf.writeUInt8(this.delta);
      return buf;
    } else if (this.type === 2 /* TypeTCCPacketReceivedLargeDelta */) {
      const buf = Buffer.alloc(2);
      buf.writeInt16BE(this.delta);
      return buf;
    }
    throw new Error("errDeltaExceedLimit " + this.delta + " " + this.type);
  }
};
var PacketChunk = /* @__PURE__ */ ((PacketChunk2) => {
  PacketChunk2[PacketChunk2["TypeTCCRunLengthChunk"] = 0] = "TypeTCCRunLengthChunk";
  PacketChunk2[PacketChunk2["TypeTCCStatusVectorChunk"] = 1] = "TypeTCCStatusVectorChunk";
  PacketChunk2[PacketChunk2["packetStatusChunkLength"] = 2] = "packetStatusChunkLength";
  return PacketChunk2;
})(PacketChunk || {});
var PacketStatus = /* @__PURE__ */ ((PacketStatus2) => {
  PacketStatus2[PacketStatus2["TypeTCCPacketNotReceived"] = 0] = "TypeTCCPacketNotReceived";
  PacketStatus2[PacketStatus2["TypeTCCPacketReceivedSmallDelta"] = 1] = "TypeTCCPacketReceivedSmallDelta";
  PacketStatus2[PacketStatus2["TypeTCCPacketReceivedLargeDelta"] = 2] = "TypeTCCPacketReceivedLargeDelta";
  PacketStatus2[PacketStatus2["TypeTCCPacketReceivedWithoutDelta"] = 3] = "TypeTCCPacketReceivedWithoutDelta";
  return PacketStatus2;
})(PacketStatus || {});
var PacketResult = class {
  sequenceNumber = 0;
  delta = 0;
  received = false;
  receivedAtMs = 0;
  constructor(props) {
    Object.assign(this, props);
  }
};

// ../rtp/src/rtcp/rtpfb/index.ts
var log6 = debug("werift-rtp:packages/rtp/rtcp/rtpfb/index");
var RtcpTransportLayerFeedback = class _RtcpTransportLayerFeedback {
  static type = RtcpTransportLayerFeedbackType;
  type = _RtcpTransportLayerFeedback.type;
  feedback;
  header;
  constructor(props = {}) {
    Object.assign(this, props);
  }
  serialize() {
    const payload = this.feedback.serialize();
    return payload;
  }
  static deSerialize(data, header) {
    let feedback;
    switch (header.count) {
      case GenericNack.count:
        feedback = GenericNack.deSerialize(data, header);
        break;
      case TransportWideCC.count:
        feedback = TransportWideCC.deSerialize(data, header);
        break;
      default:
        log6("unknown rtpfb packet", header.count);
        break;
    }
    return new _RtcpTransportLayerFeedback({ feedback, header });
  }
};

// ../rtp/src/rtcp/sdes.ts
var RtcpSourceDescriptionPacket = class _RtcpSourceDescriptionPacket {
  static type = 202;
  type = _RtcpSourceDescriptionPacket.type;
  chunks = [];
  constructor(props) {
    Object.assign(this, props);
  }
  get length() {
    let length = 0;
    this.chunks.forEach((chunk) => length += chunk.length);
    return length;
  }
  serialize() {
    let payload = Buffer.concat(this.chunks.map((chunk) => chunk.serialize()));
    while (payload.length % 4)
      payload = Buffer.concat([payload, Buffer.from([0])]);
    return RtcpHeader.serialize(
      this.type,
      this.chunks.length,
      payload,
      payload.length / 4
    );
  }
  static deSerialize(payload, header) {
    const chunks = [];
    for (let i = 0; i < payload.length; ) {
      const chunk = SourceDescriptionChunk.deSerialize(payload.slice(i));
      chunks.push(chunk);
      i += chunk.length;
    }
    return new _RtcpSourceDescriptionPacket({ chunks });
  }
};
var SourceDescriptionChunk = class _SourceDescriptionChunk {
  source;
  items = [];
  constructor(props = {}) {
    Object.assign(this, props);
  }
  get length() {
    let length = 4;
    this.items.forEach((item) => length += item.length);
    length += 1;
    length += getPadding(length);
    return length;
  }
  serialize() {
    const data = Buffer.concat([
      bufferWriter([4], [this.source]),
      Buffer.concat(this.items.map((item) => item.serialize()))
    ]);
    const res = Buffer.concat([data, Buffer.alloc(getPadding(data.length))]);
    return res;
  }
  static deSerialize(data) {
    const source = data.readUInt32BE();
    const items = [];
    for (let i = 4; i < data.length; ) {
      const type = data[i];
      if (type === 0) break;
      const item = SourceDescriptionItem.deSerialize(data.slice(i));
      items.push(item);
      i += item.length;
    }
    return new _SourceDescriptionChunk({ source, items });
  }
};
var SourceDescriptionItem = class _SourceDescriptionItem {
  type;
  text;
  constructor(props) {
    Object.assign(this, props);
  }
  get length() {
    return 1 + 1 + Buffer.from(this.text).length;
  }
  serialize() {
    const text = Buffer.from(this.text);
    return Buffer.concat([
      bufferWriter([1, 1], [this.type, text.length]),
      text
    ]);
  }
  static deSerialize(data) {
    const type = data[0];
    const octetCount = data[1];
    const text = data.slice(2, 2 + octetCount).toString();
    return new _SourceDescriptionItem({ type, text });
  }
};
function getPadding(len) {
  if (len % 4 == 0) {
    return 0;
  }
  return 4 - len % 4;
}

// ../rtp/src/rtcp/sr.ts
var RtcpSrPacket = class _RtcpSrPacket {
  ssrc = 0;
  senderInfo;
  reports = [];
  static type = 200;
  type = _RtcpSrPacket.type;
  constructor(props) {
    Object.assign(this, props);
  }
  toJSON() {
    return {
      ssrc: this.ssrc,
      senderInfo: this.senderInfo.toJSON(),
      reports: this.reports.map((r) => r.toJSON())
    };
  }
  serialize() {
    let payload = Buffer.alloc(4);
    payload.writeUInt32BE(this.ssrc);
    payload = Buffer.concat([payload, this.senderInfo.serialize()]);
    payload = Buffer.concat([
      payload,
      ...this.reports.map((report) => report.serialize())
    ]);
    return RtcpHeader.serialize(
      _RtcpSrPacket.type,
      this.reports.length,
      payload,
      Math.floor(payload.length / 4)
    );
  }
  static deSerialize(payload, count) {
    const ssrc = payload.readUInt32BE();
    const senderInfo = RtcpSenderInfo.deSerialize(payload.subarray(4, 24));
    let pos = 24;
    const reports = [];
    for (let _ = 0; _ < count; _++) {
      reports.push(
        RtcpReceiverInfo.deSerialize(payload.subarray(pos, pos + 24))
      );
      pos += 24;
    }
    const packet = new _RtcpSrPacket({ ssrc, senderInfo, reports });
    return packet;
  }
};
var RtcpSenderInfo = class _RtcpSenderInfo {
  ntpTimestamp;
  rtpTimestamp;
  packetCount;
  octetCount;
  constructor(props = {}) {
    Object.assign(this, props);
  }
  toJSON() {
    return {
      ntpTimestamp: ntpTime2Sec(this.ntpTimestamp),
      rtpTimestamp: this.rtpTimestamp
    };
  }
  serialize() {
    return bufferWriter(
      [8, 4, 4, 4],
      [this.ntpTimestamp, this.rtpTimestamp, this.packetCount, this.octetCount]
    );
  }
  static deSerialize(data) {
    const [ntpTimestamp, rtpTimestamp, packetCount, octetCount] = bufferReader(
      data,
      [8, 4, 4, 4]
    );
    return new _RtcpSenderInfo({
      ntpTimestamp,
      rtpTimestamp,
      packetCount,
      octetCount
    });
  }
};
var ntpTime2Sec = (ntp) => {
  const [ntpSec, ntpMsec] = bufferReader(bufferWriter([8], [ntp]), [4, 4]);
  return Number(`${ntpSec}.${ntpMsec}`);
};

// ../rtp/src/rtcp/rtcp.ts
var log7 = debug("werift-rtp:packages/rtp/src/rtcp/rtcp.ts");
var RtcpPacketConverter = class {
  static deSerialize(data) {
    let pos = 0;
    const packets = [];
    while (pos < data.length) {
      const header = RtcpHeader.deSerialize(
        data.subarray(pos, pos + RTCP_HEADER_SIZE)
      );
      pos += RTCP_HEADER_SIZE;
      let payload = data.subarray(pos);
      pos += header.length * 4;
      if (header.padding) {
        payload = payload.subarray(0, payload.length - payload.subarray(-1)[0]);
      }
      try {
        switch (header.type) {
          case RtcpSrPacket.type:
            packets.push(RtcpSrPacket.deSerialize(payload, header.count));
            break;
          case RtcpRrPacket.type:
            packets.push(RtcpRrPacket.deSerialize(payload, header.count));
            break;
          case RtcpSourceDescriptionPacket.type:
            packets.push(
              RtcpSourceDescriptionPacket.deSerialize(payload, header)
            );
            break;
          case RtcpTransportLayerFeedback.type:
            packets.push(
              RtcpTransportLayerFeedback.deSerialize(payload, header)
            );
            break;
          case RtcpPayloadSpecificFeedback.type:
            packets.push(
              RtcpPayloadSpecificFeedback.deSerialize(payload, header)
            );
            break;
          default:
            break;
        }
      } catch (error) {
        log7("deSerialize RTCP", error);
      }
    }
    return packets;
  }
};
function isRtcp(buf) {
  return buf.length >= 2 && buf[1] >= 192 && buf[1] <= 208;
}

// ../rtp/src/rtp/headerExtension.ts
var RTP_EXTENSION_URI = {
  sdesMid: "urn:ietf:params:rtp-hdrext:sdes:mid",
  sdesRTPStreamID: "urn:ietf:params:rtp-hdrext:sdes:rtp-stream-id",
  repairedRtpStreamId: "urn:ietf:params:rtp-hdrext:sdes:repaired-rtp-stream-id",
  transportWideCC: "http://www.ietf.org/id/draft-holmer-rmcat-transport-wide-cc-extensions-01",
  absSendTime: "http://www.webrtc.org/experiments/rtp-hdrext/abs-send-time",
  dependencyDescriptor: "https://aomediacodec.github.io/av1-rtp-spec/#dependency-descriptor-rtp-header-extension",
  audioLevelIndication: "urn:ietf:params:rtp-hdrext:ssrc-audio-level",
  videoOrientation: "urn:3gpp:video-orientation"
};
function rtpHeaderExtensionsParser(extensions, extIdUriMap) {
  return extensions.map((extension) => {
    const uri = extIdUriMap[extension.id];
    if (!uri) {
      return { uri: "unknown", value: extension.payload };
    }
    switch (uri) {
      case RTP_EXTENSION_URI.sdesMid:
      case RTP_EXTENSION_URI.sdesRTPStreamID:
      case RTP_EXTENSION_URI.repairedRtpStreamId:
        return { uri, value: deserializeString(extension.payload) };
      case RTP_EXTENSION_URI.transportWideCC:
        return { uri, value: deserializeUint16BE(extension.payload) };
      case RTP_EXTENSION_URI.absSendTime:
        return {
          uri,
          value: deserializeAbsSendTime(extension.payload)
        };
      case RTP_EXTENSION_URI.audioLevelIndication: {
        return {
          uri,
          value: deserializeAudioLevelIndication(extension.payload)
        };
      }
      case RTP_EXTENSION_URI.videoOrientation:
        return { uri, value: deserializeVideoOrientation(extension.payload) };
      default:
        return { uri, value: extension.payload };
    }
  }).reduce((acc, cur) => {
    if (cur) acc[cur.uri] = cur.value;
    return acc;
  }, {});
}
function serializeSdesMid(id) {
  return Buffer.from(id);
}
function serializeSdesRTPStreamID(id) {
  return Buffer.from(id);
}
function serializeRepairedRtpStreamId(id) {
  return Buffer.from(id);
}
function serializeTransportWideCC(transportSequenceNumber) {
  return bufferWriter([2], [transportSequenceNumber]);
}
function serializeAbsSendTime(ntpTime2) {
  const buf = Buffer.alloc(3);
  const time = ntpTime2 >> 14n & 0x00ffffffn;
  buf.writeUIntBE(Number(time), 0, 3);
  return buf;
}
function serializeAudioLevelIndication(level) {
  const stream = new BitStream(Buffer.alloc(1));
  stream.writeBits(1, 1);
  stream.writeBits(7, level);
  return stream.uint8Array;
}
function deserializeString(buf) {
  return buf.toString();
}
function deserializeUint16BE(buf) {
  return buf.readUInt16BE();
}
function deserializeAbsSendTime(buf) {
  return bufferReader(buf, [3])[0];
}
function deserializeAudioLevelIndication(buf) {
  const stream = new BitStream(buf);
  const value = {
    v: stream.readBits(1) === 1,
    level: stream.readBits(7)
  };
  return value;
}
function deserializeVideoOrientation(payload) {
  const stream = new BitStream(payload);
  stream.readBits(4);
  const value = {
    c: stream.readBits(1),
    f: stream.readBits(1),
    r1: stream.readBits(1),
    r0: stream.readBits(1)
  };
  return value;
}

// ../rtp/src/rtp/red/packet.ts
var log8 = debug("packages/rtp/src/rtp/red/packet.ts");
var Red = class _Red {
  header;
  blocks = [];
  static deSerialize(bufferOrArrayBuffer) {
    const buf = bufferOrArrayBuffer instanceof ArrayBuffer ? Buffer.from(bufferOrArrayBuffer) : bufferOrArrayBuffer;
    const red = new _Red();
    let offset = 0;
    [red.header, offset] = RedHeader.deSerialize(buf);
    red.header.fields.forEach(({ blockLength, timestampOffset: timestampOffset2, blockPT }) => {
      if (blockLength && timestampOffset2) {
        const block = buf.subarray(offset, offset + blockLength);
        red.blocks.push({ block, blockPT, timestampOffset: timestampOffset2 });
        offset += blockLength;
      } else {
        const block = buf.subarray(offset);
        red.blocks.push({ block, blockPT });
      }
    });
    return red;
  }
  serialize() {
    this.header = new RedHeader();
    for (const { timestampOffset: timestampOffset2, blockPT, block } of this.blocks) {
      if (timestampOffset2) {
        this.header.fields.push({
          fBit: 1,
          blockPT,
          blockLength: block.length,
          timestampOffset: timestampOffset2
        });
      } else {
        this.header.fields.push({ fBit: 0, blockPT });
      }
    }
    let buf = this.header.serialize();
    for (const { block } of this.blocks) {
      buf = Buffer.concat([buf, block]);
    }
    return buf;
  }
};
var RedHeader = class _RedHeader {
  fields = [];
  static deSerialize(buf) {
    let offset = 0;
    const header = new _RedHeader();
    for (; ; ) {
      const field = {};
      header.fields.push(field);
      const bitStream = new BitStream(buf.subarray(offset));
      field.fBit = bitStream.readBits(1);
      field.blockPT = bitStream.readBits(7);
      offset++;
      if (field.fBit === 0) {
        break;
      }
      field.timestampOffset = bitStream.readBits(14);
      field.blockLength = bitStream.readBits(10);
      offset += 3;
    }
    return [header, offset];
  }
  serialize() {
    let buf = Buffer.alloc(0);
    for (const field of this.fields) {
      try {
        if (field.timestampOffset && field.blockLength) {
          const bitStream = new BitStream(Buffer.alloc(4)).writeBits(1, field.fBit).writeBits(7, field.blockPT).writeBits(14, field.timestampOffset).writeBits(10, field.blockLength);
          buf = Buffer.concat([buf, bitStream.uint8Array]);
        } else {
          const bitStream = new BitStream(Buffer.alloc(1)).writeBits(1, 0).writeBits(7, field.blockPT);
          buf = Buffer.concat([buf, bitStream.uint8Array]);
        }
      } catch (error) {
        log8(error?.message);
      }
    }
    return buf;
  }
};

// ../rtp/src/rtp/red/encoder.ts
var RedEncoder = class {
  constructor(distance = 1) {
    this.distance = distance;
  }
  cache = [];
  cacheSize = 10;
  push(payload) {
    this.cache.push(payload);
    if (this.cache.length > this.cacheSize) {
      this.cache.shift();
    }
  }
  build() {
    const red = new Red();
    const redundantPayloads = this.cache.slice(-(this.distance + 1));
    const presentPayload = redundantPayloads.pop();
    if (!presentPayload) {
      return red;
    }
    redundantPayloads.forEach((redundant) => {
      const timestampOffset2 = uint32Add(
        presentPayload.timestamp,
        -redundant.timestamp
      );
      if (timestampOffset2 > Max14Uint) {
        return;
      }
      red.blocks.push({
        block: redundant.block,
        blockPT: redundant.blockPT,
        timestampOffset: timestampOffset2
      });
    });
    red.blocks.push({
      block: presentPayload.block,
      blockPT: presentPayload.blockPT
    });
    return red;
  }
};
var Max14Uint = (1 << 14) - 1;

// ../rtp/src/rtp/red/handler.ts
var RedHandler = class {
  size = 150;
  sequenceNumbers = [];
  push(red, base) {
    const packets = [];
    red.blocks.forEach(({ blockPT, timestampOffset: timestampOffset2, block }, i) => {
      const sequenceNumber = uint16Add(
        base.header.sequenceNumber,
        -(red.blocks.length - (i + 1))
      );
      if (timestampOffset2) {
        packets.push(
          new RtpPacket(
            new RtpHeader({
              timestamp: uint32Add(base.header.timestamp, -timestampOffset2),
              payloadType: blockPT,
              ssrc: base.header.ssrc,
              sequenceNumber,
              marker: true
            }),
            block
          )
        );
      } else {
        packets.push(
          new RtpPacket(
            new RtpHeader({
              timestamp: base.header.timestamp,
              payloadType: blockPT,
              ssrc: base.header.ssrc,
              sequenceNumber,
              marker: true
            }),
            block
          )
        );
      }
    });
    const filtered = packets.filter((p) => {
      if (this.sequenceNumbers.includes(p.header.sequenceNumber)) {
        return false;
      } else {
        if (this.sequenceNumbers.length > this.size) {
          this.sequenceNumbers.shift();
        }
        this.sequenceNumbers.push(p.header.sequenceNumber);
        return true;
      }
    });
    return filtered;
  }
};

// ../rtp/src/rtp/rtp.ts
var ExtensionProfiles = {
  OneByte: 48862,
  // 48862
  TwoByte: 4096
  // 4096
};
var seqNumOffset = 2;
var timestampOffset = 4;
var ssrcOffset = 8;
var csrcOffset = 12;
var csrcSize = 4;
var RtpHeader = class _RtpHeader {
  version = 2;
  padding = false;
  paddingSize = 0;
  extension = false;
  marker = false;
  payloadOffset = 0;
  payloadType = 0;
  /**16bit, 初期値はランダムである必要があります*/
  sequenceNumber = 0;
  /**32bit microsec (milli/1000), 初期値はランダムである必要があります*/
  timestamp = 0;
  ssrc = 0;
  csrcLength = 0;
  csrc = [];
  extensionProfile = ExtensionProfiles.OneByte;
  /**deserialize only */
  extensionLength;
  extensions = [];
  constructor(props = {}) {
    Object.assign(this, props);
  }
  static deSerialize(rawPacket) {
    const h = new _RtpHeader();
    let currOffset = 0;
    const v_p_x_cc = rawPacket[currOffset++];
    h.version = getBit(v_p_x_cc, 0, 2);
    h.padding = getBit(v_p_x_cc, 2) > 0;
    h.extension = getBit(v_p_x_cc, 3) > 0;
    h.csrcLength = getBit(v_p_x_cc, 4, 4);
    h.csrc = [...Array(h.csrcLength)].map(() => {
      const csrc = rawPacket.readUInt32BE(currOffset);
      currOffset += 4;
      return csrc;
    });
    currOffset += csrcOffset - 1;
    const m_pt = rawPacket[1];
    h.marker = getBit(m_pt, 0) > 0;
    h.payloadType = getBit(m_pt, 1, 7);
    h.sequenceNumber = rawPacket.readUInt16BE(seqNumOffset);
    h.timestamp = rawPacket.readUInt32BE(timestampOffset);
    h.ssrc = rawPacket.readUInt32BE(ssrcOffset);
    for (let i = 0; i < h.csrc.length; i++) {
      const offset = csrcOffset + i * csrcSize;
      h.csrc[i] = rawPacket.subarray(offset).readUInt32BE();
    }
    if (h.extension) {
      h.extensionProfile = rawPacket.subarray(currOffset).readUInt16BE();
      currOffset += 2;
      const extensionLength = rawPacket.subarray(currOffset).readUInt16BE() * 4;
      h.extensionLength = extensionLength;
      currOffset += 2;
      switch (h.extensionProfile) {
        // RFC 8285 RTP One Byte Header Extension
        case ExtensionProfiles.OneByte:
          {
            const end = currOffset + extensionLength;
            while (currOffset < end) {
              if (rawPacket[currOffset] === 0) {
                currOffset++;
                continue;
              }
              const extId = rawPacket[currOffset] >> 4;
              const len = (rawPacket[currOffset] & (rawPacket[currOffset] ^ 240)) + 1;
              currOffset++;
              if (extId === 15) {
                break;
              }
              const extension = {
                id: extId,
                payload: rawPacket.subarray(currOffset, currOffset + len)
              };
              h.extensions = [...h.extensions, extension];
              currOffset += len;
            }
          }
          break;
        // RFC 8285 RTP Two Byte Header Extension
        case ExtensionProfiles.TwoByte:
          {
            const end = currOffset + extensionLength;
            while (currOffset < end) {
              if (rawPacket[currOffset] === 0) {
                currOffset++;
                continue;
              }
              const extId = rawPacket[currOffset];
              currOffset++;
              const len = rawPacket[currOffset];
              currOffset++;
              const extension = {
                id: extId,
                payload: rawPacket.subarray(currOffset, currOffset + len)
              };
              h.extensions = [...h.extensions, extension];
              currOffset += len;
            }
          }
          break;
        default:
          {
            const extension = {
              id: 0,
              payload: rawPacket.subarray(
                currOffset,
                currOffset + extensionLength
              )
            };
            h.extensions = [...h.extensions, extension];
            currOffset += h.extensions[0].payload.length;
          }
          break;
      }
    }
    h.payloadOffset = currOffset;
    if (h.padding) {
      h.paddingSize = rawPacket[rawPacket.length - 1];
    }
    return h;
  }
  get serializeSize() {
    const { csrc, extensionProfile, extensions } = this;
    let size = 12 + csrc.length * csrcSize;
    if (extensions.length > 0 || this.extension === true) {
      let extSize = 4;
      switch (extensionProfile) {
        case ExtensionProfiles.OneByte:
          for (const extension of extensions) {
            extSize += 1 + extension.payload.length;
          }
          break;
        case ExtensionProfiles.TwoByte:
          for (const extension of extensions) {
            extSize += 2 + extension.payload.length;
          }
          break;
        default:
          extSize += extensions[0].payload.length;
      }
      size += Math.floor((extSize + 3) / 4) * 4;
    }
    return size;
  }
  serialize(size) {
    const buf = Buffer.alloc(size);
    let offset = 0;
    const v_p_x_cc = new BitWriter(8);
    v_p_x_cc.set(2, 0, this.version);
    if (this.padding) v_p_x_cc.set(1, 2, 1);
    if (this.extensions.length > 0) this.extension = true;
    if (this.extension) v_p_x_cc.set(1, 3, 1);
    v_p_x_cc.set(4, 4, this.csrc.length);
    buf.writeUInt8(v_p_x_cc.value, offset++);
    const m_pt = new BitWriter(8);
    if (this.marker) m_pt.set(1, 0, 1);
    m_pt.set(7, 1, this.payloadType);
    buf.writeUInt8(m_pt.value, offset++);
    buf.writeUInt16BE(this.sequenceNumber, seqNumOffset);
    offset += 2;
    buf.writeUInt32BE(this.timestamp, timestampOffset);
    offset += 4;
    buf.writeUInt32BE(this.ssrc, ssrcOffset);
    offset += 4;
    for (const csrc of this.csrc) {
      buf.writeUInt32BE(csrc, offset);
      offset += 4;
    }
    if (this.extension) {
      const extHeaderPos = offset;
      buf.writeUInt16BE(this.extensionProfile, offset);
      offset += 4;
      const startExtensionsPos = offset;
      switch (this.extensionProfile) {
        case ExtensionProfiles.OneByte:
          for (const extension of this.extensions) {
            buf.writeUInt8(
              extension.id << 4 | extension.payload.length - 1,
              offset++
            );
            extension.payload.copy(buf, offset);
            offset += extension.payload.length;
          }
          break;
        case ExtensionProfiles.TwoByte:
          for (const extension of this.extensions) {
            buf.writeUInt8(extension.id, offset++);
            buf.writeUInt8(extension.payload.length, offset++);
            extension.payload.copy(buf, offset);
            offset += extension.payload.length;
          }
          break;
        default: {
          const extLen = this.extensions[0].payload.length;
          if (extLen % 4 != 0) {
            throw new Error();
          }
          this.extensions[0].payload.copy(buf, offset);
          offset += extLen;
        }
      }
      const extSize = offset - startExtensionsPos;
      const roundedExtSize = Math.trunc((extSize + 3) / 4) * 4;
      buf.writeUInt16BE(Math.trunc(roundedExtSize / 4), extHeaderPos + 2);
      for (let i = 0; i < roundedExtSize - extSize; i++) {
        buf.writeUInt8(0, offset);
        offset++;
      }
    }
    this.payloadOffset = offset;
    return buf;
  }
};
var RtpPacket = class _RtpPacket {
  constructor(header, payload) {
    this.header = header;
    this.payload = payload;
  }
  get serializeSize() {
    return this.header.serializeSize + this.payload.length;
  }
  clone() {
    return new _RtpPacket(new RtpHeader({ ...this.header }), this.payload);
  }
  serialize() {
    let buf = this.header.serialize(
      this.header.serializeSize + this.payload.length
    );
    const { payloadOffset } = this.header;
    this.payload.copy(buf, payloadOffset);
    if (this.header.padding) {
      const padding = Buffer.alloc(this.header.paddingSize);
      padding.writeUInt8(this.header.paddingSize, this.header.paddingSize - 1);
      buf = Buffer.concat([buf, padding]);
    }
    return buf;
  }
  static deSerialize(buf) {
    const header = RtpHeader.deSerialize(buf);
    const p = new _RtpPacket(
      header,
      buf.subarray(header.payloadOffset, buf.length - header.paddingSize)
    );
    return p;
  }
  clear() {
    this.payload = null;
  }
};

// ../rtp/src/rtp/rtx.ts
function unwrapRtx(rtx, payloadType, ssrc) {
  const packet = new RtpPacket(
    new RtpHeader({
      payloadType,
      marker: rtx.header.marker,
      sequenceNumber: rtx.payload.readUInt16BE(0),
      timestamp: rtx.header.timestamp,
      ssrc
    }),
    rtx.payload.subarray(2)
  );
  return packet;
}
function wrapRtx(packet, payloadType, sequenceNumber, ssrc) {
  const originalSequence = Buffer.allocUnsafe(2);
  originalSequence.writeUInt16BE(packet.header.sequenceNumber, 0);
  const rtx = new RtpPacket(
    new RtpHeader({
      payloadType,
      marker: packet.header.marker,
      sequenceNumber,
      timestamp: packet.header.timestamp,
      ssrc,
      csrc: packet.header.csrc,
      extensions: packet.header.extensions
    }),
    Buffer.concat([originalSequence, packet.payload])
  );
  return rtx;
}

// ../rtp/src/srtp/context/context.ts
import { createCipheriv as createCipheriv4, createHmac as createHmac3 } from "crypto";

// ../rtp/src/srtp/cipher/ctr.ts
import {
  createCipheriv as createCipheriv2,
  createDecipheriv as createDecipheriv2,
  createHmac as createHmac2,
  timingSafeEqual
} from "crypto";

// ../rtp/src/srtp/cipher/index.ts
var CipherAesBase = class {
  constructor(srtpSessionKey, srtpSessionSalt, srtcpSessionKey, srtcpSessionSalt) {
    this.srtpSessionKey = srtpSessionKey;
    this.srtpSessionSalt = srtpSessionSalt;
    this.srtcpSessionKey = srtcpSessionKey;
    this.srtcpSessionSalt = srtcpSessionSalt;
  }
  encryptRtp(header, payload, rolloverCounter) {
    return Buffer.from([]);
  }
  decryptRtp(cipherText, rolloverCounter, header) {
    return [];
  }
  encryptRTCP(rawRtcp, srtcpIndex) {
    return Buffer.from([]);
  }
  decryptRTCP(encrypted) {
    return [];
  }
};

// ../rtp/src/srtp/error.ts
var SrtpAuthenticationError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "SrtpAuthenticationError";
  }
};

// ../rtp/src/srtp/packet.ts
var minRtpHeaderSize = 12;
var minRtcpPacketSize = 8;
function parseSrtpRtpHeader(packet, authTagLength, message = "Failed to authenticate SRTP packet") {
  const authTagOffset = packet.length - authTagLength;
  assertAuthenticatedPacketLength(
    packet.length >= minRtpHeaderSize + authTagLength,
    message
  );
  const header = wrapAuthenticationError(
    () => RtpHeader.deSerialize(packet.subarray(0, authTagOffset)),
    message
  );
  header.paddingSize = 0;
  assertAuthenticatedPacketLength(
    header.payloadOffset >= minRtpHeaderSize && header.payloadOffset <= authTagOffset,
    message
  );
  return header;
}
function parseSrtcpHeader(packet, authTagLength, srtcpIndexSize3, message = "Failed to authenticate SRTCP packet") {
  assertAuthenticatedPacketLength(
    packet.length >= minRtcpPacketSize + authTagLength + srtcpIndexSize3,
    message
  );
  return wrapAuthenticationError(
    () => RtcpHeader.deSerialize(packet.subarray(0, RTCP_HEADER_SIZE)),
    message
  );
}
function assertAuthenticatedPacketLength(condition, message) {
  if (!condition) {
    throw new SrtpAuthenticationError(message);
  }
}
function wrapAuthenticationError(parse, message) {
  try {
    return parse();
  } catch {
    throw new SrtpAuthenticationError(message);
  }
}
function finalizeSrtpRtpHeader(header, packet, message = "Failed to authenticate SRTP packet") {
  if (!header.padding) {
    header.paddingSize = 0;
    return header;
  }
  assertAuthenticatedPacketLength(
    packet.length > header.payloadOffset,
    message
  );
  const paddingSize = packet[packet.length - 1];
  assertAuthenticatedPacketLength(
    paddingSize > 0 && paddingSize <= packet.length - header.payloadOffset,
    message
  );
  header.paddingSize = paddingSize;
  return header;
}

// ../rtp/src/srtp/cipher/ctr.ts
var CipherAesCtr = class extends CipherAesBase {
  constructor(srtpSessionKey, srtpSessionSalt, srtcpSessionKey, srtcpSessionSalt, srtpSessionAuthTag, srtcpSessionAuthTag) {
    super(srtpSessionKey, srtpSessionSalt, srtcpSessionKey, srtcpSessionSalt);
    this.srtpSessionAuthTag = srtpSessionAuthTag;
    this.srtcpSessionAuthTag = srtcpSessionAuthTag;
  }
  authTagLength = 10;
  encryptRtp(header, payload, rolloverCounter) {
    const headerBuffer = header.serialize(header.serializeSize);
    const counter = this.generateCounter(
      header.sequenceNumber,
      rolloverCounter,
      header.ssrc,
      this.srtpSessionSalt
    );
    const cipher = createCipheriv2("aes-128-ctr", this.srtpSessionKey, counter);
    const enc = cipher.update(payload);
    const authTag = this.generateSrtpAuthTag(
      rolloverCounter,
      headerBuffer,
      enc
    );
    return Buffer.concat([headerBuffer, enc, authTag]);
  }
  decryptRtp(cipherText, rolloverCounter, header = parseSrtpRtpHeader(cipherText, this.authTagLength)) {
    const authTagOffset = cipherText.length - this.authTagLength;
    const encryptedPacket = cipherText.subarray(0, authTagOffset);
    const actualAuthTag = cipherText.subarray(authTagOffset);
    const expectedAuthTag = this.generateSrtpAuthTag(
      rolloverCounter,
      encryptedPacket.subarray(0, header.payloadOffset),
      encryptedPacket.subarray(header.payloadOffset)
    );
    assertAuthTag(
      actualAuthTag,
      expectedAuthTag,
      "Failed to authenticate SRTP packet"
    );
    const counter = this.generateCounter(
      header.sequenceNumber,
      rolloverCounter,
      header.ssrc,
      this.srtpSessionSalt
    );
    const cipher = createDecipheriv2(
      "aes-128-ctr",
      this.srtpSessionKey,
      counter
    );
    const payload = encryptedPacket.subarray(header.payloadOffset);
    const buf = cipher.update(payload);
    const dst = Buffer.concat([
      encryptedPacket.subarray(0, header.payloadOffset),
      buf
    ]);
    return [
      dst,
      finalizeSrtpRtpHeader(header, dst, "Failed to authenticate SRTP packet")
    ];
  }
  encryptRTCP(rtcpPacket, srtcpIndex) {
    let out = Buffer.from(rtcpPacket);
    const ssrc = out.readUInt32BE(4);
    const counter = this.generateCounter(
      srtcpIndex & 65535,
      srtcpIndex >> 16,
      ssrc,
      this.srtcpSessionSalt
    );
    const cipher = createCipheriv2("aes-128-ctr", this.srtcpSessionKey, counter);
    const buf = cipher.update(out.slice(8));
    buf.copy(out, 8);
    out = Buffer.concat([out, Buffer.alloc(4)]);
    out.writeUInt32BE(srtcpIndex, out.length - 4);
    out[out.length - 4] |= 128;
    const authTag = this.generateSrtcpAuthTag(out);
    out = Buffer.concat([out, authTag]);
    return out;
  }
  decryptRTCP(encrypted) {
    const header = parseSrtcpHeader(
      encrypted,
      this.authTagLength,
      srtcpIndexSize
    );
    const tailOffset = encrypted.length - (this.authTagLength + srtcpIndexSize);
    const authenticatedPortion = encrypted.subarray(
      0,
      encrypted.length - this.authTagLength
    );
    const actualTag = encrypted.subarray(encrypted.length - this.authTagLength);
    const expectedTag = this.generateSrtcpAuthTag(authenticatedPortion);
    assertAuthTag(
      actualTag,
      expectedTag,
      "Failed to authenticate SRTCP packet"
    );
    const out = Buffer.from(encrypted).slice(0, tailOffset);
    const isEncrypted = encrypted[tailOffset] >>> 7;
    if (isEncrypted === 0) return [out, header];
    let srtcpIndex = encrypted.readUInt32BE(tailOffset);
    srtcpIndex &= ~(1 << 31);
    const ssrc = encrypted.readUInt32BE(4);
    const counter = this.generateCounter(
      srtcpIndex & 65535,
      srtcpIndex >> 16,
      ssrc,
      this.srtcpSessionSalt
    );
    const cipher = createDecipheriv2(
      "aes-128-ctr",
      this.srtcpSessionKey,
      counter
    );
    const buf = cipher.update(out.subarray(8));
    buf.copy(out, 8);
    return [out, header];
  }
  generateSrtcpAuthTag(buf) {
    const srtcpSessionAuth = createHmac2("sha1", this.srtcpSessionAuthTag);
    return srtcpSessionAuth.update(buf).digest().slice(0, 10);
  }
  generateCounter(sequenceNumber, rolloverCounter, ssrc, sessionSalt) {
    const counter = Buffer.alloc(16);
    counter.writeUInt32BE(ssrc, 4);
    counter.writeUInt32BE(rolloverCounter, 8);
    counter.writeUInt32BE(Number(BigInt(sequenceNumber) << 16n), 12);
    for (let i = 0; i < sessionSalt.length; i++) {
      counter[i] ^= sessionSalt[i];
    }
    return counter;
  }
  generateSrtpAuthTag(roc, ...buffers) {
    const srtpSessionAuth = createHmac2("sha1", this.srtpSessionAuthTag);
    const rocRaw = Buffer.alloc(4);
    rocRaw.writeUInt32BE(roc);
    for (const buf of buffers) {
      srtpSessionAuth.update(buf);
    }
    return srtpSessionAuth.update(rocRaw).digest().subarray(0, 10);
  }
};
var srtcpIndexSize = 4;
function assertAuthTag(actual, expected, message) {
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new SrtpAuthenticationError(message);
  }
}

// ../rtp/src/srtp/cipher/gcm.ts
import { createCipheriv as createCipheriv3, createDecipheriv as createDecipheriv3 } from "crypto";
var CipherAesGcm = class extends CipherAesBase {
  aeadAuthTagLen = 16;
  rtpIvWriter = createBufferWriter([2, 4, 4, 2], true);
  rtcpIvWriter = createBufferWriter([2, 4, 2, 4], true);
  aadWriter = createBufferWriter([4], true);
  constructor(srtpSessionKey, srtpSessionSalt, srtcpSessionKey, srtcpSessionSalt) {
    super(srtpSessionKey, srtpSessionSalt, srtcpSessionKey, srtcpSessionSalt);
  }
  encryptRtp(header, payload, rolloverCounter) {
    const hdr = header.serialize(header.serializeSize);
    const iv = this.rtpInitializationVector(header, rolloverCounter);
    const cipher = createCipheriv3("aes-128-gcm", this.srtpSessionKey, iv);
    cipher.setAAD(hdr);
    const enc = cipher.update(payload);
    cipher.final();
    const authTag = cipher.getAuthTag();
    const dst = Buffer.concat([hdr, enc, authTag]);
    return dst;
  }
  decryptRtp(cipherText, rolloverCounter, header = parseSrtpRtpHeader(cipherText, this.aeadAuthTagLen)) {
    const headerBuffer = cipherText.subarray(0, header.payloadOffset);
    const authTagOffset = cipherText.length - this.aeadAuthTagLen;
    const authTag = cipherText.subarray(authTagOffset);
    let dst = Buffer.from([]);
    dst = growBufferSize(dst, cipherText.length - this.aeadAuthTagLen);
    headerBuffer.copy(dst);
    const iv = this.rtpInitializationVector(header, rolloverCounter);
    const enc = cipherText.slice(header.payloadOffset, authTagOffset);
    const decipher = createDecipheriv3("aes-128-gcm", this.srtpSessionKey, iv);
    decipher.setAAD(headerBuffer);
    decipher.setAuthTag(authTag);
    const dec = decipher.update(enc);
    finalizeAuthenticatedDecryption(decipher, "SRTP");
    dec.copy(dst, header.payloadOffset);
    return [
      dst,
      finalizeSrtpRtpHeader(header, dst, "Failed to authenticate SRTP packet")
    ];
  }
  encryptRTCP(rtcpPacket, srtcpIndex) {
    const ssrc = rtcpPacket.readUInt32BE(4);
    const addPos = rtcpPacket.length + this.aeadAuthTagLen;
    let dst = Buffer.from([]);
    dst = growBufferSize(dst, addPos + srtcpIndexSize2);
    rtcpPacket.slice(0, 8).copy(dst);
    const iv = this.rtcpInitializationVector(ssrc, srtcpIndex);
    const aad = this.rtcpAdditionalAuthenticatedData(rtcpPacket, srtcpIndex);
    const cipher = createCipheriv3("aes-128-gcm", this.srtcpSessionKey, iv);
    cipher.setAAD(aad);
    const enc = cipher.update(rtcpPacket.slice(8));
    cipher.final();
    enc.copy(dst, 8);
    const authTag = cipher.getAuthTag();
    authTag.copy(dst, 8 + enc.length);
    aad.slice(8, 12).copy(dst, addPos);
    return dst;
  }
  decryptRTCP(encrypted) {
    const header = parseSrtcpHeader(
      encrypted,
      this.aeadAuthTagLen,
      srtcpIndexSize2
    );
    const srtcpIndexOffset = encrypted.length - srtcpIndexSize2;
    const authTagOffset = srtcpIndexOffset - this.aeadAuthTagLen;
    const ssrc = encrypted.readUInt32BE(4);
    const encodedSrtcpIndex = encrypted.readUInt32BE(srtcpIndexOffset);
    const isEncrypted = encodedSrtcpIndex >>> 31 === 1;
    const srtcpIndex = encodedSrtcpIndex & ~(rtcpEncryptionFlag << 24);
    const iv = this.rtcpInitializationVector(ssrc, srtcpIndex);
    const aad = isEncrypted ? Buffer.concat([
      encrypted.subarray(0, 8),
      encrypted.subarray(srtcpIndexOffset)
    ]) : Buffer.concat([
      encrypted.subarray(0, authTagOffset),
      encrypted.subarray(srtcpIndexOffset)
    ]);
    const cipherText = isEncrypted ? encrypted.slice(8, authTagOffset) : Buffer.alloc(0);
    const dst = isEncrypted ? Buffer.alloc(authTagOffset) : Buffer.from(encrypted.subarray(0, authTagOffset));
    if (isEncrypted) {
      encrypted.slice(0, 8).copy(dst);
    }
    const decipher = createDecipheriv3("aes-128-gcm", this.srtcpSessionKey, iv);
    decipher.setAAD(aad);
    decipher.setAuthTag(encrypted.subarray(authTagOffset, srtcpIndexOffset));
    const dec = decipher.update(cipherText);
    finalizeAuthenticatedDecryption(decipher, "SRTCP");
    if (isEncrypted) {
      dec.copy(dst, 8);
    }
    return [dst, header];
  }
  // https://tools.ietf.org/html/rfc7714#section-8.1
  rtpInitializationVector(header, rolloverCounter) {
    const iv = this.rtpIvWriter([
      0,
      header.ssrc,
      rolloverCounter,
      header.sequenceNumber
    ]);
    for (let i = 0; i < iv.length; i++) {
      iv[i] ^= this.srtpSessionSalt[i];
    }
    return iv;
  }
  // https://tools.ietf.org/html/rfc7714#section-9.1
  rtcpInitializationVector(ssrc, srtcpIndex) {
    const iv = this.rtcpIvWriter([0, ssrc, 0, srtcpIndex]);
    for (let i = 0; i < iv.length; i++) {
      iv[i] ^= this.srtcpSessionSalt[i];
    }
    return iv;
  }
  // https://datatracker.ietf.org/doc/html/rfc7714#section-17
  rtcpAdditionalAuthenticatedData(rtcpPacket, srtcpIndex) {
    const aad = Buffer.concat([
      rtcpPacket.subarray(0, 8),
      this.aadWriter([srtcpIndex])
    ]);
    aad[8] |= rtcpEncryptionFlag;
    return aad;
  }
};
var srtcpIndexSize2 = 4;
var rtcpEncryptionFlag = 128;
function finalizeAuthenticatedDecryption(decipher, packetType) {
  try {
    decipher.final();
  } catch {
    throw new SrtpAuthenticationError(
      `Failed to authenticate ${packetType} packet`
    );
  }
}

// ../rtp/src/srtp/context/context.ts
function aes128EcbEncrypt(key, plaintext) {
  const cipher = createCipheriv4("aes-128-ecb", key, null);
  cipher.setAutoPadding(false);
  return Buffer.concat([cipher.update(plaintext), cipher.final()]);
}
var Context = class {
  constructor(masterKey, masterSalt, profile) {
    this.masterKey = masterKey;
    this.masterSalt = masterSalt;
    this.profile = profile;
    {
      const diff = 14 - masterSalt.length;
      if (diff > 0) {
        this.masterSalt = Buffer.concat([masterSalt, Buffer.alloc(diff)]);
      }
    }
    this.srtpSessionKey = this.generateSessionKey(0);
    this.srtpSessionSalt = this.generateSessionSalt(2);
    this.srtpSessionAuthTag = this.generateSessionAuthTag(1);
    this.srtpSessionAuth = createHmac3("sha1", this.srtpSessionAuthTag);
    this.srtcpSessionKey = this.generateSessionKey(3);
    this.srtcpSessionSalt = this.generateSessionSalt(5);
    this.srtcpSessionAuthTag = this.generateSessionAuthTag(4);
    this.srtcpSessionAuth = createHmac3("sha1", this.srtcpSessionAuthTag);
    switch (profile) {
      case ProtectionProfileAes128CmHmacSha1_80:
        this.cipher = new CipherAesCtr(
          this.srtpSessionKey,
          this.srtpSessionSalt,
          this.srtcpSessionKey,
          this.srtcpSessionSalt,
          this.srtpSessionAuthTag,
          this.srtcpSessionAuthTag
        );
        break;
      case ProtectionProfileAeadAes128Gcm:
        this.cipher = new CipherAesGcm(
          this.srtpSessionKey,
          this.srtpSessionSalt,
          this.srtcpSessionKey,
          this.srtcpSessionSalt
        );
        break;
    }
  }
  srtpSSRCStates = {};
  srtpSessionKey;
  srtpSessionSalt;
  srtpSessionAuthTag;
  srtpSessionAuth;
  srtcpSSRCStates = {};
  srtcpSessionKey;
  srtcpSessionSalt;
  srtcpSessionAuthTag;
  srtcpSessionAuth;
  cipher;
  generateSessionKey(label) {
    let sessionKey = Buffer.from(this.masterSalt);
    const labelAndIndexOverKdr = Buffer.from([
      label,
      0,
      0,
      0,
      0,
      0,
      0
    ]);
    for (let i = labelAndIndexOverKdr.length - 1, j = sessionKey.length - 1; i >= 0; i--, j--) {
      sessionKey[j] = sessionKey[j] ^ labelAndIndexOverKdr[i];
    }
    sessionKey = Buffer.concat([sessionKey, Buffer.from([0, 0])]);
    return aes128EcbEncrypt(this.masterKey, sessionKey);
  }
  generateSessionSalt(label) {
    let sessionSalt = Buffer.from(this.masterSalt);
    const labelAndIndexOverKdr = Buffer.from([
      label,
      0,
      0,
      0,
      0,
      0,
      0
    ]);
    for (let i = labelAndIndexOverKdr.length - 1, j = sessionSalt.length - 1; i >= 0; i--, j--) {
      sessionSalt[j] = sessionSalt[j] ^ labelAndIndexOverKdr[i];
    }
    sessionSalt = Buffer.concat([sessionSalt, Buffer.from([0, 0])]);
    sessionSalt = aes128EcbEncrypt(this.masterKey, sessionSalt);
    return sessionSalt.subarray(0, 14);
  }
  generateSessionAuthTag(label) {
    const sessionAuthTag = Buffer.from(this.masterSalt);
    const labelAndIndexOverKdr = Buffer.from([
      label,
      0,
      0,
      0,
      0,
      0,
      0
    ]);
    for (let i = labelAndIndexOverKdr.length - 1, j = sessionAuthTag.length - 1; i >= 0; i--, j--) {
      sessionAuthTag[j] = sessionAuthTag[j] ^ labelAndIndexOverKdr[i];
    }
    let firstRun = Buffer.concat([
      sessionAuthTag,
      Buffer.from([0, 0])
    ]);
    let secondRun = Buffer.concat([
      sessionAuthTag,
      Buffer.from([0, 1])
    ]);
    firstRun = aes128EcbEncrypt(this.masterKey, firstRun);
    secondRun = aes128EcbEncrypt(this.masterKey, secondRun);
    return Buffer.concat([firstRun, secondRun.subarray(0, 4)]);
  }
  getSrtpSsrcState(ssrc) {
    let s = this.srtpSSRCStates[ssrc];
    if (s) return s;
    s = {
      ssrc,
      rolloverCounter: 0,
      lastSequenceNumber: 0
    };
    this.srtpSSRCStates[ssrc] = s;
    return s;
  }
  getSrtcpSsrcState(ssrc) {
    let s = this.srtcpSSRCStates[ssrc];
    if (s) return s;
    s = {
      srtcpIndex: 0,
      ssrc
    };
    this.srtcpSSRCStates[ssrc] = s;
    return s;
  }
  // 3.3.1.  Packet Index Determination, and ROC, s_l Update
  // In particular, out-of-order RTP packets with
  // sequence numbers close to 2^16 or zero must be properly handled.
  updateRolloverCount(sequenceNumber, s) {
    if (!s.rolloverHasProcessed) {
      s.rolloverHasProcessed = true;
    } else if (sequenceNumber === 0) {
      if (s.lastSequenceNumber > MaxROCDisorder) {
        s.rolloverCounter++;
      }
    } else if (s.lastSequenceNumber < MaxROCDisorder && sequenceNumber > MaxSequenceNumber - MaxROCDisorder) {
      if (s.rolloverCounter > 0) {
        s.rolloverCounter--;
      }
    } else if (sequenceNumber < MaxROCDisorder && s.lastSequenceNumber > MaxSequenceNumber - MaxROCDisorder) {
      s.rolloverCounter++;
    }
    s.lastSequenceNumber = sequenceNumber;
  }
  generateSrtpAuthTag(buf, roc) {
    this.srtpSessionAuth = createHmac3("sha1", this.srtpSessionAuthTag);
    const rocRaw = Buffer.alloc(4);
    rocRaw.writeUInt32BE(roc);
    return this.srtpSessionAuth.update(buf).update(rocRaw).digest().slice(0, 10);
  }
  index(ssrc) {
    const s = this.srtcpSSRCStates[ssrc];
    if (!s) {
      return 0;
    }
    return s.srtcpIndex;
  }
  setIndex(ssrc, index) {
    const s = this.getSrtcpSsrcState(ssrc);
    s.srtcpIndex = index % 2147483647;
  }
};
var MaxROCDisorder = 100;
var MaxSequenceNumber = 65535;

// ../rtp/src/srtp/context/srtcp.ts
var SrtcpContext = class extends Context {
  constructor(masterKey, masterSalt, profile) {
    super(masterKey, masterSalt, profile);
  }
  encryptRTCP(rawRtcp) {
    const ssrc = rawRtcp.readUInt32BE(4);
    const s = this.getSrtcpSsrcState(ssrc);
    s.srtcpIndex++;
    if (s.srtcpIndex >> maxSRTCPIndex) {
      s.srtcpIndex = 0;
    }
    const enc = this.cipher.encryptRTCP(rawRtcp, s.srtcpIndex);
    return enc;
  }
  decryptRTCP(encrypted) {
    const dec = this.cipher.decryptRTCP(encrypted);
    return dec;
  }
};
var maxSRTCPIndex = 2147483647;

// ../rtp/src/srtp/session.ts
var Session = class {
  constructor(ContextCls) {
    this.ContextCls = ContextCls;
  }
  localContext;
  remoteContext;
  onData;
  start(localMasterKey, localMasterSalt, remoteMasterKey, remoteMasterSalt, profile) {
    this.localContext = new this.ContextCls(
      localMasterKey,
      localMasterSalt,
      profile
    );
    this.remoteContext = new this.ContextCls(
      remoteMasterKey,
      remoteMasterSalt,
      profile
    );
  }
};

// ../rtp/src/srtp/srtcp.ts
var SrtcpSession = class extends Session {
  constructor(config) {
    super(SrtcpContext);
    this.config = config;
    this.start(
      config.keys.localMasterKey,
      config.keys.localMasterSalt,
      config.keys.remoteMasterKey,
      config.keys.remoteMasterSalt,
      config.profile
    );
  }
  decrypt = (buf) => {
    const [decrypted] = this.remoteContext.decryptRTCP(buf);
    return decrypted;
  };
  encrypt(rawRtcp) {
    const enc = this.localContext.encryptRTCP(rawRtcp);
    return enc;
  }
};

// ../rtp/src/srtp/context/srtp.ts
var SrtpContext2 = class extends Context {
  constructor(masterKey, masterSalt, profile) {
    super(masterKey, masterSalt, profile);
  }
  encryptRtp(payload, header) {
    const s = this.getSrtpSsrcState(header.ssrc);
    this.updateRolloverCount(header.sequenceNumber, s);
    const enc = this.cipher.encryptRtp(header, payload, s.rolloverCounter);
    return enc;
  }
  decryptRtp(cipherText) {
    const header = parseSrtpRtpHeader(cipherText, this.rtpAuthTagLength);
    const existingState = this.srtpSSRCStates[header.ssrc];
    const nextState = existingState ? { ...existingState } : {
      ssrc: header.ssrc,
      rolloverCounter: 0,
      lastSequenceNumber: 0
    };
    this.updateRolloverCount(header.sequenceNumber, nextState);
    const dec = this.cipher.decryptRtp(
      cipherText,
      nextState.rolloverCounter,
      header
    );
    if (existingState) {
      Object.assign(existingState, nextState);
    } else {
      this.srtpSSRCStates[header.ssrc] = nextState;
    }
    return dec;
  }
  get rtpAuthTagLength() {
    return this.profile === ProtectionProfileAeadAes128Gcm ? 16 : 10;
  }
};

// ../rtp/src/srtp/srtp.ts
var SrtpSession = class extends Session {
  constructor(config) {
    super(SrtpContext2);
    this.config = config;
    this.start(
      config.keys.localMasterKey,
      config.keys.localMasterSalt,
      config.keys.remoteMasterKey,
      config.keys.remoteMasterSalt,
      config.profile
    );
  }
  decrypt = (buf) => {
    const [decrypted] = this.remoteContext.decryptRtp(buf);
    return decrypted;
  };
  encrypt(payload, header) {
    return this.localContext.encryptRtp(payload, header);
  }
};

// ../rtp/src/util.ts
var RtpBuilder = class {
  constructor(props) {
    this.props = props;
  }
  sequenceNumber = random16();
  timestamp = random32();
  create(payload) {
    this.sequenceNumber = uint16Add(this.sequenceNumber, 1);
    const elapsed = this.props.between * this.props.clockRate / 1e3;
    this.timestamp = uint32Add(this.timestamp, elapsed);
    const header = new RtpHeader({
      sequenceNumber: this.sequenceNumber,
      timestamp: Number(this.timestamp),
      payloadType: 96,
      extension: true,
      marker: false,
      padding: false
    });
    const rtp = new RtpPacket(header, payload);
    return rtp;
  }
};

// ../dtls/src/flight/client/flight5.ts
var log9 = debug(
  "werift-dtls : packages/dtls/src/flight/client/flight5.ts : log"
);
var Flight5 = class extends Flight {
  constructor(udp, dtls, cipher, srtp) {
    super(udp, dtls, 5, 7);
    this.cipher = cipher;
    this.srtp = srtp;
  }
  handleHandshake(handshake) {
    this.dtls.bufferHandshakeCache([handshake], false, 4);
    const message = (() => {
      switch (handshake.msg_type) {
        case 2 /* server_hello_2 */:
          return ServerHello.deSerialize(handshake.fragment);
        case 11 /* certificate_11 */:
          return Certificate2.deSerialize(handshake.fragment);
        case 12 /* server_key_exchange_12 */:
          return ServerKeyExchange.deSerialize(handshake.fragment);
        case 13 /* certificate_request_13 */:
          return ServerCertificateRequest.deSerialize(handshake.fragment);
        case 14 /* server_hello_done_14 */:
          return ServerHelloDone.deSerialize(handshake.fragment);
      }
    })();
    if (message) {
      handlers[message.msgType]({
        dtls: this.dtls,
        cipher: this.cipher,
        srtp: this.srtp
      })(message);
    }
  }
  async exec() {
    if (this.dtls.flight === 5) {
      log9(this.dtls.sessionId, "flight5 twice");
      this.send(this.dtls.lastMessage);
      return;
    }
    this.dtls.flight = 5;
    const needCertificate = this.dtls.requestedCertificateTypes.length > 0;
    log9(this.dtls.sessionId, "send flight5", needCertificate);
    const messages = [
      needCertificate && this.sendCertificate(),
      this.sendClientKeyExchange(),
      needCertificate && this.sendCertificateVerify(),
      this.sendChangeCipherSpec(),
      this.sendFinished()
    ].filter((v) => v);
    this.dtls.lastMessage = messages;
    await this.transmit(messages);
  }
  sendCertificate() {
    const certificate = new Certificate2([Buffer.from(this.cipher.localCert)]);
    const packets = this.createPacket([certificate]);
    const buf = Buffer.concat(packets.map((v) => v.serialize()));
    return buf;
  }
  sendClientKeyExchange() {
    if (!this.cipher.localKeyPair) throw new Error();
    const clientKeyExchange = new ClientKeyExchange(
      this.cipher.localKeyPair.publicKey
    );
    const packets = this.createPacket([clientKeyExchange]);
    const buf = Buffer.concat(packets.map((v) => v.serialize()));
    const localKeyPair = this.cipher.localKeyPair;
    const remoteKeyPair = this.cipher.remoteKeyPair;
    if (!remoteKeyPair.publicKey) throw new Error("not exist");
    const preMasterSecret = prfPreMasterSecret(
      remoteKeyPair.publicKey,
      localKeyPair.privateKey,
      localKeyPair.curve
    );
    log9(
      this.dtls.sessionId,
      "extendedMasterSecret",
      this.dtls.options.extendedMasterSecret,
      this.dtls.remoteExtendedMasterSecret
    );
    const handshakes = Buffer.concat(
      this.dtls.sortedHandshakeCache.map((v) => v.serialize())
    );
    this.cipher.masterSecret = this.dtls.options.extendedMasterSecret && this.dtls.remoteExtendedMasterSecret ? prfExtendedMasterSecret(preMasterSecret, handshakes) : prfMasterSecret(
      preMasterSecret,
      this.cipher.localRandom.serialize(),
      this.cipher.remoteRandom.serialize()
    );
    this.cipher.cipher = createCipher(this.cipher.cipherSuite);
    this.cipher.cipher.init(
      this.cipher.masterSecret,
      this.cipher.remoteRandom.serialize(),
      this.cipher.localRandom.serialize()
    );
    log9(this.dtls.sessionId, "cipher", this.cipher.cipher.summary);
    return buf;
  }
  sendCertificateVerify() {
    const cache = Buffer.concat(
      this.dtls.sortedHandshakeCache.map((v) => v.serialize())
    );
    const signed = this.cipher.signatureData(cache, "sha256");
    const signatureScheme = (() => {
      switch (this.cipher.signatureHashAlgorithm?.signature) {
        case SignatureAlgorithm.ecdsa_3:
          return SignatureScheme.ecdsa_secp256r1_sha256;
        case SignatureAlgorithm.rsa_1:
          return SignatureScheme.rsa_pkcs1_sha256;
      }
    })();
    if (!signatureScheme) throw new Error();
    log9(
      this.dtls.sessionId,
      "signatureScheme",
      this.cipher.signatureHashAlgorithm?.signature,
      signatureScheme
    );
    const certificateVerify = new CertificateVerify(signatureScheme, signed);
    const packets = this.createPacket([certificateVerify]);
    const buf = Buffer.concat(packets.map((v) => v.serialize()));
    return buf;
  }
  sendChangeCipherSpec() {
    const changeCipherSpec = ChangeCipherSpec.createEmpty().serialize();
    const packets = createPlaintext(this.dtls)(
      [{ type: 20 /* changeCipherSpec */, fragment: changeCipherSpec }],
      ++this.dtls.recordSequenceNumber
    );
    const buf = Buffer.concat(packets.map((v) => v.serialize()));
    return buf;
  }
  sendFinished() {
    const cache = Buffer.concat(
      this.dtls.sortedHandshakeCache.map((v) => v.serialize())
    );
    const localVerifyData = this.cipher.verifyData(cache);
    const finish = new Finished(localVerifyData);
    this.dtls.epoch = 1;
    const [packet] = this.createPacket([finish]);
    this.dtls.recordSequenceNumber = 0;
    const buf = this.cipher.encryptPacket(packet).serialize();
    log9(this.dtls.sessionId, "finished", this.cipher.cipher.summary);
    return buf;
  }
};
var handlers = {};
handlers[2 /* server_hello_2 */] = ({ cipher, srtp, dtls }) => (message) => {
  log9(dtls.sessionId, "serverHello", message.cipherSuite);
  cipher.remoteRandom = DtlsRandom.from(message.random);
  cipher.cipherSuite = message.cipherSuite;
  log9(dtls.sessionId, "selected cipherSuite", cipher.cipherSuite);
  if (message.extensions) {
    message.extensions.forEach((extension) => {
      switch (extension.type) {
        case UseSRTP.type:
          {
            const useSrtp = UseSRTP.fromData(extension.data);
            const profile = SrtpContext.findMatchingSRTPProfile(
              useSrtp.profiles,
              dtls.options.srtpProfiles || []
            );
            log9(dtls.sessionId, "selected srtp profile", profile);
            if (profile == void 0) return;
            srtp.srtpProfile = profile;
          }
          break;
        case ExtendedMasterSecret.type:
          dtls.remoteExtendedMasterSecret = true;
          break;
        case RenegotiationIndication.type:
          log9(dtls.sessionId, "RenegotiationIndication");
          break;
      }
    });
  }
};
handlers[11 /* certificate_11 */] = ({ cipher, dtls }) => (message) => {
  log9(dtls.sessionId, "handshake certificate", message);
  cipher.remoteCertificate = message.certificateList[0];
};
handlers[12 /* server_key_exchange_12 */] = ({ cipher, dtls }) => (message) => {
  if (!cipher.localRandom || !cipher.remoteRandom) throw new Error();
  log9(dtls.sessionId, "ServerKeyExchange", message);
  log9(dtls.sessionId, "selected curve", message.namedCurve);
  cipher.remoteKeyPair = {
    curve: message.namedCurve,
    publicKey: message.publicKey
  };
  cipher.localKeyPair = generateKeyPair(message.namedCurve);
};
handlers[13 /* certificate_request_13 */] = ({ dtls }) => (message) => {
  log9(dtls.sessionId, "certificate_request", message);
  dtls.requestedCertificateTypes = message.certificateTypes;
  dtls.requestedSignatureAlgorithms = message.signatures;
};
handlers[14 /* server_hello_done_14 */] = ({ dtls }) => (msg) => {
  log9(dtls.sessionId, "server_hello_done", msg);
};

// ../dtls/src/handshake/message/server/helloVerifyRequest.ts
import { decode as decode15, encode as encode16, types as types16 } from "@shinyoshiaki/binary-data";
var ServerHelloVerifyRequest = class _ServerHelloVerifyRequest {
  constructor(serverVersion, cookie) {
    this.serverVersion = serverVersion;
    this.cookie = cookie;
  }
  msgType = 3 /* hello_verify_request_3 */;
  messageSeq;
  static spec = {
    serverVersion: ProtocolVersion,
    cookie: types16.buffer(types16.uint8)
  };
  static createEmpty() {
    return new _ServerHelloVerifyRequest(void 0, void 0);
  }
  static deSerialize(buf) {
    return new _ServerHelloVerifyRequest(
      ...Object.values(decode15(buf, _ServerHelloVerifyRequest.spec))
    );
  }
  serialize() {
    const res = encode16(this, _ServerHelloVerifyRequest.spec).slice();
    return Buffer.from(res);
  }
  get version() {
    return {
      major: 255 - this.serverVersion.major,
      minor: 255 - this.serverVersion.minor
    };
  }
  toFragment() {
    const body = this.serialize();
    return new FragmentedHandshake(
      this.msgType,
      body.length,
      this.messageSeq,
      0,
      body.length,
      body
    );
  }
};

// ../dtls/src/socket.ts
import { decode as decode19, types as types20 } from "@shinyoshiaki/binary-data";
import { setTimeout as setTimeout3 } from "timers/promises";

// ../dtls/src/context/dtls.ts
var log10 = debug("werift-dtls : packages/dtls/src/context/dtls.ts : log");
var DtlsContext = class {
  constructor(options, sessionType) {
    this.options = options;
    this.sessionType = sessionType;
  }
  version = { major: 255 - 1, minor: 255 - 2 };
  lastFlight = [];
  lastMessage = [];
  recordSequenceNumber = 0;
  sequenceNumber = 0;
  epoch = 0;
  flight = 0;
  handshakeCache = {};
  cookie;
  requestedCertificateTypes = [];
  requestedSignatureAlgorithms = [];
  remoteExtendedMasterSecret = false;
  get sessionId() {
    return this.cookie ? this.cookie.toString("hex").slice(0, 10) : "";
  }
  get sortedHandshakeCache() {
    return Object.entries(this.handshakeCache).sort(([a], [b]) => Number(a) - Number(b)).flatMap(
      ([, { data }]) => data.sort((a, b) => a.message_seq - b.message_seq)
    );
  }
  checkHandshakesExist = (handshakes) => !handshakes.find(
    (type) => this.sortedHandshakeCache.find((h) => h.msg_type === type) == void 0
  );
  bufferHandshakeCache(handshakes, isLocal, flight) {
    if (!this.handshakeCache[flight]) {
      this.handshakeCache[flight] = { data: [], isLocal, flight };
    }
    const filtered = handshakes.filter((h) => {
      const exist = this.handshakeCache[flight].data.find(
        (t) => t.msg_type === h.msg_type
      );
      if (exist) {
        log10(this.sessionId, "exist", exist.summary, isLocal, flight);
        return false;
      }
      return true;
    });
    this.handshakeCache[flight].data = [
      ...this.handshakeCache[flight].data,
      ...filtered
    ];
  }
};

// ../dtls/src/context/transport.ts
var TransportContext = class {
  constructor(socket) {
    this.socket = socket;
  }
  send = (buf, addr) => {
    return this.socket.send(buf, addr);
  };
};

// ../dtls/src/handshake/extensions/ellipticCurves.ts
import { decode as decode16, encode as encode17, types as types17 } from "@shinyoshiaki/binary-data";
var EllipticCurves = class _EllipticCurves {
  static type = 10;
  static spec = {
    type: types17.uint16be,
    data: types17.array(types17.uint16be, types17.uint16be, "bytes")
  };
  type = _EllipticCurves.type;
  data = [];
  constructor(props = {}) {
    Object.assign(this, props);
  }
  static createEmpty() {
    return new _EllipticCurves();
  }
  static fromData(buf) {
    return new _EllipticCurves({
      type: _EllipticCurves.type,
      data: decode16(buf, _EllipticCurves.spec.data)
    });
  }
  static deSerialize(buf) {
    return new _EllipticCurves(decode16(buf, _EllipticCurves.spec));
  }
  serialize() {
    return Buffer.from(encode17(this, _EllipticCurves.spec).slice());
  }
  get extension() {
    return {
      type: this.type,
      data: this.serialize().slice(2)
    };
  }
};

// ../dtls/src/handshake/extensions/signature.ts
import { decode as decode17, encode as encode18, types as types18 } from "@shinyoshiaki/binary-data";
var Signature = class _Signature {
  static type = 13;
  static spec = {
    type: types18.uint16be,
    data: types18.array(
      { hash: types18.uint8, signature: types18.uint8 },
      types18.uint16be,
      "bytes"
    )
  };
  type = _Signature.type;
  data = [];
  constructor(props = {}) {
    Object.assign(this, props);
  }
  static createEmpty() {
    const v = new _Signature();
    return v;
  }
  static deSerialize(buf) {
    return new _Signature(decode17(buf, _Signature.spec));
  }
  serialize() {
    const res = encode18(this, _Signature.spec).slice();
    return Buffer.from(res);
  }
  static fromData(buf) {
    const type = Buffer.alloc(2);
    type.writeUInt16BE(_Signature.type);
    return _Signature.deSerialize(Buffer.concat([type, buf]));
  }
  get extension() {
    return {
      type: this.type,
      data: this.serialize().slice(2)
    };
  }
};

// ../dtls/src/handshake/message/alert.ts
import { decode as decode18, encode as encode19, types as types19 } from "@shinyoshiaki/binary-data";
var Alert = class _Alert {
  constructor(level, description) {
    this.level = level;
    this.description = description;
  }
  static spec = {
    level: types19.uint8,
    description: types19.uint8
  };
  static deSerialize(buf) {
    return new _Alert(
      ...Object.values(decode18(buf, _Alert.spec))
    );
  }
  serialize() {
    const res = encode19(this, _Alert.spec).slice();
    return Buffer.from(res);
  }
};

// ../dtls/src/record/receive.ts
var log11 = debug("werift-dtls : packages/dtls/record/receive.ts : log");
var err3 = debug("werift-dtls : packages/dtls/record/receive.ts : err");
var parsePacket = (data) => {
  let start = 0;
  const packets = [];
  while (data.length > start) {
    const fragmentLength = data.readUInt16BE(start + 11);
    if (data.length < start + (12 + fragmentLength)) {
      break;
    }
    const packet = DtlsPlaintext.deSerialize(data.subarray(start));
    packets.push(packet);
    start += 13 + fragmentLength;
  }
  return packets;
};
var parsePlainText = (dtls, cipher) => (plain) => {
  const contentType = plain.recordLayerHeader.contentType;
  switch (contentType) {
    case 20 /* changeCipherSpec */: {
      log11(dtls.sessionId, "change cipher spec");
      return [
        {
          type: 20 /* changeCipherSpec */,
          data: void 0
        }
      ];
    }
    case 22 /* handshake */: {
      let raw = plain.fragment;
      try {
        if (plain.recordLayerHeader.epoch > 0) {
          log11(dtls.sessionId, "decrypt handshake");
          raw = cipher.decryptPacket(plain);
        }
      } catch (error) {
        err3(dtls.sessionId, "decrypt failed", error);
        throw error;
      }
      try {
        let start = 0;
        const handshakes = [];
        while (raw.length > start) {
          const handshake = FragmentedHandshake.deSerialize(
            raw.subarray(start)
          );
          handshakes.push({ type: 22 /* handshake */, data: handshake });
          start += handshake.fragment_length + 12;
        }
        return handshakes;
      } catch (error) {
        err3(dtls.sessionId, "decSerialize failed", error, raw);
        throw error;
      }
    }
    case 23 /* applicationData */: {
      return [
        {
          type: 23 /* applicationData */,
          data: cipher.decryptPacket(plain)
        }
      ];
    }
    case 21 /* alert */: {
      let alert = Alert.deSerialize(plain.fragment);
      if (AlertDesc[alert.description] == void 0) {
        const dec = cipher.decryptPacket(plain);
        alert = Alert.deSerialize(dec);
      }
      err3(
        dtls.sessionId,
        "ContentType.alert",
        alert,
        AlertDesc[alert.description],
        "flight",
        dtls.flight,
        "lastFlight",
        dtls.lastFlight
      );
      if (alert.level > 1) {
        throw new Error("alert fatal error");
      }
      return [{ type: 21 /* alert */, data: void 0 }];
    }
    default: {
      return [{ type: 21 /* alert */, data: void 0 }];
    }
  }
};

// ../dtls/src/socket.ts
var log12 = debug("werift-dtls : packages/dtls/src/socket.ts : log");
var err4 = debug("werift-dtls : packages/dtls/src/socket.ts : err");
var DtlsSocket = class {
  constructor(options, sessionType) {
    this.options = options;
    this.sessionType = sessionType;
    this.dtls = new DtlsContext(this.options, this.sessionType);
    this.cipher = new CipherContext(
      this.sessionType,
      this.options.cert,
      this.options.key,
      this.options.signatureHash
    );
    this.transport = new TransportContext(this.options.transport);
    this.setupExtensions();
    this.transport.socket.onData = this.udpOnMessage;
  }
  onConnect = new Event2();
  onData = new Event2();
  onError = new Event2();
  onClose = new Event2();
  transport;
  cipher;
  dtls;
  srtp = new SrtpContext();
  connected = false;
  extensions = [];
  onHandleHandshakes;
  bufferFragmentedHandshakes = [];
  renegotiation() {
    log12("renegotiation", this.sessionType);
    this.connected = false;
    this.cipher = new CipherContext(
      this.sessionType,
      this.options.cert,
      this.options.key,
      this.options.signatureHash
    );
    this.dtls = new DtlsContext(this.options, this.sessionType);
    this.srtp = new SrtpContext();
    this.extensions = [];
    this.bufferFragmentedHandshakes = [];
  }
  udpOnMessage = (data) => {
    const packets = parsePacket(data);
    for (const packet of packets) {
      try {
        const messages = parsePlainText(this.dtls, this.cipher)(packet);
        for (const message of messages) {
          switch (message.type) {
            case 22 /* handshake */:
              {
                const handshake = message.data;
                const handshakes = this.handleFragmentHandshake([handshake]);
                const assembled = Object.values(
                  handshakes.reduce(
                    (acc, cur) => {
                      if (!acc[cur.msg_type]) acc[cur.msg_type] = [];
                      acc[cur.msg_type].push(cur);
                      return acc;
                    },
                    {}
                  )
                ).map((v) => FragmentedHandshake.assemble(v)).sort((a, b) => a.msg_type - b.msg_type);
                this.onHandleHandshakes(assembled).catch((error) => {
                  err4(this.dtls.sessionId, "onHandleHandshakes error", error);
                  this.onError.execute(error);
                });
              }
              break;
            case 23 /* applicationData */:
              {
                this.onData.execute(message.data);
              }
              break;
            case 21 /* alert */:
              this.onClose.execute();
              break;
          }
        }
      } catch (error) {
        err4(this.dtls.sessionId, "catch udpOnMessage error", error);
      }
    }
  };
  setupExtensions() {
    log12(this.dtls.sessionId, "support srtpProfiles", this.options.srtpProfiles);
    if (this.options.srtpProfiles && this.options.srtpProfiles.length > 0) {
      const useSrtp = UseSRTP.create(
        this.options.srtpProfiles,
        Buffer.from([0])
      );
      this.extensions.push(useSrtp.extension);
    }
    {
      const curve = EllipticCurves.createEmpty();
      curve.data = NamedCurveAlgorithmList;
      this.extensions.push(curve.extension);
    }
    {
      const signature = Signature.createEmpty();
      signature.data = signatures;
      this.extensions.push(signature.extension);
    }
    if (this.options.extendedMasterSecret) {
      this.extensions.push({
        type: ExtendedMasterSecret.type,
        data: Buffer.alloc(0)
      });
    }
    {
      const renegotiationIndication = RenegotiationIndication.createEmpty();
      this.extensions.push(renegotiationIndication.extension);
    }
  }
  waitForReady = (condition) => new Promise(async (r, f) => {
    for (let i = 0; i < 10; i++) {
      if (condition()) {
        r();
        break;
      } else {
        await setTimeout3(100 * i);
      }
    }
    f("waitForReady timeout");
  });
  handleFragmentHandshake(messages) {
    let handshakes = messages.filter((v) => {
      if (v.fragment_length !== v.length) {
        this.bufferFragmentedHandshakes.push(v);
        return false;
      }
      return true;
    });
    if (this.bufferFragmentedHandshakes.length > 1) {
      const [last] = this.bufferFragmentedHandshakes.slice(-1);
      if (last.fragment_offset + last.fragment_length === last.length) {
        handshakes = [...this.bufferFragmentedHandshakes, ...handshakes];
        this.bufferFragmentedHandshakes = [];
      }
    }
    return handshakes;
  }
  /**send application data */
  send = async (buf, addr) => {
    const pkt = createPlaintext(this.dtls)(
      [{ type: 23 /* applicationData */, fragment: buf }],
      ++this.dtls.recordSequenceNumber
    )[0];
    await this.transport.send(this.cipher.encryptPacket(pkt).serialize(), addr);
  };
  close() {
    this.transport.socket.close();
  }
  extractSessionKeys(keyLength2, saltLength2) {
    const keyingMaterial = this.exportKeyingMaterial(
      "EXTRACTOR-dtls_srtp",
      keyLength2 * 2 + saltLength2 * 2
    );
    const { clientKey, serverKey, clientSalt, serverSalt } = decode19(
      keyingMaterial,
      {
        clientKey: types20.buffer(keyLength2),
        serverKey: types20.buffer(keyLength2),
        clientSalt: types20.buffer(saltLength2),
        serverSalt: types20.buffer(saltLength2)
      }
    );
    if (this.sessionType === SessionType.CLIENT) {
      return {
        localKey: clientKey,
        localSalt: clientSalt,
        remoteKey: serverKey,
        remoteSalt: serverSalt
      };
    } else {
      return {
        localKey: serverKey,
        localSalt: serverSalt,
        remoteKey: clientKey,
        remoteSalt: clientSalt
      };
    }
  }
  exportKeyingMaterial(label, length) {
    return exportKeyingMaterial(
      label,
      length,
      this.cipher.masterSecret,
      this.cipher.localRandom.serialize(),
      this.cipher.remoteRandom.serialize(),
      this.sessionType === SessionType.CLIENT
    );
  }
  get remoteCertificate() {
    return this.cipher.remoteCertificate;
  }
};

// ../dtls/src/client.ts
var log13 = debug("werift-dtls : packages/dtls/src/client.ts : log");
var DtlsClient = class extends DtlsSocket {
  constructor(options) {
    super(options, SessionType.CLIENT);
    this.onHandleHandshakes = this.handleHandshakes;
    log13(this.dtls.sessionId, "start client");
  }
  async connect() {
    await new Flight1(this.transport, this.dtls, this.cipher).exec(
      this.extensions
    );
  }
  flight5;
  handleHandshakes = async (assembled) => {
    log13(
      this.dtls.sessionId,
      "handleHandshakes",
      assembled.map((a) => a.msg_type)
    );
    for (const handshake of assembled) {
      switch (handshake.msg_type) {
        // flight2
        case 3 /* hello_verify_request_3 */:
          {
            const verifyReq = ServerHelloVerifyRequest.deSerialize(
              handshake.fragment
            );
            await new Flight3(this.transport, this.dtls).exec(verifyReq);
          }
          break;
        // flight 4
        case 2 /* server_hello_2 */:
          {
            if (this.connected) return;
            this.flight5 = new Flight5(
              this.transport,
              this.dtls,
              this.cipher,
              this.srtp
            );
            this.flight5.handleHandshake(handshake);
          }
          break;
        case 11 /* certificate_11 */:
        case 12 /* server_key_exchange_12 */:
        case 13 /* certificate_request_13 */:
          {
            await this.waitForReady(() => !!this.flight5);
            this.flight5?.handleHandshake(handshake);
          }
          break;
        case 14 /* server_hello_done_14 */:
          {
            await this.waitForReady(() => !!this.flight5);
            this.flight5?.handleHandshake(handshake);
            const targets = [
              11,
              12,
              this.options.certificateRequest && 13
            ].filter((n) => typeof n === "number");
            await this.waitForReady(
              () => this.dtls.checkHandshakesExist(targets)
            );
            await this.flight5?.exec();
          }
          break;
        // flight 6
        case 20 /* finished_20 */:
          {
            this.dtls.flight = 7;
            this.connected = true;
            this.onConnect.execute();
            log13(this.dtls.sessionId, "dtls connected");
          }
          break;
      }
    }
  };
};

// ../dtls/src/flight/server/flight2.ts
import { randomBytes as randomBytes4 } from "crypto";
var log14 = debug("werift-dtls : packages/dtls/flight/server/flight2.ts : log");
var flight2 = (udp, dtls, cipher, srtp) => (clientHello) => {
  log14("dtls version", clientHello.clientVersion);
  dtls.flight = 2;
  dtls.recordSequenceNumber = 0;
  dtls.sequenceNumber = 0;
  clientHello.extensions.forEach((extension) => {
    switch (extension.type) {
      case EllipticCurves.type:
        {
          const curves = EllipticCurves.fromData(extension.data).data;
          log14(dtls.sessionId, "curves", curves);
          const curve = curves.filter(
            (curve2) => NamedCurveAlgorithmList.includes(curve2)
          )[0];
          cipher.namedCurve = curve;
          log14(dtls.sessionId, "curve selected", cipher.namedCurve);
        }
        break;
      case Signature.type:
        {
          if (!cipher.signatureHashAlgorithm)
            throw new Error("need to set certificate");
          const signatureHash = Signature.fromData(extension.data).data;
          log14(dtls.sessionId, "hash,signature", signatureHash);
          const signature = signatureHash.find(
            (v) => v.signature === cipher.signatureHashAlgorithm?.signature
          )?.signature;
          const hash2 = signatureHash.find(
            (v) => v.hash === cipher.signatureHashAlgorithm?.hash
          )?.hash;
          if (signature == void 0 || hash2 == void 0) {
            throw new Error("invalid signatureHash");
          }
        }
        break;
      case UseSRTP.type:
        {
          if (!dtls.options?.srtpProfiles) return;
          if (dtls.options.srtpProfiles.length === 0) return;
          const useSrtp = UseSRTP.fromData(extension.data);
          log14(dtls.sessionId, "srtp profiles", useSrtp.profiles);
          const profile = SrtpContext.findMatchingSRTPProfile(
            useSrtp.profiles,
            dtls.options?.srtpProfiles
          );
          if (!profile) {
            throw new Error();
          }
          srtp.srtpProfile = profile;
          log14(dtls.sessionId, "srtp profile selected", srtp.srtpProfile);
        }
        break;
      case ExtendedMasterSecret.type:
        {
          dtls.remoteExtendedMasterSecret = true;
        }
        break;
      case RenegotiationIndication.type:
        {
          log14(dtls.sessionId, "RenegotiationIndication", extension.data);
        }
        break;
      case 43:
        {
          const data = extension.data.subarray(1);
          const versions = [...data].map((v) => v.toString(10));
          log14("dtls supported version", versions);
        }
        break;
    }
  });
  cipher.localRandom = new DtlsRandom();
  cipher.remoteRandom = DtlsRandom.from(clientHello.random);
  const suites = clientHello.cipherSuites;
  log14(dtls.sessionId, "cipher suites", suites);
  const suite = (() => {
    switch (cipher.signatureHashAlgorithm?.signature) {
      case SignatureAlgorithm.ecdsa_3:
        return CipherSuite.TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256_49195;
      case SignatureAlgorithm.rsa_1:
        return CipherSuite.TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256_49199;
    }
  })();
  if (suite === void 0 || !suites.includes(suite)) {
    throw new Error("dtls cipher suite negotiation failed");
  }
  cipher.cipherSuite = suite;
  log14(dtls.sessionId, "selected cipherSuite", cipher.cipherSuite);
  cipher.localKeyPair = generateKeyPair(cipher.namedCurve);
  dtls.cookie ||= randomBytes4(20);
  const helloVerifyReq = new ServerHelloVerifyRequest(
    {
      major: 255 - 1,
      minor: 255 - 2
    },
    dtls.cookie
  );
  const fragments = createFragments(dtls)([helloVerifyReq]);
  const packets = createPlaintext(dtls)(
    fragments.map((fragment) => ({
      type: 22 /* handshake */,
      fragment: fragment.serialize()
    })),
    ++dtls.recordSequenceNumber
  );
  const chunk = packets.map((v) => v.serialize());
  for (const buf of chunk) {
    udp.send(buf);
  }
};

// ../dtls/src/flight/server/flight4.ts
var log15 = debug("werift-dtls : packages/dtls/flight/server/flight4.ts : log");
var Flight4 = class extends Flight {
  constructor(udp, dtls, cipher, srtp) {
    super(udp, dtls, 4, 6);
    this.cipher = cipher;
    this.srtp = srtp;
  }
  async exec(clientHello, certificateRequest = false) {
    if (this.dtls.flight === 4) {
      log15(this.dtls.sessionId, "flight4 twice");
      this.send(this.dtls.lastMessage);
      return;
    }
    this.dtls.flight = 4;
    this.dtls.sequenceNumber = 1;
    this.dtls.bufferHandshakeCache([clientHello], false, 4);
    const messages = [
      this.sendServerHello(),
      this.sendCertificate(),
      this.sendServerKeyExchange(),
      certificateRequest && this.sendCertificateRequest(),
      this.sendServerHelloDone()
    ].filter((v) => v);
    this.dtls.lastMessage = messages;
    await this.transmit(messages);
  }
  sendServerHello() {
    const extensions = [];
    if (this.srtp.srtpProfile) {
      extensions.push(
        UseSRTP.create([this.srtp.srtpProfile], Buffer.from([0])).extension
      );
    }
    if (this.dtls.options.extendedMasterSecret) {
      extensions.push({
        type: ExtendedMasterSecret.type,
        data: Buffer.alloc(0)
      });
    }
    const renegotiationIndication = RenegotiationIndication.createEmpty();
    extensions.push(renegotiationIndication.extension);
    const serverHello = new ServerHello(
      this.dtls.version,
      this.cipher.localRandom,
      Buffer.from([0]),
      this.cipher.cipherSuite,
      0,
      // do not compression
      extensions
    );
    const packets = this.createPacket([serverHello]);
    return Buffer.concat(packets.map((v) => v.serialize()));
  }
  // 7.4.2 Server Certificate
  sendCertificate() {
    const certificate = new Certificate2([Buffer.from(this.cipher.localCert)]);
    const packets = this.createPacket([certificate]);
    return Buffer.concat(packets.map((v) => v.serialize()));
  }
  sendServerKeyExchange() {
    const signature = this.cipher.generateKeySignature("sha256");
    if (!this.cipher.signatureHashAlgorithm) throw new Error("not exist");
    const keyExchange = new ServerKeyExchange(
      CurveType.named_curve_3,
      this.cipher.namedCurve,
      this.cipher.localKeyPair.publicKey.length,
      this.cipher.localKeyPair.publicKey,
      this.cipher.signatureHashAlgorithm.hash,
      this.cipher.signatureHashAlgorithm.signature,
      signature.length,
      signature
    );
    const packets = this.createPacket([keyExchange]);
    return Buffer.concat(packets.map((v) => v.serialize()));
  }
  // 7.4.4.  Certificate Request
  sendCertificateRequest() {
    const handshake = new ServerCertificateRequest(
      certificateTypes,
      signatures,
      []
    );
    log15(this.dtls.sessionId, "sendCertificateRequest", handshake);
    const packets = this.createPacket([handshake]);
    return Buffer.concat(packets.map((v) => v.serialize()));
  }
  sendServerHelloDone() {
    const handshake = new ServerHelloDone();
    const packets = this.createPacket([handshake]);
    return Buffer.concat(packets.map((v) => v.serialize()));
  }
};

// ../dtls/src/flight/server/flight6.ts
var log16 = debug("werift-dtls : packages/dtls/flight/server/flight6.ts");
var Flight6 = class extends Flight {
  constructor(udp, dtls, cipher) {
    super(udp, dtls, 6);
    this.cipher = cipher;
  }
  handleHandshake(handshake) {
    this.dtls.bufferHandshakeCache([handshake], false, 5);
    const message = (() => {
      switch (handshake.msg_type) {
        case 11 /* certificate_11 */:
          return Certificate2.deSerialize(handshake.fragment);
        case 15 /* certificate_verify_15 */:
          return CertificateVerify.deSerialize(handshake.fragment);
        case 16 /* client_key_exchange_16 */:
          return ClientKeyExchange.deSerialize(handshake.fragment);
        case 20 /* finished_20 */:
          return Finished.deSerialize(handshake.fragment);
      }
    })();
    if (message) {
      const handler = handlers2[message.msgType];
      if (!handler) {
        return;
      }
      handler({ dtls: this.dtls, cipher: this.cipher })(message);
    }
  }
  async exec() {
    if (this.dtls.flight === 6) {
      log16(this.dtls.sessionId, "flight6 twice");
      this.send(this.dtls.lastMessage);
      return;
    }
    this.dtls.flight = 6;
    const messages = [this.sendChangeCipherSpec(), this.sendFinished()];
    this.dtls.lastMessage = messages;
    await this.transmit(messages);
  }
  sendChangeCipherSpec() {
    const changeCipherSpec = ChangeCipherSpec.createEmpty().serialize();
    const packets = createPlaintext(this.dtls)(
      [{ type: 20 /* changeCipherSpec */, fragment: changeCipherSpec }],
      ++this.dtls.recordSequenceNumber
    );
    const buf = Buffer.concat(packets.map((v) => v.serialize()));
    return buf;
  }
  sendFinished() {
    const cache = Buffer.concat(
      this.dtls.sortedHandshakeCache.map((v) => v.serialize())
    );
    const localVerifyData = this.cipher.verifyData(cache);
    const finish = new Finished(localVerifyData);
    this.dtls.epoch = 1;
    const [packet] = this.createPacket([finish]);
    this.dtls.recordSequenceNumber = 0;
    const buf = this.cipher.encryptPacket(packet).serialize();
    return buf;
  }
};
var handlers2 = {};
handlers2[16 /* client_key_exchange_16 */] = ({ cipher, dtls }) => (message) => {
  cipher.remoteKeyPair = {
    curve: cipher.namedCurve,
    publicKey: message.publicKey
  };
  if (!cipher.remoteKeyPair.publicKey || !cipher.localKeyPair || !cipher.remoteRandom || !cipher.localRandom)
    throw new Error("not exist");
  const preMasterSecret = prfPreMasterSecret(
    cipher.remoteKeyPair.publicKey,
    cipher.localKeyPair.privateKey,
    cipher.localKeyPair.curve
  );
  log16(
    dtls.sessionId,
    "extendedMasterSecret",
    dtls.options.extendedMasterSecret,
    dtls.remoteExtendedMasterSecret
  );
  const handshakes = Buffer.concat(
    dtls.sortedHandshakeCache.map((v) => v.serialize())
  );
  cipher.masterSecret = dtls.options.extendedMasterSecret && dtls.remoteExtendedMasterSecret ? prfExtendedMasterSecret(preMasterSecret, handshakes) : prfMasterSecret(
    preMasterSecret,
    cipher.remoteRandom.serialize(),
    cipher.localRandom.serialize()
  );
  cipher.cipher = createCipher(cipher.cipherSuite);
  cipher.cipher.init(
    cipher.masterSecret,
    cipher.localRandom.serialize(),
    cipher.remoteRandom.serialize()
  );
  log16(dtls.sessionId, "setup cipher", cipher.cipher.summary);
};
handlers2[11 /* certificate_11 */] = ({ cipher, dtls }) => (message) => {
  log16(dtls.sessionId, "handshake certificate", message);
  cipher.remoteCertificate = message.certificateList[0];
};
handlers2[15 /* certificate_verify_15 */] = ({ cipher, dtls }) => (message) => {
  if (!cipher.remoteCertificate) {
    throw new Error("client certificate missing before certificate verify");
  }
  log16(dtls.sessionId, "certificate_verify", message.algorithm);
};
handlers2[20 /* finished_20 */] = ({ dtls }) => (message) => {
  log16(dtls.sessionId, "finished", message);
};

// ../dtls/src/server.ts
var log17 = debug("werift-dtls : packages/dtls/src/server.ts : log");
var DtlsServer = class extends DtlsSocket {
  constructor(options) {
    super(options, SessionType.SERVER);
    this.onHandleHandshakes = this.handleHandshakes;
    log17(this.dtls.sessionId, "start server");
  }
  flight6;
  handleHandshakes = async (assembled) => {
    log17(
      this.dtls.sessionId,
      "handleHandshakes",
      assembled.map((a) => a.msg_type)
    );
    for (const handshake of assembled) {
      switch (handshake.msg_type) {
        // flight1,3
        case 1 /* client_hello_1 */:
          {
            if (this.connected) {
              this.renegotiation();
            }
            const clientHello = ClientHello.deSerialize(handshake.fragment);
            if (clientHello.cookie.length === 0) {
              log17(this.dtls.sessionId, "send flight2");
              flight2(
                this.transport,
                this.dtls,
                this.cipher,
                this.srtp
              )(clientHello);
            } else if (this.dtls.cookie && clientHello.cookie.equals(this.dtls.cookie)) {
              log17(this.dtls.sessionId, "send flight4");
              await new Flight4(
                this.transport,
                this.dtls,
                this.cipher,
                this.srtp
              ).exec(handshake, this.options.certificateRequest);
            } else {
              log17("wrong state", {
                dtlsCookie: this.dtls.cookie?.toString("hex").slice(10),
                helloCookie: clientHello.cookie.toString("hex").slice(10)
              });
            }
          }
          break;
        // flight 5
        case 11 /* certificate_11 */:
        case 15 /* certificate_verify_15 */:
        case 16 /* client_key_exchange_16 */:
          {
            if (this.connected) return;
            this.flight6 = new Flight6(this.transport, this.dtls, this.cipher);
            this.flight6.handleHandshake(handshake);
          }
          break;
        case 20 /* finished_20 */:
          {
            await this.waitForReady(() => !!this.flight6);
            this.flight6?.handleHandshake(handshake);
            const requiredHandshakes = [
              16,
              this.options.certificateRequest && 11,
              this.options.certificateRequest && 15
            ].filter((type) => typeof type === "number");
            await this.waitForReady(
              () => this.dtls.checkHandshakesExist(requiredHandshakes)
            );
            await this.flight6?.exec();
            this.connected = true;
            this.onConnect.execute();
            log17(this.dtls.sessionId, "dtls connected");
          }
          break;
      }
    }
  };
};

// ../ice-server/src/stun/const.ts
var COOKIE = 554869826;
var FINGERPRINT_LENGTH = 8;
var FINGERPRINT_XOR = 1398035790;
var HEADER_LENGTH = 20;
var INTEGRITY_LENGTH = 24;
var IPV4_PROTOCOL = 1;
var IPV6_PROTOCOL = 2;
var RETRY_MAX = 6;
var RETRY_RTO = 50;
var AttributeKeys = [
  "FINGERPRINT",
  "MESSAGE-INTEGRITY",
  "MESSAGE-INTEGRITY-SHA256",
  "CHANGE-REQUEST",
  "PRIORITY",
  "USERNAME",
  "USERHASH",
  "ICE-CONTROLLING",
  "SOURCE-ADDRESS",
  "USE-CANDIDATE",
  "ICE-CONTROLLED",
  "ERROR-CODE",
  "UNKNOWN-ATTRIBUTES",
  "XOR-MAPPED-ADDRESS",
  "CHANGED-ADDRESS",
  "LIFETIME",
  "REQUESTED-TRANSPORT",
  "NONCE",
  "REALM",
  "REQUESTED-ADDRESS-FAMILY",
  "EVEN-PORT",
  "PASSWORD-ALGORITHM",
  "PASSWORD-ALGORITHMS",
  "XOR-RELAYED-ADDRESS",
  "RESERVATION-TOKEN",
  "CHANNEL-NUMBER",
  "XOR-PEER-ADDRESS",
  "DATA",
  "SOFTWARE",
  "MAPPED-ADDRESS",
  "ALTERNATE-DOMAIN",
  "ALTERNATE-SERVER",
  "RESPONSE-ORIGIN",
  "OTHER-ADDRESS"
];
var classes = /* @__PURE__ */ ((classes2) => {
  classes2[classes2["REQUEST"] = 0] = "REQUEST";
  classes2[classes2["INDICATION"] = 16] = "INDICATION";
  classes2[classes2["RESPONSE"] = 256] = "RESPONSE";
  classes2[classes2["ERROR"] = 272] = "ERROR";
  return classes2;
})(classes || {});
var methods = /* @__PURE__ */ ((methods2) => {
  methods2[methods2["BINDING"] = 1] = "BINDING";
  methods2[methods2["SHARED_SECRET"] = 2] = "SHARED_SECRET";
  methods2[methods2["ALLOCATE"] = 3] = "ALLOCATE";
  methods2[methods2["REFRESH"] = 4] = "REFRESH";
  methods2[methods2["SEND"] = 6] = "SEND";
  methods2[methods2["DATA"] = 7] = "DATA";
  methods2[methods2["CREATE_PERMISSION"] = 8] = "CREATE_PERMISSION";
  methods2[methods2["CHANNEL_BIND"] = 9] = "CHANNEL_BIND";
  return methods2;
})(methods || {});
function isComprehensionRequiredAttribute(type) {
  return type >= 0 && type <= 32767;
}
function isStunMessage(data) {
  if (data.length < HEADER_LENGTH) {
    return false;
  }
  if ((data[0] & 192) !== 0) {
    return false;
  }
  if (data.readUInt32BE(4) !== COOKIE) {
    return false;
  }
  const length = data.readUInt16BE(2);
  if (length % 4 !== 0) {
    return false;
  }
  return data.length === HEADER_LENGTH + length;
}

// ../ice/src/stun/tcpFrame.ts
function encodeTcpFrame(data) {
  const header = Buffer.alloc(2);
  header.writeUInt16BE(data.length, 0);
  return Buffer.concat([header, data]);
}
function splitTcpFrames(buffer2) {
  const frames = [];
  let offset = 0;
  while (buffer2.length - offset >= 2) {
    const length = buffer2.readUInt16BE(offset);
    if (buffer2.length - offset < length + 2) {
      break;
    }
    frames.push(buffer2.subarray(offset + 2, offset + 2 + length));
    offset += 2 + length;
  }
  return {
    frames,
    rest: buffer2.subarray(offset)
  };
}

// ../ice/src/stun/tcpProtocol.ts
import { connect as connect3, createServer } from "node:net";

// ../ice-server/src/stun/message.ts
import { createHmac as createHmac4, randomBytes as randomBytes5 } from "crypto";

// ../ice-server/src/stun/ip.ts
import { isIPv4, isIPv6 } from "node:net";
function ipAddressToBuffer(address) {
  if (isIPv4(address)) {
    const buf = Buffer.allocUnsafe(4);
    const parts = address.split(".");
    for (let i = 0; i < 4; i++) {
      buf[i] = Number(parts[i]) & 255;
    }
    return buf;
  }
  if (!isIPv6(address)) {
    throw new Error(`Invalid ip address: ${address}`);
  }
  const sections = address.split(":", 8);
  for (let i = 0; i < sections.length; i++) {
    let v4Buffer;
    if (isIPv4(sections[i])) {
      v4Buffer = ipAddressToBuffer(sections[i]);
      sections[i] = v4Buffer.subarray(0, 2).toString("hex");
    }
    if (v4Buffer && ++i < 8) {
      sections.splice(i, 0, v4Buffer.subarray(2, 4).toString("hex"));
    }
  }
  if (sections[0] === "") {
    while (sections.length < 8) sections.unshift("0");
  } else if (sections[sections.length - 1] === "") {
    while (sections.length < 8) sections.push("0");
  } else if (sections.length < 8) {
    let emptyIndex = 0;
    for (; emptyIndex < sections.length && sections[emptyIndex] !== ""; emptyIndex++) ;
    const zeros = [];
    for (let n = 9 - sections.length; n > 0; n--) {
      zeros.push("0");
    }
    sections.splice(emptyIndex, 1, ...zeros);
  }
  const result = Buffer.allocUnsafe(16);
  let offset = 0;
  for (const section of sections) {
    const word = Number.parseInt(section, 16) || 0;
    result[offset++] = word >> 8 & 255;
    result[offset++] = word & 255;
  }
  return result;
}
function bufferToIpAddress(buf) {
  if (buf.length === 4) {
    return `${buf[0]}.${buf[1]}.${buf[2]}.${buf[3]}`;
  }
  if (buf.length !== 16) {
    throw new Error(`Invalid ip address buffer length: ${buf.length}`);
  }
  const hextets = [];
  for (let i = 0; i < 16; i += 2) {
    hextets.push(buf.readUInt16BE(i).toString(16));
  }
  let result = hextets.join(":");
  result = result.replace(/(^|:)0(:0)*:0(:|$)/, "$1::$3");
  result = result.replace(/:{3,4}/, "::");
  return result;
}
function isIpV4Address(address) {
  return isIPv4(address);
}

// ../ice-server/src/stun/attributes.ts
function packAddress(value) {
  const [address] = value;
  const protocol = isIpV4Address(address) ? IPV4_PROTOCOL : IPV6_PROTOCOL;
  const buffer2 = Buffer.alloc(4);
  buffer2.writeUInt8(0, 0);
  buffer2.writeUInt8(protocol, 1);
  buffer2.writeUInt16BE(value[1], 2);
  return Buffer.concat([buffer2, ipAddressToBuffer(address)]);
}
function unpackErrorCode(data) {
  if (data.length < 4) {
    throw new Error("STUN error code is less than 4 bytes");
  }
  const codeHigh = data.readUInt8(2);
  const codeLow = data.readUInt8(3);
  const reason = data.slice(4).toString("utf8");
  return [codeHigh * 100 + codeLow, reason];
}
function unpackAddress(data) {
  if (data.length < 4) {
    throw new Error("STUN address length is less than 4 bytes");
  }
  const protocol = data.readUInt8(1);
  const port = data.readUInt16BE(2);
  const address = data.slice(4);
  switch (protocol) {
    case IPV4_PROTOCOL:
      if (address.length !== 4) {
        throw new Error("STUN address has invalid length for IPv4");
      }
      return [bufferToIpAddress(address), port];
    case IPV6_PROTOCOL:
      if (address.length !== 16) {
        throw new Error("STUN address has invalid length for IPv6");
      }
      return [bufferToIpAddress(address), port];
    default:
      throw new Error("STUN address has unknown protocol");
  }
}
var cookieBuffer = Buffer.alloc(6);
cookieBuffer.writeUInt16BE(COOKIE >> 16, 0);
cookieBuffer.writeUInt32BE(COOKIE, 2);
function xorAddress(data, transactionId) {
  const xPad = [...cookieBuffer, ...transactionId];
  let xData = data.slice(0, 2);
  for (let i = 2; i < data.length; i++) {
    const num = data[i] ^ xPad[i - 2];
    const buf = Buffer.alloc(1);
    buf.writeUIntBE(num, 0, 1);
    xData = Buffer.concat([xData, buf]);
  }
  return xData;
}
function unpackXorAddress(data, transactionId) {
  return unpackAddress(xorAddress(data, transactionId));
}
function packErrorCode(value) {
  const buffer2 = Buffer.alloc(4);
  buffer2.writeUInt16BE(0, 0);
  buffer2.writeUInt8(Math.floor(value[0] / 100), 2);
  buffer2.writeUInt8(value[0] % 100, 3);
  const encoded = Buffer.from(value[1], "utf8");
  return Buffer.concat([buffer2, encoded]);
}
function packUnknownAttributes(value) {
  const buffer2 = Buffer.alloc(value.length * 2);
  value.forEach((attributeType, index) => {
    buffer2.writeUInt16BE(attributeType, index * 2);
  });
  return buffer2;
}
function unpackUnknownAttributes(data) {
  if (data.length % 2 !== 0) {
    throw new Error("UNKNOWN-ATTRIBUTES must have an even length");
  }
  const attributes = [];
  for (let offset = 0; offset < data.length; offset += 2) {
    attributes.push(data.readUInt16BE(offset));
  }
  return attributes;
}
function packXorAddress(value, transactionId) {
  return xorAddress(packAddress(value), transactionId);
}
var packUnsigned = (value) => {
  const buffer2 = Buffer.alloc(4);
  buffer2.writeUInt32BE(value, 0);
  return buffer2;
};
var unpackUnsigned = (data) => data.readUInt32BE(0);
var packUnsignedShort = (value) => {
  const buffer2 = Buffer.alloc(4);
  buffer2.writeUInt16BE(value, 0);
  return buffer2;
};
var unpackUnsignedShort = (data) => data.readUInt16BE(0);
var packUnsigned64 = (value) => {
  const buffer2 = Buffer.allocUnsafe(8);
  buffer2.writeBigUInt64BE(value, 0);
  return buffer2;
};
var unpackUnsigned64 = (data) => data.readBigUInt64BE(0);
var packString = (value) => Buffer.from(value, "utf8");
var unpackString = (data) => data.toString("utf8");
var packSoftware = (value) => {
  if ([...value].length >= 128) {
    throw new Error("SOFTWARE must be shorter than 128 characters");
  }
  return packString(value);
};
var packBytes = (value) => value;
var unpackBytes = (data) => data;
var packNone = () => Buffer.alloc(0);
var unpackNone = () => null;
var ATTRIBUTES = [
  [1, "MAPPED-ADDRESS", packAddress, unpackAddress],
  [3, "CHANGE-REQUEST", packUnsigned, unpackUnsigned],
  [4, "SOURCE-ADDRESS", packAddress, unpackAddress],
  [5, "CHANGED-ADDRESS", packAddress, unpackAddress],
  [6, "USERNAME", packString, unpackString],
  [8, "MESSAGE-INTEGRITY", packBytes, unpackBytes],
  [9, "ERROR-CODE", packErrorCode, unpackErrorCode],
  [
    10,
    "UNKNOWN-ATTRIBUTES",
    packUnknownAttributes,
    unpackUnknownAttributes
  ],
  [12, "CHANNEL-NUMBER", packUnsignedShort, unpackUnsignedShort],
  [13, "LIFETIME", packUnsigned, unpackUnsigned],
  [18, "XOR-PEER-ADDRESS", packXorAddress, unpackXorAddress],
  [19, "DATA", packBytes, unpackBytes],
  [20, "REALM", packString, unpackString],
  [21, "NONCE", packBytes, unpackBytes],
  [22, "XOR-RELAYED-ADDRESS", packXorAddress, unpackXorAddress],
  [23, "REQUESTED-ADDRESS-FAMILY", packUnsigned, unpackUnsigned],
  [24, "EVEN-PORT", packBytes, unpackBytes],
  [25, "REQUESTED-TRANSPORT", packUnsigned, unpackUnsigned],
  [28, "MESSAGE-INTEGRITY-SHA256", packBytes, unpackBytes],
  [29, "PASSWORD-ALGORITHM", packBytes, unpackBytes],
  [30, "USERHASH", packBytes, unpackBytes],
  [32, "XOR-MAPPED-ADDRESS", packXorAddress, unpackXorAddress],
  [34, "RESERVATION-TOKEN", packBytes, unpackBytes],
  [36, "PRIORITY", packUnsigned, unpackUnsigned],
  [37, "USE-CANDIDATE", packNone, unpackNone],
  [32770, "PASSWORD-ALGORITHMS", packBytes, unpackBytes],
  [32771, "ALTERNATE-DOMAIN", packString, unpackString],
  [32802, "SOFTWARE", packSoftware, unpackString],
  [32803, "ALTERNATE-SERVER", packAddress, unpackAddress],
  [32808, "FINGERPRINT", packUnsigned, unpackUnsigned],
  [32809, "ICE-CONTROLLED", packUnsigned64, unpackUnsigned64],
  [32810, "ICE-CONTROLLING", packUnsigned64, unpackUnsigned64],
  [32811, "RESPONSE-ORIGIN", packAddress, unpackAddress],
  [32812, "OTHER-ADDRESS", packAddress, unpackAddress]
];
var AttributeRepository = class {
  constructor(attributes = []) {
    this.attributes = attributes;
  }
  getAttributes() {
    return this.attributes;
  }
  setAttribute(key, value) {
    const existing = this.attributes.find((attribute) => attribute[0] === key);
    if (existing) {
      existing[1] = value;
    } else {
      this.attributes.push([key, value]);
    }
    return this;
  }
  getAttributeValue(key) {
    const attribute = this.attributes.find((candidate) => candidate[0] === key);
    return attribute?.[1];
  }
  get attributesKeys() {
    return this.attributes.map((attribute) => attribute[0]);
  }
  clear() {
    this.attributes = [];
  }
};
var ATTRIBUTES_BY_TYPE = ATTRIBUTES.reduce(
  (acc, cur) => {
    acc[cur[0]] = cur;
    return acc;
  },
  {}
);
var ATTRIBUTES_BY_NAME = ATTRIBUTES.reduce(
  (acc, cur) => {
    acc[cur[1]] = cur;
    return acc;
  },
  {}
);

// ../ice-server/src/stun/message.ts
function parseMessage(data, integrityKey) {
  if (!isStunMessage(data)) {
    return void 0;
  }
  const messageType = data.readUInt16BE(0);
  const transactionId = Buffer.from(
    data.slice(HEADER_LENGTH - 12, HEADER_LENGTH)
  );
  const attributeRepository = new AttributeRepository();
  const rawAttributes = [];
  let messageIntegrityVerified = false;
  for (let pos = HEADER_LENGTH; pos < data.length; ) {
    if (pos + 4 > data.length) {
      return void 0;
    }
    const attrType = data.readUInt16BE(pos);
    const attrLen = data.readUInt16BE(pos + 2);
    const valueStart = pos + 4;
    const valueEnd = valueStart + attrLen;
    if (valueEnd > data.length) {
      return void 0;
    }
    const payload = data.slice(valueStart, valueEnd);
    const padLen = paddingLength(attrLen);
    if (valueEnd + padLen > data.length) {
      return void 0;
    }
    const attribute = ATTRIBUTES_BY_TYPE[attrType];
    if (attribute) {
      const [, attrName, , attrUnpack] = attribute;
      let value;
      try {
        value = attrUnpack.name === unpackXorAddress.name ? attrUnpack(payload, transactionId) : attrUnpack(payload);
      } catch {
        return void 0;
      }
      attributeRepository.setAttribute(attrName, value);
      if (attrName === "FINGERPRINT") {
        const fingerprint2 = messageFingerprint(data.slice(0, pos));
        if (attributeRepository.getAttributeValue("FINGERPRINT") !== fingerprint2) {
          return void 0;
        }
      } else if (attrName === "MESSAGE-INTEGRITY" && integrityKey) {
        const integrity = messageIntegrity(data.slice(0, pos), integrityKey);
        const expected = attributeRepository.getAttributeValue("MESSAGE-INTEGRITY");
        if (!integrity.equals(expected)) {
          return void 0;
        }
        messageIntegrityVerified = true;
      }
    } else {
      rawAttributes.push({
        type: attrType,
        length: attrLen,
        value: Buffer.from(payload)
      });
    }
    pos = valueEnd + padLen;
  }
  if (integrityKey && !messageIntegrityVerified) {
    return void 0;
  }
  return new Message(
    messageType & 16111,
    messageType & 272,
    transactionId,
    attributeRepository.getAttributes(),
    rawAttributes
  );
}
var Message = class extends AttributeRepository {
  constructor(messageMethod, messageClass, transactionId = randomBytes5(12), attributes = [], rawAttributes = []) {
    super(attributes);
    this.messageMethod = messageMethod;
    this.messageClass = messageClass;
    this.transactionId = transactionId;
    this.rawAttributes = rawAttributes;
  }
  toJSON() {
    return this.json;
  }
  get json() {
    return {
      messageMethod: this.messageMethod,
      messageClass: this.messageClass,
      attributes: this.attributes,
      rawAttributes: this.rawAttributes.map((attribute) => ({
        type: attribute.type,
        length: attribute.value.length
      }))
    };
  }
  get transactionIdHex() {
    return this.transactionId.toString("hex");
  }
  appendRawAttribute(type, value) {
    this.rawAttributes.push({ type, value: Buffer.from(value) });
    return this;
  }
  get unknownAttributeTypes() {
    return this.rawAttributes.map((attribute) => attribute.type);
  }
  get bytes() {
    const body = Buffer.concat(
      this.serializedAttributes.map(
        (attribute) => serializeAttribute(attribute.type, attribute.value)
      )
    );
    const header = Buffer.alloc(8);
    header.writeUInt16BE(this.messageMethod | this.messageClass, 0);
    header.writeUInt16BE(body.length, 2);
    header.writeUInt32BE(COOKIE, 4);
    return Buffer.concat([header, this.transactionId, body]);
  }
  addMessageIntegrity(key) {
    this.setAttribute("MESSAGE-INTEGRITY", this.messageIntegrity(key));
    return this;
  }
  messageIntegrity(key) {
    const checkData = setBodyLength(
      this.bytes,
      this.bytes.length - HEADER_LENGTH + INTEGRITY_LENGTH
    );
    return Buffer.from(
      createHmac4("sha1", key).update(checkData).digest("hex"),
      "hex"
    );
  }
  addFingerprint() {
    this.setAttribute("FINGERPRINT", messageFingerprint(this.bytes));
    return this;
  }
  get serializedAttributes() {
    const attributes = [];
    for (const attrName of this.attributesKeys) {
      const attrValue = this.getAttributeValue(attrName);
      const [attrType, , attrPack] = ATTRIBUTES_BY_NAME[attrName];
      const value = attrPack.name === packXorAddress.name ? attrPack(attrValue, this.transactionId) : attrPack(attrValue);
      attributes.push({ type: attrType, value });
    }
    attributes.push(
      ...this.rawAttributes.map((attribute) => ({
        type: attribute.type,
        value: Buffer.from(attribute.value)
      }))
    );
    return attributes;
  }
};
function serializeAttribute(type, value) {
  const attrLen = value.length;
  const padLen = paddingLength(attrLen);
  const header = Buffer.alloc(4);
  header.writeUInt16BE(type, 0);
  header.writeUInt16BE(attrLen, 2);
  return Buffer.concat([header, value, Buffer.alloc(padLen)]);
}
var setBodyLength = (data, length) => {
  const output = Buffer.alloc(data.length);
  data.copy(output, 0, 0, 2);
  output.writeUInt16BE(length, 2);
  data.copy(output, 4, 4);
  return output;
};
function messageFingerprint(data) {
  const checkData = setBodyLength(
    data,
    data.length - HEADER_LENGTH + FINGERPRINT_LENGTH
  );
  return (crc32(checkData) ^ FINGERPRINT_XOR) >>> 0;
}
function messageIntegrity(data, key) {
  const checkData = setBodyLength(
    data,
    data.length - HEADER_LENGTH + INTEGRITY_LENGTH
  );
  return Buffer.from(
    createHmac4("sha1", key).update(checkData).digest("hex"),
    "hex"
  );
}
function paddingLength(length) {
  const rest = length % 4;
  return rest === 0 ? 0 : 4 - rest;
}

// ../ice/src/stun/transaction.ts
import { promises as dns } from "node:dns";
import { isIP as isIP2 } from "node:net";

// ../ice/src/exceptions.ts
var TransactionError = class extends Error {
  response;
  addr;
};
var TransactionFailed = class extends TransactionError {
  constructor(response, addr) {
    super();
    this.response = response;
    this.addr = addr;
  }
  get str() {
    let out = "STUN transaction failed";
    const attribute = this.response.getAttributeValue("ERROR-CODE");
    if (attribute) {
      const [code, msg] = attribute;
      out += ` (${code} - ${msg})`;
    }
    return out;
  }
};
var TransactionTimeout = class extends TransactionError {
  get str() {
    return "STUN transaction timed out";
  }
};

// ../ice/src/stun/transaction.ts
var log18 = debug("werift-ice:packages/ice/src/stun/transaction.ts");
async function resolveRequestAddress(addr, family = 0) {
  if (isIP2(addr[0])) {
    return addr;
  }
  const looked = await dns.lookup(addr[0], { family });
  return [looked.address, addr[1]];
}
function normalizeTransactionOptions(retransmissionsOrOptions, onRequestSent) {
  if (retransmissionsOrOptions !== null && typeof retransmissionsOrOptions === "object") {
    return retransmissionsOrOptions;
  }
  const retransmissions = typeof retransmissionsOrOptions === "number" ? retransmissionsOrOptions : void 0;
  return {
    retransmissions,
    onRequestSent
  };
}
function addressEquals(a, b) {
  return a[0] === b[0] && a[1] === b[1];
}
var Transaction = class {
  constructor(request, addr, protocol, retransmissionsOrOptions, onRequestSent) {
    this.request = request;
    this.addr = addr;
    this.protocol = protocol;
    const options = normalizeTransactionOptions(
      retransmissionsOrOptions,
      onRequestSent
    );
    this.triesMax = 1 + (options.retransmissions ?? RETRY_MAX);
    this.timeoutDelay = options.responseTimeout ?? RETRY_RTO;
    this.onRequestSent = options.onRequestSent;
    this.signal = options.signal;
    this.expectedAddr = addr;
    this.integrityKey = options.integrityKey;
  }
  timeoutDelay;
  ended = false;
  tries = 0;
  triesMax;
  onResponse = new Event2();
  onRequestSent;
  signal;
  /** Remote address this transaction was sent to; responses must match. */
  expectedAddr;
  /**
   * When set, protocol layers re-parse the wire response with this key so
   * MESSAGE-INTEGRITY failures are rejected before responseReceived.
   */
  integrityKey;
  waitTimer;
  waitResolve;
  onAbort;
  /**
   * Accept a matching authenticated non-error response from the expected
   * remote address. Wrong address, missing MESSAGE-INTEGRITY (when required),
   * or non-success class is rejected without completing the transaction
   * (wrong address / unauthenticated responses are ignored so we keep waiting).
   */
  responseReceived = (message, addr) => {
    if (this.ended || this.onResponse.length === 0) {
      return;
    }
    if (!addressEquals(this.expectedAddr, addr)) {
      log18(
        "ignore STUN response from unexpected address",
        addr,
        "expected",
        this.expectedAddr
      );
      return;
    }
    if (this.integrityKey) {
      const hasIntegrity = message.attributesKeys.includes("MESSAGE-INTEGRITY") || message.attributesKeys.includes("MESSAGE-INTEGRITY-SHA256");
      if (!hasIntegrity) {
        log18(
          "ignore unauthenticated STUN response (MESSAGE-INTEGRITY required)"
        );
        return;
      }
    }
    if (message.messageClass === 256 /* RESPONSE */) {
      this.onResponse.execute(message, addr);
      this.onResponse.complete();
    } else {
      this.onResponse.error(new TransactionFailed(message, addr));
    }
  };
  run = async () => {
    try {
      if (this.signal?.aborted) {
        throw new TransactionTimeout();
      }
      this.attachAbortListener();
      this.retry().catch((e) => {
        log18("retry failed", e);
      });
      const res = await this.onResponse.asPromise();
      return res;
    } catch (error) {
      throw error;
    } finally {
      this.cancel();
    }
  };
  attachAbortListener() {
    if (!this.signal) {
      return;
    }
    this.onAbort = () => {
      this.failWithTimeout();
    };
    this.signal.addEventListener("abort", this.onAbort, { once: true });
  }
  failWithTimeout() {
    if (this.ended) {
      return;
    }
    this.ended = true;
    this.clearWait();
    if (this.onResponse.length > 0) {
      this.onResponse.error(new TransactionTimeout());
    }
  }
  clearWait() {
    if (this.waitTimer !== void 0) {
      clearTimeout(this.waitTimer);
      this.waitTimer = void 0;
    }
    const resolve = this.waitResolve;
    this.waitResolve = void 0;
    resolve?.();
  }
  wait(ms) {
    return new Promise((resolve) => {
      if (this.ended || this.signal?.aborted) {
        resolve();
        return;
      }
      this.waitResolve = resolve;
      this.waitTimer = setTimeout(() => {
        this.waitTimer = void 0;
        this.waitResolve = void 0;
        resolve();
      }, ms);
    });
  }
  retry = async () => {
    while (this.tries < this.triesMax && !this.ended) {
      this.onRequestSent?.(this.tries);
      this.protocol.sendStun(this.request, this.addr).catch((e) => {
        log18("send stun failed", e);
      });
      await this.wait(this.timeoutDelay);
      if (this.ended) {
        break;
      }
      this.timeoutDelay *= 2;
      this.tries++;
    }
    if (this.tries >= this.triesMax && !this.ended) {
      log18(`retry failed times:${this.tries} maxLimit:${this.triesMax}`);
      this.failWithTimeout();
    }
  };
  cancel() {
    this.ended = true;
    this.clearWait();
    if (this.signal && this.onAbort) {
      this.signal.removeEventListener("abort", this.onAbort);
      this.onAbort = void 0;
    }
  }
};
function buildTransactionOptions(integrityKey, retransmissionsOrOptions, onRequestSent) {
  const options = normalizeTransactionOptions(
    retransmissionsOrOptions,
    onRequestSent
  );
  if (integrityKey && !options.integrityKey) {
    options.integrityKey = integrityKey;
  }
  return options;
}

// ../ice/src/stun/tcpProtocol.ts
var log19 = debug("werift-ice:packages/ice/src/stun/tcpProtocol.ts");
function socketKey(addr) {
  return `${addr[0]}:${addr[1]}`;
}
function addressFromSocket(socket) {
  if (!socket.remoteAddress || !socket.remotePort) {
    return;
  }
  return [socket.remoteAddress, socket.remotePort];
}
async function waitForListening(server, host, port) {
  return await new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolve();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen({
      host,
      port: port ?? 0,
      exclusive: true
    });
  });
}
var BaseTcpProtocol = class _BaseTcpProtocol {
  static type = "tcp";
  type = _BaseTcpProtocol.type;
  transactions = {};
  localCandidate;
  sentMessage;
  localIp;
  onRequestReceived = new Event2();
  onDataReceived = new Event2();
  sockets = /* @__PURE__ */ new Map();
  rememberSocket(entry) {
    const remoteAddr = entry.remoteAddr;
    if (!remoteAddr) {
      return;
    }
    this.sockets.set(socketKey(remoteAddr), entry);
  }
  forgetSocket(remoteAddr) {
    if (!remoteAddr) {
      return;
    }
    this.sockets.delete(socketKey(remoteAddr));
  }
  registerSocket(socket, remoteAddr) {
    const entry = {
      socket,
      buffer: Buffer.alloc(0),
      remoteAddr
    };
    if (remoteAddr) {
      this.rememberSocket(entry);
    }
    socket.on("data", (data) => {
      entry.buffer = Buffer.concat([entry.buffer, data]);
      const { frames, rest } = splitTcpFrames(entry.buffer);
      entry.buffer = rest;
      const socketAddr = entry.remoteAddr ?? addressFromSocket(socket);
      if (!entry.remoteAddr && socketAddr) {
        entry.remoteAddr = socketAddr;
        this.rememberSocket(entry);
      }
      if (!socketAddr) {
        return;
      }
      for (const frame of frames) {
        if (frame.length === 0) {
          continue;
        }
        this.handleFrame(frame, socketAddr);
      }
    });
    socket.on("close", () => {
      this.forgetSocket(entry.remoteAddr);
    });
    socket.on("error", (error) => {
      log19("tcp socket error", error);
    });
    return entry;
  }
  handleFrame(data, addr) {
    try {
      const message = parseMessage(data);
      if (!message) {
        this.onDataReceived.execute(data);
        return;
      }
      if ((message.messageClass === 256 /* RESPONSE */ || message.messageClass === 272 /* ERROR */) && this.transactions[message.transactionIdHex]) {
        const transaction = this.transactions[message.transactionIdHex];
        const verified = transaction.integrityKey ? parseMessage(data, transaction.integrityKey) : message;
        if (!verified) {
          log19("STUN response failed MESSAGE-INTEGRITY check");
          return;
        }
        transaction.responseReceived(verified, addr);
      } else if (message.messageClass === 0 /* REQUEST */) {
        this.onRequestReceived.execute(message, addr, data);
      }
    } catch (error) {
      log19("tcp frame parse error", error);
    }
  }
  async sendFrame(data, addr) {
    const entry = await this.getSocket(addr);
    await new Promise((resolve, reject) => {
      entry.socket.write(encodeTcpFrame(data), (error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
  async sendStun(message, addr) {
    await this.sendFrame(message.bytes, addr);
  }
  async sendData(data, addr) {
    await this.sendFrame(data, addr);
  }
  async request(request, addr, integrityKey, retransmissionsOrOptions, onRequestSent) {
    if (this.transactions[request.transactionIdHex]) {
      throw new Error("already requested");
    }
    if (integrityKey) {
      request.addMessageIntegrity(integrityKey);
      request.addFingerprint();
    }
    const resolvedAddr = await resolveRequestAddress(addr);
    const options = buildTransactionOptions(
      integrityKey,
      retransmissionsOrOptions,
      onRequestSent
    );
    const transaction = new Transaction(request, resolvedAddr, this, options);
    this.transactions[request.transactionIdHex] = transaction;
    try {
      return await transaction.run();
    } finally {
      delete this.transactions[request.transactionIdHex];
    }
  }
  async pruneForSelection(remoteAddr) {
    for (const [key, entry] of this.sockets.entries()) {
      if (remoteAddr && key === socketKey(remoteAddr)) {
        continue;
      }
      entry.socket.destroy();
      this.sockets.delete(key);
    }
  }
  get activeSocketCount() {
    return this.sockets.size;
  }
  get address() {
    return {};
  }
  async close() {
    Object.values(this.transactions).forEach((transaction) => {
      transaction.cancel();
    });
    await this.pruneForSelection();
    this.onRequestReceived.complete();
    this.onDataReceived.complete();
  }
};
var TcpActiveProtocol = class extends BaseTcpProtocol {
  pendingSockets = /* @__PURE__ */ new Map();
  async connectionMade(localIp) {
    this.localIp = localIp;
  }
  async getSocket(addr) {
    const key = socketKey(addr);
    const existing = this.sockets.get(key);
    if (existing) {
      return existing;
    }
    const pending = this.pendingSockets.get(key);
    if (pending) {
      return await pending;
    }
    const connecting = new Promise((resolve, reject) => {
      const socket = connect3({
        host: addr[0],
        port: addr[1],
        localAddress: this.localIp
      });
      const entry = this.registerSocket(socket, addr);
      const onError = (error) => {
        socket.off("connect", onConnect);
        reject(error);
      };
      const onConnect = () => {
        socket.off("error", onError);
        resolve(entry);
      };
      socket.once("error", onError);
      socket.once("connect", onConnect);
    });
    this.pendingSockets.set(key, connecting);
    try {
      return await connecting;
    } finally {
      this.pendingSockets.delete(key);
    }
  }
};
var TcpPassiveProtocol = class extends BaseTcpProtocol {
  server = createServer((socket) => {
    this.registerSocket(socket, addressFromSocket(socket));
  });
  async connectionMade(localIp, portRange) {
    this.localIp = localIp;
    if (portRange) {
      let lastError;
      for (let port = portRange[0]; port <= portRange[1]; port++) {
        try {
          await waitForListening(this.server, localIp, port);
          return;
        } catch (error) {
          lastError = error;
        }
      }
      throw lastError ?? new Error("tcp port not found");
    }
    await waitForListening(this.server, localIp);
  }
  async getSocket(addr) {
    const entry = this.sockets.get(socketKey(addr));
    if (!entry) {
      throw new Error("tcp passive connection not established");
    }
    return entry;
  }
  get listeningPort() {
    const address = this.server.address();
    if (!address || typeof address === "string") {
      throw new Error("tcp passive protocol is not listening");
    }
    return address.port;
  }
  async close() {
    await super.close();
    await new Promise((resolve) => {
      this.server.close(() => resolve());
    });
  }
};

// ../ice/src/stun/protocol.ts
var log20 = debug("werift-ice : packages/ice/src/stun/protocol.ts");
var StunProtocol = class _StunProtocol {
  static type = "stun";
  type = _StunProtocol.type;
  transport;
  transactions = {};
  get transactionsKeys() {
    return Object.keys(this.transactions);
  }
  localCandidate;
  sentMessage;
  localIp;
  onRequestReceived = new Event2();
  onDataReceived = new Event2();
  constructor() {
  }
  connectionMade = async (useIpv4, portRange, interfaceAddresses) => {
    if (useIpv4) {
      this.transport = await UdpTransport.init("udp4", {
        portRange,
        interfaceAddresses
      });
    } else {
      this.transport = await UdpTransport.init("udp6", {
        portRange,
        interfaceAddresses
      });
    }
    this.transport.onData = (data, addr) => {
      this.datagramReceived(data, addr);
    };
  };
  datagramReceived(data, addr) {
    try {
      const message = parseMessage(data);
      if (!message) {
        if (this.localCandidate) {
          this.onDataReceived.execute(data);
        }
        return;
      }
      if ((message.messageClass === 256 /* RESPONSE */ || message.messageClass === 272 /* ERROR */) && this.transactionsKeys.includes(message.transactionIdHex)) {
        const transaction = this.transactions[message.transactionIdHex];
        const verified = transaction.integrityKey ? parseMessage(data, transaction.integrityKey) : message;
        if (!verified) {
          log20("STUN response failed MESSAGE-INTEGRITY check");
          return;
        }
        transaction.responseReceived(verified, addr);
      } else if (message.messageClass === 0 /* REQUEST */) {
        this.onRequestReceived.execute(message, addr, data);
      }
    } catch (error) {
      log20("datagramReceived error", error);
    }
  }
  getExtraInfo() {
    const { address: host, port } = this.transport.address;
    return [host, port];
  }
  async sendStun(message, addr) {
    if (this.transport.closed) {
      return;
    }
    const data = message.bytes;
    await this.transport.send(data, addr).catch(() => {
      log20("sendStun failed", addr, message);
    });
  }
  async sendData(data, addr) {
    if (this.transport.closed) {
      return;
    }
    await this.transport.send(data, addr);
  }
  async request(request, addr, integrityKey, retransmissionsOrOptions, onRequestSent) {
    if (this.transactionsKeys.includes(request.transactionIdHex))
      throw new Error("already request ed");
    if (integrityKey) {
      request.addMessageIntegrity(integrityKey);
      request.addFingerprint();
    }
    const socketType = this.transport.socketType;
    const family = socketType === "udp6" ? 6 : 4;
    const resolvedAddr = await resolveRequestAddress(addr, family);
    const options = buildTransactionOptions(
      integrityKey,
      retransmissionsOrOptions,
      onRequestSent
    );
    const transaction = new Transaction(
      request,
      resolvedAddr,
      this,
      options
    );
    this.transactions[request.transactionIdHex] = transaction;
    try {
      return await transaction.run();
    } catch (e) {
      throw e;
    } finally {
      delete this.transactions[request.transactionIdHex];
    }
  }
  async close() {
    Object.values(this.transactions).forEach((transaction) => {
      transaction.cancel();
    });
    await this.transport.close();
    this.onRequestReceived.complete();
    this.onDataReceived.complete();
  }
};

// ../ice/src/turn/protocol.ts
import { setTimeout as setTimeout4 } from "timers/promises";

// ../ice-server/src/turn/auth.ts
import { createHash as createHash2 } from "crypto";
function makeTurnIntegrityKey(username, realm, password) {
  return createHash2("md5").update(Buffer.from([username, realm, password].join(":"))).digest();
}

// ../ice/src/helper.ts
import { randomBytes as randomBytes6 } from "crypto";
function randomString(length) {
  return randomBytes6(length).toString("hex").substring(0, length);
}
function randomTransactionId() {
  return randomBytes6(12);
}
var PQueue = class {
  queue = [];
  wait = new Event2();
  put(v) {
    this.queue.push(v);
    if (this.queue.length === 1) {
      this.wait.execute(v);
    }
  }
  get() {
    const v = this.queue.shift();
    if (!v) {
      return new Promise((r) => {
        this.wait.subscribe((v2) => {
          this.queue.shift();
          r(v2);
        });
      });
    }
    return v;
  }
};
var cancelable = (ex) => {
  let resolve;
  let reject;
  const p = new Promise((r, f) => {
    resolve = r;
    reject = f;
  });
  p.then(() => {
    onCancel.execute(void 0);
    onCancel.complete();
  }).catch((e) => {
    onCancel.execute(e ?? new Error());
    onCancel.complete();
  });
  const onCancel = new Event2();
  ex(resolve, reject, onCancel).catch(() => {
  });
  return { awaitable: p, resolve, reject };
};

// ../ice-server/src/turn/frame.ts
function isChannelData(data) {
  return data.length >= 4 && (data[0] & 192) === 64;
}
function encodeChannelData(channelNumber, data) {
  const header = Buffer.alloc(4);
  header.writeUInt16BE(channelNumber, 0);
  header.writeUInt16BE(data.length, 2);
  return Buffer.concat([header, data]);
}
function decodeChannelData(data) {
  if (!isChannelData(data) || data.length < 4) {
    return void 0;
  }
  const channelNumber = data.readUInt16BE(0);
  const length = data.readUInt16BE(2);
  if (data.length < 4 + length) {
    return void 0;
  }
  return {
    channelNumber,
    data: data.subarray(4, 4 + length)
  };
}
function padTurnFrame(data) {
  const padding = paddingLength(data.length);
  return padding > 0 ? Buffer.concat([data, Buffer.alloc(padding)]) : data;
}
function splitTurnTcpFrames(buffer2) {
  const frames = [];
  let offset = 0;
  let malformed = false;
  while (buffer2.length - offset >= 4) {
    let frameLength;
    if (isChannelData(buffer2.subarray(offset))) {
      const payloadLength = buffer2.readUInt16BE(offset + 2);
      frameLength = 4 + payloadLength + paddingLength(payloadLength);
    } else if ((buffer2[offset] & 192) === 0) {
      if (buffer2.length - offset < 20) {
        break;
      }
      const stunBodyLength = buffer2.readUInt16BE(offset + 2);
      frameLength = 20 + stunBodyLength + paddingLength(stunBodyLength);
    } else {
      malformed = true;
      break;
    }
    if (buffer2.length - offset < frameLength) {
      break;
    }
    frames.push(buffer2.subarray(offset, offset + frameLength));
    offset += frameLength;
  }
  return {
    frames,
    malformed,
    rest: buffer2.subarray(offset)
  };
}

// ../ice/src/turn/protocol.ts
var log21 = debug("werift-ice:packages/ice/src/turn/protocol.ts");
var DEFAULT_CHANNEL_REFRESH_TIME = 500;
var DEFAULT_ALLOCATION_LIFETIME = 600;
var UDP_TRANSPORT = 285212672;
function isStreamTransport(transport) {
  return transport.type === "tcp" || transport.type === "tls";
}
function permissionKey(addr) {
  return addr[0];
}
function channelKey(addr) {
  return JSON.stringify(addr);
}
var StunOverTurnProtocol = class _StunOverTurnProtocol {
  constructor(turn) {
    this.turn = turn;
    turn.onData.subscribe((data, addr) => {
      this.handleStunMessage(data, addr);
    }).disposer(this.disposer);
  }
  static type = "turn";
  type = _StunOverTurnProtocol.type;
  localCandidate;
  disposer = new EventDisposer();
  onRequestReceived = new Event2();
  onDataReceived = new Event2();
  handleStunMessage = (data, addr) => {
    try {
      const message = parseMessage(data);
      if (!message) {
        this.onDataReceived.execute(data);
        return;
      }
      if (message.messageClass === 256 /* RESPONSE */ || message.messageClass === 272 /* ERROR */) {
        const transaction = this.turn.transactions[message.transactionIdHex];
        if (transaction) {
          const verified = transaction.integrityKey ? parseMessage(data, transaction.integrityKey) : message;
          if (!verified) {
            log21("STUN over TURN response failed MESSAGE-INTEGRITY check");
            return;
          }
          transaction.responseReceived(verified, addr);
        }
      } else if (message.messageClass === 0 /* REQUEST */) {
        this.onRequestReceived.execute(message, addr, data);
      }
    } catch (error) {
      log21("datagramReceived error", error);
    }
  };
  async request(request, addr, integrityKey, retransmissionsOrOptions, onRequestSent) {
    if (this.turn.transactions[request.transactionIdHex]) {
      throw new Error("exist");
    }
    if (integrityKey) {
      request.addMessageIntegrity(integrityKey);
      request.addFingerprint();
    }
    const resolvedAddr = await resolveRequestAddress(addr);
    const options = buildTransactionOptions(
      integrityKey,
      retransmissionsOrOptions,
      onRequestSent
    );
    const transaction = new Transaction(request, resolvedAddr, this, options);
    this.turn.transactions[request.transactionIdHex] = transaction;
    try {
      return await transaction.run();
    } catch (e) {
      throw e;
    } finally {
      delete this.turn.transactions[request.transactionIdHex];
    }
  }
  async connectionMade() {
  }
  async sendData(data, addr) {
    await this.turn.sendData(data, addr);
  }
  async sendStun(message, addr) {
    await this.turn.sendData(message.bytes, addr);
  }
  async close() {
    this.disposer.dispose();
    return this.turn.close();
  }
};
var TurnProtocol = class _TurnProtocol {
  constructor(server, username, password, lifetime, transport, options = {}) {
    this.server = server;
    this.username = username;
    this.password = password;
    this.lifetime = lifetime;
    this.transport = transport;
    this.options = options;
    this.channelRefreshTime = this.options.channelRefreshTime ?? DEFAULT_CHANNEL_REFRESH_TIME;
  }
  static type = "turn";
  type = _TurnProtocol.type;
  onData = new Event2();
  onRequestReceived = new Event2();
  onDataReceived = new Event2();
  integrityKey;
  nonce;
  realm;
  relayedAddress;
  mappedAddress;
  localCandidate;
  transactions = {};
  refreshHandle;
  channelNumber = 16384;
  channelByAddr = {};
  addrByChannel = {};
  /**sec */
  channelRefreshTime;
  /**
   * Serializes ChannelBind requests so allocation-wide auth state
   * (nonce/realm/integrityKey) is not updated concurrently. Rejections
   * must not poison this tail — see channelBindQueue assignment sites.
   */
  channelBindQueue = Promise.resolve();
  /** In-flight ChannelBind per peer transport address (dedupe concurrent). */
  channelBindingByAddr = /* @__PURE__ */ new Map();
  tcpBuffer = Buffer.alloc(0);
  /** Permission cache keyed by peer IP only (RFC 8656). */
  permissionByAddr = {};
  /**
   * Serializes CreatePermission requests (auth state race avoidance).
   * Rejections must not poison this tail.
   */
  permissionQueue = Promise.resolve();
  /** In-flight CreatePermission per peer IP (dedupe concurrent). */
  creatingPermissionByAddr = /* @__PURE__ */ new Map();
  async connectionMade() {
    this.transport.onData = (data, addr) => {
      this.dataReceived(data, addr);
    };
    const request = new Message(3 /* ALLOCATE */, 0 /* REQUEST */);
    request.setAttribute("LIFETIME", this.lifetime).setAttribute("REQUESTED-TRANSPORT", UDP_TRANSPORT);
    const [response] = await this.requestWithRetry(request, this.server).catch(
      (e) => {
        log21("connect error", e);
        throw e;
      }
    );
    this.relayedAddress = response.getAttributeValue("XOR-RELAYED-ADDRESS");
    this.mappedAddress = response.getAttributeValue("XOR-MAPPED-ADDRESS");
    const exp = response.getAttributeValue("LIFETIME");
    log21("connect", this.relayedAddress, this.mappedAddress, { exp });
    this.refresh(exp);
  }
  handleChannelData(data) {
    const decoded = decodeChannelData(data);
    const addr = decoded && this.addrByChannel[decoded.channelNumber];
    if (addr && decoded) {
      this.onData.execute(decoded.data, addr);
    }
  }
  handleSTUNMessage(data, addr) {
    try {
      const message = parseMessage(data);
      if (!message) {
        throw new Error("not stun message");
      }
      if (message.messageClass === 256 /* RESPONSE */ || message.messageClass === 272 /* ERROR */) {
        const transaction = this.transactions[message.transactionIdHex];
        if (transaction) {
          const verified = transaction.integrityKey ? parseMessage(data, transaction.integrityKey) : message;
          if (!verified) {
            log21("TURN STUN response failed MESSAGE-INTEGRITY check");
            return;
          }
          transaction.responseReceived(verified, addr);
        }
      } else if (message.messageClass === 0 /* REQUEST */) {
        this.onData.execute(data, addr);
      }
      if (message.getAttributeValue("DATA")) {
        const buf = message.getAttributeValue("DATA");
        const peerAddress = message.getAttributeValue("XOR-PEER-ADDRESS") ?? addr;
        this.onData.execute(buf, peerAddress);
      }
    } catch (error) {
      log21("parse error", data.toString());
    }
  }
  dataReceived(data, addr) {
    const datagramReceived = (data2, addr2) => {
      if (data2.length >= 4 && isChannelData(data2)) {
        this.handleChannelData(data2);
      } else {
        this.handleSTUNMessage(data2, addr2);
      }
    };
    if (isStreamTransport(this.transport)) {
      this.tcpBuffer = Buffer.concat([this.tcpBuffer, data]);
      const { frames, rest } = splitTurnTcpFrames(this.tcpBuffer);
      this.tcpBuffer = rest;
      for (const frame of frames) {
        datagramReceived(frame, addr);
      }
    } else {
      datagramReceived(data, addr);
    }
  }
  async send(data, addr) {
    if (this.transport.closed) {
      return;
    }
    await this.transport.send(
      isStreamTransport(this.transport) ? padTurnFrame(data) : data,
      addr
    );
  }
  async createPermission(peerAddress) {
    const request = new Message(8 /* CREATE_PERMISSION */, 0 /* REQUEST */);
    request.setAttribute("XOR-PEER-ADDRESS", peerAddress).setAttribute("USERNAME", this.username).setAttribute("REALM", this.realm).setAttribute("NONCE", this.nonce);
    await this.requestWithRetry(request, this.server);
  }
  refresh = (exp) => {
    this.refreshHandle = cancelable(async (_, __, onCancel) => {
      let run = true;
      onCancel.once(() => {
        run = false;
      });
      while (run) {
        const delay = 5 / 6 * exp * 1e3;
        log21("refresh delay", delay, { exp });
        await setTimeout4(delay);
        const request = new Message(4 /* REFRESH */, 0 /* REQUEST */);
        request.setAttribute("LIFETIME", exp);
        try {
          const [message] = await this.requestWithRetry(request, this.server);
          exp = message.getAttributeValue("LIFETIME");
          log21("refresh", { exp });
        } catch (error) {
          log21("refresh error", error);
        }
      }
    });
  };
  async request(request, addr, _integrityKey, retransmissionsOrOptions, onRequestSent) {
    if (this.transactions[request.transactionIdHex]) {
      throw new Error("exist");
    }
    if (this.integrityKey) {
      request.setAttribute("USERNAME", this.username).setAttribute("REALM", this.realm).setAttribute("NONCE", this.nonce).addMessageIntegrity(this.integrityKey).addFingerprint();
    }
    const resolvedAddr = await resolveRequestAddress(addr);
    const options = buildTransactionOptions(
      this.integrityKey,
      retransmissionsOrOptions,
      onRequestSent
    );
    const transaction = new Transaction(request, resolvedAddr, this, options);
    this.transactions[request.transactionIdHex] = transaction;
    try {
      return await transaction.run();
    } catch (e) {
      throw e;
    } finally {
      delete this.transactions[request.transactionIdHex];
    }
  }
  async requestWithRetry(request, addr) {
    let message, address;
    try {
      [message, address] = await this.request(request, addr);
    } catch (error) {
      if (error instanceof TransactionFailed == false) {
        log21("requestWithRetry error", error);
        throw error;
      }
      this.server = error.addr;
      const [errorCode] = error.response.getAttributeValue("ERROR-CODE");
      const nonce = error.response.getAttributeValue("NONCE");
      const realm = error.response.getAttributeValue("REALM");
      if ((errorCode === 401 && realm || errorCode === 438 && this.realm) && nonce) {
        log21("retry with nonce", errorCode);
        this.nonce = nonce;
        if (errorCode === 401) {
          this.realm = realm;
        }
        this.integrityKey = makeIntegrityKey(
          this.username,
          this.realm,
          this.password
        );
        request.transactionId = randomTransactionId();
        [message, address] = await this.request(request, this.server);
      } else {
        throw error;
      }
    }
    return [message, address];
  }
  async sendData(data, addr) {
    let channel;
    try {
      channel = await this.getChannel(addr);
    } catch (e) {
      log21("channelBind error; falling back to Send Indication", e);
    }
    if (!channel) {
      await this.getPermission(addr);
      const indicate = new Message(6 /* SEND */, 16 /* INDICATION */).setAttribute("DATA", data).setAttribute("XOR-PEER-ADDRESS", addr);
      await this.sendStun(indicate, this.server);
      return;
    }
    await this.send(encodeChannelData(channel.number, data), this.server);
  }
  /**
   * Ensure a CreatePermission exists for the peer IP.
   * Peer failures are isolated: a rejection for peer A does not poison peer B.
   */
  async getPermission(addr) {
    const key = permissionKey(addr);
    if (this.permissionByAddr[key]) {
      return;
    }
    const existing = this.creatingPermissionByAddr.get(key);
    if (existing) {
      return existing;
    }
    const operation = this.permissionQueue.then(async () => {
      if (this.permissionByAddr[key]) {
        return;
      }
      await this.createPermission(addr);
      this.permissionByAddr[key] = true;
    });
    this.permissionQueue = operation.then(
      () => void 0,
      () => void 0
    );
    this.creatingPermissionByAddr.set(key, operation);
    try {
      await operation;
    } catch (error) {
      log21("createPermission error", error);
      throw error;
    } finally {
      if (this.creatingPermissionByAddr.get(key) === operation) {
        this.creatingPermissionByAddr.delete(key);
      }
    }
  }
  /**
   * Ensure a ChannelBind exists for the peer transport address.
   * Peer failures are isolated; concurrent same-peer calls share one Promise.
   */
  async getChannel(addr) {
    const key = channelKey(addr);
    const existing = this.channelBindingByAddr.get(key);
    if (existing) {
      return existing;
    }
    const cached = this.channelByAddr[key];
    const now = int(Date.now() / 1e3);
    if (cached && cached.refreshAt > now) {
      return cached;
    }
    const operation = this.channelBindQueue.then(
      () => this.ensureChannel(addr)
    );
    this.channelBindQueue = operation.then(
      () => void 0,
      () => void 0
    );
    this.channelBindingByAddr.set(key, operation);
    try {
      return await operation;
    } catch (error) {
      log21("channelBind error", error);
      throw error;
    } finally {
      if (this.channelBindingByAddr.get(key) === operation) {
        this.channelBindingByAddr.delete(key);
      }
    }
  }
  /**
   * Create or refresh a channel for addr. Provisional mapping is installed
   * before the request so early ChannelData can be decoded; only a failed
   * *initial* bind rolls the mapping back. Failed channel numbers are never
   * reused.
   */
  async ensureChannel(addr) {
    const key = channelKey(addr);
    const now = int(Date.now() / 1e3);
    let channel = this.channelByAddr[key];
    if (channel && channel.refreshAt > now) {
      return channel;
    }
    const isNew = !channel;
    if (!channel) {
      channel = {
        number: this.channelNumber++,
        address: addr,
        refreshAt: 0
      };
      this.channelByAddr[key] = channel;
      this.addrByChannel[channel.number] = addr;
    }
    try {
      await this.channelBind(channel.number, addr);
      channel.refreshAt = int(Date.now() / 1e3) + this.channelRefreshTime;
      log21(isNew ? "channelBind" : "channelBind refresh", channel);
      return channel;
    } catch (error) {
      if (isNew) {
        delete this.channelByAddr[key];
        delete this.addrByChannel[channel.number];
      }
      throw error;
    }
  }
  async channelBind(channelNumber, addr) {
    const request = new Message(9 /* CHANNEL_BIND */, 0 /* REQUEST */);
    request.setAttribute("CHANNEL-NUMBER", channelNumber).setAttribute("XOR-PEER-ADDRESS", addr);
    const [response] = await this.requestWithRetry(request, this.server);
    if (response.messageMethod !== 9 /* CHANNEL_BIND */) {
      throw new Error("should be CHANNEL_BIND");
    }
  }
  async sendStun(message, addr) {
    await this.send(message.bytes, addr);
  }
  async close() {
    this.refreshHandle?.resolve?.();
    await this.transport.close();
  }
};
async function createTurnClient({ address, username, password }, {
  lifetime,
  portRange,
  interfaceAddresses,
  ssl,
  tlsOptions,
  transport: transportType
} = {}) {
  lifetime ??= DEFAULT_ALLOCATION_LIFETIME;
  transportType ??= ssl ? "tls" : "udp";
  const transport = transportType === "udp" ? await UdpTransport.init("udp4", { portRange, interfaceAddresses }) : transportType === "tcp" ? await TcpTransport.init(address) : await TlsTransport.init(address, tlsOptions);
  const turn = new TurnProtocol(
    address,
    username,
    password,
    lifetime,
    transport
  );
  await turn.connectionMade();
  return turn;
}
async function createStunOverTurnClient({
  address,
  username,
  password
}, {
  lifetime,
  portRange,
  interfaceAddresses,
  ssl,
  tlsOptions,
  transport: transportType
} = {}) {
  const turn = await createTurnClient(
    {
      address,
      username,
      password
    },
    {
      lifetime,
      portRange,
      interfaceAddresses,
      ssl,
      tlsOptions,
      transport: transportType
    }
  );
  const turnTransport = new StunOverTurnProtocol(turn);
  return turnTransport;
}
function makeIntegrityKey(username, realm, password) {
  return makeTurnIntegrityKey(username, realm, password);
}

// ../ice/src/candidate.ts
import { createHash as createHash3, randomUUID } from "crypto";
import { isIPv4 as isIPv42 } from "net";
var Candidate = class _Candidate {
  constructor(foundation, component, transport, priority, host, port, type, relatedAddress, relatedPort, tcptype, generation, ufrag) {
    this.foundation = foundation;
    this.component = component;
    this.transport = transport;
    this.priority = priority;
    this.host = host;
    this.port = port;
    this.type = type;
    this.relatedAddress = relatedAddress;
    this.relatedPort = relatedPort;
    this.tcptype = tcptype;
    this.generation = generation;
    this.ufrag = ufrag;
  }
  // An ICE candidate.
  id = randomUUID().toString();
  refreshId() {
    this.id = randomUUID().toString();
  }
  static fromSdp(sdp) {
    const bits = sdp.split(" ");
    if (bits.length < 8) {
      throw new Error("SDP does not have enough properties");
    }
    const kwargs = {
      foundation: bits[0],
      component: Number(bits[1]),
      transport: bits[2],
      priority: Number(bits[3]),
      host: bits[4],
      port: Number(bits[5]),
      type: bits[7]
    };
    for (let i = 8, il = bits.length - 1; i < il; i += 2) {
      if (bits[i] === "raddr") {
        kwargs["related_address"] = bits[i + 1];
      } else if (bits[i] === "rport") {
        kwargs["related_port"] = Number(bits[i + 1]);
      } else if (bits[i] === "tcptype") {
        kwargs["tcptype"] = bits[i + 1];
      } else if (bits[i] === "generation") {
        kwargs["generation"] = Number(bits[i + 1]);
      } else if (bits[i] === "ufrag") {
        kwargs["ufrag"] = bits[i + 1];
      }
    }
    const { foundation, component, transport, priority, host, port, type } = kwargs;
    return new _Candidate(
      foundation,
      component,
      transport,
      priority,
      host,
      port,
      type,
      kwargs["related_address"],
      kwargs["related_port"],
      kwargs["tcptype"],
      kwargs["generation"],
      kwargs["ufrag"]
    );
  }
  canPairWith(other) {
    const a = isIPv42(this.host);
    const b = isIPv42(other.host);
    return this.component === other.component && this.transport.toLowerCase() === other.transport.toLowerCase() && canPairTcpCandidates(this, other) && a === b;
  }
  toSdp() {
    let sdp = `${this.foundation} ${this.component} ${this.transport} ${this.priority} ${this.host} ${this.port} typ ${this.type}`;
    if (this.relatedAddress) sdp += ` raddr ${this.relatedAddress}`;
    if (this.relatedPort != void 0) sdp += ` rport ${this.relatedPort}`;
    if (this.tcptype) sdp += ` tcptype ${this.tcptype}`;
    if (this.generation != void 0) sdp += ` generation ${this.generation}`;
    if (this.ufrag != void 0) sdp += ` ufrag ${this.ufrag}`;
    return sdp;
  }
};
var UDP_TYPE_PREFERENCE = {
  host: 126,
  prflx: 110,
  srflx: 100,
  relay: 0
};
var TCP_TYPE_PREFERENCE = {
  host: 105,
  prflx: 90,
  srflx: 80,
  relay: 0
};
var ACTIVE_PASSIVE_DIRECTION_PREFERENCE = {
  active: 6,
  passive: 4,
  so: 2
};
var REFLEXIVE_DIRECTION_PREFERENCE = {
  active: 4,
  passive: 2,
  so: 6
};
function normalizeTransport(transport) {
  return transport?.toLowerCase() ?? "udp";
}
function normalizeTcpType(tcptype) {
  switch (tcptype) {
    case "active":
    case "passive":
    case "so":
      return tcptype;
    default:
      return void 0;
  }
}
function canPairTcpCandidates(local, remote) {
  if (normalizeTransport(local.transport) !== "tcp") {
    return true;
  }
  const localType = normalizeTcpType(local.tcptype);
  const remoteType = normalizeTcpType(remote.tcptype);
  if (!localType || !remoteType) {
    return false;
  }
  return localType === "active" && remoteType === "passive" || localType === "passive" && remoteType === "active" || localType === "so" && remoteType === "so";
}
function candidateLocalPreference({
  candidateType,
  transport = "udp",
  tcptype,
  otherPreference = 8191
}) {
  if (normalizeTransport(transport) !== "tcp") {
    return otherPreference;
  }
  const tcpType = normalizeTcpType(tcptype) ?? "active";
  const directionPreference = candidateType === "srflx" || candidateType === "prflx" ? REFLEXIVE_DIRECTION_PREFERENCE[tcpType] : ACTIVE_PASSIVE_DIRECTION_PREFERENCE[tcpType];
  return (1 << 13) * directionPreference + otherPreference;
}
function candidateTypePreference(candidateType, transport = "udp") {
  const table = normalizeTransport(transport) === "tcp" ? TCP_TYPE_PREFERENCE : UDP_TYPE_PREFERENCE;
  return table[candidateType] ?? 0;
}
function candidateFoundation(candidateType, candidateTransport, baseAddress) {
  const key = `${candidateType}|${candidateTransport}|${baseAddress}`;
  return createHash3("md5").update(key, "ascii").digest("hex").slice(7);
}
function candidatePriority(candidateType, options = 65535) {
  const candidateComponent = 1;
  const transport = typeof options === "number" ? "udp" : normalizeTransport(options.transport);
  const localPref = typeof options === "number" ? options : options.localPreference ?? candidateLocalPreference({
    candidateType,
    transport,
    tcptype: options.tcptype,
    otherPreference: options.otherPreference
  });
  const typePref = candidateTypePreference(candidateType, transport);
  return (1 << 24) * typePref + (1 << 8) * localPref + (256 - candidateComponent);
}
function remoteTcpTypeForIncoming(localTcpType) {
  switch (localTcpType) {
    case "passive":
      return "active";
    case "active":
      return "passive";
    default:
      return "so";
  }
}

// ../ice/src/ice.ts
import { randomBytes as randomBytes7 } from "crypto";
import { isIPv4 as isIPv43 } from "net";
import * as timers from "node:timers/promises";

// ../ice/src/dns/lookup.ts
import mdns from "multicast-dns";
var MdnsLookup = class {
  cache = /* @__PURE__ */ new Map();
  mdnsInstance = mdns();
  constructor() {
    this.mdnsInstance.setMaxListeners(50);
  }
  lookup(host) {
    return new Promise((r, f) => {
      const cleanup = () => {
        this.mdnsInstance.removeListener("response", l);
        clearTimeout(timeout);
      };
      const timeout = setTimeout(() => {
        cleanup();
        f(new Error("No mDNS response"));
      }, 1e4);
      const l = (response) => {
        const a = response.answers?.[0];
        if (a?.type !== "A") {
          return;
        }
        if (a.name !== host) {
          return;
        }
        cleanup();
        r(a.data);
      };
      this.mdnsInstance.on("response", l);
      this.mdnsInstance.query(host, "A");
    });
  }
  close() {
    this.mdnsInstance.destroy();
  }
};

// ../ice/src/iceBase.ts
import { randomUUID as randomUUID2 } from "crypto";
var log22 = debug("werift-ice : packages/ice/src/ice.ts : log");
var CandidatePair = class {
  constructor(protocol, remoteCandidate, iceControlling) {
    this.protocol = protocol;
    this.remoteCandidate = remoteCandidate;
    this.iceControlling = iceControlling;
  }
  id = randomUUID2().toString();
  handle;
  nominated = false;
  remoteNominated = false;
  // 5.7.4.  Computing States
  _state = 0 /* FROZEN */;
  get state() {
    return this._state;
  }
  // Statistics tracking
  packetsSent = 0;
  packetsReceived = 0;
  bytesSent = 0;
  bytesReceived = 0;
  rtt;
  totalRoundTripTime = 0;
  roundTripTimeMeasurements = 0;
  requestsReceived = 0;
  requestsSent = 0;
  responsesReceived = 0;
  responsesSent = 0;
  retransmissionsReceived = 0;
  retransmissionsSent = 0;
  consentRequestsSent = 0;
  requestTransactionIds = /* @__PURE__ */ new Set();
  toJSON() {
    return this.json;
  }
  get json() {
    return {
      protocol: this.protocol.type,
      localCandidate: this.localCandidate.toSdp(),
      remoteCandidate: this.remoteCandidate.toSdp()
    };
  }
  updateState(state) {
    this._state = state;
  }
  get localCandidate() {
    if (!this.protocol.localCandidate) {
      throw new Error("localCandidate not exist");
    }
    return this.protocol.localCandidate;
  }
  get remoteAddr() {
    return [this.remoteCandidate.host, this.remoteCandidate.port];
  }
  get component() {
    return this.localCandidate.component;
  }
  get priority() {
    return candidatePairPriority(
      this.localCandidate,
      this.remoteCandidate,
      this.iceControlling
    );
  }
  get foundation() {
    return this.localCandidate.foundation;
  }
  noteIncomingRequest(transactionId) {
    const isRetransmission = this.requestTransactionIds.has(transactionId);
    if (!isRetransmission) {
      this.requestTransactionIds.add(transactionId);
      return false;
    }
    this.retransmissionsReceived++;
    return true;
  }
};
var ICE_COMPLETED = 1;
var ICE_FAILED = 2;
var CONSENT_INTERVAL = 5;
var CONSENT_FAILURES = 6;
var CONSENT_TIMEOUT = 30;
var CONSENT_RESPONSE_TIMEOUT = 1e3;
var CONSENT_RESPONSE_TIMEOUT_MIN = 500;
function consentResponseTimeoutMs(rttSeconds) {
  if (rttSeconds === void 0 || !Number.isFinite(rttSeconds) || rttSeconds <= 0) {
    return CONSENT_RESPONSE_TIMEOUT;
  }
  return Math.max(
    CONSENT_RESPONSE_TIMEOUT_MIN,
    Math.round(rttSeconds * 1e3 * 2 + 200)
  );
}
var CandidatePairState = /* @__PURE__ */ ((CandidatePairState2) => {
  CandidatePairState2[CandidatePairState2["FROZEN"] = 0] = "FROZEN";
  CandidatePairState2[CandidatePairState2["WAITING"] = 1] = "WAITING";
  CandidatePairState2[CandidatePairState2["IN_PROGRESS"] = 2] = "IN_PROGRESS";
  CandidatePairState2[CandidatePairState2["SUCCEEDED"] = 3] = "SUCCEEDED";
  CandidatePairState2[CandidatePairState2["FAILED"] = 4] = "FAILED";
  return CandidatePairState2;
})(CandidatePairState || {});
var defaultOptions = {
  iceLite: false,
  useTcp: false,
  useIpv4: true,
  useIpv6: true
};
function validateRemoteCandidate(candidate) {
  if (!["host", "relay", "srflx"].includes(candidate.type))
    throw new Error(`Unexpected candidate type "${candidate.type}"`);
  return candidate;
}
function sortCandidatePairs(pairs, iceControlling) {
  return pairs.sort(
    (a, b) => candidatePairPriority(
      a.localCandidate,
      a.remoteCandidate,
      iceControlling
    ) - candidatePairPriority(
      b.localCandidate,
      b.remoteCandidate,
      iceControlling
    )
  ).reverse();
}
function candidatePairPriority(local, remote, iceControlling) {
  const G = iceControlling && local.priority || remote.priority;
  const D = iceControlling && remote.priority || local.priority;
  return (1 << 32) * Math.min(G, D) + 2 * Math.max(G, D) + (G > D ? 1 : 0);
}
async function serverReflexiveCandidate(protocol, stunServer) {
  const request = new Message(1 /* BINDING */, 0 /* REQUEST */);
  try {
    const [response] = await protocol.request(request, stunServer);
    const localCandidate = protocol.localCandidate;
    if (!localCandidate) {
      throw new Error("not exist");
    }
    const candidate = new Candidate(
      candidateFoundation(
        "srflx",
        localCandidate.transport,
        localCandidate.host
      ),
      localCandidate.component,
      localCandidate.transport,
      candidatePriority("srflx", {
        transport: localCandidate.transport,
        tcptype: localCandidate.tcptype
      }),
      response.getAttributeValue("XOR-MAPPED-ADDRESS")[0],
      response.getAttributeValue("XOR-MAPPED-ADDRESS")[1],
      "srflx",
      localCandidate.host,
      localCandidate.port,
      localCandidate.tcptype
    );
    return candidate;
  } catch (error) {
    log22("error serverReflexiveCandidate", error);
  }
}
function validateAddress(addr) {
  if (addr && Number.isNaN(addr[1])) {
    return [addr[0], 443];
  }
  return addr;
}

// ../ice/src/utils.ts
import * as os from "node:os";

// ../ice/src/internal/selectAddresses.ts
function selectAddressesFromInterfaces(interfaces, family, options = {}, isLinkLocal) {
  const costlyNetworks = ["ipsec", "tun", "utun", "tap"];
  const banNetworks = ["vmnet", "veth"];
  const { useLinkLocalAddress } = options;
  const all = Object.keys(interfaces).map((nic) => {
    for (const word of [...costlyNetworks, ...banNetworks]) {
      if (nic.startsWith(word)) {
        return {
          nic,
          addresses: []
        };
      }
    }
    const addresses = (interfaces[nic] ?? []).filter(
      (details) => normalizeFamilyNodeV18(details.family) === family && !details.internal && (useLinkLocalAddress ? true : !isLinkLocal(details))
    );
    return {
      nic,
      addresses: addresses.map((address) => address.address)
    };
  }).filter((address) => !!address);
  all.sort((a, b) => a.nic.localeCompare(b.nic));
  return Object.values(all).flatMap((entry) => entry.addresses);
}

// ../ice/src/utils.ts
var logger = debug("werift-ice : packages/ice/src/utils.ts");
async function getGlobalIp(stunServer, interfaceAddresses) {
  const protocol = new StunProtocol();
  await protocol.connectionMade(true, void 0, interfaceAddresses);
  const request = new Message(1 /* BINDING */, 0 /* REQUEST */);
  const [response] = await protocol.request(
    request,
    stunServer ?? ["stun.l.google.com", 19302]
  );
  await protocol.close();
  const address = response.getAttributeValue("XOR-MAPPED-ADDRESS");
  return address[0];
}
function isLinkLocalAddress(info) {
  return normalizeFamilyNodeV18(info.family) === 4 && info.address?.startsWith("169.254.") || normalizeFamilyNodeV18(info.family) === 6 && info.address?.startsWith("fe80::");
}
function nodeIpAddress(family, {
  useLinkLocalAddress
} = {}) {
  const interfaces = os.networkInterfaces();
  logger(interfaces);
  return selectAddressesFromInterfaces(
    interfaces,
    family,
    { useLinkLocalAddress },
    isLinkLocalAddress
  );
}
function getHostAddresses(useIpv4, useIpv6, options = {}) {
  const address = [];
  if (useIpv4) {
    address.push(...nodeIpAddress(4, options));
  }
  if (useIpv6) {
    address.push(...nodeIpAddress(6, options));
  }
  return address;
}
var url2Address = (url) => {
  if (!url) return;
  const [address, port] = url.split(":");
  return [address, Number.parseInt(port)];
};

// ../ice/src/ice.ts
var log23 = debug("werift-ice : packages/ice/src/ice.ts : log");
var Connection = class {
  constructor(_iceControlling, options) {
    this._iceControlling = _iceControlling;
    this.options = {
      ...defaultOptions,
      ...options
    };
    if (this.iceLite) {
      this._iceControlling = false;
    }
    const { stunServer, turnServer } = this.options;
    this.stunServer = validateAddress(stunServer) ?? [
      "stun.l.google.com",
      19302
    ];
    this.turnServer = validateAddress(turnServer);
    this.restart();
    log23("new Connection", this.options);
  }
  localUsername = randomString(4);
  localPassword = randomString(22);
  remoteIsLite = false;
  remotePassword = "";
  remoteUsername = "";
  checkList = [];
  localCandidates = [];
  stunServer;
  turnServer;
  options;
  remoteCandidatesEnd = false;
  localCandidatesEnd = false;
  generation = -1;
  userHistory = {};
  tieBreaker = randomBytes7(8).readBigUInt64BE(0);
  state = "new";
  lookup;
  _remoteCandidates = [];
  // P2P接続完了したソケット
  nominated;
  nominating = false;
  checkListDone = false;
  checkListState = new PQueue();
  earlyChecks = [];
  earlyChecksDone = false;
  localCandidatesStart = false;
  protocols = [];
  queryConsentHandle;
  /** RFC 7675 consent-to-send: application data may use the selected pair. */
  consentFresh = false;
  /** Invalidates in-flight consent callbacks on restart / close / replace / expire. */
  consentSessionId = 0;
  consentExpiryTimer;
  consentRequestAbort;
  onData = new Event2();
  stateChanged = new Event2();
  onIceCandidate = new Event2();
  get iceControlling() {
    return this._iceControlling;
  }
  set iceControlling(value) {
    if (this.iceLite) {
      value = false;
    }
    if (this.nominated) {
      return;
    }
    this.applyIceControlling(value);
  }
  get iceLite() {
    return this.options.iceLite;
  }
  async restart() {
    this.generation++;
    this.localUsername = randomString(4);
    this.localPassword = randomString(22);
    if (this.options.localPasswordPrefix) {
      this.localPassword = this.options.localPasswordPrefix + this.localPassword.slice(this.options.localPasswordPrefix.length);
    }
    this.userHistory[this.localUsername] = this.localPassword;
    this.remoteUsername = "";
    this.remotePassword = "";
    this.localCandidates = [];
    this._remoteCandidates = [];
    this.remoteCandidatesEnd = false;
    this.localCandidatesEnd = false;
    this.state = "new";
    this.lookup?.close?.();
    this.lookup = void 0;
    this.nominated = void 0;
    this.nominating = false;
    this.checkList = [];
    this.checkListDone = false;
    this.checkListState = new PQueue();
    this.earlyChecks = [];
    this.earlyChecksDone = false;
    this.localCandidatesStart = false;
    for (const protocol of this.protocols) {
      if (protocol.localCandidate) {
        protocol.localCandidate.refreshId();
        protocol.localCandidate.generation = this.generation;
        protocol.localCandidate.ufrag = this.localUsername;
      }
    }
    this.stopConsentLifecycle();
  }
  resetNominatedPair() {
    log23("resetNominatedPair");
    this.nominated = void 0;
    this.nominating = false;
    this.stopConsentLifecycle();
  }
  setRemoteParams({
    iceLite,
    usernameFragment,
    password
  }) {
    log23("setRemoteParams", { iceLite, usernameFragment, password });
    this.remoteIsLite = iceLite;
    this.remoteUsername = usernameFragment;
    this.remotePassword = password;
  }
  // 4.1.1 Gathering Candidates
  async gatherCandidates() {
    if (!this.localCandidatesStart) {
      this.localCandidatesStart = true;
      for (const protocol of this.protocols) {
        if (protocol.localCandidate) {
          protocol.localCandidate.generation = this.generation;
          protocol.localCandidate.ufrag = this.localUsername;
          this.appendLocalCandidate(protocol.localCandidate);
        }
      }
      let address = getHostAddresses(
        this.options.useIpv4,
        this.options.useIpv6,
        {
          useLinkLocalAddress: this.options.useLinkLocalAddress
        }
      );
      const { interfaceAddresses } = this.options;
      if (interfaceAddresses) {
        const filteredAddresses = address.filter(
          (check) => Object.values(interfaceAddresses).includes(check)
        );
        if (filteredAddresses.length) {
          address = filteredAddresses;
        }
      }
      if (this.options.additionalHostAddresses) {
        address = Array.from(
          /* @__PURE__ */ new Set([...this.options.additionalHostAddresses, ...address])
        );
      }
      const candidatePromises = this.getCandidatePromises(address, 5);
      await Promise.allSettled(candidatePromises);
      this.localCandidatesEnd = true;
    }
    this.setState("completed");
  }
  appendLocalCandidate(candidate) {
    this.localCandidates.push(candidate);
    this.onIceCandidate.execute(candidate);
  }
  ensureProtocol(protocol) {
    protocol.onRequestReceived.subscribe((msg, addr, data) => {
      if (msg.messageMethod !== 1 /* BINDING */) {
        this.respondError(msg, addr, protocol, [400, "Bad Request"]);
        return;
      }
      const txUsername = msg.getAttributeValue("USERNAME");
      const { remoteUsername: localUsername } = decodeTxUsername(txUsername);
      const localPassword = this.userHistory[localUsername] ?? this.localPassword;
      const { iceControlling } = this;
      if (iceControlling && msg.attributesKeys.includes("ICE-CONTROLLING")) {
        if (this.tieBreaker >= msg.getAttributeValue("ICE-CONTROLLING")) {
          this.respondError(msg, addr, protocol, [487, "Role Conflict"]);
          return;
        } else {
          this.switchRole(false);
        }
      } else if (!iceControlling && msg.attributesKeys.includes("ICE-CONTROLLED")) {
        if (this.iceLite || this.tieBreaker < msg.getAttributeValue("ICE-CONTROLLED")) {
          this.respondError(msg, addr, protocol, [487, "Role Conflict"]);
          return;
        } else {
          this.switchRole(true);
          return;
        }
      }
      if (this.options.filterStunResponse && !this.options.filterStunResponse(msg, addr, protocol)) {
        return;
      }
      const response = new Message(
        1 /* BINDING */,
        256 /* RESPONSE */,
        msg.transactionId
      );
      response.setAttribute("XOR-MAPPED-ADDRESS", addr).addMessageIntegrity(Buffer.from(localPassword, "utf8")).addFingerprint();
      protocol.sendStun(response, addr).catch((e) => {
        log23("sendStun error", e);
      });
      if (this.checkList.length === 0 && !this.earlyChecksDone) {
        this.earlyChecks.push([msg, addr, protocol]);
      } else {
        this.checkIncoming(msg, addr, protocol);
      }
    });
    protocol.onDataReceived.subscribe((data) => {
      try {
        const activePair = this.nominated;
        if (activePair && activePair.protocol === protocol) {
          activePair.packetsReceived++;
          activePair.bytesReceived += data.length;
        }
        this.onData.execute(data);
      } catch (error) {
        log23("dataReceived", error);
      }
    });
  }
  getCandidatePromises(addresses, timeout = 5) {
    const candidatePromises = [];
    const { stunServer, turnServer } = this;
    const { turnUsername, turnPassword } = this.options;
    const gatherIceLite = this.iceLite;
    const gatherRelayOnly = !gatherIceLite && this.options.forceTurn && turnServer && turnUsername && turnPassword;
    addresses = addresses.filter((address) => {
      if (this.protocols.find((protocol) => protocol.localIp === address)) {
        return false;
      }
      return true;
    });
    const localStunPromises = gatherRelayOnly ? [] : addresses.map(async (address) => {
      const protocol = new StunProtocol();
      this.ensureProtocol(protocol);
      try {
        await protocol.connectionMade(
          isIPv43(address),
          this.options.portRange,
          this.options.interfaceAddresses
        );
        protocol.localIp = address;
        this.protocols.push(protocol);
        log23("protocol", protocol.localIp);
        const candidateAddress = [
          address,
          protocol.getExtraInfo()[1]
        ];
        protocol.localCandidate = new Candidate(
          candidateFoundation("host", "udp", candidateAddress[0]),
          1,
          "udp",
          candidatePriority("host", { transport: "udp" }),
          candidateAddress[0],
          candidateAddress[1],
          "host",
          void 0,
          void 0,
          void 0,
          this.generation,
          this.localUsername
        );
        this.pairLocalProtocol(protocol);
        this.appendLocalCandidate(protocol.localCandidate);
        return protocol;
      } catch (error) {
        log23("error protocol STUN", error);
      }
    });
    if (!gatherRelayOnly) {
      candidatePromises.push(
        ...localStunPromises.map(
          (localPromise) => localPromise.then((protocol) => protocol?.localCandidate)
        )
      );
    }
    if (!gatherRelayOnly && this.options.useTcp) {
      const tcpCandidatePromises = addresses.map(async (address) => {
        const passiveProtocol = new TcpPassiveProtocol();
        this.ensureProtocol(passiveProtocol);
        await passiveProtocol.connectionMade(address, this.options.portRange);
        passiveProtocol.localIp = address;
        passiveProtocol.localCandidate = new Candidate(
          candidateFoundation("host", "tcp", address),
          1,
          "tcp",
          candidatePriority("host", {
            transport: "tcp",
            tcptype: "passive"
          }),
          address,
          passiveProtocol.listeningPort,
          "host",
          void 0,
          void 0,
          "passive",
          this.generation,
          this.localUsername
        );
        this.protocols.push(passiveProtocol);
        this.appendLocalCandidate(passiveProtocol.localCandidate);
        if (!gatherIceLite) {
          const activeProtocol = new TcpActiveProtocol();
          this.ensureProtocol(activeProtocol);
          await activeProtocol.connectionMade(address);
          activeProtocol.localIp = address;
          activeProtocol.localCandidate = new Candidate(
            candidateFoundation("host", "tcp", address),
            1,
            "tcp",
            candidatePriority("host", {
              transport: "tcp",
              tcptype: "active"
            }),
            address,
            9,
            "host",
            void 0,
            void 0,
            "active",
            this.generation,
            this.localUsername
          );
          this.protocols.push(activeProtocol);
          this.pairLocalProtocol(activeProtocol);
          this.appendLocalCandidate(activeProtocol.localCandidate);
        }
      });
      candidatePromises.push(...tcpCandidatePromises);
    }
    if (!gatherIceLite && !gatherRelayOnly && stunServer) {
      const stunCandidatePromises = localStunPromises.map(
        async (protocolPromise) => {
          const protocol = await protocolPromise;
          if (!protocol) return;
          const stunCandidatePromise = new Promise(
            async (r, f) => {
              const timer2 = setTimeout(f, timeout * 1e3);
              if (protocol.localCandidate?.host && isIPv43(protocol.localCandidate?.host)) {
                const candidate = await serverReflexiveCandidate(
                  protocol,
                  stunServer
                ).catch((error) => {
                  log23("error", error);
                });
                if (candidate) {
                  this.appendLocalCandidate(candidate);
                }
                clearTimeout(timer2);
                r(candidate);
              } else {
                clearTimeout(timer2);
                r();
              }
            }
          ).catch((error) => {
            log23("query STUN server", error);
          });
          return stunCandidatePromise;
        }
      );
      candidatePromises.push(...stunCandidatePromises);
    }
    if (!gatherIceLite && turnServer && turnUsername && turnPassword) {
      const turnCandidatePromise = (async () => {
        const turnTransport = this.options.turnTransport ?? "udp";
        const protocol = await createStunOverTurnClient(
          {
            address: turnServer,
            username: turnUsername,
            password: turnPassword
          },
          {
            portRange: this.options.portRange,
            interfaceAddresses: this.options.interfaceAddresses,
            transport: turnTransport,
            tlsOptions: this.options.turnTlsOptions
          }
        ).catch(async (e) => {
          if (turnTransport === "udp") {
            return await createStunOverTurnClient(
              {
                address: turnServer,
                username: turnUsername,
                password: turnPassword
              },
              {
                portRange: this.options.portRange,
                interfaceAddresses: this.options.interfaceAddresses,
                transport: "tcp"
              }
            );
          } else {
            throw e;
          }
        });
        this.ensureProtocol(protocol);
        this.protocols.push(protocol);
        const candidateAddress = protocol.turn.relayedAddress;
        const relatedAddress = protocol.turn.mappedAddress;
        log23("turn candidateAddress", candidateAddress);
        protocol.localCandidate = new Candidate(
          candidateFoundation("relay", "udp", candidateAddress[0]),
          1,
          "udp",
          candidatePriority("relay"),
          candidateAddress[0],
          candidateAddress[1],
          "relay",
          relatedAddress[0],
          relatedAddress[1],
          void 0,
          this.generation,
          this.localUsername
        );
        this.appendLocalCandidate(protocol.localCandidate);
        return protocol.localCandidate;
      })().catch((error) => {
        log23("query TURN server", error);
      });
      candidatePromises.push(turnCandidatePromise);
    }
    return candidatePromises;
  }
  async connect() {
    log23("start connect ice");
    if (!this.localCandidatesEnd) {
      if (!this.localCandidatesStart) {
        throw new Error("Local candidates gathering was not performed");
      }
    }
    if (!this.remoteUsername || !this.remotePassword) {
      throw new Error("Remote username or password is missing");
    }
    for (const c of this.remoteCandidates) {
      this.pairRemoteCandidate(c);
    }
    this.sortCheckList();
    if (!this.iceLite) {
      this.unfreezeInitial();
    }
    log23("earlyChecks", this.localPassword, this.earlyChecks.length);
    for (const earlyCheck of this.earlyChecks) {
      this.checkIncoming(...earlyCheck);
    }
    this.earlyChecks = [];
    this.earlyChecksDone = true;
    if (this.iceLite) {
      if (!this.nominated) {
        let res2 = ICE_FAILED;
        while (!this.checkListDone && this.state !== "closed") {
          res2 = await this.checkListState.get();
          log23("checkListState", res2);
          if (res2 === ICE_COMPLETED) {
            break;
          }
        }
        if (res2 !== ICE_COMPLETED && !this.nominated) {
          throw new Error("ICE negotiation failed");
        }
      }
      this.setState("connected");
      return;
    }
    for (; ; ) {
      if (this.state === "closed") break;
      if (!this.schedulingChecks()) break;
      await timers.setTimeout(20);
    }
    let res = ICE_FAILED;
    while (this.checkList.length > 0 && res === ICE_FAILED) {
      res = await this.checkListState.get();
      log23("checkListState", res);
    }
    for (const check of this.checkList) {
      check.handle?.resolve?.();
    }
    if (res !== ICE_COMPLETED) {
      throw new Error("ICE negotiation failed");
    }
    this.queryConsent();
    this.setState("connected");
  }
  unfreezeInitial() {
    const [firstPair] = this.checkList;
    if (!firstPair) return;
    if (firstPair.state === 0 /* FROZEN */) {
      firstPair.updateState(1 /* WAITING */);
    }
    const seenFoundations = new Set(firstPair.localCandidate.foundation);
    for (const pair of this.checkList) {
      if (pair.component === firstPair.component && !seenFoundations.has(pair.localCandidate.foundation) && pair.state === 0 /* FROZEN */) {
        pair.updateState(1 /* WAITING */);
        seenFoundations.add(pair.localCandidate.foundation);
      }
    }
  }
  // 5.8 Scheduling Checks
  schedulingChecks() {
    {
      const pair = this.checkList.filter((pair2) => {
        if (this.options.forceTurn && pair2.protocol.type === StunProtocol.type)
          return false;
        return true;
      }).find((pair2) => pair2.state === 1 /* WAITING */);
      if (pair) {
        pair.handle = this.checkStart(pair);
        return true;
      }
    }
    {
      const pair = this.checkList.find(
        (pair2) => pair2.state === 0 /* FROZEN */
      );
      if (pair) {
        pair.handle = this.checkStart(pair);
        return true;
      }
    }
    if (!this.remoteCandidatesEnd) {
      return !this.checkListDone;
    }
    return false;
  }
  /**
   * Stop consent request cadence, expiry timer, and outstanding transactions.
   * Does not change ICE state by itself.
   */
  stopConsentLifecycle() {
    this.consentSessionId++;
    this.consentFresh = false;
    if (this.consentExpiryTimer !== void 0) {
      clearTimeout(this.consentExpiryTimer);
      this.consentExpiryTimer = void 0;
    }
    this.consentRequestAbort?.abort();
    this.consentRequestAbort = void 0;
    const handle = this.queryConsentHandle;
    this.queryConsentHandle = void 0;
    handle?.resolve?.();
  }
  /**
   * ICE-lite interop only (not required by RFC 7675): mirror libwebrtc
   * semi-aggressive nomination — attach USE-CANDIDATE when we are controlling,
   * the remote is ICE-lite, and the target is the current selected pair.
   */
  shouldNominateConsentRequest(pair) {
    return this.iceControlling && this.remoteIsLite && this.nominated?.id === pair.id;
  }
  canSendApplicationData() {
    if (!this.nominated) {
      return false;
    }
    if (this.state === "closed" || this.state === "failed") {
      return false;
    }
    if (this.iceLite) {
      return true;
    }
    return this.consentFresh;
  }
  abortableDelay(ms, signal) {
    return new Promise((resolve, reject) => {
      if (signal.aborted) {
        reject(new DOMException("The operation was aborted", "AbortError"));
        return;
      }
      const timer2 = setTimeout(() => {
        signal.removeEventListener("abort", onAbort);
        resolve();
      }, ms);
      const onAbort = () => {
        clearTimeout(timer2);
        reject(new DOMException("The operation was aborted", "AbortError"));
      };
      signal.addEventListener("abort", onAbort, { once: true });
    });
  }
  // RFC 7675 consent freshness
  queryConsent = () => {
    if (this.iceLite) {
      return;
    }
    this.stopConsentLifecycle();
    const sessionId = this.consentSessionId;
    this.consentFresh = true;
    const handle = cancelable(async (_, __, onCancel) => {
      let canceled = false;
      const cancelEvent = new AbortController();
      const clearConsentExpiry = () => {
        if (this.consentExpiryTimer === void 0) {
          return;
        }
        clearTimeout(this.consentExpiryTimer);
        this.consentExpiryTimer = void 0;
      };
      const refreshConsentExpiry = () => {
        if (canceled || sessionId !== this.consentSessionId) {
          return;
        }
        clearConsentExpiry();
        this.consentExpiryTimer = setTimeout(() => {
          this.consentExpiryTimer = void 0;
          if (canceled || sessionId !== this.consentSessionId) {
            return;
          }
          if (this.state === "closed" || this.state === "failed") {
            return;
          }
          log23("Consent to send expired");
          this.consentFresh = false;
          this.consentSessionId++;
          this.consentRequestAbort?.abort();
          this.consentRequestAbort = void 0;
          if (this.queryConsentHandle === handle) {
            this.queryConsentHandle = void 0;
          }
          canceled = true;
          cancelEvent.abort();
          this.setState("failed");
        }, CONSENT_TIMEOUT * 1e3);
      };
      onCancel.once(() => {
        canceled = true;
        if (sessionId === this.consentSessionId) {
          clearConsentExpiry();
          this.consentRequestAbort?.abort();
          this.consentRequestAbort = void 0;
        }
        cancelEvent.abort();
        if (this.queryConsentHandle === handle) {
          this.queryConsentHandle = void 0;
        }
      });
      refreshConsentExpiry();
      const randomizedConsentInterval = () => CONSENT_INTERVAL * (0.8 + 0.4 * Math.random()) * 1e3;
      let nextConsentAt = Date.now() + randomizedConsentInterval();
      const isTerminalState = () => this.state === "closed" || this.state === "failed";
      try {
        while (!isTerminalState() && !canceled && sessionId === this.consentSessionId) {
          await this.abortableDelay(
            Math.max(0, nextConsentAt - Date.now()),
            cancelEvent.signal
          );
          if (canceled || isTerminalState() || sessionId !== this.consentSessionId) {
            break;
          }
          nextConsentAt = Date.now() + randomizedConsentInterval();
          const nominated = this.nominated;
          if (!nominated) {
            break;
          }
          const pairId = nominated.id;
          const generation = this.generation;
          const remotePassword = this.remotePassword;
          const { localUsername, remoteUsername, iceControlling } = this;
          const request = this.buildRequest({
            nominate: this.shouldNominateConsentRequest(nominated),
            localUsername,
            remoteUsername,
            iceControlling,
            localCandidate: nominated.localCandidate
          });
          this.consentRequestAbort?.abort();
          const requestAbort = new AbortController();
          this.consentRequestAbort = requestAbort;
          nominated.consentRequestsSent++;
          nominated.requestsSent++;
          const responseTimeout = consentResponseTimeoutMs(nominated.rtt);
          const requestStartedAt = performance.now();
          nominated.protocol.request(
            request,
            nominated.remoteAddr,
            Buffer.from(remotePassword, "utf8"),
            {
              retransmissions: 0,
              responseTimeout,
              signal: requestAbort.signal,
              onRequestSent: (attempt) => {
                if (attempt > 0) {
                  nominated.retransmissionsSent++;
                }
              }
            }
          ).then(() => {
            if (sessionId !== this.consentSessionId || canceled) {
              return;
            }
            const state = this.state;
            if (state === "closed" || state === "failed") {
              return;
            }
            if (this.nominated?.id !== pairId) {
              return;
            }
            if (this.generation !== generation) {
              return;
            }
            if (this.remotePassword !== remotePassword) {
              return;
            }
            const rtt = (performance.now() - requestStartedAt) / 1e3;
            nominated.rtt = rtt;
            nominated.totalRoundTripTime += rtt;
            nominated.roundTripTimeMeasurements++;
            nominated.responsesReceived++;
            this.consentFresh = true;
            refreshConsentExpiry();
            if (state === "disconnected") {
              this.setState("connected");
            }
          }).catch((error) => {
            if (sessionId === this.consentSessionId && this.nominated?.id === pairId) {
              log23("no stun response", error);
            }
          });
        }
      } catch (error) {
      } finally {
        if (sessionId === this.consentSessionId) {
          clearConsentExpiry();
        }
      }
    });
    this.queryConsentHandle = handle;
  };
  async close() {
    this.setState("closed");
    this.stopConsentLifecycle();
    if (this.checkList && !this.checkListDone) {
      this.checkListState.put(
        new Promise((r) => {
          r(ICE_FAILED);
        })
      );
    }
    this.nominated = void 0;
    for (const protocol of this.protocols) {
      if (protocol.close) {
        await protocol.close();
      }
    }
    this.protocols = [];
    this.localCandidates = [];
    this.lookup?.close?.();
    this.lookup = void 0;
  }
  setState(state) {
    this.state = state;
    this.stateChanged.execute(state);
  }
  async addRemoteCandidate(remoteCandidate) {
    if (!remoteCandidate) {
      this.remoteCandidatesEnd = true;
      return;
    }
    if (remoteCandidate.host.includes(".local")) {
      try {
        if (!this.lookup) {
          this.lookup = new MdnsLookup();
        }
        const host = await this.lookup.lookup(remoteCandidate.host);
        remoteCandidate.host = host;
      } catch (error) {
        return;
      }
    }
    try {
      validateRemoteCandidate(remoteCandidate);
    } catch (error) {
      return;
    }
    log23("addRemoteCandidate", remoteCandidate);
    this._remoteCandidates.push(remoteCandidate);
    this.pairRemoteCandidate(remoteCandidate);
    this.sortCheckList();
  }
  send = async (data) => {
    if (!this.canSendApplicationData()) {
      return;
    }
    const activePair = this.nominated;
    await activePair.protocol.sendData(data, activePair.remoteAddr);
    activePair.packetsSent++;
    activePair.bytesSent += data.length;
  };
  getDefaultCandidate() {
    const candidates = this.localCandidates.sort(
      (a, b) => a.priority - b.priority
    );
    const [candidate] = candidates;
    return candidate;
  }
  // for test only
  set remoteCandidates(value) {
    if (this.remoteCandidatesEnd)
      throw new Error("Cannot set remote candidates after end-of-candidates.");
    this._remoteCandidates = [];
    for (const remoteCandidate of value) {
      try {
        validateRemoteCandidate(remoteCandidate);
      } catch (error) {
        continue;
      }
      this._remoteCandidates.push(remoteCandidate);
    }
    this.remoteCandidatesEnd = true;
  }
  get remoteCandidates() {
    return this._remoteCandidates;
  }
  get candidatePairs() {
    return this.checkList;
  }
  sortCheckList() {
    sortCandidatePairs(this.checkList, this.iceControlling);
  }
  findPair(protocol, remoteCandidate) {
    const pair = this.checkList.find(
      (pair2) => pair2.protocol === protocol && pair2.remoteCandidate === remoteCandidate
    );
    return pair;
  }
  applyIceControlling(iceControlling) {
    this._iceControlling = iceControlling;
    for (const pair of this.checkList) {
      pair.iceControlling = iceControlling;
    }
  }
  switchRole(iceControlling) {
    log23("switch role", iceControlling);
    if (this.iceLite) {
      iceControlling = false;
    }
    this.applyIceControlling(iceControlling);
    this.sortCheckList();
  }
  checkComplete(pair) {
    pair.handle = void 0;
    if (pair.state === 3 /* SUCCEEDED */) {
      if (pair.nominated && // remoteのgenerationをチェックする.localのgenerationは更新が間に合わないかもしれないのでチェックしない
      (pair.remoteCandidate.generation != void 0 ? pair.remoteCandidate.generation === this.generation : true) && this.nominated == void 0) {
        log23("nominated", pair.toJSON());
        this.nominated = pair;
        this.nominating = false;
        this.pruneTcpConnections(pair);
        if (!this.iceLite && (this.state === "connected" || this.state === "completed")) {
          this.queryConsent();
        }
        for (const p of this.checkList) {
          if (p.component === pair.component && [1 /* WAITING */, 0 /* FROZEN */].includes(
            p.state
          )) {
            p.updateState(4 /* FAILED */);
          }
        }
      }
      if (this.nominated) {
        if (!this.checkListDone) {
          log23("ICE completed");
          this.checkListState.put(new Promise((r) => r(ICE_COMPLETED)));
          this.checkListDone = true;
        }
        return;
      }
      log23("not completed", pair.toJSON());
      for (const p of this.checkList) {
        if (p.localCandidate.foundation === pair.localCandidate.foundation && p.state === 0 /* FROZEN */) {
          p.updateState(1 /* WAITING */);
        }
      }
    }
    {
      const list = [3 /* SUCCEEDED */, 4 /* FAILED */];
      if (this.checkList.find(({ state }) => !list.includes(state))) {
        return;
      }
    }
    if (!this.iceControlling) {
      const target = 3 /* SUCCEEDED */;
      if (this.checkList.find(({ state }) => state === target)) {
        return;
      }
    }
    if (!this.checkListDone) {
      log23("ICE failed");
      this.checkListState.put(
        new Promise((r) => {
          r(ICE_FAILED);
        })
      );
    }
  }
  // 3.  Terminology : Check
  checkStart = (pair) => cancelable(async (r) => {
    log23("check start", pair.toJSON());
    pair.updateState(2 /* IN_PROGRESS */);
    const result = {};
    const { remotePassword, remoteUsername, generation } = this;
    const localUsername = pair.localCandidate.ufrag ?? this.localUsername;
    const nominate = this.iceControlling && !this.remoteIsLite;
    const request = this.buildRequest({
      nominate,
      localUsername,
      remoteUsername,
      iceControlling: this.iceControlling,
      localCandidate: pair.localCandidate
    });
    const startTime = performance.now();
    try {
      pair.requestsSent++;
      const [response, addr] = await pair.protocol.request(
        request,
        pair.remoteAddr,
        Buffer.from(remotePassword, "utf8"),
        pair.localCandidate.transport.toLowerCase() === "tcp" ? 0 : 4,
        (attempt) => {
          if (attempt > 0) {
            pair.retransmissionsSent++;
          }
        }
      );
      pair.responsesReceived++;
      const endTime = performance.now();
      const rtt = (endTime - startTime) / 1e3;
      pair.rtt = rtt;
      pair.totalRoundTripTime += rtt;
      pair.roundTripTimeMeasurements++;
      log23("response received", request.toJSON(), response.toJSON(), addr, {
        localUsername,
        remoteUsername,
        remotePassword,
        generation,
        rtt
      });
      result.response = response;
      result.addr = addr;
    } catch (error) {
      const exc = error;
      log23(
        "failure case",
        request.toJSON(),
        exc.response ? JSON.stringify(exc.response.toJSON(), null, 2) : error,
        {
          localUsername,
          remoteUsername,
          remotePassword,
          generation
        },
        pair.remoteAddr
      );
      if (exc.response?.getAttributeValue("ERROR-CODE")[0] === 487) {
        if (request.attributesKeys.includes("ICE-CONTROLLED")) {
          this.switchRole(true);
        } else if (request.attributesKeys.includes("ICE-CONTROLLING")) {
          this.switchRole(false);
        }
        await this.checkStart(pair).awaitable;
        r();
        return;
      }
      if (exc.response?.getAttributeValue("ERROR-CODE")[0] === 401) {
        log23("retry 401", pair.toJSON());
        await this.checkStart(pair).awaitable;
        r();
        return;
      } else {
        log23("checkStart CandidatePairState.FAILED", pair.toJSON());
        pair.updateState(4 /* FAILED */);
        this.checkComplete(pair);
        r();
        return;
      }
    }
    if (result.addr[0] !== pair.remoteAddr[0] || result.addr[1] !== pair.remoteAddr[1]) {
      pair.updateState(4 /* FAILED */);
      this.checkComplete(pair);
      r();
      return;
    }
    if (nominate || pair.remoteNominated) {
      pair.nominated = true;
    } else if (this.iceControlling && !this.nominating) {
      this.nominating = true;
      const request2 = this.buildRequest({
        nominate: true,
        localUsername,
        remoteUsername,
        iceControlling: this.iceControlling,
        localCandidate: pair.localCandidate
      });
      try {
        pair.requestsSent++;
        await pair.protocol.request(
          request2,
          pair.remoteAddr,
          Buffer.from(this.remotePassword, "utf8"),
          pair.localCandidate.transport.toLowerCase() === "tcp" ? 0 : 4,
          (attempt) => {
            if (attempt > 0) {
              pair.retransmissionsSent++;
            }
          }
        );
        pair.responsesReceived++;
      } catch (error) {
        pair.updateState(4 /* FAILED */);
        this.checkComplete(pair);
        return;
      }
      pair.nominated = true;
    }
    pair.updateState(3 /* SUCCEEDED */);
    this.checkComplete(pair);
    r();
  });
  addPair(pair) {
    this.checkList.push(pair);
    this.sortCheckList();
  }
  // 7.2.  STUN Server Procedures
  // 7.2.1.3、7.2.1.4、および7.2.1.5
  checkIncoming(message, addr, protocol) {
    const txUsername = message.getAttributeValue("USERNAME");
    const { remoteUsername: localUsername } = decodeTxUsername(txUsername);
    let remoteCandidate;
    const [host, port] = addr;
    for (const c of this.remoteCandidates) {
      if (c.host === host && c.port === port) {
        remoteCandidate = c;
        break;
      }
    }
    if (!remoteCandidate) {
      remoteCandidate = new Candidate(
        randomString(10),
        1,
        protocol.localCandidate?.transport ?? "udp",
        message.getAttributeValue("PRIORITY"),
        host,
        port,
        "prflx",
        void 0,
        void 0,
        protocol.localCandidate?.transport === "tcp" ? remoteTcpTypeForIncoming(protocol.localCandidate.tcptype) : void 0,
        void 0,
        void 0
      );
      this._remoteCandidates.push(remoteCandidate);
    }
    let pair = this.findPair(protocol, remoteCandidate);
    if (!pair) {
      pair = new CandidatePair(protocol, remoteCandidate, this.iceControlling);
      pair.updateState(1 /* WAITING */);
      this.addPair(pair);
    }
    pair.noteIncomingRequest(message.transactionIdHex);
    pair.requestsReceived++;
    pair.responsesSent++;
    pair.localCandidate.ufrag = localUsername;
    log23("Triggered Checks", message.toJSON(), pair.toJSON(), {
      localUsername: this.localUsername,
      remoteUsername: this.remoteUsername,
      localPassword: this.localPassword,
      remotePassword: this.remotePassword,
      generation: this.generation
    });
    if (this.iceLite) {
      if (message.attributesKeys.includes("USE-CANDIDATE") && !this.iceControlling) {
        pair.remoteNominated = true;
        pair.nominated = true;
        pair.updateState(3 /* SUCCEEDED */);
        this.checkComplete(pair);
      }
      return;
    }
    if ([1 /* WAITING */, 4 /* FAILED */].includes(
      pair.state
    )) {
      pair.handle = this.checkStart(pair);
    }
    if (message.attributesKeys.includes("USE-CANDIDATE") && !this.iceControlling) {
      pair.remoteNominated = true;
      if (pair.state === 3 /* SUCCEEDED */) {
        pair.nominated = true;
        this.checkComplete(pair);
      }
    }
  }
  tryPair(protocol, remoteCandidate) {
    if (protocol.localCandidate?.canPairWith(remoteCandidate) && !(protocol.localCandidate.transport.toLowerCase() === "tcp" && protocol.localCandidate.tcptype === "passive" && remoteCandidate.type !== "prflx") && !this.findPair(protocol, remoteCandidate)) {
      const pair = new CandidatePair(
        protocol,
        remoteCandidate,
        this.iceControlling
      );
      if (this.options.filterCandidatePair && !this.options.filterCandidatePair(pair)) {
        return;
      }
      pair.updateState(1 /* WAITING */);
      this.addPair(pair);
    }
  }
  pairLocalProtocol(protocol) {
    for (const remoteCandidate of this.remoteCandidates) {
      this.tryPair(protocol, remoteCandidate);
    }
  }
  pairRemoteCandidate = (remoteCandidate) => {
    for (const protocol of this.protocols) {
      this.tryPair(protocol, remoteCandidate);
    }
  };
  buildRequest({
    nominate,
    remoteUsername,
    localUsername,
    iceControlling,
    localCandidate
  }) {
    const txUsername = encodeTxUsername({ remoteUsername, localUsername });
    const request = new Message(1 /* BINDING */, 0 /* REQUEST */);
    request.setAttribute("USERNAME", txUsername).setAttribute(
      "PRIORITY",
      candidatePriority("prflx", {
        transport: localCandidate?.transport,
        tcptype: localCandidate?.tcptype
      })
    );
    if (iceControlling) {
      request.setAttribute("ICE-CONTROLLING", this.tieBreaker);
      if (nominate) {
        request.setAttribute("USE-CANDIDATE", null);
      }
    } else {
      request.setAttribute("ICE-CONTROLLED", this.tieBreaker);
    }
    return request;
  }
  pruneTcpConnections(selectedPair) {
    for (const protocol of this.protocols) {
      if (protocol.localCandidate?.transport.toLowerCase() !== "tcp") {
        continue;
      }
      if ("pruneForSelection" in protocol && typeof protocol.pruneForSelection === "function") {
        void protocol.pruneForSelection(
          protocol === selectedPair.protocol ? selectedPair.remoteAddr : void 0
        );
      }
    }
  }
  respondError(request, addr, protocol, errorCode) {
    const response = new Message(
      request.messageMethod,
      272 /* ERROR */,
      request.transactionId
    );
    response.setAttribute("ERROR-CODE", errorCode).addMessageIntegrity(Buffer.from(this.localPassword, "utf8")).addFingerprint();
    protocol.sendStun(response, addr).catch((e) => {
      log23("sendStun error", e);
    });
  }
};
var encodeTxUsername = ({
  remoteUsername,
  localUsername
}) => {
  return `${remoteUsername}:${localUsername}`;
};
var decodeTxUsername = (txUsername) => {
  const [remoteUsername, localUsername] = txUsername.split(":");
  return { remoteUsername, localUsername };
};

// src/dataChannel.ts
import { randomUUID as randomUUID3 } from "crypto";

// src/helper.ts
import { EventEmitter } from "node:events";
function enumerate2(arr) {
  return arr.map((v, i) => [i, v]);
}
function divide(from, split) {
  const arr = from.split(split);
  return [arr[0], arr.slice(1).join(split)];
}
var EventTarget = class extends EventEmitter {
  emit(type, ...args) {
    if (typeof type !== "string") {
      return super.emit(type, ...args);
    }
    if (args.length === 0) {
      return super.emit(type, new Event(type));
    }
    const [event, ...rest] = args;
    if (event && typeof event === "object" && !("type" in event)) {
      try {
        Object.defineProperty(event, "type", {
          configurable: true,
          enumerable: true,
          value: type
        });
      } catch {
        return super.emit(type, { type, ...event }, ...rest);
      }
    }
    return super.emit(type, event, ...rest);
  }
  addEventListener = (type, listener, options) => {
    if (typeof options === "object" && options?.once) {
      this.once(type, listener);
      return;
    }
    this.addListener(type, listener);
  };
  removeEventListener = (type, listener) => {
    this.removeListener(type, listener);
  };
  dispatchEvent = (event) => this.emit(event.type, event);
};

// src/dataChannel.ts
var log24 = debug("werift:packages/webrtc/src/dataChannel.ts");
function getDataChannelMessageSize(data) {
  return Buffer.isBuffer(data) ? data.length : Buffer.byteLength(data);
}
var RTCDataChannel = class extends EventTarget {
  constructor(sctp, parameters, sendOpen = true) {
    super();
    this.sctp = sctp;
    this.parameters = parameters;
    this.sendOpen = sendOpen;
    this.id = this.parameters.id;
    if (parameters.negotiated) {
      if (this.id == void 0 || this.id < 0 || this.id > 65534) {
        throw new Error(
          "ID must be in range 0-65534 if data channel is negotiated out-of-band"
        );
      }
      this.sctp.dataChannelAddNegotiated(this);
    } else {
      if (sendOpen) {
        this.sendOpen = false;
        this.sctp.dataChannelOpen(this);
      }
    }
  }
  statsId = randomUUID3().toString();
  stateChange = new Event2();
  stateChanged = new Event2();
  onMessage = new Event2();
  // todo impl
  error = new Event2();
  bufferedAmountLow = new Event2();
  onopen;
  onclose;
  onclosing;
  onmessage;
  // todo impl
  onerror;
  isCreatedByRemote = false;
  id;
  readyState = "connecting";
  bufferedAmount = 0;
  _bufferedAmountLowThreshold = 0;
  // Statistics
  messagesSent = 0;
  bytesSent = 0;
  messagesReceived = 0;
  bytesReceived = 0;
  get ordered() {
    return this.parameters.ordered;
  }
  get maxRetransmits() {
    return this.parameters.maxRetransmits ?? null;
  }
  get maxPacketLifeTime() {
    return this.parameters.maxPacketLifeTime ?? null;
  }
  get label() {
    return this.parameters.label;
  }
  get protocol() {
    return this.parameters.protocol;
  }
  get negotiated() {
    return this.parameters.negotiated;
  }
  get bufferedAmountLowThreshold() {
    return this._bufferedAmountLowThreshold;
  }
  set bufferedAmountLowThreshold(value) {
    if (value < 0 || value > 4294967295) {
      throw new Error(
        "bufferedAmountLowThreshold must be in range 0 - 4294967295"
      );
    }
    this._bufferedAmountLowThreshold = value;
  }
  setId(id) {
    this.id = id;
  }
  setReadyState(state) {
    if (state !== this.readyState) {
      this.readyState = state;
      this.stateChange.execute(state);
      this.stateChanged.execute(state);
      switch (state) {
        case "open":
          if (this.onopen) this.onopen();
          this.emit("open");
          break;
        case "closed":
          if (this.onclose) this.onclose();
          this.emit("close");
          break;
        case "closing":
          if (this.onclosing) this.onclosing();
          break;
      }
      log24("change state", state);
    }
  }
  addBufferedAmount(amount) {
    const crossesThreshold = this.bufferedAmount > this.bufferedAmountLowThreshold && this.bufferedAmount + amount <= this.bufferedAmountLowThreshold;
    this.bufferedAmount += amount;
    if (crossesThreshold) {
      this.bufferedAmountLow.execute();
      this.emit("bufferedamountlow");
    }
  }
  send(data) {
    const size = this.sctp.datachannelSend(this, data);
    this.messagesSent++;
    this.bytesSent += size;
  }
  close() {
    this.sctp.dataChannelClose(this);
  }
};
var RTCDataChannelParameters = class {
  label = "";
  maxPacketLifeTime;
  // sec
  maxRetransmits;
  ordered = true;
  protocol = "";
  negotiated = false;
  id;
  constructor(props = {}) {
    Object.assign(this, props);
  }
};

// src/media/extension/rtcpFeedback.ts
var useFIR = () => ({ type: "ccm", parameter: "fir" });
var useNACK = () => ({ type: "nack" });
var usePLI = () => ({ type: "nack", parameter: "pli" });
var useREMB = () => ({ type: "goog-remb" });
var useTWCC = () => ({ type: "transport-cc" });

// src/media/parameters.ts
var RTCRtpCodecParameters = class {
  /**
   * When specifying a codec with a fixed payloadType such as PCMU,
   * it is necessary to set the correct PayloadType in RTCRtpCodecParameters in advance.
   */
  payloadType;
  mimeType;
  clockRate;
  channels;
  rtcpFeedback = [];
  parameters;
  direction = "all";
  constructor(props) {
    Object.assign(this, props);
  }
  get name() {
    return this.mimeType.split("/")[1];
  }
  get contentType() {
    return this.mimeType.split("/")[0];
  }
  get str() {
    let s = `${this.name}/${this.clockRate}`;
    if (this.channels === 2) s += "/2";
    return s;
  }
};
var RTCRtpHeaderExtensionParameters = class {
  id;
  uri;
  constructor(props) {
    Object.assign(this, props);
  }
};
var RTCRtcpParameters = class {
  cname;
  mux = false;
  ssrc;
  constructor(props = {}) {
    Object.assign(this, props);
  }
};
var RTCRtcpFeedback = class {
  type;
  parameter;
  constructor(props = {}) {
    Object.assign(this, props);
  }
};
var RTCRtpRtxParameters = class {
  ssrc;
  constructor(props = {}) {
    Object.assign(this, props);
  }
};
var RTCRtpCodingParameters = class {
  ssrc;
  payloadType;
  rtx;
  constructor(props) {
    Object.assign(this, props);
  }
};
var RTCRtpSimulcastParameters = class {
  rid;
  direction;
  constructor(props) {
    Object.assign(this, props);
  }
};

// src/media/codec.ts
var useH264 = (props = {}) => new RTCRtpCodecParameters({
  mimeType: "video/h264",
  clockRate: 9e4,
  rtcpFeedback: [useNACK(), usePLI(), useREMB()],
  parameters: "profile-level-id=42e01f;packetization-mode=1;level-asymmetry-allowed=1",
  ...props
});
var useVP8 = (props = {}) => new RTCRtpCodecParameters({
  mimeType: "video/VP8",
  clockRate: 9e4,
  rtcpFeedback: [useNACK(), usePLI(), useREMB()],
  ...props
});
var useVP9 = (props = {}) => new RTCRtpCodecParameters({
  mimeType: "video/VP9",
  clockRate: 9e4,
  rtcpFeedback: [useNACK(), usePLI(), useREMB()],
  ...props
});
var useAV1X = (props = {}) => new RTCRtpCodecParameters({
  mimeType: "video/AV1X",
  clockRate: 9e4,
  rtcpFeedback: [useNACK(), usePLI(), useREMB()],
  ...props
});
var useOPUS = (props = {}) => new RTCRtpCodecParameters({
  mimeType: "audio/OPUS",
  clockRate: 48e3,
  channels: 2,
  ...props
});
var usePCMU = (props = {}) => new RTCRtpCodecParameters({
  mimeType: "audio/PCMU",
  clockRate: 8e3,
  channels: 1,
  payloadType: 0,
  ...props
});
var supportedCodecs = [
  useAV1X(),
  useVP9(),
  useVP8(),
  useH264(),
  useOPUS(),
  usePCMU()
].map((codec) => codec.mimeType);
var supportedVideoCodecs = supportedCodecs.filter(
  (codec) => codec.toLowerCase().startsWith("video/")
);
var supportedAudioCodecs = supportedCodecs.filter(
  (codec) => codec.toLowerCase().startsWith("audio/")
);

// src/media/extension/rtpExtension.ts
function useSdesMid() {
  return new RTCRtpHeaderExtensionParameters({
    uri: RTP_EXTENSION_URI.sdesMid
  });
}
function useSdesRTPStreamId() {
  return new RTCRtpHeaderExtensionParameters({
    uri: RTP_EXTENSION_URI.sdesRTPStreamID
  });
}
function useRepairedRtpStreamId() {
  return new RTCRtpHeaderExtensionParameters({
    uri: RTP_EXTENSION_URI.repairedRtpStreamId
  });
}
function useTransportWideCC() {
  return new RTCRtpHeaderExtensionParameters({
    uri: RTP_EXTENSION_URI.transportWideCC
  });
}
function useAbsSendTime() {
  return new RTCRtpHeaderExtensionParameters({
    uri: RTP_EXTENSION_URI.absSendTime
  });
}
function useDependencyDescriptor() {
  return new RTCRtpHeaderExtensionParameters({
    uri: RTP_EXTENSION_URI.dependencyDescriptor
  });
}
function useAudioLevelIndication() {
  return new RTCRtpHeaderExtensionParameters({
    uri: RTP_EXTENSION_URI.audioLevelIndication
  });
}
function useVideoOrientation() {
  return new RTCRtpHeaderExtensionParameters({
    uri: RTP_EXTENSION_URI.videoOrientation
  });
}

// src/media/rtpReceiver.ts
import { randomUUID as randomUUID9 } from "crypto";
import { setTimeout as setTimeout8 } from "timers/promises";

// src/utils.ts
import { createHash as createHash4 } from "crypto";
import { createSocket as createSocket3 } from "dgram";
import { performance as performance2 } from "perf_hooks";

// src/media/rtpTransceiver.ts
import { randomUUID as randomUUID4 } from "crypto";

// src/const.ts
var DATA_CHANNEL_ACK = 2;
var DATA_CHANNEL_OPEN = 3;
var DATA_CHANNEL_RELIABLE = 0;
var WEBRTC_DCEP = 50;
var WEBRTC_STRING = 51;
var WEBRTC_BINARY = 53;
var WEBRTC_STRING_EMPTY = 56;
var WEBRTC_BINARY_EMPTY = 57;
var DISCARD_HOST = "0.0.0.0";
var DISCARD_PORT = 9;
var DTLS_ROLE_SETUP = {
  auto: "actpass",
  client: "active",
  server: "passive"
};
var DTLS_SETUP_ROLE = Object.keys(
  DTLS_ROLE_SETUP
).reduce((acc, cur) => {
  const key = DTLS_ROLE_SETUP[cur];
  acc[key] = cur;
  return acc;
}, {});
var FMTP_INT_PARAMETERS = [
  "apt",
  "max-fr",
  "max-fs",
  "maxplaybackrate",
  "minptime",
  "stereo",
  "useinbandfec"
];
var SSRC_INFO_ATTRS = ["cname", "msid", "mslabel", "label"];
var SRTP_PROFILE = {
  SRTP_AES128_CM_HMAC_SHA1_80: ProtectionProfileAes128CmHmacSha1_80,
  SRTP_AEAD_AES_128_GCM: ProtectionProfileAeadAes128Gcm
};
var SenderDirections = ["sendonly", "sendrecv"];
var ReceiverDirection = ["sendrecv", "recvonly"];

// src/media/stats.ts
var RTCStatsReport = class extends Map {
  constructor(stats) {
    super();
    if (stats) {
      for (const stat of stats) {
        this.set(stat.id, stat);
      }
    }
  }
};
function generateStatsId(type, ...parts) {
  const validParts = parts.filter((p) => p !== void 0);
  return `${type}_${validParts.join("_")}`;
}
function generateCodecStatsId(transportId, payloadType, scopeId) {
  return generateStatsId("codec", transportId, payloadType, scopeId);
}
function getStatsTimestamp() {
  return performance.timeOrigin + performance.now();
}
function getReferencedStatsIds(stat) {
  const references = [];
  for (const [key, value] of Object.entries(
    stat
  )) {
    if (key === "id") {
      continue;
    }
    if (key.endsWith("Id")) {
      if (typeof value === "string") {
        references.push(value);
      }
      continue;
    }
    if (key.endsWith("Ids") && Array.isArray(value)) {
      for (const entry of value) {
        if (typeof entry === "string") {
          references.push(entry);
        }
      }
    }
  }
  return references;
}
function buildStatsReport(stats, rootIds) {
  const index = /* @__PURE__ */ new Map();
  for (const stat of stats) {
    index.set(stat.id, stat);
  }
  if (!rootIds) {
    return new RTCStatsReport([...index.values()]);
  }
  const includedIds = /* @__PURE__ */ new Set();
  const queue = [...new Set(Array.from(rootIds))];
  while (queue.length > 0) {
    const id = queue.shift();
    if (!id || includedIds.has(id)) {
      continue;
    }
    const stat = index.get(id);
    if (!stat) {
      continue;
    }
    includedIds.add(id);
    queue.push(...getReferencedStatsIds(stat));
  }
  return new RTCStatsReport(
    [...includedIds].map((id) => index.get(id)).filter((stat) => !!stat)
  );
}

// src/media/rtpTransceiver.ts
var RTCRtpTransceiver = class {
  constructor(kind, dtlsTransport, receiver, sender, _direction) {
    this.kind = kind;
    this.receiver = receiver;
    this.sender = sender;
    this._direction = _direction;
    if (dtlsTransport) {
      this.setDtlsTransport(dtlsTransport);
    }
  }
  id = randomUUID4().toString();
  onTrack = new Event2();
  mid = null;
  mLineIndex;
  /**should not be reused because it has been used for sending before. */
  usedForSender = false;
  _currentDirection;
  offerDirection;
  _codecs = [];
  set codecs(codecs) {
    this._codecs = codecs;
  }
  get codecs() {
    return this._codecs;
  }
  headerExtensions = [];
  options = {};
  stopping = false;
  stopped = false;
  get dtlsTransport() {
    return this.receiver.dtlsTransport;
  }
  /**RFC 8829 4.2.4. setDirectionに渡された最後の値を示します */
  get direction() {
    return this._direction;
  }
  set direction(direction) {
    this.setDirection(direction);
  }
  setDirection(direction) {
    this._direction = direction;
    if (this._currentDirection && this._currentDirection !== "stopped" && SenderDirections.includes(this._currentDirection)) {
      this.usedForSender = true;
    }
  }
  /**RFC 8829 4.2.5. last negotiated direction */
  get currentDirection() {
    return this._currentDirection ?? null;
  }
  setCurrentDirection(direction) {
    this._currentDirection = direction;
  }
  setDtlsTransport(dtls) {
    this.receiver.setDtlsTransport(dtls);
    this.sender.setDtlsTransport(dtls);
  }
  get msid() {
    return this.msids[0];
  }
  get msids() {
    return this.sender.streamIds.map(
      (streamId) => `${streamId} ${this.sender.trackId}`
    );
  }
  addTrack(track) {
    const res = this.receiver.addTrack(track);
    if (res) {
      this.onTrack.execute(track, this);
    }
  }
  // todo impl
  // https://www.w3.org/TR/webrtc/#methods-8
  stop() {
    if (this.stopping) {
      return;
    }
    this.stopping = true;
  }
  forceStop() {
    if (this.stopped) {
      return;
    }
    this.stopping = true;
    this.stopped = true;
    this.setCurrentDirection("stopped");
    this.receiver.stop();
    this.sender.stop();
  }
  getPayloadType(mimeType) {
    return this.codecs.find(
      (codec) => codec.mimeType.toLowerCase().includes(mimeType.toLowerCase())
    )?.payloadType;
  }
  getCodecStats() {
    const timestamp = getStatsTimestamp();
    return this.collectCodecStats(timestamp);
  }
  collectCodecStats(timestamp) {
    const stats = [];
    if (!this.dtlsTransport) {
      return stats;
    }
    const transportId = generateStatsId("transport", this.dtlsTransport.id);
    for (const codec of this.codecs) {
      const codecStats = {
        type: "codec",
        id: generateCodecStatsId(transportId, codec.payloadType, this.id),
        timestamp,
        payloadType: codec.payloadType,
        transportId,
        mimeType: codec.mimeType,
        clockRate: codec.clockRate,
        channels: codec.channels,
        sdpFmtpLine: codec.parameters
      };
      stats.push(codecStats);
    }
    return stats;
  }
};
var Inactive = "inactive";
var Sendonly = "sendonly";
var Recvonly = "recvonly";
var Sendrecv = "sendrecv";
var Directions = [Inactive, Sendonly, Recvonly, Sendrecv];

// src/media/track.ts
import { randomUUID as randomUUID5 } from "crypto";
var MediaStreamTrack = class extends EventTarget {
  uuid = randomUUID5().toString();
  /**MediaStream ID*/
  streamId;
  remote = false;
  label;
  kind;
  id;
  /**mediaSsrc */
  ssrc;
  rid;
  header;
  codec;
  /**todo impl */
  enabled = true;
  onReceiveRtp = new Event2();
  onReceiveRtcp = new Event2();
  onSourceChanged = new Event2();
  stopped = false;
  muted = true;
  constructor(props) {
    super();
    Object.assign(this, props);
    this.onReceiveRtp.subscribe((rtp) => {
      this.muted = false;
      this.header = rtp.header;
    });
    this.label = `${this.remote ? "remote" : "local"} ${this.kind}`;
  }
  stop = () => {
    this.stopped = true;
    this.muted = true;
    this.onReceiveRtp.complete();
    this.emit("ended");
  };
  writeRtp = (rtp) => {
    if (this.remote) {
      throw new Error("this is remoteTrack");
    }
    if (this.stopped) {
      return;
    }
    const packet = Buffer.isBuffer(rtp) ? RtpPacket.deSerialize(rtp) : rtp;
    packet.header.payloadType = this.codec?.payloadType ?? packet.header.payloadType;
    this.onReceiveRtp.execute(packet);
  };
};
var MediaStream = class {
  id;
  tracks = [];
  constructor(props = {}) {
    if (Array.isArray(props)) {
      this.tracks = props;
    } else {
      Object.assign(this, props);
    }
    this.id ??= randomUUID5().toString();
  }
  addTrack(track) {
    track.streamId = this.id;
    this.tracks.push(track);
  }
  removeTrack(track) {
    this.tracks = this.tracks.filter((currentTrack) => currentTrack !== track);
    if (track.streamId === this.id) {
      track.streamId = void 0;
    }
  }
  getTracks() {
    return this.tracks;
  }
  getAudioTracks() {
    return this.tracks.filter((track) => track.kind === "audio");
  }
  getVideoTracks() {
    return this.tracks.filter((track) => track.kind === "video");
  }
};

// src/utils.ts
var log25 = debug("werift:packages/webrtc/src/utils.ts");
function fingerprint(file, hashName) {
  const upper = (s) => s.toUpperCase();
  const colon = (s) => s.match(/(.{2})/g).join(":");
  const hash2 = createHash4(hashName).update(file).digest("hex");
  return colon(upper(hash2));
}
var fingerprintHashAlgorithms = {
  sha1: "sha1",
  "sha-1": "sha1",
  sha224: "sha224",
  "sha-224": "sha224",
  sha256: "sha256",
  "sha-256": "sha256",
  sha384: "sha384",
  "sha-384": "sha384",
  sha512: "sha512",
  "sha-512": "sha512"
};
function normalizeFingerprintAlgorithm(algorithm) {
  return fingerprintHashAlgorithms[algorithm.trim().toLowerCase()];
}
function normalizeFingerprintValue(value) {
  return value.replace(/[^0-9a-f]/gi, "").toLowerCase();
}
function isDtls(buf) {
  const firstByte = buf[0];
  return firstByte > 19 && firstByte < 64;
}
function reverseSimulcastDirection(dir) {
  if (dir === "recv") return "send";
  return "recv";
}
var andDirection = (a, b) => Directions[Directions.indexOf(a) & Directions.indexOf(b)];
function reverseDirection(dir) {
  if (dir === "sendonly") return "recvonly";
  if (dir === "recvonly") return "sendonly";
  return dir;
}
var milliTime = Date.now;
var startupTimestampInMicroseconds = BigInt(Date.now()) * 1000n - process.hrtime.bigint() / 1000n;
var microTime = () => {
  return startupTimestampInMicroseconds + process.hrtime.bigint() / 1000n;
};
var timestampSeconds = () => Date.now() / 1e3;
var ntpTime = () => {
  const now = performance2.timeOrigin + performance2.now() - Date.UTC(1900, 0, 1);
  const seconds = now / 1e3;
  const [sec, msec] = seconds.toString().split(".").map(Number);
  const buf = bufferWriter([4, 4], [sec, msec]);
  return buf.readBigUInt64BE();
};
var ntpTimeToEpochMs = (ntp) => {
  const [seconds, milliseconds] = bufferReader(
    bufferWriter([8], [ntp]),
    [4, 4]
  );
  return seconds * 1e3 + milliseconds + Date.UTC(1900, 0, 1);
};
var compactNtp = (ntp) => {
  const buf = bufferWriter([8], [ntp]);
  const [, sec, msec] = bufferReader(buf, [2, 2, 2, 2]);
  return bufferWriter([2, 2], [sec, msec]).readUInt32BE();
};
function parseIceServers(iceServers) {
  const options = {};
  for (const iceServer of iceServers) {
    const urls = Array.isArray(iceServer.urls) ? iceServer.urls : [iceServer.urls];
    for (const url of urls) {
      const parsed = parseIceServerUrl(url);
      if (!parsed) {
        continue;
      }
      if (!options.stunServer && parsed.kind === "stun") {
        options.stunServer = parsed.address;
      }
      if (!options.turnServer && parsed.kind === "turn") {
        options.turnServer = parsed.address;
        options.turnTransport = parsed.transport;
        options.turnUsername = iceServer.username;
        options.turnPassword = iceServer.credential;
      }
    }
  }
  log25("iceOptions", options);
  return options;
}
function resolveTurnTransport({
  configuredTurnTransport,
  forceTurnTCP,
  parsedTurnTransport
}) {
  if (parsedTurnTransport) {
    return parsedTurnTransport;
  }
  if (configuredTurnTransport) {
    return configuredTurnTransport;
  }
  if (forceTurnTCP) {
    return "tcp";
  }
  return void 0;
}
function parseIceServerUrl(url) {
  const matched = /^(stun|stuns|turn|turns):(.+)$/i.exec(url.trim());
  if (!matched) {
    return;
  }
  const [, rawScheme, rawRest] = matched;
  const scheme = rawScheme.toLowerCase();
  const [authority] = rawRest.split("?", 1);
  const [, query = ""] = rawRest.split("?");
  const address = parseAddress(authority, defaultPort(scheme));
  if (!address) {
    return;
  }
  if (scheme === "stun" || scheme === "stuns") {
    return { kind: "stun", address };
  }
  const queryParams = new URLSearchParams(query);
  const transportParam = queryParams.get("transport");
  const transport = resolveParsedTurnTransport({
    scheme,
    transportParam
  });
  if (transport === "invalid") {
    return;
  }
  return {
    kind: "turn",
    address,
    transport
  };
}
function resolveParsedTurnTransport({
  scheme,
  transportParam
}) {
  if (transportParam == null) {
    return scheme === "turns" ? "tls" : void 0;
  }
  if (transportParam === "udp") {
    return scheme === "turns" ? "invalid" : "udp";
  }
  if (transportParam === "tcp") {
    return scheme === "turns" ? "tls" : "tcp";
  }
  return "invalid";
}
function defaultPort(scheme) {
  if (scheme === "stuns" || scheme === "turns") {
    return 5349;
  }
  return 3478;
}
function parseAddress(value, fallbackPort) {
  const authority = value.startsWith("//") ? value.slice(2) : value;
  if (!authority) {
    return;
  }
  if (authority.startsWith("[")) {
    const closingBracket = authority.indexOf("]");
    if (closingBracket === -1) {
      return;
    }
    const host = authority.slice(1, closingBracket);
    const port = parsePort(authority.slice(closingBracket + 1), fallbackPort);
    return [host, port];
  }
  const firstColon = authority.indexOf(":");
  const lastColon = authority.lastIndexOf(":");
  if (firstColon !== -1 && firstColon === lastColon) {
    return [
      authority.slice(0, firstColon),
      parsePort(authority.slice(firstColon + 1), fallbackPort)
    ];
  }
  return [authority, fallbackPort];
}
function parsePort(value, fallbackPort) {
  const portString = value.startsWith(":") ? value.slice(1) : value;
  const port = Number.parseInt(portString, 10);
  return Number.isFinite(port) ? port : fallbackPort;
}
var createSelfSignedCertificate = CipherContext.createSelfSignedCertificateWithKey;
var MediaStreamTrackFactory = class {
  static async rtpSource({
    port,
    kind,
    cb
  }) {
    port ??= await randomPort();
    const track = new MediaStreamTrack({ kind });
    const udp = createSocket3("udp4");
    udp.bind(port);
    const onMessage = (msg) => {
      if (cb) {
        msg = cb(msg);
      }
      track.writeRtp(msg);
    };
    udp.addListener("message", onMessage);
    const dispose = () => {
      udp.removeListener("message", onMessage);
      try {
        udp.close();
      } catch (error) {
      }
    };
    return [track, port, dispose];
  }
};
var deepMerge = (dst, src) => {
  if (!dst || typeof dst !== "object") {
    if (src !== null && typeof src === "object") {
      return src;
    } else {
      return dst;
    }
  }
  if (!src || typeof src !== "object") {
    if (src == void 0) {
      return dst;
    }
    return src;
  }
  for (const key in src) {
    if (Object.prototype.hasOwnProperty.call(src, key)) {
      const sourceValue = src[key];
      if (sourceValue != void 0) {
        dst[key] = sourceValue;
      }
    }
  }
  return dst;
};

// src/media/receiver/nack.ts
var log26 = debug("werift:packages/webrtc/src/media/receiver/nack.ts");
var LOST_SIZE = 30 * 5;
var NackHandler = class {
  constructor(receiver) {
    this.receiver = receiver;
  }
  newEstSeqNum = 0;
  _lost = {};
  nackLoop;
  onPacketLost = new Event2();
  mediaSourceSsrc;
  retryCount = 10;
  closed = false;
  get lostSeqNumbers() {
    return Object.keys(this._lost).map(Number).sort();
  }
  getLost(seq) {
    return this._lost[seq];
  }
  setLost(seq, count) {
    this._lost[seq] = count;
    if (this.nackLoop || this.closed) {
      return;
    }
    this.nackLoop = setInterval(async () => {
      try {
        await this.sendNack();
        if (!Object.keys(this._lost).length) {
          clearInterval(this.nackLoop);
          this.nackLoop = void 0;
        }
      } catch (error) {
        log26("failed to send nack", error);
      }
    }, 5);
  }
  removeLost(sequenceNumber) {
    delete this._lost[sequenceNumber];
  }
  addPacket(packet) {
    const { sequenceNumber, ssrc } = packet.header;
    this.mediaSourceSsrc = ssrc;
    if (this.newEstSeqNum === 0) {
      this.newEstSeqNum = sequenceNumber;
      return;
    }
    if (this.getLost(sequenceNumber)) {
      this.removeLost(sequenceNumber);
      return;
    }
    if (sequenceNumber === uint16Add(this.newEstSeqNum, 1)) {
      this.newEstSeqNum = sequenceNumber;
    } else if (sequenceNumber > uint16Add(this.newEstSeqNum, 1)) {
      for (let i = uint16Add(this.newEstSeqNum, 1); i < sequenceNumber; i = uint16Add(i, 1)) {
        this.setLost(i, 1);
      }
      this.newEstSeqNum = sequenceNumber;
      this.pruneLost();
    }
  }
  pruneLost() {
    if (this.lostSeqNumbers.length > LOST_SIZE) {
      this._lost = Object.entries(this._lost).slice(-LOST_SIZE).reduce(
        (acc, [key, v]) => {
          acc[key] = v;
          return acc;
        },
        {}
      );
    }
  }
  close() {
    this.closed = true;
    clearInterval(this.nackLoop);
    this._lost = {};
  }
  updateRetryCount() {
    this.lostSeqNumbers.forEach((seq) => {
      const count = this._lost[seq]++;
      if (count > this.retryCount) {
        this.removeLost(seq);
        return seq;
      }
    });
  }
  sendNack = () => new Promise((r, f) => {
    if (this.lostSeqNumbers.length > 0 && this.mediaSourceSsrc) {
      const nack = new GenericNack({
        senderSsrc: this.receiver.rtcpSsrc,
        mediaSourceSsrc: this.mediaSourceSsrc,
        lost: this.lostSeqNumbers
      });
      const rtcp = new RtcpTransportLayerFeedback({
        feedback: nack
      });
      this.receiver.dtlsTransport.sendRtcp([rtcp]).then(r).catch(f);
      this.updateRetryCount();
      this.onPacketLost.execute(nack);
    }
  });
};

// src/media/receiver/receiverTwcc.ts
import { setTimeout as setTimeout6 } from "timers/promises";
var log27 = debug("werift:packages/webrtc/media/receiver/receiverTwcc");
var ReceiverTWCC = class {
  constructor(dtlsTransport, rtcpSsrc, mediaSourceSsrc) {
    this.dtlsTransport = dtlsTransport;
    this.rtcpSsrc = rtcpSsrc;
    this.mediaSourceSsrc = mediaSourceSsrc;
    this.runTWCC();
  }
  extensionInfo = {};
  twccRunning = false;
  /** uint8 */
  fbPktCount = 0;
  lastTimestamp;
  handleTWCC(transportSequenceNumber) {
    this.extensionInfo[transportSequenceNumber] = {
      tsn: transportSequenceNumber,
      timestamp: microTime()
    };
    if (Object.keys(this.extensionInfo).length > 10) {
      this.sendTWCC();
    }
  }
  async runTWCC() {
    while (this.twccRunning) {
      this.sendTWCC();
      await setTimeout6(100);
    }
  }
  sendTWCC() {
    if (Object.keys(this.extensionInfo).length === 0) return;
    const extensionsArr = Object.values(this.extensionInfo).sort(
      (a, b) => a.tsn - b.tsn
    );
    const minTSN = extensionsArr[0].tsn;
    const maxTSN = extensionsArr.slice(-1)[0].tsn;
    const packetChunks = [];
    const baseSequenceNumber = extensionsArr[0].tsn;
    const packetStatusCount = uint16Add(maxTSN - minTSN, 1);
    let referenceTime;
    let lastPacketStatus;
    const recvDeltas = [];
    for (let i = minTSN; i <= maxTSN; i++) {
      const timestamp = this.extensionInfo[i]?.timestamp;
      if (timestamp) {
        if (!this.lastTimestamp) {
          this.lastTimestamp = timestamp;
        }
        if (!referenceTime) {
          referenceTime = this.lastTimestamp;
        }
        const delta = timestamp - this.lastTimestamp;
        this.lastTimestamp = timestamp;
        const recvDelta = new RecvDelta({
          delta: Number(delta)
        });
        recvDelta.parseDelta();
        recvDeltas.push(recvDelta);
        if (lastPacketStatus != void 0 && lastPacketStatus.status !== recvDelta.type) {
          packetChunks.push(
            new RunLengthChunk({
              packetStatus: lastPacketStatus.status,
              runLength: i - lastPacketStatus.minTSN
            })
          );
          lastPacketStatus = { minTSN: i, status: recvDelta.type };
        }
        if (i === maxTSN) {
          if (lastPacketStatus != void 0) {
            packetChunks.push(
              new RunLengthChunk({
                packetStatus: lastPacketStatus.status,
                runLength: i - lastPacketStatus.minTSN + 1
              })
            );
          } else {
            packetChunks.push(
              new RunLengthChunk({
                packetStatus: recvDelta.type,
                runLength: 1
              })
            );
          }
        }
        if (lastPacketStatus == void 0) {
          lastPacketStatus = { minTSN: i, status: recvDelta.type };
        }
      }
    }
    if (!referenceTime) {
      return;
    }
    const packet = new RtcpTransportLayerFeedback({
      feedback: new TransportWideCC({
        senderSsrc: this.rtcpSsrc,
        mediaSourceSsrc: this.mediaSourceSsrc,
        baseSequenceNumber,
        packetStatusCount,
        referenceTime: uint24(Math.floor(Number(referenceTime / 1000n / 64n))),
        fbPktCount: this.fbPktCount,
        recvDeltas,
        packetChunks
      })
    });
    this.dtlsTransport.sendRtcp([packet]).catch((err5) => {
      log27(err5);
    });
    this.extensionInfo = {};
    this.fbPktCount = uint8Add(this.fbPktCount, 1);
  }
};

// src/media/receiver/statistics.ts
var StreamStatistics = class {
  base_seq;
  max_seq;
  cycles = 0;
  packets_received = 0;
  bytesReceived = 0;
  headerBytesReceived = 0;
  lastPacketReceivedTimestamp;
  // # jitter
  clockRate;
  jitter_q4 = 0;
  last_arrival;
  last_timestamp;
  // # fraction lost
  expected_prior = 0;
  received_prior = 0;
  constructor(clockRate) {
    this.clockRate = clockRate;
  }
  add(packet, now = Date.now() / 1e3) {
    const inOrder = this.max_seq == void 0 || uint16Gt(packet.header.sequenceNumber, this.max_seq);
    this.packets_received++;
    this.bytesReceived += packet.payload.length;
    this.headerBytesReceived += packet.header.serializeSize;
    this.lastPacketReceivedTimestamp = getStatsTimestamp();
    if (this.base_seq == void 0) {
      this.base_seq = packet.header.sequenceNumber;
    }
    if (inOrder) {
      const arrival = int(now * this.clockRate);
      if (this.max_seq != void 0 && packet.header.sequenceNumber < this.max_seq) {
        this.cycles += 1 << 16;
      }
      this.max_seq = packet.header.sequenceNumber;
      if (packet.header.timestamp !== this.last_timestamp && this.packets_received > 1) {
        const diff = Math.abs(
          arrival - (this.last_arrival ?? 0) - (packet.header.timestamp - (this.last_timestamp ?? 0))
        );
        this.jitter_q4 += diff - (this.jitter_q4 + 8 >> 4);
      }
      this.last_arrival = arrival;
      this.last_timestamp = packet.header.timestamp;
    }
  }
  get fraction_lost() {
    const expected_interval = this.packets_expected - this.expected_prior;
    this.expected_prior = this.packets_expected;
    const received_interval = this.packets_received - this.received_prior;
    this.received_prior = this.packets_received;
    const lost_interval = expected_interval - received_interval;
    if (expected_interval == 0 || lost_interval <= 0) {
      return 0;
    } else {
      return Math.floor((lost_interval << 8) / expected_interval);
    }
  }
  get jitter() {
    return this.jitter_q4 >> 4;
  }
  get packets_expected() {
    return this.cycles + (this.max_seq ?? 0) - (this.base_seq ?? 0) + 1;
  }
  get packets_lost() {
    const lost = this.packets_expected - this.packets_received;
    return lost < 0 ? 0 : lost;
  }
};

// src/sdp.ts
import { randomBytes as randomBytes9 } from "crypto";
import { isIPv4 as isIPv44 } from "net";

// src/transport/dtls.ts
import { Certificate as Certificate3, PrivateKey as PrivateKey2 } from "@fidm/x509";
import { randomUUID as randomUUID6 } from "crypto";
import { setTimeout as setTimeout7 } from "timers/promises";
var log28 = debug("werift:packages/webrtc/src/transport/dtls.ts");
function formatDtlsVersion(version) {
  if (!version) {
    return;
  }
  if (version.major === 254 && version.minor === 253) {
    return "DTLS 1.2";
  }
  if (version.major === 254 && version.minor === 255) {
    return "DTLS 1.0";
  }
}
function formatSrtpCipher(profile) {
  switch (profile) {
    case 1:
      return "AES_CM_128_HMAC_SHA1_80";
    case 7:
      return "AEAD_AES_128_GCM";
    default:
      return;
  }
}
var RTCDtlsTransport = class _RTCDtlsTransport {
  constructor(config, iceTransport, localCertificate, srtpProfiles2 = []) {
    this.config = config;
    this.iceTransport = iceTransport;
    this.localCertificate = localCertificate;
    this.srtpProfiles = srtpProfiles2;
    this.localCertificate ??= _RTCDtlsTransport.localCertificate;
  }
  id = randomUUID6().toString();
  state = "new";
  role = "auto";
  srtpStarted = false;
  transportSequenceNumber = 0;
  // Statistics tracking
  bytesSent = 0;
  bytesReceived = 0;
  packetsSent = 0;
  packetsReceived = 0;
  dataReceiver = () => {
  };
  dtls;
  srtp;
  srtcp;
  onStateChange = new Event2();
  onRtcp = new Event2();
  onRtp = new Event2();
  events = new EventTarget();
  onstatechange;
  static localCertificate;
  static localCertificatePromise;
  remoteParameters;
  addEventListener = (type, listener, options) => {
    this.events.addEventListener(type, listener, options);
  };
  removeEventListener = (type, listener) => {
    this.events.removeEventListener(type, listener);
  };
  dispatchEvent = (event) => this.events.dispatchEvent(event);
  get localParameters() {
    return new RTCDtlsParameters(
      this.localCertificate ? this.localCertificate.getFingerprints() : [],
      this.role
    );
  }
  static async SetupCertificate() {
    if (this.localCertificate) {
      return this.localCertificate;
    }
    if (this.localCertificatePromise) {
      return this.localCertificatePromise;
    }
    this.localCertificatePromise = (async () => {
      const { certPem, keyPem, signatureHash } = await CipherContext.createSelfSignedCertificateWithKey(
        {
          signature: SignatureAlgorithm.ecdsa_3,
          hash: HashAlgorithm.sha256_4
        },
        NamedCurveAlgorithm.secp256r1_23
      );
      this.localCertificate = new RTCCertificate(
        keyPem,
        certPem,
        signatureHash
      );
      return this.localCertificate;
    })();
    return this.localCertificatePromise;
  }
  setRemoteParams(remoteParameters) {
    const fingerprints = deduplicateFingerprints([
      ...this.remoteParameters?.fingerprints ?? [],
      ...remoteParameters.fingerprints
    ]);
    const role = remoteParameters.role === "auto" && this.remoteParameters?.role ? this.remoteParameters.role : remoteParameters.role;
    this.remoteParameters = new RTCDtlsParameters(fingerprints, role);
  }
  async start() {
    if (this.state !== "new") {
      throw new Error("state must be new");
    }
    if (!this.remoteParameters || this.remoteParameters.fingerprints.length === 0) {
      throw new Error("remote fingerprint not exist");
    }
    if (this.role === "auto") {
      if (this.iceTransport.role === "controlling") {
        this.role = "server";
      } else {
        this.role = "client";
      }
    }
    this.setState("connecting");
    await new Promise(async (r, f) => {
      if (this.role === "server") {
        this.dtls = new DtlsServer({
          cert: this.localCertificate?.certPem,
          key: this.localCertificate?.privateKey,
          signatureHash: this.localCertificate?.signatureHash,
          transport: createIceTransport(this.iceTransport.connection),
          srtpProfiles: this.srtpProfiles,
          extendedMasterSecret: true,
          certificateRequest: true
        });
      } else {
        this.dtls = new DtlsClient({
          cert: this.localCertificate?.certPem,
          key: this.localCertificate?.privateKey,
          signatureHash: this.localCertificate?.signatureHash,
          transport: createIceTransport(this.iceTransport.connection),
          srtpProfiles: this.srtpProfiles,
          extendedMasterSecret: true
        });
      }
      this.dtls.onData.subscribe((buf) => {
        if (this.config.debug?.inboundPacketLoss && this.config.debug?.inboundPacketLoss / 100 < Math.random()) {
          return;
        }
        this.dataReceiver(buf);
      });
      this.dtls.onClose.subscribe(() => {
        if (this.state !== "failed") {
          this.setState("closed");
        }
      });
      this.dtls.onConnect.once(r);
      this.dtls.onError.once((error) => {
        this.setState("failed");
        log28("dtls failed", error);
        f(error);
      });
      if (this.dtls instanceof DtlsClient) {
        await setTimeout7(100);
        this.dtls.connect().catch((error) => {
          this.setState("failed");
          log28("dtls connect failed", error);
          f(error);
        });
      }
    });
    try {
      this.verifyRemoteCertificateFingerprint();
    } catch (error) {
      this.setState("failed");
      this.dtls?.close();
      throw error;
    }
    if (this.srtpProfiles.length > 0) {
      this.startSrtp();
    }
    this.setState("connected");
    log28("dtls connected");
  }
  verifyRemoteCertificateFingerprint() {
    if (!this.remoteParameters || this.remoteParameters.fingerprints.length === 0) {
      throw new Error("remote fingerprint not exist");
    }
    const remoteCertificate = this.dtls?.remoteCertificate;
    if (!remoteCertificate) {
      throw new Error("remote certificate not available");
    }
    const supportedFingerprints = this.remoteParameters.fingerprints.flatMap(
      ({ algorithm, value }) => {
        const normalizedAlgorithm = normalizeFingerprintAlgorithm(algorithm);
        if (!normalizedAlgorithm) {
          return [];
        }
        const normalizedValue = normalizeFingerprintValue(value);
        if (!normalizedValue) {
          throw new Error("remote fingerprint value is empty");
        }
        return [{ normalizedAlgorithm, normalizedValue }];
      }
    );
    if (supportedFingerprints.length === 0) {
      throw new Error("no supported remote fingerprint algorithms");
    }
    const preferredAlgorithm = selectPreferredFingerprintAlgorithm(
      supportedFingerprints
    );
    const expectedFingerprints = supportedFingerprints.filter(
      ({ normalizedAlgorithm }) => normalizedAlgorithm === preferredAlgorithm
    );
    const actualFingerprints = expectedFingerprints.reduce(
      (acc, { normalizedAlgorithm }) => {
        if (!acc.has(normalizedAlgorithm)) {
          acc.set(
            normalizedAlgorithm,
            normalizeFingerprintValue(
              fingerprint(remoteCertificate, normalizedAlgorithm)
            )
          );
        }
        return acc;
      },
      /* @__PURE__ */ new Map()
    );
    const matched = expectedFingerprints.some(
      ({ normalizedAlgorithm, normalizedValue }) => actualFingerprints.get(normalizedAlgorithm) === normalizedValue
    );
    if (!matched) {
      throw new Error("remote certificate fingerprint mismatch");
    }
  }
  updateSrtpSession() {
    if (!this.dtls) throw new Error();
    const profile = this.dtls.srtp.srtpProfile;
    if (!profile) {
      throw new Error("need srtpProfile");
    }
    log28("selected SRTP Profile", profile);
    const { localKey, localSalt, remoteKey, remoteSalt } = this.dtls.extractSessionKeys(keyLength(profile), saltLength(profile));
    const config = {
      keys: {
        localMasterKey: localKey,
        localMasterSalt: localSalt,
        remoteMasterKey: remoteKey,
        remoteMasterSalt: remoteSalt
      },
      profile
    };
    this.srtp = new SrtpSession(config);
    this.srtcp = new SrtcpSession(config);
  }
  startSrtp() {
    if (this.srtpStarted) return;
    this.srtpStarted = true;
    this.updateSrtpSession();
    this.iceTransport.connection.onData.subscribe((data) => {
      if (this.config.debug?.inboundPacketLoss && this.config.debug?.inboundPacketLoss / 100 < Math.random()) {
        return;
      }
      if (!isMedia(data)) return;
      this.bytesReceived += data.length;
      this.packetsReceived++;
      if (isRtcp(data)) {
        let dec;
        try {
          dec = this.srtcp.decrypt(data);
        } catch (error) {
          if (error instanceof SrtpAuthenticationError) {
            log28("dropping invalid SRTCP packet", error);
            return;
          }
          throw error;
        }
        let rtcpPackets;
        try {
          rtcpPackets = RtcpPacketConverter.deSerialize(dec);
        } catch (error) {
          log28("dropping malformed SRTCP packet", error);
          return;
        }
        for (const rtcp of rtcpPackets) {
          try {
            this.onRtcp.execute(rtcp);
          } catch (error) {
            log28("RTCP error", error);
          }
        }
      } else {
        let dec;
        try {
          dec = this.srtp.decrypt(data);
        } catch (error) {
          if (error instanceof SrtpAuthenticationError) {
            log28("dropping invalid SRTP packet", error);
            return;
          }
          throw error;
        }
        let rtp;
        try {
          rtp = RtpPacket.deSerialize(dec);
        } catch (error) {
          log28("dropping malformed SRTP packet", error);
          return;
        }
        try {
          this.onRtp.execute(rtp);
        } catch (error) {
          log28("RTP error", error);
        }
      }
    });
  }
  sendData = async (data) => {
    if (this.config.debug?.outboundPacketLoss && this.config.debug?.outboundPacketLoss / 100 < Math.random()) {
      return;
    }
    if (!this.dtls) {
      throw new Error("dtls not established");
    }
    await this.dtls.send(data);
  };
  async sendRtp(payload, header) {
    try {
      const enc = this.srtp.encrypt(payload, header);
      if (this.config.debug?.outboundPacketLoss && this.config.debug?.outboundPacketLoss / 100 < Math.random()) {
        return enc.length;
      }
      this.bytesSent += enc.length;
      this.packetsSent++;
      await this.iceTransport.connection.send(enc).catch(() => {
      });
      return enc.length;
    } catch (error) {
      log28("failed to send", error);
      return 0;
    }
  }
  async sendRtcp(packets) {
    const payload = Buffer.concat(packets.map((packet) => packet.serialize()));
    const enc = this.srtcp.encrypt(payload);
    if (this.config.debug?.outboundPacketLoss && this.config.debug?.outboundPacketLoss / 100 < Math.random()) {
      return enc.length;
    }
    this.bytesSent += enc.length;
    this.packetsSent++;
    await this.iceTransport.connection.send(enc).catch(() => {
    });
  }
  setState(state, emitEvent = true) {
    if (state != this.state) {
      this.state = state;
      this.onStateChange.execute(state);
      if (emitEvent) {
        this.onstatechange?.();
        this.events.emit("statechange");
      }
    }
  }
  async stop() {
    this.setState("closed", false);
    await this.iceTransport.stop();
  }
  async getStats(timestamp = getStatsTimestamp()) {
    const stats = [];
    const transportId = generateStatsId("transport", this.id);
    const transportStats = {
      type: "transport",
      id: transportId,
      timestamp,
      bytesSent: this.bytesSent,
      bytesReceived: this.bytesReceived,
      packetsSent: this.packetsSent,
      packetsReceived: this.packetsReceived,
      dtlsState: this.state,
      iceState: this.iceTransport.state,
      iceRole: this.iceTransport.role === "unknown" ? void 0 : this.iceTransport.role,
      iceLocalUsernameFragment: this.iceTransport.localParameters.usernameFragment,
      selectedCandidatePairId: this.iceTransport.connection.nominated ? generateStatsId(
        "candidate-pair",
        this.iceTransport.connection.nominated.id
      ) : void 0,
      localCertificateId: this.localCertificate ? generateStatsId("certificate", this.id, "local") : void 0,
      remoteCertificateId: this.dtls?.remoteCertificate ? generateStatsId("certificate", this.id, "remote") : void 0,
      dtlsRole: this.role === "auto" ? void 0 : this.role,
      tlsVersion: formatDtlsVersion(this.dtls?.dtls.version),
      dtlsCipher: this.dtls?.cipher.cipher?.name,
      srtpCipher: formatSrtpCipher(this.dtls?.srtp.srtpProfile),
      iceRestarts: this.iceTransport.iceRestarts
    };
    stats.push(transportStats);
    if (this.localCertificate) {
      const fingerprints = this.localCertificate.getFingerprints();
      if (fingerprints.length > 0) {
        const certStats = {
          type: "certificate",
          id: generateStatsId("certificate", this.id, "local"),
          timestamp,
          fingerprint: fingerprints[0].value,
          fingerprintAlgorithm: fingerprints[0].algorithm,
          base64Certificate: Buffer.from(
            this.localCertificate.certPem
          ).toString("base64")
        };
        stats.push(certStats);
      }
    }
    if (this.remoteParameters && this.remoteParameters.fingerprints.length > 0 && this.dtls?.remoteCertificate) {
      const certStats = {
        type: "certificate",
        id: generateStatsId("certificate", this.id, "remote"),
        timestamp,
        fingerprint: this.remoteParameters.fingerprints[0].value,
        fingerprintAlgorithm: this.remoteParameters.fingerprints[0].algorithm,
        base64Certificate: Buffer.from(this.dtls.remoteCertificate).toString(
          "base64"
        )
      };
      stats.push(certStats);
    }
    const iceStats = await this.iceTransport.getStats(timestamp, transportId);
    stats.push(...iceStats);
    return stats;
  }
};
var DtlsStates = [
  "new",
  "connecting",
  "connected",
  "closed",
  "failed"
];
var RTCCertificate = class {
  constructor(privateKeyPem, certPem, signatureHash) {
    this.certPem = certPem;
    this.signatureHash = signatureHash;
    const cert = Certificate3.fromPEM(Buffer.from(certPem));
    this.publicKey = cert.publicKey.toPEM();
    this.privateKey = PrivateKey2.fromPEM(Buffer.from(privateKeyPem)).toPEM();
  }
  publicKey;
  privateKey;
  getFingerprints() {
    return [
      new RTCDtlsFingerprint(
        "sha-256",
        fingerprint(
          Certificate3.fromPEM(Buffer.from(this.certPem)).raw,
          "sha256"
        )
      )
    ];
  }
};
var RTCDtlsFingerprint = class {
  constructor(algorithm, value) {
    this.algorithm = algorithm;
    this.value = value;
  }
};
var RTCDtlsParameters = class {
  constructor(fingerprints = [], role) {
    this.fingerprints = fingerprints;
    this.role = role;
  }
};
var deduplicateFingerprints = (fingerprints) => {
  const seen = /* @__PURE__ */ new Set();
  return fingerprints.filter(({ algorithm, value }) => {
    const key = `${normalizeFingerprintAlgorithm(algorithm) ?? algorithm.trim().toLowerCase()}:${normalizeFingerprintValue(value)}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};
var preferredFingerprintAlgorithms = [
  "sha512",
  "sha384",
  "sha256",
  "sha224",
  "sha1"
];
var selectPreferredFingerprintAlgorithm = (fingerprints) => {
  return preferredFingerprintAlgorithms.find(
    (algorithm) => fingerprints.some(
      ({ normalizedAlgorithm }) => normalizedAlgorithm === algorithm
    )
  ) ?? fingerprints[0].normalizedAlgorithm;
};
var IceTransport = class {
  constructor(ice) {
    this.ice = ice;
    ice.onData.subscribe((buf) => {
      if (isDtls(buf)) {
        if (this.onData) {
          this.onData(buf);
        }
      }
    });
  }
  closed = false;
  onData = () => {
  };
  get address() {
    return {};
  }
  type = "ice";
  send = (data) => {
    return this.ice.send(data);
  };
  async close() {
    this.closed = true;
    this.ice.close();
  }
};
var createIceTransport = (ice) => new IceTransport(ice);

// src/transport/ice.ts
import { randomUUID as randomUUID7 } from "crypto";
var log29 = debug("werift:packages/webrtc/src/transport/ice.ts");
function mapCandidatePairState(state) {
  switch (state) {
    case 0:
      return "frozen";
    case 1:
      return "waiting";
    case 2:
      return "in-progress";
    case 3:
      return "succeeded";
    case 4:
      return "failed";
    default:
      return "failed";
  }
}
var RTCIceTransport = class {
  constructor(iceGather) {
    this.iceGather = iceGather;
    this.connection = this.iceGather.connection;
    this.connection.stateChanged.subscribe((state) => {
      this.setState(state);
    });
    this.iceGather.onIceCandidate = (candidate) => {
      this.onIceCandidate.execute(candidate);
    };
    this.iceGather.onGatheringStateChange.subscribe(() => {
      this.ongatheringstatechange?.();
      this.events.emit("gatheringstatechange");
    });
  }
  id = randomUUID7().toString();
  connection;
  state = "new";
  component = "rtp";
  iceRestarts = 0;
  waitStart;
  renominating = false;
  events = new EventTarget();
  onstatechange;
  ongatheringstatechange;
  onStateChange = new Event2();
  onIceCandidate = new Event2();
  onNegotiationNeeded = new Event2();
  addEventListener = (type, listener, options) => {
    this.events.addEventListener(type, listener, options);
  };
  removeEventListener = (type, listener) => {
    this.events.removeEventListener(type, listener);
  };
  dispatchEvent = (event) => this.events.dispatchEvent(event);
  get role() {
    if (!this.connection.remoteUsername || !this.connection.remotePassword) {
      return "unknown";
    }
    if (this.connection.iceControlling) return "controlling";
    else return "controlled";
  }
  get gatheringState() {
    return this.iceGather.gatheringState;
  }
  get localCandidates() {
    return this.iceGather.localCandidates;
  }
  get localParameters() {
    return this.iceGather.localParameters;
  }
  getRemoteCandidates() {
    return this.connection.remoteCandidates.filter((candidate) => candidate.type !== "prflx").map((candidate) => candidateFromIce(candidate).toJSON());
  }
  getLocalCandidates() {
    return this.connection.localCandidates.map(
      (candidate) => candidateFromIce(candidate).toJSON()
    );
  }
  getSelectedCandidatePair() {
    const pair = this.connection.candidatePairs.find((candidate) => candidate.nominated) ?? this.connection.candidatePairs.find((candidate) => candidate.state === 3);
    if (!pair) {
      return null;
    }
    return {
      local: candidateFromIce(pair.localCandidate).toJSON(),
      remote: candidateFromIce(pair.remoteCandidate).toJSON()
    };
  }
  getLocalParameters() {
    return this.localParameters ?? null;
  }
  getRemoteParameters() {
    if (!this.connection.remoteUsername || !this.connection.remotePassword) {
      return null;
    }
    return new RTCIceParameters({
      iceLite: this.connection.remoteIsLite,
      password: this.connection.remotePassword,
      usernameFragment: this.connection.remoteUsername
    });
  }
  setState(state, emitEvent = true) {
    if (state !== this.state) {
      this.state = state;
      this.onStateChange.execute(state);
      if (emitEvent) {
        this.onstatechange?.();
        this.events.emit("statechange");
      }
    }
  }
  gather() {
    return this.iceGather.gather();
  }
  addRemoteCandidate = (candidate) => {
    if (!this.connection.remoteCandidatesEnd) {
      return !candidate ? this.connection.addRemoteCandidate(void 0) : this.connection.addRemoteCandidate(candidateToIce(candidate));
    }
  };
  setRemoteParams(remoteParameters, renomination = false) {
    if (renomination) {
      this.renominating = true;
    }
    if (this.connection.remoteUsername && this.connection.remotePassword && (this.connection.remoteUsername !== remoteParameters.usernameFragment || this.connection.remotePassword !== remoteParameters.password)) {
      if (this.renominating) {
        log29("renomination", remoteParameters);
        this.connection.resetNominatedPair();
        this.renominating = false;
      } else {
        log29("restart", remoteParameters);
        this.restart();
      }
    }
    this.connection.setRemoteParams(remoteParameters);
  }
  restart() {
    this.iceRestarts++;
    this.connection.restart();
    this.setState("new");
    this.iceGather.gatheringState = "new";
    this.waitStart = void 0;
    this.onNegotiationNeeded.execute();
  }
  async start() {
    if (this.state === "closed") {
      throw new Error("RTCIceTransport is closed");
    }
    if (!this.connection.remotePassword || !this.connection.remoteUsername) {
      throw new Error("remoteParams missing");
    }
    if (this.waitStart) {
      await this.waitStart.asPromise();
    }
    this.waitStart = new Event2();
    this.setState("checking");
    try {
      await this.connection.connect();
    } catch (error) {
      this.setState("failed");
      throw error;
    }
    this.waitStart.execute();
    this.waitStart.complete();
    this.waitStart = void 0;
  }
  async stop() {
    if (this.state !== "closed") {
      this.setState("closed", false);
      await this.connection.close();
    }
    this.onStateChange.complete();
    this.onIceCandidate.complete();
    this.onNegotiationNeeded.complete();
  }
  async getStats(timestamp = getStatsTimestamp(), transportId = generateStatsId("transport", this.id)) {
    const stats = [];
    for (const candidate of this.connection.localCandidates) {
      const candidateStats = {
        type: "local-candidate",
        id: generateStatsId("local-candidate", candidate.id),
        timestamp,
        transportId,
        address: candidate.host,
        port: candidate.port,
        protocol: candidate.transport,
        candidateType: candidate.type,
        priority: candidate.priority,
        foundation: candidate.foundation,
        relatedAddress: candidate.relatedAddress,
        relatedPort: candidate.relatedPort,
        usernameFragment: candidate.ufrag,
        tcpType: candidate.tcptype
      };
      stats.push(candidateStats);
    }
    for (const candidate of this.connection.remoteCandidates) {
      const candidateStats = {
        type: "remote-candidate",
        id: generateStatsId("remote-candidate", candidate.id),
        timestamp,
        transportId,
        address: candidate.host,
        port: candidate.port,
        protocol: candidate.transport,
        candidateType: candidate.type,
        priority: candidate.priority,
        foundation: candidate.foundation,
        relatedAddress: candidate.relatedAddress,
        relatedPort: candidate.relatedPort,
        usernameFragment: candidate.ufrag,
        tcpType: candidate.tcptype
      };
      stats.push(candidateStats);
    }
    const pairs = this.connection?.candidatePairs ? [
      ...this.connection.candidatePairs.filter((p) => p.nominated),
      ...this.connection.candidatePairs.filter((p) => !p.nominated)
    ] : [];
    for (const pair of pairs) {
      const pairStats = {
        type: "candidate-pair",
        id: generateStatsId("candidate-pair", pair.id),
        timestamp,
        transportId,
        localCandidateId: generateStatsId(
          "local-candidate",
          pair.localCandidate.id
        ),
        remoteCandidateId: generateStatsId(
          "remote-candidate",
          pair.remoteCandidate.id
        ),
        state: mapCandidatePairState(pair.state),
        nominated: pair.nominated,
        packetsSent: pair.packetsSent,
        packetsReceived: pair.packetsReceived,
        bytesSent: pair.bytesSent,
        bytesReceived: pair.bytesReceived,
        currentRoundTripTime: pair.rtt,
        totalRoundTripTime: pair.totalRoundTripTime,
        roundTripTimeMeasurements: pair.roundTripTimeMeasurements,
        requestsReceived: pair.requestsReceived,
        requestsSent: pair.requestsSent,
        responsesReceived: pair.responsesReceived,
        responsesSent: pair.responsesSent,
        retransmissionsReceived: pair.retransmissionsReceived,
        retransmissionsSent: pair.retransmissionsSent,
        consentRequestsSent: pair.consentRequestsSent
      };
      stats.push(pairStats);
    }
    return stats;
  }
};
var IceTransportStates = [
  "new",
  "checking",
  "connected",
  "completed",
  "disconnected",
  "failed",
  "closed"
];
var IceGathererStates = ["new", "gathering", "complete"];
var RTCIceGatherer = class {
  constructor(options = {}) {
    this.options = options;
    this.connection = new Connection(false, this.options);
    this.connection.onIceCandidate.subscribe((candidate) => {
      this.onIceCandidate(candidateFromIce(candidate));
    });
  }
  onIceCandidate = () => {
  };
  gatheringState = "new";
  connection;
  onGatheringStateChange = new Event2();
  async gather() {
    if (this.gatheringState === "new") {
      this.setState("gathering");
      await this.connection.gatherCandidates();
      this.onIceCandidate(void 0);
      this.setState("complete");
    }
  }
  get localCandidates() {
    return this.connection.localCandidates.map(candidateFromIce);
  }
  get localParameters() {
    const params = new RTCIceParameters({
      iceLite: this.connection.iceLite,
      usernameFragment: this.connection.localUsername,
      password: this.connection.localPassword
    });
    return params;
  }
  setState(state) {
    if (state !== this.gatheringState) {
      this.gatheringState = state;
      this.onGatheringStateChange.execute(state);
    }
  }
};
function candidateFromIce(c) {
  const candidate = new IceCandidate(
    c.component,
    c.foundation,
    c.host,
    c.port,
    c.priority,
    c.transport,
    c.type,
    c.generation,
    c.ufrag
  );
  candidate.relatedAddress = c.relatedAddress;
  candidate.relatedPort = c.relatedPort;
  candidate.tcpType = c.tcptype;
  return candidate;
}
function candidateToIce(x) {
  return new Candidate(
    x.foundation,
    x.component,
    x.protocol,
    x.priority,
    x.ip,
    x.port,
    x.type,
    x.relatedAddress,
    x.relatedPort,
    x.tcpType,
    x.generation,
    x.ufrag
  );
}
var RTCIceCandidate = class {
  candidate;
  sdpMid;
  sdpMLineIndex;
  usernameFragment;
  constructor(props) {
    Object.assign(this, props);
  }
  static fromSdp(sdp) {
    const ice = Candidate.fromSdp(sdp);
    const candidate = candidateFromIce(ice);
    return candidate.toJSON();
  }
  static isThis(o) {
    if (typeof o?.candidate === "string") return true;
  }
  toJSON() {
    return {
      candidate: this.candidate,
      sdpMid: this.sdpMid,
      sdpMLineIndex: this.sdpMLineIndex,
      usernameFragment: this.usernameFragment
    };
  }
};
var IceCandidate = class {
  constructor(component, foundation, ip, port, priority, protocol, type, generation, ufrag) {
    this.component = component;
    this.foundation = foundation;
    this.ip = ip;
    this.port = port;
    this.priority = priority;
    this.protocol = protocol;
    this.type = type;
    this.generation = generation;
    this.ufrag = ufrag;
  }
  // """
  // The :class:`RTCIceCandidate` interface represents a candidate Interactive
  // Connectivity Establishment (ICE) configuration which may be used to
  // establish an RTCPeerConnection.
  // """
  relatedAddress;
  relatedPort;
  sdpMid;
  sdpMLineIndex;
  tcpType;
  toJSON() {
    return new RTCIceCandidate({
      candidate: candidateToSdp(this),
      sdpMLineIndex: this.sdpMLineIndex,
      sdpMid: this.sdpMid,
      usernameFragment: this.ufrag
    });
  }
  static fromJSON(data) {
    try {
      if (!data.candidate) {
        throw new Error("candidate is required");
      }
      const normalizedCandidate = data.candidate.startsWith("candidate:") ? data.candidate.slice("candidate:".length) : data.candidate;
      const candidate = candidateFromSdp(normalizedCandidate);
      candidate.sdpMLineIndex = data.sdpMLineIndex ?? void 0;
      candidate.sdpMid = data.sdpMid ?? void 0;
      return candidate;
    } catch (error) {
    }
  }
};
var RTCIceParameters = class {
  iceLite = false;
  usernameFragment;
  password;
  constructor(props = {}) {
    Object.assign(this, props);
  }
};

// src/transport/sctp.ts
import { randomUUID as randomUUID8 } from "crypto";

// ../sctp/src/sctp.ts
import { createHmac as createHmac5, randomBytes as randomBytes8 } from "crypto";

// ../sctp/src/chunk.ts
var Chunk = class _Chunk {
  constructor(flags = 0, _body = Buffer.from("")) {
    this.flags = flags;
    this._body = _body;
  }
  get body() {
    return this._body;
  }
  set body(value) {
    this._body = value;
  }
  static type = -1;
  get type() {
    return _Chunk.type;
  }
  get bytes() {
    if (!this.body) throw new Error();
    const header = Buffer.alloc(4);
    header.writeUInt8(this.type, 0);
    header.writeUInt8(this.flags, 1);
    header.writeUInt16BE(this.body.length + 4, 2);
    const data = Buffer.concat([
      header,
      this.body,
      ...[...Array(padL(this.body.length))].map(() => Buffer.from("\0"))
    ]);
    return data;
  }
};
var BaseInitChunk = class extends Chunk {
  constructor(flags = 0, body) {
    super(flags, body);
    this.flags = flags;
    if (body) {
      this.initiateTag = body.readUInt32BE(0);
      this.advertisedRwnd = body.readUInt32BE(4);
      this.outboundStreams = body.readUInt16BE(8);
      this.inboundStreams = body.readUInt16BE(10);
      this.initialTsn = body.readUInt32BE(12);
      this.params = decodeParams(body.slice(16));
    } else {
      this.initiateTag = 0;
      this.advertisedRwnd = 0;
      this.outboundStreams = 0;
      this.inboundStreams = 0;
      this.initialTsn = 0;
      this.params = [];
    }
  }
  initiateTag;
  advertisedRwnd;
  outboundStreams;
  inboundStreams;
  initialTsn;
  params;
  get body() {
    const body = Buffer.alloc(16);
    body.writeUInt32BE(this.initiateTag, 0);
    body.writeUInt32BE(this.advertisedRwnd, 4);
    body.writeUInt16BE(this.outboundStreams, 8);
    body.writeUInt16BE(this.inboundStreams, 10);
    body.writeUInt32BE(this.initialTsn, 12);
    return Buffer.concat([body, encodeParams(this.params)]);
  }
};
var InitChunk = class _InitChunk extends BaseInitChunk {
  static type = 1;
  get type() {
    return _InitChunk.type;
  }
};
var InitAckChunk = class _InitAckChunk extends BaseInitChunk {
  static type = 2;
  get type() {
    return _InitAckChunk.type;
  }
};
var ReConfigChunk = class _ReConfigChunk extends BaseInitChunk {
  static type = 130;
  get type() {
    return _ReConfigChunk.type;
  }
};
var ForwardTsnChunk = class _ForwardTsnChunk extends Chunk {
  constructor(flags = 0, body) {
    super(flags, body);
    this.flags = flags;
    if (body) {
      this.cumulativeTsn = body.readUInt32BE(0);
      let pos = 4;
      while (pos < body.length) {
        this.streams.push([body.readUInt16BE(pos), body.readUInt16BE(pos + 2)]);
        pos += 4;
      }
    } else {
      this.cumulativeTsn = 0;
    }
  }
  static type = 192;
  streams = [];
  cumulativeTsn;
  get type() {
    return _ForwardTsnChunk.type;
  }
  set body(_) {
  }
  get body() {
    const body = Buffer.alloc(4);
    body.writeUInt32BE(this.cumulativeTsn, 0);
    return Buffer.concat([
      body,
      ...this.streams.map(([id, seq]) => {
        const streamBuffer = Buffer.alloc(4);
        streamBuffer.writeUInt16BE(id, 0);
        streamBuffer.writeUInt16BE(seq, 2);
        return streamBuffer;
      })
    ]);
  }
};
var DataChunk = class _DataChunk extends Chunk {
  constructor(flags = 0, body) {
    super(flags, body);
    this.flags = flags;
    if (body) {
      this.tsn = body.readUInt32BE(0);
      this.streamId = body.readUInt16BE(4);
      this.streamSeqNum = body.readUInt16BE(6);
      this.protocol = body.readUInt32BE(8);
      this.userData = body.slice(12);
    }
  }
  static type = 0;
  get type() {
    return _DataChunk.type;
  }
  tsn = 0;
  streamId = 0;
  streamSeqNum = 0;
  protocol = 0;
  userData = Buffer.from("");
  abandoned = false;
  acked = false;
  misses = 0;
  retransmit = false;
  sentCount = 0;
  bookSize = 0;
  expiry;
  maxRetransmits;
  sentTime;
  get bytes() {
    const length = 16 + this.userData.length;
    const header = Buffer.alloc(16);
    header.writeUInt8(this.type, 0);
    header.writeUInt8(this.flags, 1);
    header.writeUInt16BE(length, 2);
    header.writeUInt32BE(this.tsn, 4);
    header.writeUInt16BE(this.streamId, 8);
    header.writeUInt16BE(this.streamSeqNum, 10);
    header.writeUInt32BE(this.protocol, 12);
    let data = Buffer.concat([header, this.userData]);
    if (length % 4) {
      data = Buffer.concat([
        data,
        ...[...Array(padL(length))].map(() => Buffer.from("\0"))
      ]);
    }
    return data;
  }
};
var CookieEchoChunk = class _CookieEchoChunk extends Chunk {
  static type = 10;
  get type() {
    return _CookieEchoChunk.type;
  }
};
var CookieAckChunk = class _CookieAckChunk extends Chunk {
  static type = 11;
  get type() {
    return _CookieAckChunk.type;
  }
};
var BaseParamsChunk = class extends Chunk {
  constructor(flags = 0, body = void 0) {
    super(flags, body);
    this.flags = flags;
    if (body) {
      this.params = decodeParams(body);
    }
  }
  params = [];
  get body() {
    return encodeParams(this.params);
  }
};
var AbortChunk = class _AbortChunk extends BaseParamsChunk {
  static type = 6;
  get type() {
    return _AbortChunk.type;
  }
};
var ErrorChunk = class _ErrorChunk extends BaseParamsChunk {
  static type = 9;
  static CODE = {
    InvalidStreamIdentifier: 1,
    MissingMandatoryParameter: 2,
    StaleCookieError: 3,
    OutofResource: 4,
    UnresolvableAddress: 5,
    UnrecognizedChunkType: 6,
    InvalidMandatoryParameter: 7,
    UnrecognizedParameters: 8,
    NoUserData: 9,
    CookieReceivedWhileShuttingDown: 10,
    RestartofanAssociationwithNewAddresses: 11,
    UserInitiatedAbort: 12,
    ProtocolViolation: 13
  };
  get type() {
    return _ErrorChunk.type;
  }
  get descriptions() {
    return this.params.map(([code, body]) => {
      const name = (Object.entries(_ErrorChunk.CODE).find(
        ([, num]) => num === code
      ) || [])[0];
      return { name, body };
    });
  }
};
var HeartbeatChunk = class _HeartbeatChunk extends BaseParamsChunk {
  static type = 4;
  get type() {
    return _HeartbeatChunk.type;
  }
};
var HeartbeatAckChunk = class _HeartbeatAckChunk extends BaseParamsChunk {
  static type = 5;
  get type() {
    return _HeartbeatAckChunk.type;
  }
};
var ReconfigChunk = class _ReconfigChunk extends BaseParamsChunk {
  static type = 130;
  get type() {
    return _ReconfigChunk.type;
  }
};
var SackChunk = class _SackChunk extends Chunk {
  constructor(flags = 0, body) {
    super(flags, body);
    this.flags = flags;
    if (body) {
      this.cumulativeTsn = body.readUInt32BE(0);
      this.advertisedRwnd = body.readUInt32BE(4);
      const nbGaps = body.readUInt16BE(8);
      const nbDuplicates = body.readUInt16BE(10);
      let pos = 12;
      [...Array(nbGaps)].forEach(() => {
        this.gaps.push([body.readUInt16BE(pos), body.readUInt16BE(pos + 2)]);
        pos += 4;
      });
      [...Array(nbDuplicates)].forEach(() => {
        this.duplicates.push(body.readUInt32BE(pos));
        pos += 4;
      });
    }
  }
  static type = 3;
  get type() {
    return _SackChunk.type;
  }
  gaps = [];
  duplicates = [];
  cumulativeTsn = 0;
  advertisedRwnd = 0;
  get bytes() {
    const length = 16 + 4 * (this.gaps.length + this.duplicates.length);
    const header = Buffer.alloc(16);
    header.writeUInt8(this.type, 0);
    header.writeUInt8(this.flags, 1);
    header.writeUInt16BE(length, 2);
    header.writeUInt32BE(this.cumulativeTsn, 4);
    header.writeUInt32BE(this.advertisedRwnd, 8);
    header.writeUInt16BE(this.gaps.length, 12);
    header.writeUInt16BE(this.duplicates.length, 14);
    let data = Buffer.concat([
      header,
      ...this.gaps.map((gap) => {
        const gapBuffer = Buffer.alloc(4);
        gapBuffer.writeUInt16BE(gap[0], 0);
        gapBuffer.writeUInt16BE(gap[1], 2);
        return gapBuffer;
      })
    ]);
    data = Buffer.concat([
      data,
      ...this.duplicates.map((tsn) => {
        const tsnBuffer = Buffer.alloc(4);
        tsnBuffer.writeUInt32BE(tsn, 0);
        return tsnBuffer;
      })
    ]);
    return data;
  }
};
var ShutdownChunk = class _ShutdownChunk extends Chunk {
  constructor(flags = 0, body) {
    super(flags, body);
    this.flags = flags;
    if (body) {
      this.cumulativeTsn = body.readUInt32BE(0);
    }
  }
  static type = 7;
  get type() {
    return _ShutdownChunk.type;
  }
  cumulativeTsn = 0;
  get body() {
    const body = Buffer.alloc(4);
    body.writeUInt32BE(this.cumulativeTsn, 0);
    return body;
  }
};
var ShutdownAckChunk = class _ShutdownAckChunk extends Chunk {
  static type = 8;
  get type() {
    return _ShutdownAckChunk.type;
  }
};
var ShutdownCompleteChunk = class _ShutdownCompleteChunk extends Chunk {
  static type = 14;
  get type() {
    return _ShutdownCompleteChunk.type;
  }
};
var CHUNK_CLASSES = [
  DataChunk,
  InitChunk,
  InitAckChunk,
  SackChunk,
  HeartbeatChunk,
  HeartbeatAckChunk,
  AbortChunk,
  ShutdownChunk,
  ShutdownAckChunk,
  ErrorChunk,
  CookieEchoChunk,
  CookieAckChunk,
  ShutdownCompleteChunk,
  ReconfigChunk,
  ForwardTsnChunk
];
var CHUNK_BY_TYPE = CHUNK_CLASSES.reduce(
  (acc, cur) => {
    acc[cur.type] = cur;
    return acc;
  },
  {}
);
function padL(l) {
  const m = l % 4;
  return m ? 4 - m : 0;
}
function encodeParams(params) {
  let body = Buffer.from("");
  let padding = Buffer.from("");
  params.forEach(([type, value]) => {
    const length = value.length + 4;
    const paramHeader = Buffer.alloc(4);
    paramHeader.writeUInt16BE(type, 0);
    paramHeader.writeUInt16BE(length, 2);
    body = Buffer.concat([body, padding, paramHeader, value]);
    padding = Buffer.concat(
      [...Array(padL(length))].map(() => Buffer.from("\0"))
    );
  });
  return body;
}
function decodeParams(body) {
  const params = [];
  let pos = 0;
  while (pos <= body.length - 4) {
    const type = body.readUInt16BE(pos);
    const length = body.readUInt16BE(pos + 2);
    params.push([type, body.slice(pos + 4, pos + length)]);
    pos += length + padL(length);
  }
  return params;
}
function parsePacket2(data) {
  if (data.length < 12)
    throw new Error("SCTP packet length is less than 12 bytes");
  const sourcePort = data.readUInt16BE(0);
  const destinationPort = data.readUInt16BE(2);
  const verificationTag = data.readUInt32BE(4);
  const checkSum = data.readUInt32LE(8);
  const expect = crc32c(
    Buffer.concat([
      data.slice(0, 8),
      Buffer.from("\0\0\0\0"),
      data.slice(12)
    ])
  );
  if (checkSum !== expect) throw new Error("SCTP packet has invalid checksum");
  const chunks = [];
  let pos = 12;
  while (pos + 4 <= data.length) {
    const chunkType = data.readUInt8(pos);
    const chunkFlags = data.readUInt8(pos + 1);
    const chunkLength = data.readUInt16BE(pos + 2);
    const chunkBody = data.slice(pos + 4, pos + chunkLength);
    const ChunkClass = CHUNK_BY_TYPE[chunkType.toString()];
    if (ChunkClass) {
      chunks.push(new ChunkClass(chunkFlags, chunkBody));
    } else {
      throw new Error("unknown");
    }
    pos += chunkLength + padL(chunkLength);
  }
  return [sourcePort, destinationPort, verificationTag, chunks];
}
function serializePacket(sourcePort, destinationPort, verificationTag, chunk) {
  const header = Buffer.alloc(8);
  header.writeUInt16BE(sourcePort, 0);
  header.writeUInt16BE(destinationPort, 2);
  header.writeUInt32BE(verificationTag, 4);
  const body = chunk.bytes;
  const checksum = crc32c(
    Buffer.concat([header, Buffer.from("\0\0\0\0"), body])
  );
  const checkSumBuf = Buffer.alloc(4);
  checkSumBuf.writeUInt32LE(checksum, 0);
  const packet = Buffer.concat([header, checkSumBuf, body]);
  return packet;
}

// ../sctp/src/helper.ts
function enumerate3(arr) {
  return arr.map((v, i) => [i, v]);
}
function createEventsFromList(list) {
  return list.reduce((acc, cur) => {
    acc[cur] = new Event2();
    return acc;
  }, {});
}

// ../sctp/src/param.ts
var OutgoingSSNResetRequestParam = class _OutgoingSSNResetRequestParam {
  // Outgoing SSN Reset Request Parameter
  constructor(requestSequence, responseSequence, lastTsn, streams) {
    this.requestSequence = requestSequence;
    this.responseSequence = responseSequence;
    this.lastTsn = lastTsn;
    this.streams = streams;
  }
  static type = 13;
  get type() {
    return _OutgoingSSNResetRequestParam.type;
  }
  get bytes() {
    const data = Buffer.allocUnsafe(12);
    data.writeUInt32BE(this.requestSequence, 0);
    data.writeUInt32BE(this.responseSequence, 4);
    data.writeUInt32BE(this.lastTsn, 8);
    return Buffer.concat([
      data,
      ...this.streams.map((stream) => {
        const buf = Buffer.allocUnsafe(2);
        buf.writeUInt16BE(stream, 0);
        return buf;
      })
    ]);
  }
  static parse(data) {
    const requestSequence = data.readUInt32BE(0);
    const responseSequence = data.readUInt32BE(4);
    const lastTsn = data.readUInt32BE(8);
    const stream = [];
    for (let pos = 12; pos < data.length; pos += 2) {
      stream.push(data.readUInt16BE(pos));
    }
    return new _OutgoingSSNResetRequestParam(
      requestSequence,
      responseSequence,
      lastTsn,
      stream
    );
  }
};
var StreamAddOutgoingParam = class _StreamAddOutgoingParam {
  // Add Outgoing Streams Request Parameter
  constructor(requestSequence, newStreams) {
    this.requestSequence = requestSequence;
    this.newStreams = newStreams;
  }
  static type = 17;
  get type() {
    return _StreamAddOutgoingParam.type;
  }
  get bytes() {
    const buf = Buffer.allocUnsafe(8);
    buf.writeUInt32BE(this.requestSequence, 0);
    buf.writeUInt16BE(this.newStreams, 4);
    buf.writeUInt16BE(0, 6);
    return buf;
  }
  static parse(data) {
    const requestSequence = data.readUInt32BE(0);
    const newStreams = data.readUInt16BE(4);
    return new _StreamAddOutgoingParam(requestSequence, newStreams);
  }
};
var reconfigResult = {
  ReconfigResultSuccessPerformed: 1,
  BadSequenceNumber: 5
};
var ReconfigResponseParam = class _ReconfigResponseParam {
  // Re-configuration Response Parameter
  constructor(responseSequence, result) {
    this.responseSequence = responseSequence;
    this.result = result;
  }
  static type = 16;
  get type() {
    return _ReconfigResponseParam.type;
  }
  get bytes() {
    const buf = Buffer.allocUnsafe(8);
    buf.writeUInt32BE(this.responseSequence, 0);
    buf.writeUInt32BE(this.result, 4);
    return buf;
  }
  static parse(data) {
    const requestSequence = data.readUInt32BE(0);
    const result = data.readUInt32BE(4);
    return new _ReconfigResponseParam(requestSequence, result);
  }
};
var RECONFIG_PARAM_BY_TYPES = {
  13: OutgoingSSNResetRequestParam,
  // Outgoing SSN Reset Request Parameter
  16: ReconfigResponseParam,
  // Re-configuration Response Parameter
  17: StreamAddOutgoingParam
  // Add Outgoing Streams Request Parameter
};

// ../sctp/src/sctp.ts
var log30 = debug("werift/sctp/sctp");
var COOKIE_LENGTH = 24;
var COOKIE_LIFETIME = 60;
var MAX_STREAMS = 65535;
var USERDATA_MAX_LENGTH = 1200;
var SCTP_DATA_LAST_FRAG = 1;
var SCTP_DATA_FIRST_FRAG = 2;
var SCTP_DATA_UNORDERED = 4;
var SCTP_MAX_ASSOCIATION_RETRANS = 10;
var SCTP_MAX_INIT_RETRANS = 8;
var SCTP_RTO_ALPHA = 1 / 8;
var SCTP_RTO_BETA = 1 / 4;
var SCTP_RTO_INITIAL = 3;
var SCTP_RTO_MIN = 1;
var SCTP_RTO_MAX = 60;
var SCTP_TSN_MODULO = 2 ** 32;
var SCTP_SACK_DELAY_MS = 200;
var SCTP_HEARTBEAT_INTERVAL = 30;
var RECONFIG_MAX_STREAMS = 135;
var SCTP_STATE_COOKIE = 7;
var SCTP_SUPPORTED_CHUNK_EXT = 32776;
var SCTP_PRSCTP_SUPPORTED = 49152;
var SCTPConnectionStates = [
  "new",
  "closed",
  "connected",
  "connecting"
];
var SCTP = class _SCTP {
  // slow start threshold
  constructor(transport, port = 5e3) {
    this.transport = transport;
    this.port = port;
    this.localPort = this.port;
    this.transport.onData = (buf) => {
      this.handleData(buf);
    };
  }
  flush = new Event2();
  stateChanged = createEventsFromList(SCTPConnectionStates);
  onReconfigStreams = new Event2();
  /**streamId: number, ppId: number, data: Buffer */
  onReceive = new Event2();
  onSackReceived = async () => {
  };
  associationState = 1 /* CLOSED */;
  started = false;
  state = "new";
  isServer = true;
  isStopping = false;
  isClosed = false;
  hmacKey = randomBytes8(16);
  localPartialReliability = true;
  localPort;
  localVerificationTag = random32();
  remoteExtensions = [];
  remotePartialReliability = true;
  remotePort;
  remoteVerificationTag = 0;
  // inbound
  advertisedRwnd = 1024 * 1024;
  // Receiver Window
  peerAdvertisedRwnd = this.advertisedRwnd;
  get peerRwnd() {
    return Math.max(0, this.peerAdvertisedRwnd - this.flightSize);
  }
  inboundStreams = {};
  _inboundStreamsCount = 0;
  _inboundStreamsMax = MAX_STREAMS;
  lastReceivedTsn;
  // Transmission Sequence Number
  sackDuplicates = [];
  sackMisOrdered = /* @__PURE__ */ new Set();
  sackNeeded = false;
  sackPacketCount = 0;
  sackHasNewDataInPacket = false;
  sackImmediate = false;
  sackTimeout;
  // # outbound
  cwnd = 3 * USERDATA_MAX_LENGTH;
  // Congestion Window
  fastRecoveryExit;
  fastRecoveryTransmit = false;
  forwardTsnChunk;
  flightSize = 0;
  outboundQueue = [];
  outboundStreamSeq = {};
  _outboundStreamsCount = MAX_STREAMS;
  /**local transmission sequence number */
  localTsn = Number(random32());
  lastSackedTsn = tsnMinusOne(this.localTsn);
  advancedPeerAckTsn = tsnMinusOne(this.localTsn);
  // acknowledgement
  partialBytesAcked = 0;
  sentQueue = [];
  transmitting = false;
  transmitRequested = false;
  // # reconfiguration
  /**初期TSNと同じ値に初期化される単調に増加する数です. これは、新しいre-configuration requestパラメーターを送信するたびに1ずつ増加します */
  reconfigRequestSeq = this.localTsn;
  /**このフィールドは、incoming要求のre-configuration requestシーケンス番号を保持します. 他の場合では、次に予想されるre-configuration requestシーケンス番号から1を引いた値が保持されます */
  reconfigResponseSeq = 0;
  reconfigRequest;
  reconfigQueue = [];
  // rtt calculation
  srtt;
  rttvar;
  // timers
  rto = SCTP_RTO_INITIAL;
  /**t1 is wait for initAck or cookieAck */
  timer1Handle;
  timer1Chunk;
  timer1Failures = 0;
  /**t2 is wait for shutdown */
  timer2Handle;
  timer2Chunk;
  timer2Failures = 0;
  /**t3 is wait for data sack */
  timer3Handle;
  /**Re-configuration Timer */
  timerReconfigHandle;
  timerReconfigFailures = 0;
  timerHeartbeatHandle;
  heartbeatInterval = SCTP_HEARTBEAT_INTERVAL;
  // etc
  ssthresh;
  get isStopped() {
    return this.isStopping || this.isClosed;
  }
  get maxChannels() {
    if (this._inboundStreamsCount > 0) {
      return Math.min(this._inboundStreamsCount, this._outboundStreamsCount);
    }
    return void 0;
  }
  static client(transport, port = 5e3) {
    const sctp = new _SCTP(transport, port);
    sctp.isServer = false;
    return sctp;
  }
  static server(transport, port = 5e3) {
    const sctp = new _SCTP(transport, port);
    sctp.isServer = true;
    return sctp;
  }
  // call from dtls transport
  async handleData(data) {
    if (this.isStopped) return;
    let expectedTag;
    const [, , verificationTag, chunks] = parsePacket2(data);
    const initChunk = chunks.filter((v) => v.type === InitChunk.type).length;
    if (initChunk > 0) {
      if (chunks.length != 1) {
        throw new Error();
      }
      expectedTag = 0;
    } else {
      expectedTag = this.localVerificationTag;
    }
    if (verificationTag !== expectedTag) {
      return;
    }
    this.sackHasNewDataInPacket = false;
    for (const chunk of chunks) {
      await this.receiveChunk(chunk);
    }
    if (this.sackNeeded) {
      if (this.sackHasNewDataInPacket) {
        this.sackPacketCount++;
      }
      if (this.sackPacketCount >= 2) {
        this.sackImmediate = true;
      }
      await this.scheduleSack();
    }
  }
  async scheduleSack() {
    if (this.isStopped) return;
    if (!this.sackNeeded) return;
    if (this.sackImmediate) {
      if (this.sackTimeout) {
        clearTimeout(this.sackTimeout);
        this.sackTimeout = void 0;
      }
      await this.sendSack();
      return;
    }
    if (this.sackTimeout) return;
    this.sackTimeout = setTimeout(() => {
      this.sackTimeout = void 0;
      this.sendSack().catch((err5) => {
        log30("send delayed sack failed", err5.message);
      });
    }, SCTP_SACK_DELAY_MS);
  }
  async sendSack() {
    if (this.isStopped) return;
    if (!this.sackNeeded) return;
    const gaps = [];
    let gapNext;
    [...this.sackMisOrdered].sort().forEach((tsn) => {
      const pos = (tsn - this.lastReceivedTsn) % SCTP_TSN_MODULO;
      if (tsn === gapNext) {
        gaps[gaps.length - 1][1] = pos;
      } else {
        gaps.push([pos, pos]);
      }
      gapNext = tsnPlusOne(tsn);
    });
    const sack = new SackChunk(0, void 0);
    sack.cumulativeTsn = this.lastReceivedTsn;
    sack.advertisedRwnd = Math.max(0, this.advertisedRwnd);
    sack.duplicates = [...this.sackDuplicates];
    sack.gaps = gaps;
    await this.sendChunk(sack).catch((err5) => {
      log30("send sack failed", err5.message);
    });
    this.sackDuplicates = [];
    this.sackNeeded = false;
    this.sackPacketCount = 0;
    this.sackImmediate = false;
  }
  async receiveChunk(chunk) {
    switch (chunk.type) {
      case DataChunk.type:
        {
          this.receiveDataChunk(chunk);
        }
        break;
      case InitChunk.type:
        {
          if (!this.isServer) return;
          const init = chunk;
          log30("receive init", init);
          this.lastReceivedTsn = tsnMinusOne(init.initialTsn);
          this.reconfigResponseSeq = tsnMinusOne(init.initialTsn);
          this.remoteVerificationTag = init.initiateTag;
          this.ssthresh = init.advertisedRwnd;
          this.peerAdvertisedRwnd = init.advertisedRwnd;
          this.getExtensions(init.params);
          this._inboundStreamsCount = Math.min(
            init.outboundStreams,
            this._inboundStreamsMax
          );
          this._outboundStreamsCount = Math.min(
            this._outboundStreamsCount,
            init.inboundStreams
          );
          const ack = new InitAckChunk();
          ack.initiateTag = this.localVerificationTag;
          ack.advertisedRwnd = this.advertisedRwnd;
          ack.outboundStreams = this._outboundStreamsCount;
          ack.inboundStreams = this._inboundStreamsCount;
          ack.initialTsn = this.localTsn;
          this.setExtensions(ack.params);
          const time = Math.floor(Date.now() / 1e3);
          const cookieTime = Buffer.allocUnsafe(4);
          cookieTime.writeUInt32BE(time, 0);
          let cookie = cookieTime;
          cookie = Buffer.concat([
            cookie,
            createHmac5("sha1", this.hmacKey).update(cookie).digest()
          ]);
          ack.params.push([SCTP_STATE_COOKIE, cookie]);
          log30("send initAck", ack);
          await this.sendChunk(ack).catch((err5) => {
            log30("send initAck failed", err5.message);
          });
        }
        break;
      case InitAckChunk.type:
        {
          if (this.associationState != 2 /* COOKIE_WAIT */) return;
          const initAck = chunk;
          this.timer1Cancel();
          this.lastReceivedTsn = tsnMinusOne(initAck.initialTsn);
          this.reconfigResponseSeq = tsnMinusOne(initAck.initialTsn);
          this.remoteVerificationTag = initAck.initiateTag;
          this.ssthresh = initAck.advertisedRwnd;
          this.peerAdvertisedRwnd = initAck.advertisedRwnd;
          this.getExtensions(initAck.params);
          this._inboundStreamsCount = Math.min(
            initAck.outboundStreams,
            this._inboundStreamsMax
          );
          this._outboundStreamsCount = Math.min(
            this._outboundStreamsCount,
            initAck.inboundStreams
          );
          const echo = new CookieEchoChunk();
          for (const [k, v] of initAck.params) {
            if (k === SCTP_STATE_COOKIE) {
              echo.body = v;
              break;
            }
          }
          await this.sendChunk(echo).catch((err5) => {
            log30("send echo failed", err5.message);
          });
          this.timer1Start(echo);
          this.setState(3 /* COOKIE_ECHOED */);
        }
        break;
      case SackChunk.type:
        {
          await this.receiveSackChunk(chunk);
        }
        break;
      case HeartbeatChunk.type:
        {
          const ack = new HeartbeatAckChunk();
          ack.params = chunk.params;
          await this.sendChunk(ack).catch((err5) => {
            log30("send heartbeat ack failed", err5.message);
          });
        }
        break;
      case AbortChunk.type:
        {
          this.setState(1 /* CLOSED */);
        }
        break;
      case ShutdownChunk.type:
        {
          this.timer2Cancel();
          this.setState(7 /* SHUTDOWN_RECEIVED */);
          const ack = new ShutdownAckChunk();
          await this.sendChunk(ack).catch((err5) => {
            log30("send shutdown ack failed", err5.message);
          });
          this.t2Start(ack);
          this.setState(6 /* SHUTDOWN_SENT */);
        }
        break;
      case ErrorChunk.type:
        {
          log30("ErrorChunk", chunk.descriptions);
        }
        break;
      case CookieEchoChunk.type:
        {
          if (!this.isServer) return;
          const data = chunk;
          const cookie = data.body;
          const digest = createHmac5("sha1", this.hmacKey).update(cookie.slice(0, 4)).digest();
          if (cookie?.length != COOKIE_LENGTH || !cookie.slice(4).equals(digest)) {
            log30("x State cookie is invalid");
            return;
          }
          const now = Math.floor(Date.now() / 1e3);
          const stamp = cookie.readUInt32BE(0);
          if (stamp < now - COOKIE_LIFETIME || stamp > now) {
            const error = new ErrorChunk(0, void 0);
            error.params.push([
              ErrorChunk.CODE.StaleCookieError,
              Buffer.concat([...Array(8)].map(() => Buffer.from("\0")))
            ]);
            await this.sendChunk(error).catch((err5) => {
              log30("send errorChunk failed", err5.message);
            });
            return;
          }
          const ack = new CookieAckChunk();
          await this.sendChunk(ack).catch((err5) => {
            log30("send cookieAck failed", err5.message);
          });
          this.setState(4 /* ESTABLISHED */);
        }
        break;
      case CookieAckChunk.type:
        {
          if (this.associationState != 3 /* COOKIE_ECHOED */) return;
          this.timer1Cancel();
          this.setState(4 /* ESTABLISHED */);
        }
        break;
      case ShutdownCompleteChunk.type:
        {
          if (this.associationState != 8 /* SHUTDOWN_ACK_SENT */) return;
          this.timer2Cancel();
          this.setState(1 /* CLOSED */);
        }
        break;
      // extensions
      case ReconfigChunk.type:
        {
          if (this.associationState != 4 /* ESTABLISHED */) return;
          const reconfig = chunk;
          for (const [type, body] of reconfig.params) {
            const target = RECONFIG_PARAM_BY_TYPES[type];
            if (target) {
              await this.receiveReconfigParam(target.parse(body));
            }
          }
        }
        break;
      case ForwardTsnChunk.type:
        {
          this.receiveForwardTsnChunk(chunk);
        }
        break;
    }
  }
  getExtensions(params) {
    for (const [k, v] of params) {
      if (k === SCTP_PRSCTP_SUPPORTED) {
        this.remotePartialReliability = true;
      } else if (k === SCTP_SUPPORTED_CHUNK_EXT) {
        this.remoteExtensions = [...v];
      }
    }
  }
  async receiveReconfigParam(param) {
    log30("receiveReconfigParam", RECONFIG_PARAM_BY_TYPES[param.type]);
    switch (param.type) {
      case OutgoingSSNResetRequestParam.type:
        {
          const p = param;
          const response = new ReconfigResponseParam(
            p.requestSequence,
            reconfigResult.ReconfigResultSuccessPerformed
          );
          this.reconfigResponseSeq = p.requestSequence;
          await this.sendReconfigParam(response);
          await Promise.all(
            p.streams.map(async (streamId) => {
              delete this.inboundStreams[streamId];
              if (this.outboundStreamSeq[streamId]) {
                if (!this.reconfigQueue.includes(streamId)) {
                  this.reconfigQueue.push(streamId);
                }
              }
            })
          );
          await this.transmitReconfigRequest();
          this.onReconfigStreams.execute(p.streams);
        }
        break;
      case ReconfigResponseParam.type:
        {
          const reset = param;
          if (reset.result !== reconfigResult.ReconfigResultSuccessPerformed) {
            log30(
              "OutgoingSSNResetRequestParam failed",
              Object.keys(reconfigResult).find(
                (key) => reconfigResult[key] === reset.result
              )
            );
          } else if (reset.responseSequence === this.reconfigRequest?.requestSequence) {
            const streamIds = this.reconfigRequest.streams.map((streamId) => {
              delete this.outboundStreamSeq[streamId];
              return streamId;
            });
            this.onReconfigStreams.execute(streamIds);
            this.reconfigRequest = void 0;
            this.timerReconfigCancel();
            this.rto = SCTP_RTO_INITIAL;
            this.timerReconfigFailures = 0;
            if (this.reconfigQueue.length > 0) {
              await this.transmitReconfigRequest();
            }
          }
        }
        break;
      case StreamAddOutgoingParam.type:
        {
          const add = param;
          this._inboundStreamsCount += add.newStreams;
          const res = new ReconfigResponseParam(add.requestSequence, 1);
          this.reconfigResponseSeq = add.requestSequence;
          await this.sendReconfigParam(res);
        }
        break;
    }
  }
  receiveDataChunk(chunk) {
    this.sackNeeded = true;
    if (this.markReceived(chunk.tsn)) {
      this.sackImmediate = true;
      return;
    }
    this.sackHasNewDataInPacket = true;
    this.sackImmediate = true;
    if ((chunk.flags & SCTP_DATA_LAST_FRAG) === 0) {
      this.sackImmediate = true;
    }
    if (this.sackMisOrdered.size > 0) {
      this.sackImmediate = true;
    }
    const inboundStream = this.getInboundStream(chunk.streamId);
    inboundStream.addChunk(chunk);
    this.advertisedRwnd -= chunk.userData.length;
    for (const message of inboundStream.popMessages()) {
      this.advertisedRwnd += message[2].length;
      this.receive(...message);
    }
  }
  async receiveSackChunk(chunk) {
    if (uint32Gt(this.lastSackedTsn, chunk.cumulativeTsn)) return;
    const receivedTime = Date.now() / 1e3;
    this.lastSackedTsn = chunk.cumulativeTsn;
    const cwndFullyUtilized = this.flightSize >= this.cwnd;
    let done = 0, doneBytes = 0;
    while (this.sentQueue.length > 0 && uint32Gte(this.lastSackedTsn, this.sentQueue[0].tsn)) {
      const sChunk = this.sentQueue.shift();
      done++;
      if (!sChunk?.acked) {
        doneBytes += sChunk.bookSize;
        this.flightSizeDecrease(sChunk);
      }
      if (done === 1 && sChunk.sentCount === 1) {
        this.updateRto(receivedTime - sChunk.sentTime);
      }
    }
    if (!this.sentQueue.length) {
      this.sentQueue = [];
    }
    let loss = false;
    if (chunk.gaps.length > 0) {
      const seen = /* @__PURE__ */ new Set();
      let highestSeenTsn;
      chunk.gaps.forEach((gap) => {
        for (let pos = gap[0]; pos < gap[1] + 1; pos++) {
          highestSeenTsn = (chunk.cumulativeTsn + pos) % SCTP_TSN_MODULO;
          seen.add(highestSeenTsn);
        }
      });
      let highestNewlyAcked = chunk.cumulativeTsn;
      for (const sChunk of this.sentQueue) {
        if (uint32Gt(sChunk.tsn, highestSeenTsn)) {
          break;
        }
        if (seen.has(sChunk.tsn) && !sChunk.acked) {
          doneBytes += sChunk.bookSize;
          sChunk.acked = true;
          this.flightSizeDecrease(sChunk);
          highestNewlyAcked = sChunk.tsn;
        }
      }
      for (const sChunk of this.sentQueue) {
        if (uint32Gt(sChunk.tsn, highestNewlyAcked)) {
          break;
        }
        if (!seen.has(sChunk.tsn)) {
          sChunk.misses++;
          if (sChunk.misses === 3) {
            sChunk.misses = 0;
            if (!this.maybeAbandon(sChunk)) {
              sChunk.retransmit = true;
            }
            sChunk.acked = false;
            this.flightSizeDecrease(sChunk);
            loss = true;
          }
        }
      }
    }
    if (this.fastRecoveryExit === void 0) {
      if (done && cwndFullyUtilized) {
        if (this.cwnd <= this.ssthresh) {
          this.cwnd += Math.min(doneBytes, USERDATA_MAX_LENGTH);
        } else {
          this.partialBytesAcked += doneBytes;
          if (this.partialBytesAcked >= this.cwnd) {
            this.partialBytesAcked -= this.cwnd;
            this.cwnd += USERDATA_MAX_LENGTH;
          }
        }
      }
      if (loss) {
        this.ssthresh = Math.max(
          Math.floor(this.cwnd / 2),
          4 * USERDATA_MAX_LENGTH
        );
        this.cwnd = this.ssthresh;
        this.partialBytesAcked = 0;
        this.fastRecoveryExit = this.sentQueue[this.sentQueue.length - 1].tsn;
        this.fastRecoveryTransmit = true;
      }
    } else if (uint32Gte(chunk.cumulativeTsn, this.fastRecoveryExit)) {
      this.fastRecoveryExit = void 0;
    }
    if (this.sentQueue.length === 0) {
      this.timer3Cancel();
    } else if (done > 0) {
      this.timer3Restart();
    }
    this.peerAdvertisedRwnd = chunk.advertisedRwnd;
    this.updateAdvancedPeerAckPoint();
    await this.onSackReceived();
    await this.transmit();
  }
  receiveForwardTsnChunk(chunk) {
    this.sackNeeded = true;
    this.sackImmediate = true;
    if (uint32Gte(this.lastReceivedTsn, chunk.cumulativeTsn)) {
      return;
    }
    const isObsolete = (x) => uint32Gt(x, this.lastReceivedTsn);
    this.lastReceivedTsn = chunk.cumulativeTsn;
    this.sackMisOrdered = new Set([...this.sackMisOrdered].filter(isObsolete));
    for (const tsn of [...this.sackMisOrdered].sort()) {
      if (tsn === tsnPlusOne(this.lastReceivedTsn)) {
        this.lastReceivedTsn = tsn;
      } else {
        break;
      }
    }
    this.sackDuplicates = this.sackDuplicates.filter(isObsolete);
    this.sackMisOrdered = new Set([...this.sackMisOrdered].filter(isObsolete));
    for (const [streamId, streamSeqNum] of chunk.streams) {
      const inboundStream = this.getInboundStream(streamId);
      inboundStream.streamSequenceNumber = uint16Add(streamSeqNum, 1);
      for (const message of inboundStream.popMessages()) {
        this.advertisedRwnd += message[2].length;
        this.receive(...message);
      }
    }
    Object.values(this.inboundStreams).forEach((inboundStream) => {
      this.advertisedRwnd += inboundStream.pruneChunks(this.lastReceivedTsn);
    });
  }
  updateRto(R) {
    if (!this.srtt) {
      this.rttvar = R / 2;
      this.srtt = R;
    } else {
      this.rttvar = (1 - SCTP_RTO_BETA) * this.rttvar + SCTP_RTO_BETA * Math.abs(this.srtt - R);
      this.srtt = (1 - SCTP_RTO_ALPHA) * this.srtt + SCTP_RTO_ALPHA * R;
    }
    this.rto = Math.max(
      SCTP_RTO_MIN,
      Math.min(this.srtt + 4 * this.rttvar, SCTP_RTO_MAX)
    );
  }
  receive(streamId, ppId, data) {
    this.onReceive.execute(streamId, ppId, data);
  }
  getInboundStream(streamId) {
    if (!this.inboundStreams[streamId]) {
      this.inboundStreams[streamId] = new InboundStream();
    }
    return this.inboundStreams[streamId];
  }
  markReceived(tsn) {
    if (uint32Gte(this.lastReceivedTsn, tsn) || this.sackMisOrdered.has(tsn)) {
      this.sackDuplicates.push(tsn);
      return true;
    }
    this.sackMisOrdered.add(tsn);
    for (const tsn2 of [...this.sackMisOrdered].sort()) {
      if (tsn2 === tsnPlusOne(this.lastReceivedTsn)) {
        this.lastReceivedTsn = tsn2;
      } else {
        break;
      }
    }
    const isObsolete = (x) => uint32Gt(x, this.lastReceivedTsn);
    this.sackDuplicates = this.sackDuplicates.filter(isObsolete);
    this.sackMisOrdered = new Set([...this.sackMisOrdered].filter(isObsolete));
    return false;
  }
  send = async (streamId, ppId, userData, {
    expiry,
    maxRetransmits,
    ordered
  } = { expiry: void 0, maxRetransmits: void 0, ordered: true }) => {
    const streamSeqNum = ordered ? this.outboundStreamSeq[streamId] || 0 : 0;
    const fragments = Math.ceil(userData.length / USERDATA_MAX_LENGTH);
    let pos = 0;
    const chunks = [];
    for (let fragment = 0; fragment < fragments; fragment++) {
      const chunk = new DataChunk(0, void 0);
      chunk.flags = 0;
      if (!ordered) {
        chunk.flags = SCTP_DATA_UNORDERED;
      }
      if (fragment === 0) {
        chunk.flags |= SCTP_DATA_FIRST_FRAG;
      }
      if (fragment === fragments - 1) {
        chunk.flags |= SCTP_DATA_LAST_FRAG;
      }
      chunk.tsn = this.localTsn;
      chunk.streamId = streamId;
      chunk.streamSeqNum = streamSeqNum;
      chunk.protocol = ppId;
      chunk.userData = userData.slice(pos, pos + USERDATA_MAX_LENGTH);
      chunk.bookSize = chunk.userData.length;
      chunk.expiry = expiry;
      chunk.maxRetransmits = maxRetransmits;
      pos += USERDATA_MAX_LENGTH;
      this.localTsn = tsnPlusOne(this.localTsn);
      chunks.push(chunk);
    }
    chunks.forEach((chunk) => {
      this.outboundQueue.push(chunk);
    });
    if (ordered) {
      this.outboundStreamSeq[streamId] = uint16Add(streamSeqNum, 1);
    }
    await this.transmit();
    while (this.outboundQueue.length) {
      await this.flush.asPromise();
    }
  };
  async transmit() {
    if (this.isStopped) return;
    if (this.transmitting) {
      this.transmitRequested = true;
      return;
    }
    this.transmitting = true;
    try {
      do {
        this.transmitRequested = false;
        await this.transmitOnce();
      } while (this.transmitRequested);
    } finally {
      this.transmitting = false;
    }
  }
  async transmitOnce() {
    if (this.isStopped) return;
    if (this.forwardTsnChunk) {
      await this.sendChunk(this.forwardTsnChunk).catch((err5) => {
        log30("send forwardTsn failed", err5.message);
      });
      this.forwardTsnChunk = void 0;
      if (!this.timer3Handle) {
        this.timer3Start();
      }
    }
    const burstSize = this.fastRecoveryExit != void 0 ? 2 * USERDATA_MAX_LENGTH : 4 * USERDATA_MAX_LENGTH;
    const cwnd = Math.min(this.flightSize + burstSize, this.cwnd);
    let retransmitEarliest = true;
    for (const dataChunk of this.sentQueue) {
      if (dataChunk.retransmit) {
        if (this.fastRecoveryTransmit) {
          this.fastRecoveryTransmit = false;
        } else if (this.flightSize >= cwnd) {
          break;
        }
        this.flightSizeIncrease(dataChunk);
        dataChunk.misses = 0;
        dataChunk.retransmit = false;
        dataChunk.sentCount++;
        await this.sendChunk(dataChunk).catch((err5) => {
          log30("send data failed", err5.message);
        });
        if (retransmitEarliest) {
          this.timer3Restart();
        }
      }
      retransmitEarliest = false;
    }
    while (this.outboundQueue.length > 0 && this.flightSize < cwnd && this.peerRwnd > 0) {
      const chunk = this.outboundQueue.shift();
      if (!chunk) break;
      if (chunk.bookSize > this.peerRwnd && this.flightSize > 0) {
        this.outboundQueue.unshift(chunk);
        break;
      }
      this.sentQueue.push(chunk);
      this.flightSizeIncrease(chunk);
      chunk.sentCount++;
      chunk.sentTime = Date.now() / 1e3;
      await this.sendChunk(chunk).catch((err5) => {
        log30("send data outboundQueue failed", err5.message);
      });
      if (!this.timer3Handle) {
        this.timer3Start();
      }
    }
    if (!this.outboundQueue.length) {
      this.outboundQueue = [];
    }
    this.flush.execute();
  }
  async transmitReconfigRequest() {
    if (this.reconfigQueue.length > 0 && this.associationState === 4 /* ESTABLISHED */ && !this.reconfigRequest) {
      const uniqueStreams = [...new Set(this.reconfigQueue)];
      const streams = uniqueStreams.slice(0, RECONFIG_MAX_STREAMS);
      this.reconfigQueue = uniqueStreams.slice(RECONFIG_MAX_STREAMS);
      const param = new OutgoingSSNResetRequestParam(
        this.reconfigRequestSeq,
        this.reconfigResponseSeq,
        tsnMinusOne(this.localTsn),
        streams
      );
      this.reconfigRequestSeq = tsnPlusOne(this.reconfigRequestSeq);
      this.reconfigRequest = param;
      await this.sendReconfigParam(param);
      this.timerReconfigHandleStart();
    }
  }
  async sendReconfigParam(param) {
    log30("sendReconfigParam", param);
    const chunk = new ReconfigChunk();
    chunk.params.push([param.type, param.bytes]);
    await this.sendChunk(chunk).catch((err5) => {
      log30("send reconfig failed", err5.message);
    });
  }
  // https://github.com/pion/sctp/pull/44/files
  async sendResetRequest(streamId) {
    log30("sendResetRequest", streamId);
    const chunk = new DataChunk(0, void 0);
    chunk.streamId = streamId;
    this.outboundQueue.push(chunk);
    if (!this.timer3Handle) {
      await this.transmit();
    }
  }
  flightSizeIncrease(chunk) {
    this.flightSize += chunk.bookSize;
  }
  flightSizeDecrease(chunk) {
    this.flightSize = Math.max(0, this.flightSize - chunk.bookSize);
  }
  // # timers
  /**t1 is wait for initAck or cookieAck */
  timer1Start(chunk) {
    if (this.timer1Handle) throw new Error();
    this.timer1Chunk = chunk;
    this.timer1Failures = 0;
    this.timer1Handle = setTimeout(this.timer1Expired, this.rto * 1e3);
  }
  timer1Expired = () => {
    if (this.isStopped) return;
    this.timer1Failures++;
    this.timer1Handle = void 0;
    if (this.timer1Failures > SCTP_MAX_INIT_RETRANS) {
      this.setState(1 /* CLOSED */);
    } else {
      setImmediate(() => {
        if (this.isStopped) return;
        this.sendChunk(this.timer1Chunk).catch((err5) => {
          log30("send timer1 chunk failed", err5.message);
        });
      });
      if (this.isStopped) return;
      this.timer1Handle = setTimeout(this.timer1Expired, this.rto * 1e3);
    }
  };
  timer1Cancel() {
    if (this.timer1Handle) {
      clearTimeout(this.timer1Handle);
      this.timer1Handle = void 0;
      this.timer1Chunk = void 0;
    }
  }
  /**t2 is wait for shutdown */
  t2Start(chunk) {
    if (this.timer2Handle) throw new Error();
    this.timer2Chunk = chunk;
    this.timer2Failures = 0;
    this.timer2Handle = setTimeout(this.timer2Expired, this.rto * 1e3);
  }
  timer2Expired = () => {
    if (this.isStopped) return;
    this.timer2Failures++;
    this.timer2Handle = void 0;
    if (this.timer2Failures > SCTP_MAX_ASSOCIATION_RETRANS) {
      this.setState(1 /* CLOSED */);
    } else {
      setImmediate(() => {
        if (this.isStopped) return;
        this.sendChunk(this.timer2Chunk).catch((err5) => {
          log30("send timer2Chunk failed", err5.message);
        });
      });
      if (this.isStopped) return;
      this.timer2Handle = setTimeout(this.timer2Expired, this.rto * 1e3);
    }
  };
  timer2Cancel() {
    if (this.timer2Handle) {
      clearTimeout(this.timer2Handle);
      this.timer2Handle = void 0;
      this.timer2Chunk = void 0;
    }
  }
  /**t3 is wait for data sack */
  timer3Start() {
    if (this.isStopped) return;
    if (this.timer3Handle) throw new Error();
    this.timer3Handle = setTimeout(this.timer3Expired, this.rto * 1e3);
  }
  timer3Restart() {
    if (this.isStopped) return;
    this.timer3Cancel();
    this.timer3Handle = setTimeout(this.timer3Expired, this.rto * 1e3);
  }
  timer3Expired = () => {
    if (this.isStopped) return;
    this.timer3Handle = void 0;
    this.sentQueue.forEach((chunk) => {
      if (!this.maybeAbandon(chunk)) {
        chunk.retransmit = true;
      }
    });
    this.updateAdvancedPeerAckPoint();
    this.fastRecoveryExit = void 0;
    this.flightSize = 0;
    this.partialBytesAcked = 0;
    this.ssthresh = Math.max(
      Math.floor(this.cwnd / 2),
      4 * USERDATA_MAX_LENGTH
    );
    this.cwnd = USERDATA_MAX_LENGTH;
    this.transmit();
  };
  timer3Cancel() {
    if (this.timer3Handle) {
      clearTimeout(this.timer3Handle);
      this.timer3Handle = void 0;
    }
  }
  /**Re-configuration Timer */
  timerReconfigHandleStart() {
    if (this.isStopped) return;
    if (this.timerReconfigHandle) return;
    log30("timerReconfigHandleStart", { rto: this.rto });
    this.timerReconfigFailures = 0;
    this.timerReconfigHandle = setTimeout(
      this.timerReconfigHandleExpired,
      this.rto * 1e3
    );
  }
  timerReconfigHandleExpired = async () => {
    if (this.isStopped) return;
    this.timerReconfigFailures++;
    this.rto = Math.ceil(this.rto * 1.5);
    if (this.timerReconfigFailures > SCTP_MAX_ASSOCIATION_RETRANS) {
      log30("timerReconfigFailures", this.timerReconfigFailures);
      this.setState(1 /* CLOSED */);
      this.timerReconfigHandle = void 0;
    } else if (this.reconfigRequest) {
      log30("timerReconfigHandleExpired", this.timerReconfigFailures, this.rto);
      await this.sendReconfigParam(this.reconfigRequest);
      if (this.isStopped) return;
      this.timerReconfigHandle = setTimeout(
        this.timerReconfigHandleExpired,
        this.rto * 1e3
      );
    }
  };
  timerReconfigCancel() {
    if (this.timerReconfigHandle) {
      log30("timerReconfigCancel");
      clearTimeout(this.timerReconfigHandle);
      this.timerReconfigHandle = void 0;
      this.timerReconfigFailures = 0;
    }
  }
  heartbeatStart() {
    if (this.timerHeartbeatHandle || this.associationState !== 4 /* ESTABLISHED */) {
      return;
    }
    this.timerHeartbeatHandle = setTimeout(
      this.timerHeartbeatExpired,
      (this.rto + this.heartbeatInterval) * 1e3
    );
  }
  heartbeatRestart() {
    this.heartbeatCancel();
    this.heartbeatStart();
  }
  heartbeatCancel() {
    if (this.timerHeartbeatHandle) {
      clearTimeout(this.timerHeartbeatHandle);
      this.timerHeartbeatHandle = void 0;
    }
  }
  timerHeartbeatExpired = async () => {
    this.timerHeartbeatHandle = void 0;
    if (this.associationState !== 4 /* ESTABLISHED */) return;
    if (this.flightSize === 0 && this.outboundQueue.length === 0) {
      const heartbeat = new HeartbeatChunk();
      const heartbeatTime = Buffer.allocUnsafe(4);
      heartbeatTime.writeUInt32BE(Math.floor(Date.now() / 1e3), 0);
      heartbeat.params.push([1, heartbeatTime]);
      await this.sendChunk(heartbeat).catch((err5) => {
        log30("send heartbeat failed", err5.message);
      });
    }
    this.heartbeatStart();
  };
  setHeartbeatInterval(interval) {
    if (interval <= 0) {
      throw new Error("heartbeat interval must be > 0");
    }
    this.heartbeatInterval = interval;
    this.heartbeatRestart();
  }
  updateAdvancedPeerAckPoint() {
    if (uint32Gt(this.lastSackedTsn, this.advancedPeerAckTsn)) {
      this.advancedPeerAckTsn = this.lastSackedTsn;
    }
    let done = 0;
    const streams = {};
    while (this.sentQueue.length > 0 && this.sentQueue[0].abandoned) {
      const chunk = this.sentQueue.shift();
      this.advancedPeerAckTsn = chunk.tsn;
      done++;
      if (!(chunk.flags & SCTP_DATA_UNORDERED)) {
        streams[chunk.streamId] = chunk.streamSeqNum;
      }
    }
    if (!this.sentQueue.length) {
      this.sentQueue = [];
    }
    if (done) {
      this.forwardTsnChunk = new ForwardTsnChunk(0, void 0);
      this.forwardTsnChunk.cumulativeTsn = this.advancedPeerAckTsn;
      this.forwardTsnChunk.streams = Object.entries(streams).map(([k, v]) => [
        Number(k),
        v
      ]);
    }
  }
  maybeAbandon(chunk) {
    if (chunk.abandoned) return true;
    const abandon = !!chunk.maxRetransmits && chunk.maxRetransmits < chunk.sentCount || !!chunk.expiry && chunk.expiry < Date.now() / 1e3;
    if (!abandon) return false;
    const chunkPos = this.sentQueue.findIndex((v) => v.type === chunk.type);
    for (let pos = chunkPos; pos >= 0; pos--) {
      const oChunk = this.sentQueue[pos];
      oChunk.abandoned = true;
      oChunk.retransmit = false;
      if (oChunk.flags & SCTP_DATA_LAST_FRAG) {
        break;
      }
    }
    for (let pos = chunkPos; pos < this.sentQueue.length; pos++) {
      const oChunk = this.sentQueue[pos];
      oChunk.abandoned = true;
      oChunk.retransmit = false;
      if (oChunk.flags & SCTP_DATA_LAST_FRAG) {
        break;
      }
    }
    return true;
  }
  static getCapabilities() {
    return new RTCSctpCapabilities(65536);
  }
  setRemotePort(port) {
    this.remotePort = port;
  }
  async start(remotePort) {
    if (!this.started) {
      this.started = true;
      this.setConnectionState("connecting");
      if (remotePort) {
        this.setRemotePort(remotePort);
      }
      if (!this.isServer) {
        await this.init();
      }
    }
  }
  async init() {
    const init = new InitChunk();
    init.initiateTag = this.localVerificationTag;
    init.advertisedRwnd = this.advertisedRwnd;
    init.outboundStreams = this._outboundStreamsCount;
    init.inboundStreams = this._inboundStreamsMax;
    init.initialTsn = this.localTsn;
    this.setExtensions(init.params);
    log30("send init", init);
    try {
      await this.sendChunk(init);
      this.timer1Start(init);
      this.setState(2 /* COOKIE_WAIT */);
    } catch (error) {
      log30("send init failed", error.message);
    }
  }
  setExtensions(params) {
    const extensions = [];
    if (this.localPartialReliability) {
      params.push([SCTP_PRSCTP_SUPPORTED, Buffer.from("")]);
      extensions.push(ForwardTsnChunk.type);
    }
    extensions.push(ReConfigChunk.type);
    params.push([SCTP_SUPPORTED_CHUNK_EXT, Buffer.from(extensions)]);
  }
  async sendChunk(chunk) {
    if (this.state === "closed") return;
    if (this.remotePort === void 0) {
      throw new Error("invalid remote port");
    }
    const packet = serializePacket(
      this.localPort,
      this.remotePort,
      this.remoteVerificationTag,
      chunk
    );
    await this.transport.send(packet);
  }
  setState(state) {
    if (state != this.associationState) {
      this.associationState = state;
    }
    if (state === 4 /* ESTABLISHED */) {
      this.isStopping = false;
      this.isClosed = false;
      this.setConnectionState("connected");
      this.heartbeatStart();
    } else if (state === 1 /* CLOSED */) {
      this.isClosed = true;
      this.timer1Cancel();
      this.timer2Cancel();
      this.timer3Cancel();
      this.timerReconfigCancel();
      this.heartbeatCancel();
      if (this.sackTimeout) {
        clearTimeout(this.sackTimeout);
        this.sackTimeout = void 0;
      }
      this.setConnectionState("closed");
      this.removeAllListeners();
    }
  }
  setConnectionState(state) {
    this.state = state;
    log30("setConnectionState", state);
    this.stateChanged[state].execute();
  }
  async stop() {
    if (this.isStopped) {
      this.setState(1 /* CLOSED */);
      return;
    }
    this.isStopping = true;
    this.transport.onData = void 0;
    if (this.sackTimeout) {
      clearTimeout(this.sackTimeout);
      this.sackTimeout = void 0;
    }
    if (this.associationState !== 1 /* CLOSED */) {
      await this.abort();
    }
    this.setState(1 /* CLOSED */);
    clearTimeout(this.timer1Handle);
    clearTimeout(this.timer2Handle);
    clearTimeout(this.timer3Handle);
    clearTimeout(this.timerReconfigHandle);
    clearTimeout(this.timerHeartbeatHandle);
    clearTimeout(this.sackTimeout);
  }
  async abort() {
    const abort = new AbortChunk();
    await this.sendChunk(abort).catch((err5) => {
      log30("send abort failed", err5.message);
    });
  }
  removeAllListeners() {
    Object.values(this.stateChanged).forEach((v) => v.allUnsubscribe());
  }
};
var InboundStream = class {
  reassembly = [];
  streamSequenceNumber = 0;
  // SSN
  constructor() {
  }
  addChunk(chunk) {
    if (this.reassembly.length === 0 || uint32Gt(chunk.tsn, this.reassembly[this.reassembly.length - 1].tsn)) {
      this.reassembly.push(chunk);
      return;
    }
    for (const [i, v] of enumerate3(this.reassembly)) {
      if (v.tsn === chunk.tsn) throw new Error("duplicate chunk in reassembly");
      if (uint32Gt(v.tsn, chunk.tsn)) {
        this.reassembly.splice(i, 0, chunk);
        break;
      }
    }
  }
  *popMessages() {
    let pos = 0;
    let startPos;
    let expectedTsn;
    let ordered;
    while (pos < this.reassembly.length) {
      const chunk = this.reassembly[pos];
      if (startPos === void 0) {
        ordered = !(chunk.flags & SCTP_DATA_UNORDERED);
        if (!(chunk.flags & SCTP_DATA_FIRST_FRAG)) {
          if (ordered) {
            break;
          } else {
            pos++;
            continue;
          }
        }
        if (ordered && uint16Gt(chunk.streamSeqNum, this.streamSequenceNumber)) {
          break;
        }
        expectedTsn = chunk.tsn;
        startPos = pos;
      } else if (chunk.tsn !== expectedTsn) {
        if (ordered) {
          break;
        } else {
          startPos = void 0;
          pos++;
          continue;
        }
      }
      if (chunk.flags & SCTP_DATA_LAST_FRAG) {
        const arr = this.reassembly.slice(startPos, pos + 1).map((c) => c.userData).reduce((acc, cur) => {
          acc.push(cur);
          acc.push(Buffer.from(""));
          return acc;
        }, []);
        arr.pop();
        const userData = Buffer.concat(arr);
        this.reassembly = [
          ...this.reassembly.slice(0, startPos),
          ...this.reassembly.slice(pos + 1)
        ];
        if (ordered && chunk.streamSeqNum === this.streamSequenceNumber) {
          this.streamSequenceNumber = uint16Add(this.streamSequenceNumber, 1);
        }
        pos = startPos;
        yield [chunk.streamId, chunk.protocol, userData];
      } else {
        pos++;
      }
      expectedTsn = tsnPlusOne(expectedTsn);
    }
  }
  pruneChunks(tsn) {
    let pos = -1, size = 0;
    for (const [i, chunk] of this.reassembly.entries()) {
      if (uint32Gte(tsn, chunk.tsn)) {
        pos = i;
        size += chunk.userData.length;
      } else {
        break;
      }
    }
    this.reassembly = this.reassembly.slice(pos + 1);
    return size;
  }
};
var RTCSctpCapabilities = class {
  constructor(maxMessageSize) {
    this.maxMessageSize = maxMessageSize;
  }
};
function tsnMinusOne(a) {
  return (a - 1) % SCTP_TSN_MODULO;
}
function tsnPlusOne(a) {
  return (a + 1) % SCTP_TSN_MODULO;
}

// src/transport/sctp.ts
var log31 = debug("werift:packages/webrtc/src/transport/sctp.ts");
var DEFAULT_MAX_MESSAGE_SIZE = 65536;
var RTCSctpTransport = class _RTCSctpTransport {
  constructor(port = 5e3, maxMessageSize = DEFAULT_MAX_MESSAGE_SIZE) {
    this.port = port;
    this.maxMessageSize = maxMessageSize;
  }
  dtlsTransport;
  sctp;
  onDataChannel = new Event2();
  id = randomUUID8().toString();
  mid;
  mLineIndex;
  bundled = false;
  dataChannels = {};
  remoteMaxMessageSize = DEFAULT_MAX_MESSAGE_SIZE;
  dataChannelQueue = [];
  dataChannelId;
  eventDisposer = [];
  get transport() {
    return this.dtlsTransport;
  }
  setDtlsTransport(dtlsTransport) {
    if (this.dtlsTransport && this.dtlsTransport.id === dtlsTransport.id) {
      return;
    }
    this.eventDisposer.forEach((dispose) => dispose());
    this.dtlsTransport = dtlsTransport;
    this.sctp = new SCTP(new BridgeDtls(this.dtlsTransport), this.port);
    this.eventDisposer = [
      ...[
        this.sctp.onReceive.subscribe(this.datachannelReceive),
        this.sctp.onReconfigStreams.subscribe((ids) => {
          ids.forEach((id) => {
            const dc = this.dataChannels[id];
            if (!dc) return;
            dc.setReadyState("closing");
            dc.setReadyState("closed");
            delete this.dataChannels[id];
          });
        }),
        this.sctp.stateChanged.connected.subscribe(() => {
          Object.values(this.dataChannels).forEach((channel) => {
            if (channel.negotiated && channel.readyState !== "open") {
              channel.setReadyState("open");
            }
          });
          this.dataChannelFlush();
        }),
        this.sctp.stateChanged.closed.subscribe(() => {
          Object.values(this.dataChannels).forEach((dc) => {
            dc.setReadyState("closed");
          });
          this.dataChannels = {};
        }),
        this.dtlsTransport.onStateChange.subscribe((state) => {
          if (state === "closed") {
            this.sctp.setState(1 /* CLOSED */);
          }
        })
      ].map((e) => e.unSubscribe),
      () => this.sctp.onSackReceived = async () => {
      }
    ];
    this.sctp.onSackReceived = async () => {
      await this.dataChannelFlush();
    };
  }
  get isServer() {
    return this.dtlsTransport.iceTransport.role !== "controlling";
  }
  channelByLabel(label) {
    return Object.values(this.dataChannels).find((d) => d.label === label);
  }
  datachannelReceive = async (streamId, ppId, data) => {
    if (ppId === WEBRTC_DCEP && data.length > 0) {
      log31("DCEP", streamId, ppId, data);
      switch (data[0]) {
        case DATA_CHANNEL_OPEN:
          {
            if (data.length < 12) {
              log31("DATA_CHANNEL_OPEN data.length not enough");
              return;
            }
            if (!Object.keys(this.dataChannels).includes(streamId.toString())) {
              const channelType = data.readUInt8(1);
              const reliability = data.readUInt32BE(4);
              const labelLength = data.readUInt16BE(8);
              const protocolLength = data.readUInt16BE(10);
              let pos = 12;
              const label = data.slice(pos, pos + labelLength).toString("utf8");
              pos += labelLength;
              const protocol = data.slice(pos, pos + protocolLength).toString("utf8");
              log31("DATA_CHANNEL_OPEN", {
                channelType,
                reliability,
                streamId,
                label,
                protocol
              });
              const maxRetransmits = (channelType & 3) === 1 ? reliability : void 0;
              const maxPacketLifeTime = (channelType & 3) === 2 ? reliability : void 0;
              const parameters = new RTCDataChannelParameters({
                label,
                ordered: (channelType & 128) === 0,
                maxPacketLifeTime,
                maxRetransmits,
                protocol,
                id: streamId
              });
              const channel2 = new RTCDataChannel(this, parameters, false);
              channel2.isCreatedByRemote = true;
              this.dataChannels[streamId] = channel2;
              this.onDataChannel.execute(channel2);
              channel2.setReadyState("open");
            } else {
              log31("datachannel already opened", "retransmit ack");
            }
            const channel = this.dataChannels[streamId];
            const ack = Buffer.allocUnsafe(1);
            ack.writeUInt8(DATA_CHANNEL_ACK, 0);
            this.dataChannelQueue.push([channel, WEBRTC_DCEP, ack]);
            await this.dataChannelFlush();
          }
          break;
        case DATA_CHANNEL_ACK:
          {
            log31("DATA_CHANNEL_ACK", streamId, ppId);
            const channel = this.dataChannels[streamId];
            if (!channel) {
              throw new Error("channel not found");
            }
            channel.setReadyState("open");
          }
          break;
      }
    } else {
      const channel = this.dataChannels[streamId];
      if (channel) {
        const msg = (() => {
          switch (ppId) {
            case WEBRTC_STRING:
              return data.toString("utf8");
            case WEBRTC_STRING_EMPTY:
              return "";
            case WEBRTC_BINARY:
              return data;
            case WEBRTC_BINARY_EMPTY:
              return Buffer.from([]);
            default:
              throw new Error();
          }
        })();
        channel.messagesReceived++;
        channel.bytesReceived += data.length;
        channel.onMessage.execute(msg);
        channel.emit("message", { data: msg });
        if (channel.onmessage) {
          channel.onmessage({ data: msg });
        }
      }
    }
  };
  dataChannelAddNegotiated(channel) {
    if (channel.id == void 0) {
      throw new Error();
    }
    if (this.dataChannels[channel.id]) {
      throw new Error();
    }
    this.dataChannels[channel.id] = channel;
    if (this.sctp.associationState === 4 /* ESTABLISHED */) {
      channel.setReadyState("open");
    }
  }
  dataChannelOpen(channel) {
    if (channel.id !== void 0) {
      if (this.dataChannels[channel.id])
        throw new Error(
          `Data channel with ID ${channel.id} already registered`
        );
      this.dataChannels[channel.id] = channel;
    }
    let channelType = DATA_CHANNEL_RELIABLE;
    const priority = 0;
    let reliability = 0;
    if (!channel.ordered) {
      channelType = 128;
    }
    if (channel.maxRetransmits !== null) {
      channelType = 1;
      reliability = channel.maxRetransmits;
    } else if (channel.maxPacketLifeTime !== null) {
      channelType = 2;
      reliability = channel.maxPacketLifeTime;
    }
    const data = Buffer.allocUnsafe(12);
    data.writeUInt8(DATA_CHANNEL_OPEN, 0);
    data.writeUInt8(channelType, 1);
    data.writeUInt16BE(priority, 2);
    data.writeUInt32BE(reliability, 4);
    data.writeUInt16BE(channel.label.length, 8);
    data.writeUInt16BE(channel.protocol.length, 10);
    const send = Buffer.concat([
      data,
      Buffer.from(channel.label, "utf8"),
      Buffer.from(channel.protocol, "utf8")
    ]);
    this.dataChannelQueue.push([channel, WEBRTC_DCEP, send]);
    this.dataChannelFlush();
  }
  async dataChannelFlush() {
    if (this.sctp.associationState != 4 /* ESTABLISHED */) return;
    while (this.dataChannelQueue.length > 0) {
      const [channel, protocol, userData] = this.dataChannelQueue.shift();
      let streamId = channel.id;
      if (streamId === void 0) {
        streamId = this.dataChannelId;
        while (Object.keys(this.dataChannels).includes(streamId.toString())) {
          streamId += 2;
        }
        this.dataChannels[streamId] = channel;
        channel.setId(streamId);
      }
      if (protocol === WEBRTC_DCEP) {
        await this.sctp.send(streamId, protocol, userData, {
          ordered: true
        });
      } else {
        const expiry = channel.maxPacketLifeTime !== null ? Date.now() + channel.maxPacketLifeTime / 1e3 : void 0;
        await this.sctp.send(streamId, protocol, userData, {
          expiry,
          maxRetransmits: channel.maxRetransmits ?? void 0,
          ordered: channel.ordered
        });
        channel.addBufferedAmount(-userData.length);
      }
    }
    this.dataChannelQueue = [];
  }
  assertSendableMessageSize(size) {
    if (this.remoteMaxMessageSize !== 0 && size > this.remoteMaxMessageSize) {
      throw new Error(
        `max-message-size exceeded: ${size} > ${this.remoteMaxMessageSize}`
      );
    }
  }
  datachannelSend = (channel, data) => {
    const userData = Buffer.isBuffer(data) ? data : Buffer.from(data);
    const size = getDataChannelMessageSize(data);
    this.assertSendableMessageSize(size);
    channel.addBufferedAmount(size);
    this.dataChannelQueue.push(
      typeof data === "string" ? [channel, WEBRTC_STRING, userData] : [channel, WEBRTC_BINARY, userData]
    );
    if (this.sctp.associationState !== 4 /* ESTABLISHED */) {
      log31("sctp not established", this.sctp.associationState);
    }
    this.dataChannelFlush();
    return size;
  };
  getCapabilities() {
    return _RTCSctpTransport.getCapabilities(this.maxMessageSize);
  }
  static getCapabilities(maxMessageSize = DEFAULT_MAX_MESSAGE_SIZE) {
    return new RTCSctpCapabilities2(maxMessageSize);
  }
  setRemoteMaxMessageSize(maxMessageSize) {
    this.remoteMaxMessageSize = maxMessageSize ?? DEFAULT_MAX_MESSAGE_SIZE;
  }
  setRemotePort(port) {
    this.sctp.setRemotePort(port);
  }
  async start(remotePort) {
    if (this.isServer) {
      this.dataChannelId = 0;
    } else {
      this.dataChannelId = 1;
    }
    this.sctp.isServer = this.isServer;
    await this.sctp.start(remotePort);
  }
  async stop() {
    this.dtlsTransport.dataReceiver = () => {
    };
    await this.sctp.stop();
  }
  dataChannelClose(channel) {
    if (!["closing", "closed"].includes(channel.readyState)) {
      channel.setReadyState("closing");
      if (this.sctp.associationState === 4 /* ESTABLISHED */) {
        if (!this.sctp.reconfigQueue.includes(channel.id)) {
          this.sctp.reconfigQueue.push(channel.id);
        }
        if (this.sctp.reconfigQueue.length === 1) {
          this.sctp.transmitReconfigRequest();
        }
      } else {
        this.dataChannelQueue = this.dataChannelQueue.filter(
          (queueItem) => queueItem[0].id !== channel.id
        );
        this.sctp.reconfigQueue = this.sctp.reconfigQueue.filter(
          (streamId) => streamId !== channel.id
        );
        if (channel.id !== void 0) {
          delete this.dataChannels[channel.id];
        }
        channel.setReadyState("closed");
      }
    }
  }
};
var RTCSctpCapabilities2 = class {
  constructor(maxMessageSize) {
    this.maxMessageSize = maxMessageSize;
  }
};
var BridgeDtls = class {
  constructor(dtls) {
    this.dtls = dtls;
  }
  set onData(onData) {
    this.dtls.dataReceiver = onData;
  }
  send = (data) => {
    return this.dtls.sendData(data);
  };
  close() {
  }
};

// src/sdp.ts
var SessionDescription = class _SessionDescription {
  version = 0;
  origin;
  name = "-";
  time = "0 0";
  host;
  group = [];
  extMapAllowMixed = true;
  msidSemantic = [];
  media = [];
  type;
  dtlsRole;
  iceOptions;
  iceLite;
  icePassword;
  iceUsernameFragment;
  dtlsFingerprints = [];
  cachedJson;
  static parse(sdp) {
    const [sessionLines, mediaGroups] = groupLines(sdp);
    const session = new _SessionDescription();
    sessionLines.forEach((line) => {
      if (line.startsWith("v=")) {
        session.version = Number.parseInt(line.slice(2), 10);
      } else if (line.startsWith("o=")) {
        session.origin = line.slice(2);
      } else if (line.startsWith("s=")) {
        session.name = line.slice(2);
      } else if (line.startsWith("c=")) {
        session.host = ipAddressFromSdp(line.slice(2));
      } else if (line.startsWith("t=")) {
        session.time = line.slice(2);
      } else if (line.startsWith("a=")) {
        const [attr, value] = parseAttr(line);
        switch (attr) {
          case "fingerprint":
            {
              const [algorithm, fingerprint2] = value?.split(" ") || [];
              session.dtlsFingerprints.push(
                new RTCDtlsFingerprint(algorithm, fingerprint2)
              );
            }
            break;
          case "ice-lite":
            session.iceLite = true;
            break;
          case "ice-options":
            session.iceOptions = value;
            break;
          case "ice-pwd":
            session.icePassword = value;
            break;
          case "ice-ufrag":
            session.iceUsernameFragment = value;
            break;
          case "group":
            parseGroup(session.group, value);
            break;
          case "msid-semantic":
            parseGroup(session.msidSemantic, value);
            break;
          case "setup":
            session.dtlsRole = DTLS_SETUP_ROLE[value];
            break;
          case "extmap-allow-mixed":
            session.extMapAllowMixed = true;
            break;
        }
      }
    });
    const bundle = session.group.find((g) => g.semantic === "BUNDLE");
    mediaGroups.forEach((mediaLines) => {
      const target = mediaLines[0];
      const m = target.match(/^m=([^ ]+) ([0-9]+) ([A-Z/]+) (.+)/);
      if (!m) {
        throw new Error("m line not found");
      }
      const kind = m[1];
      const fmt = m[4].split(" ");
      const fmtInt = ["audio", "video"].includes(kind) ? fmt.map((v) => Number(v)) : void 0;
      const currentMedia = new MediaDescription(
        kind,
        Number.parseInt(m[2]),
        m[3],
        fmtInt || fmt
      );
      currentMedia.dtlsParams = new RTCDtlsParameters(
        [...session.dtlsFingerprints],
        session.dtlsRole
      );
      currentMedia.iceParams = new RTCIceParameters({
        iceLite: session.iceLite,
        usernameFragment: session.iceUsernameFragment,
        password: session.icePassword
      });
      currentMedia.iceOptions = session.iceOptions;
      session.media.push(currentMedia);
      mediaLines.slice(1).forEach((line) => {
        if (line.startsWith("c=")) {
          currentMedia.host = ipAddressFromSdp(line.slice(2));
        } else if (line.startsWith("a=")) {
          const [attr, value] = parseAttr(line);
          switch (attr) {
            case "candidate":
              if (!value) throw new Error();
              currentMedia.iceCandidates.push(candidateFromSdp(value));
              break;
            case "end-of-candidates":
              currentMedia.iceCandidatesComplete = true;
              break;
            case "extmap":
              {
                let [extId, extUri] = value.split(" ");
                if (extId.includes("/")) {
                  [extId] = extId.split("/");
                }
                currentMedia.rtp.headerExtensions.push(
                  new RTCRtpHeaderExtensionParameters({
                    id: Number.parseInt(extId),
                    uri: extUri
                  })
                );
              }
              break;
            case "fingerprint":
              {
                if (!value) throw new Error();
                const [algorithm, fingerprint2] = value.split(" ");
                currentMedia.dtlsParams?.fingerprints.push(
                  new RTCDtlsFingerprint(algorithm, fingerprint2)
                );
              }
              break;
            case "ice-options":
              currentMedia.iceOptions = value;
              break;
            case "ice-pwd":
              currentMedia.iceParams.password = value;
              break;
            case "ice-ufrag":
              currentMedia.iceParams.usernameFragment = value;
              break;
            case "ice-lite":
              currentMedia.iceParams.iceLite = true;
              break;
            case "max-message-size":
              currentMedia.sctpCapabilities = new RTCSctpCapabilities2(
                Number.parseInt(value, 10)
              );
              break;
            case "mid":
              currentMedia.rtp.muxId = value;
              break;
            case "msid":
              currentMedia.msids.push(value);
              break;
            case "rtcp":
              {
                const [port, rest] = divide(value, " ");
                currentMedia.rtcpPort = Number.parseInt(port);
                currentMedia.rtcpHost = ipAddressFromSdp(rest);
              }
              break;
            case "rtcp-mux":
              currentMedia.rtcpMux = true;
              break;
            case "setup":
              currentMedia.dtlsParams.role = DTLS_SETUP_ROLE[value];
              break;
            case "recvonly":
            case "sendonly":
            case "sendrecv":
            case "inactive":
              currentMedia.direction = attr;
              break;
            case "rtpmap":
              {
                const [formatId, formatDesc] = divide(value, " ");
                const [type, clock, channel] = formatDesc.split("/");
                let channels;
                if (currentMedia.kind === "audio") {
                  channels = channel ? Number.parseInt(channel) : 1;
                }
                const codec = new RTCRtpCodecParameters({
                  mimeType: currentMedia.kind + "/" + type,
                  channels,
                  clockRate: Number.parseInt(clock),
                  payloadType: Number.parseInt(formatId)
                });
                currentMedia.rtp.codecs.push(codec);
              }
              break;
            case "sctpmap":
              {
                if (!value) throw new Error();
                const [formatId, formatDesc] = divide(value, " ");
                currentMedia.sctpMap[Number.parseInt(formatId)] = formatDesc;
                currentMedia.sctpPort = Number.parseInt(formatId);
              }
              break;
            case "sctp-port":
              if (!value) throw new Error();
              currentMedia.sctpPort = Number.parseInt(value);
              break;
            case "ssrc":
              {
                const [ssrcStr, ssrcDesc] = divide(value, " ");
                const ssrc = Number.parseInt(ssrcStr);
                const [ssrcAttr, ssrcValue] = divide(ssrcDesc, ":");
                let ssrcInfo = currentMedia.ssrc.find((v) => v.ssrc === ssrc);
                if (!ssrcInfo) {
                  ssrcInfo = new SsrcDescription({ ssrc });
                  currentMedia.ssrc.push(ssrcInfo);
                }
                if (SSRC_INFO_ATTRS.includes(ssrcAttr)) {
                  ssrcInfo[ssrcAttr] = ssrcValue;
                }
              }
              break;
            case "ssrc-group":
              parseGroup(currentMedia.ssrcGroup, value);
              break;
            case "rid":
              {
                const [rid, direction] = divide(value, " ");
                currentMedia.simulcastParameters.push(
                  new RTCRtpSimulcastParameters({
                    rid,
                    direction
                  })
                );
              }
              break;
          }
        }
      });
      if (!currentMedia.iceParams.usernameFragment || !currentMedia.iceParams.password) {
        if (currentMedia.rtp.muxId && bundle && bundle.items.includes(currentMedia.rtp.muxId)) {
          for (let i = 0; i < bundle.items.length; i++) {
            if (!bundle.items.includes(i.toString())) continue;
            const check = session.media[i];
            if (check.iceParams?.usernameFragment && check.iceParams.password) {
              currentMedia.iceParams = {
                ...check.iceParams
              };
              break;
            }
          }
        }
      }
      if (!currentMedia.dtlsParams.role) {
        currentMedia.dtlsParams = void 0;
      }
      const findCodec = (pt) => currentMedia.rtp.codecs.find((v) => v.payloadType === pt);
      mediaLines.slice(1).forEach((line) => {
        if (line.startsWith("a=")) {
          const [attr, value] = parseAttr(line);
          if (attr === "fmtp") {
            const [formatId, formatDesc] = divide(value, " ");
            const codec = findCodec(Number(formatId));
            codec.parameters = formatDesc;
          } else if (attr === "rtcp-fb") {
            const [payloadType, feedbackType, feedbackParam] = value.split(" ");
            currentMedia.rtp.codecs.forEach((codec) => {
              if (["*", codec.payloadType.toString()].includes(payloadType)) {
                codec.rtcpFeedback.push(
                  new RTCRtcpFeedback({
                    type: feedbackType,
                    parameter: feedbackParam
                  })
                );
              }
            });
          }
        }
      });
    });
    return session;
  }
  webrtcTrackId(media) {
    if (media.msid?.includes(" ")) {
      const bits = media.msid.split(" ");
      for (const group of this.msidSemantic) {
        if (group.semantic === "WMS" && (group.items.includes(bits[0]) || group.items.includes("*"))) {
          return bits[1];
        }
      }
    }
    return;
  }
  get string() {
    const lines = [`v=${this.version}`, `o=${this.origin}`, `s=${this.name}`];
    if (this.host) {
      lines.push(`c=${ipAddressToSdp(this.host)}`);
    }
    lines.push(`t=${this.time}`);
    this.group.forEach((group) => lines.push(`a=group:${group.str}`));
    if (this.extMapAllowMixed) {
      lines.push(`a=extmap-allow-mixed`);
    }
    this.msidSemantic.forEach(
      (group) => lines.push(`a=msid-semantic:${group.str}`)
    );
    const media = this.media.map((m) => m.toString()).join("");
    const sdp = lines.join("\r\n") + "\r\n" + media;
    return sdp;
  }
  toJSON() {
    const sdp = this.string;
    if (!this.cachedJson || this.cachedJson.sdp !== sdp || this.cachedJson.type !== this.type) {
      this.cachedJson = new RTCSessionDescription(sdp, this.type);
    }
    return this.cachedJson;
  }
  toSdp() {
    return {
      type: this.type,
      sdp: this.string
    };
  }
};
var MediaDescription = class {
  constructor(kind, port, profile, fmt) {
    this.kind = kind;
    this.port = port;
    this.profile = profile;
    this.fmt = fmt;
  }
  // rtp
  host;
  direction;
  msids = [];
  // rtcp
  rtcpPort;
  rtcpHost;
  rtcpMux = false;
  // ssrc
  ssrc = [];
  ssrcGroup = [];
  // formats
  rtp = { codecs: [], headerExtensions: [] };
  // sctp
  sctpCapabilities;
  sctpMap = {};
  sctpPort;
  // DTLS
  dtlsParams;
  // ICE
  iceParams;
  iceCandidates = [];
  iceCandidatesComplete = false;
  iceOptions;
  // Simulcast
  simulcastParameters = [];
  get msid() {
    return this.msids[0];
  }
  set msid(value) {
    this.msids = value ? [value] : [];
  }
  toString() {
    const lines = [];
    lines.push(
      `m=${this.kind} ${this.port} ${this.profile} ${this.fmt.map((v) => v.toString()).join(" ")}`
    );
    if (this.host) {
      lines.push(`c=${ipAddressToSdp(this.host)}`);
    }
    this.iceCandidates.forEach((candidate) => {
      lines.push(`a=candidate:${candidateToSdp(candidate)}`);
    });
    if (this.iceCandidatesComplete) {
      lines.push("a=end-of-candidates");
    }
    if (this.iceParams?.usernameFragment) {
      lines.push(`a=ice-ufrag:${this.iceParams.usernameFragment}`);
    }
    if (this.iceParams?.password) {
      lines.push(`a=ice-pwd:${this.iceParams.password}`);
    }
    if (this.iceParams?.iceLite) {
      lines.push(`a=ice-lite`);
    }
    if (this.iceOptions) {
      lines.push(`a=ice-options:${this.iceOptions}`);
    }
    if (this.dtlsParams) {
      this.dtlsParams.fingerprints.forEach((fingerprint2) => {
        lines.push(
          `a=fingerprint:${fingerprint2.algorithm} ${fingerprint2.value}`
        );
      });
      lines.push(`a=setup:${DTLS_ROLE_SETUP[this.dtlsParams.role]}`);
    }
    if (this.direction) {
      lines.push(`a=${this.direction}`);
    }
    if (this.rtp.muxId) {
      lines.push(`a=mid:${this.rtp.muxId}`);
    }
    this.msids.forEach((msid) => lines.push(`a=msid:${msid}`));
    if (this.rtcpPort && this.rtcpHost) {
      lines.push(`a=rtcp:${this.rtcpPort} ${ipAddressToSdp(this.rtcpHost)}`);
      if (this.rtcpMux) {
        lines.push("a=rtcp-mux");
      }
    }
    this.ssrcGroup.forEach((group) => {
      lines.push(`a=ssrc-group:${group.str}`);
    });
    this.ssrc.forEach((ssrcInfo) => {
      SSRC_INFO_ATTRS.forEach((ssrcAttr) => {
        const ssrcValue = ssrcInfo[ssrcAttr];
        if (ssrcValue !== void 0) {
          lines.push(`a=ssrc:${ssrcInfo.ssrc} ${ssrcAttr}:${ssrcValue}`);
        }
      });
    });
    this.rtp.codecs.forEach((codec) => {
      lines.push(`a=rtpmap:${codec.payloadType} ${codec.str}`);
      codec.rtcpFeedback.forEach((feedback) => {
        let value = feedback.type;
        if (feedback.parameter) value += ` ${feedback.parameter}`;
        lines.push(`a=rtcp-fb:${codec.payloadType} ${value}`);
      });
      if (codec.parameters) {
        lines.push(`a=fmtp:${codec.payloadType} ${codec.parameters}`);
      }
    });
    Object.keys(this.sctpMap).forEach((k) => {
      const v = this.sctpMap[Number(k)];
      lines.push(`a=sctpmap:${k} ${v}`);
    });
    if (this.sctpPort) {
      lines.push(`a=sctp-port:${this.sctpPort}`);
    }
    if (this.sctpCapabilities) {
      lines.push(`a=max-message-size:${this.sctpCapabilities.maxMessageSize}`);
    }
    this.rtp.headerExtensions.forEach(
      (extension) => lines.push(`a=extmap:${extension.id} ${extension.uri}`)
    );
    if (this.simulcastParameters.length) {
      this.simulcastParameters.forEach((param) => {
        lines.push(`a=rid:${param.rid} ${param.direction}`);
      });
      let line = `a=simulcast:`;
      const recv = this.simulcastParameters.filter(
        (v) => v.direction === "recv"
      );
      if (recv.length) {
        line += `recv ${recv.map((v) => v.rid).join(";")} `;
      }
      const send = this.simulcastParameters.filter(
        (v) => v.direction === "send"
      );
      if (send.length) {
        line += `send ${send.map((v) => v.rid).join(";")}`;
      }
      lines.push(line);
    }
    return lines.join("\r\n") + "\r\n";
  }
};
var GroupDescription = class {
  constructor(semantic, items) {
    this.semantic = semantic;
    this.items = items;
  }
  get str() {
    return `${this.semantic} ${this.items.join(" ")}`;
  }
};
function ipAddressFromSdp(sdp) {
  const m = sdp.match(/^IN (IP4|IP6) ([^ ]+)$/);
  if (!m) throw new Error("exception");
  return m[2];
}
function ipAddressToSdp(addr) {
  const version = isIPv44(addr) ? 4 : 6;
  return `IN IP${version} ${addr}`;
}
function candidateToSdp(c) {
  let sdp = `${c.foundation} ${c.component} ${c.protocol} ${c.priority} ${c.ip} ${c.port} typ ${c.type}`;
  if (c.relatedAddress != void 0) {
    sdp += ` raddr ${c.relatedAddress}`;
  }
  if (c.relatedPort != void 0) {
    sdp += ` rport ${c.relatedPort}`;
  }
  if (c.tcpType != void 0) {
    sdp += ` tcptype ${c.tcpType}`;
  }
  if (c.generation != void 0) {
    sdp += ` generation ${c.generation}`;
  }
  if (c.ufrag != void 0) {
    sdp += ` ufrag ${c.ufrag}`;
  }
  return sdp;
}
function groupLines(sdp) {
  const session = [];
  const media = [];
  let lines = sdp.split("\r\n");
  if (lines.length === 1) {
    lines = sdp.split("\n");
  }
  lines.forEach((line) => {
    if (line.startsWith("m=")) {
      media.push([line]);
    } else if (media.length > 0) {
      media[media.length - 1].push(line);
    } else {
      session.push(line);
    }
  });
  return [session, media];
}
function parseAttr(line) {
  if (line.includes(":")) {
    const bits = divide(line.slice(2), ":");
    return [bits[0], bits[1]];
  } else {
    return [line.slice(2), void 0];
  }
}
function parseGroup(dest, value, type = (v) => v.toString()) {
  const bits = value.split(" ");
  if (bits.length > 0) {
    dest.push(new GroupDescription(bits[0], bits.slice(1).map(type)));
  }
}
function candidateFromSdp(sdp) {
  const ice = Candidate.fromSdp(sdp);
  const candidate = candidateFromIce(ice);
  return candidate;
}
var RTCSessionDescription = class {
  sdp;
  type;
  constructor(sdp, type) {
    Object.defineProperties(this, {
      sdp: {
        configurable: true,
        enumerable: true,
        value: sdp,
        writable: false
      },
      type: {
        configurable: true,
        enumerable: true,
        value: type,
        writable: false
      }
    });
  }
  static isThis(o) {
    if (typeof o?.sdp === "string") return true;
  }
  toSdp() {
    return {
      sdp: this.sdp,
      type: this.type
    };
  }
};
function addSDPHeader(type, description) {
  const username = "-";
  const sessionId = randomBytes9(8).readBigUInt64BE(0).toString().slice(0, 8);
  const sessionVersion = 0;
  description.origin = `${username} ${sessionId} ${sessionVersion} IN IP4 0.0.0.0`;
  description.msidSemantic.push(new GroupDescription("WMS", ["*"]));
  description.type = type;
}
function codecParametersFromString(str) {
  const parameters = {};
  str.split(";").forEach((param) => {
    if (param.includes("=")) {
      const [k, v] = divide(param, "=");
      if (FMTP_INT_PARAMETERS.includes(k)) {
        parameters[k] = Number(v);
      } else {
        parameters[k] = v;
      }
    } else if (param.includes(":")) {
      const [k, v] = param.split(":");
      parameters[k] = Number.isNaN(Number(v)) ? v : Number(v);
    } else {
      parameters[param] = void 0;
    }
  });
  return parameters;
}
function codecParametersToString(parameters, joint = "=") {
  const params = Object.entries(parameters).map(([k, v]) => {
    if (v) return `${k}${joint}${v}`;
    else return k;
  });
  if (params.length > 0) {
    return params.join(";");
  }
  return void 0;
}
var SsrcDescription = class {
  ssrc;
  cname;
  msid;
  msLabel;
  label;
  constructor(props) {
    Object.assign(this, props);
  }
};

// src/media/rtpReceiver.ts
var log32 = debug("werift:packages/webrtc/src/media/rtpReceiver.ts");
var RTCRtpReceiver = class {
  constructor(config, kind, rtcpSsrc) {
    this.config = config;
    this.kind = kind;
    this.rtcpSsrc = rtcpSsrc;
    this.defaultTrack = new MediaStreamTrack({ kind, remote: true });
    this.onPacketLost.subscribe((nack) => {
      this.nackCountBySsrc[nack.mediaSourceSsrc] = (this.nackCountBySsrc[nack.mediaSourceSsrc] ?? 0) + 1;
    });
  }
  codecs = {};
  defaultTrack;
  get codecArray() {
    return Object.values(this.codecs).sort(
      (a, b) => a.payloadType - b.payloadType
    );
  }
  ssrcByRtx = {};
  nack = new NackHandler(this);
  audioRedHandler = new RedHandler();
  type = "receiver";
  uuid = randomUUID9().toString();
  tracks = [];
  trackBySSRC = {};
  trackByRID = {};
  /**last sender Report Timestamp
   * compactNtp
   */
  lastSRtimestamp = {};
  /**seconds */
  receiveLastSRTimestamp = {};
  onPacketLost = this.nack.onPacketLost;
  onRtcp = new Event2();
  dtlsTransport;
  sdesMid;
  latestRid;
  latestRepairedRid;
  receiverTWCC;
  stopped = false;
  remoteStreamId;
  remoteStreamIds = [];
  remoteTrackId;
  rtcpRunning = false;
  rtcpCancel = new AbortController();
  remoteStreams = {};
  senderReportsReceivedBySsrc = {};
  remoteTimestampsBySsrc = {};
  remotePacketCountBySsrc = {};
  remoteOctetCountBySsrc = {};
  nackCountBySsrc = {};
  pliCountBySsrc = {};
  get transport() {
    return this.dtlsTransport ?? null;
  }
  setDtlsTransport(dtls) {
    this.dtlsTransport = dtls;
  }
  // todo fix
  get track() {
    return this.tracks[0] ?? this.defaultTrack;
  }
  get nackEnabled() {
    return this.codecArray[0]?.rtcpFeedback.find((f) => f.type === "nack");
  }
  get twccEnabled() {
    return this.codecArray[0]?.rtcpFeedback.find(
      (f) => f.type === useTWCC().type
    );
  }
  get pliEnabled() {
    return this.codecArray[0]?.rtcpFeedback.find(
      (f) => f.type === usePLI().type
    );
  }
  prepareReceive(params) {
    params.codecs.forEach((c) => {
      this.codecs[c.payloadType] = c;
    });
    params.encodings.forEach((e) => {
      if (e.rtx) {
        this.ssrcByRtx[e.rtx.ssrc] = e.ssrc;
      }
    });
  }
  /**
   * setup TWCC if supported
   */
  setupTWCC(mediaSourceSsrc) {
    if (this.twccEnabled && !this.receiverTWCC) {
      this.receiverTWCC = new ReceiverTWCC(
        this.dtlsTransport,
        this.rtcpSsrc,
        mediaSourceSsrc
      );
    }
  }
  addTrack(track) {
    const exist = this.tracks.find((t) => {
      if (t.rid) {
        return t.rid === track.rid;
      }
      if (t.ssrc) {
        return t.ssrc === track.ssrc;
      }
    });
    if (exist) {
      return false;
    }
    this.tracks.push(track);
    if (track.ssrc) {
      this.trackBySSRC[track.ssrc] = track;
    }
    if (track.rid) {
      this.trackByRID[track.rid] = track;
    }
    return true;
  }
  stop() {
    this.stopped = true;
    this.rtcpRunning = false;
    this.rtcpCancel.abort();
    if (this.receiverTWCC) this.receiverTWCC.twccRunning = false;
    this.nack.close();
  }
  async runRtcp() {
    if (this.rtcpRunning || this.stopped) return;
    this.rtcpRunning = true;
    try {
      while (this.rtcpRunning) {
        await setTimeout8(500 + Math.random() * 1e3, void 0, {
          signal: this.rtcpCancel.signal
        });
        const reports = Object.entries(this.remoteStreams).map(
          ([ssrc, stream]) => {
            let lastSRtimestamp = 0, delaySinceLastSR = 0;
            if (this.lastSRtimestamp[ssrc]) {
              lastSRtimestamp = this.lastSRtimestamp[ssrc];
              const delaySeconds = timestampSeconds() - this.receiveLastSRTimestamp[ssrc];
              if (delaySeconds > 0 && delaySeconds < 65536) {
                delaySinceLastSR = int(delaySeconds * 65536);
              }
            }
            return new RtcpReceiverInfo({
              ssrc: Number(ssrc),
              fractionLost: stream.fraction_lost,
              packetsLost: stream.packets_lost,
              highestSequence: stream.max_seq,
              jitter: stream.jitter,
              lsr: lastSRtimestamp,
              dlsr: delaySinceLastSR
            });
          }
        );
        const packet = new RtcpRrPacket({ ssrc: this.rtcpSsrc, reports });
        try {
          if (this.config.debug.receiverReportDelay) {
            await setTimeout8(this.config.debug.receiverReportDelay);
          }
          await this.dtlsTransport.sendRtcp([packet]);
        } catch (error) {
          log32("sendRtcp failed", error);
          await setTimeout8(500 + Math.random() * 1e3);
        }
      }
    } catch (error) {
    }
  }
  getInboundRtpStatsId(track) {
    return generateStatsId("inbound-rtp", track.id ?? track.uuid);
  }
  getRemoteOutboundRtpStatsId(track) {
    return generateStatsId("remote-outbound-rtp", track.id ?? track.uuid);
  }
  getStatsRootIds(selector) {
    return this.tracks.filter((track) => !selector ? true : track === selector).filter((track) => track.ssrc).map((track) => this.getInboundRtpStatsId(track));
  }
  collectStats(timestamp) {
    const stats = [];
    const transportId = this.dtlsTransport ? generateStatsId("transport", this.dtlsTransport.id) : void 0;
    const activeCodec = this.codecArray[0];
    const emittedCodecIds = /* @__PURE__ */ new Set();
    for (const track of this.tracks) {
      if (!track.ssrc) continue;
      const streamStats = this.remoteStreams[track.ssrc];
      const hasRemoteTimestamp = this.remoteTimestampsBySsrc[track.ssrc] !== void 0;
      const remoteId = this.lastSRtimestamp[track.ssrc] !== void 0 || hasRemoteTimestamp ? this.getRemoteOutboundRtpStatsId(track) : void 0;
      const codecId = activeCodec && transportId ? generateCodecStatsId(
        transportId,
        activeCodec.payloadType,
        track.id ?? track.uuid
      ) : void 0;
      if (activeCodec && transportId && codecId && !emittedCodecIds.has(codecId)) {
        emittedCodecIds.add(codecId);
        const codecStats = {
          type: "codec",
          id: codecId,
          timestamp,
          payloadType: activeCodec.payloadType,
          transportId,
          mimeType: activeCodec.mimeType,
          clockRate: activeCodec.clockRate,
          channels: activeCodec.channels,
          sdpFmtpLine: activeCodec.parameters
        };
        stats.push(codecStats);
      }
      const inboundRtpStats = {
        type: "inbound-rtp",
        id: this.getInboundRtpStatsId(track),
        timestamp,
        ssrc: track.ssrc,
        kind: this.kind,
        transportId,
        codecId,
        mid: this.sdesMid,
        trackIdentifier: track.id ?? track.uuid,
        packetsReceived: streamStats?.packets_received ?? 0,
        bytesReceived: streamStats?.bytesReceived ?? 0,
        headerBytesReceived: streamStats?.headerBytesReceived ?? 0,
        packetsLost: streamStats?.packets_lost ?? 0,
        jitter: streamStats?.clockRate ? streamStats.jitter / streamStats.clockRate : void 0,
        lastPacketReceivedTimestamp: streamStats?.lastPacketReceivedTimestamp,
        remoteId,
        nackCount: this.nackCountBySsrc[track.ssrc] || void 0,
        pliCount: this.pliCountBySsrc[track.ssrc] || void 0
      };
      stats.push(inboundRtpStats);
      if (remoteId) {
        const remoteOutboundStats = {
          type: "remote-outbound-rtp",
          id: this.getRemoteOutboundRtpStatsId(track),
          timestamp,
          ssrc: track.ssrc,
          kind: this.kind,
          transportId,
          codecId: inboundRtpStats.codecId,
          localId: inboundRtpStats.id,
          remoteTimestamp: this.remoteTimestampsBySsrc[track.ssrc],
          reportsSent: this.senderReportsReceivedBySsrc[track.ssrc] ?? 0,
          packetsSent: this.remotePacketCountBySsrc[track.ssrc],
          bytesSent: this.remoteOctetCountBySsrc[track.ssrc]
        };
        stats.push(remoteOutboundStats);
      }
    }
    return stats;
  }
  async getStats() {
    const timestamp = getStatsTimestamp();
    const stats = this.collectStats(timestamp);
    if (this.dtlsTransport) {
      stats.push(...await this.dtlsTransport.getStats(timestamp));
    }
    return buildStatsReport(stats, this.getStatsRootIds());
  }
  async sendRtcpPLI(mediaSsrc) {
    if (!this.pliEnabled) {
      log32("pli not supported", { mediaSsrc });
      return;
    }
    if (this.stopped) {
      return;
    }
    log32("sendRtcpPLI", { mediaSsrc });
    const packet = new RtcpPayloadSpecificFeedback({
      feedback: new PictureLossIndication({
        senderSsrc: this.rtcpSsrc,
        mediaSsrc
      })
    });
    try {
      this.pliCountBySsrc[mediaSsrc] = (this.pliCountBySsrc[mediaSsrc] ?? 0) + 1;
      await this.dtlsTransport.sendRtcp([packet]);
    } catch (error) {
      log32(error);
    }
  }
  handleRtcpPacket(packet) {
    switch (packet.type) {
      case RtcpSrPacket.type:
        {
          const sr = packet;
          this.lastSRtimestamp[sr.ssrc] = compactNtp(
            sr.senderInfo.ntpTimestamp
          );
          this.receiveLastSRTimestamp[sr.ssrc] = timestampSeconds();
          this.senderReportsReceivedBySsrc[sr.ssrc] = (this.senderReportsReceivedBySsrc[sr.ssrc] ?? 0) + 1;
          this.remoteTimestampsBySsrc[sr.ssrc] = ntpTimeToEpochMs(
            sr.senderInfo.ntpTimestamp
          );
          this.remotePacketCountBySsrc[sr.ssrc] = sr.senderInfo.packetCount;
          this.remoteOctetCountBySsrc[sr.ssrc] = sr.senderInfo.octetCount;
          const track = this.trackBySSRC[packet.ssrc];
          if (track) {
            track.onReceiveRtcp.execute(packet);
          }
        }
        break;
    }
    this.onRtcp.execute(packet);
  }
  handleRtpBySsrc = (packet, extensions) => {
    const track = this.trackBySSRC[packet.header.ssrc];
    this.handleRTP(packet, extensions, track);
  };
  handleRtpByRid = (packet, rid, extensions) => {
    const track = this.trackByRID[rid];
    if (!this.trackBySSRC[packet.header.ssrc]) {
      this.trackBySSRC[packet.header.ssrc] = track;
    }
    this.handleRTP(packet, extensions, track);
  };
  handleRTP(packet, extensions, track) {
    if (this.stopped) {
      return;
    }
    const codec = this.codecs[packet.header.payloadType];
    if (!codec) {
      return;
    }
    this.remoteStreams[packet.header.ssrc] = this.remoteStreams[packet.header.ssrc] ?? new StreamStatistics(codec.clockRate);
    this.remoteStreams[packet.header.ssrc].add(packet);
    if (this.receiverTWCC) {
      const transportSequenceNumber = extensions[RTP_EXTENSION_URI.transportWideCC];
      if (!transportSequenceNumber == void 0) {
        throw new Error("undefined");
      }
      this.receiverTWCC.handleTWCC(transportSequenceNumber);
    } else if (this.twccEnabled) {
      this.setupTWCC(packet.header.ssrc);
    }
    if (codec.name.toLowerCase() === "rtx") {
      const originalSsrc = this.ssrcByRtx[packet.header.ssrc];
      const codecParams = codecParametersFromString(codec.parameters ?? "");
      const rtxCodec = this.codecs[codecParams["apt"]];
      if (packet.payload.length < 2) return;
      packet = unwrapRtx(packet, rtxCodec.payloadType, originalSsrc);
      track = this.trackBySSRC[originalSsrc];
    }
    let red;
    if (codec.name.toLowerCase() === "red") {
      red = Red.deSerialize(packet.payload);
      if (!Object.keys(this.codecs).includes(
        red.header.fields[0].blockPT.toString()
      )) {
        return;
      }
    }
    if (track?.kind === "video" && this.nackEnabled) {
      this.nack.addPacket(packet);
    }
    if (track) {
      if (red) {
        if (track.kind === "audio") {
          const payloads = this.audioRedHandler.push(red, packet);
          for (const packet2 of payloads) {
            track.onReceiveRtp.execute(packet2.clone(), extensions);
          }
        } else {
        }
      } else {
        track.onReceiveRtp.execute(packet.clone(), extensions);
      }
    }
    this.runRtcp();
  }
};

// src/media/router.ts
var log33 = debug("werift:packages/webrtc/src/media/router.ts");
var RtpRouter = class {
  ssrcTable = {};
  ridTable = {};
  extIdUriMap = {};
  constructor() {
  }
  registerRtpSender(sender) {
    this.ssrcTable[sender.ssrc] = sender;
  }
  registerRtpReceiver(receiver, ssrc) {
    log33("registerRtpReceiver", ssrc);
    this.ssrcTable[ssrc] = receiver;
  }
  registerRtpReceiverBySsrc(transceiver, params) {
    log33("registerRtpReceiverBySsrc", params);
    params.encodings.filter((e) => e.ssrc != void 0).forEach((encode20, i) => {
      this.registerRtpReceiver(transceiver.receiver, encode20.ssrc);
      transceiver.addTrack(
        new MediaStreamTrack({
          ssrc: encode20.ssrc,
          kind: transceiver.kind,
          id: transceiver.sender.trackId,
          remote: true,
          codec: params.codecs[i]
        })
      );
      if (encode20.rtx) {
        this.registerRtpReceiver(transceiver.receiver, encode20.rtx.ssrc);
      }
    });
    params.headerExtensions.forEach((extension) => {
      this.extIdUriMap[extension.id] = extension.uri;
    });
  }
  registerRtpReceiverByRid(transceiver, param, params) {
    const [codec] = params.codecs;
    log33("registerRtpReceiverByRid", param);
    transceiver.addTrack(
      new MediaStreamTrack({
        rid: param.rid,
        kind: transceiver.kind,
        id: transceiver.sender.trackId,
        remote: true,
        codec
      })
    );
    this.ridTable[param.rid] = transceiver.receiver;
  }
  routeRtp = (packet) => {
    const extensions = rtpHeaderExtensionsParser(
      packet.header.extensions,
      this.extIdUriMap
    );
    let rtpReceiver = this.ssrcTable[packet.header.ssrc];
    const rid = extensions[RTP_EXTENSION_URI.sdesRTPStreamID];
    if (typeof rid === "string") {
      rtpReceiver = this.ridTable[rid];
      rtpReceiver.latestRid = rid;
      rtpReceiver.handleRtpByRid(packet, rid, extensions);
    } else if (rtpReceiver) {
      rtpReceiver.handleRtpBySsrc(packet, extensions);
    } else {
      rtpReceiver = Object.values(this.ridTable).filter((r) => r instanceof RTCRtpReceiver).find((r) => r.trackBySSRC[packet.header.ssrc]);
      if (rtpReceiver) {
        log33("simulcast register receiver by ssrc", packet.header.ssrc);
        this.registerRtpReceiver(rtpReceiver, packet.header.ssrc);
        rtpReceiver.handleRtpBySsrc(packet, extensions);
      } else {
      }
    }
    if (!rtpReceiver) {
      log33("ssrcReceiver not found");
      return;
    }
    const sdesMid = extensions[RTP_EXTENSION_URI.sdesMid];
    if (typeof sdesMid === "string") {
      rtpReceiver.sdesMid = sdesMid;
    }
    const repairedRid = extensions[RTP_EXTENSION_URI.repairedRtpStreamId];
    if (typeof repairedRid === "string") {
      rtpReceiver.latestRepairedRid = repairedRid;
    }
  };
  routeRtcp = (packet) => {
    const recipients = [];
    switch (packet.type) {
      case RtcpSrPacket.type:
        {
          packet = packet;
          recipients.push(this.ssrcTable[packet.ssrc]);
        }
        break;
      case RtcpRrPacket.type:
        {
          packet = packet;
          packet.reports.forEach((report) => {
            recipients.push(this.ssrcTable[report.ssrc]);
          });
        }
        break;
      case RtcpSourceDescriptionPacket.type:
        {
          const sdes = packet;
        }
        break;
      case RtcpTransportLayerFeedback.type:
        {
          const rtpfb = packet;
          if (rtpfb.feedback) {
            recipients.push(this.ssrcTable[rtpfb.feedback.mediaSourceSsrc]);
          }
        }
        break;
      case RtcpPayloadSpecificFeedback.type:
        {
          const psfb = packet;
          switch (psfb.feedback.count) {
            case ReceiverEstimatedMaxBitrate.count:
              {
                const remb = psfb.feedback;
                recipients.push(this.ssrcTable[remb.ssrcFeedbacks[0]]);
              }
              break;
            default:
              recipients.push(
                this.ssrcTable[psfb.feedback.senderSsrc] || this.ssrcTable[psfb.feedback.mediaSsrc]
              );
          }
        }
        break;
    }
    recipients.filter((v) => v).forEach((recipient) => recipient.handleRtcpPacket(packet));
  };
};

// src/media/rtpSender.ts
import { randomBytes as randomBytes10 } from "crypto";
import { randomUUID as randomUUID10 } from "crypto";
import { setTimeout as setTimeout9 } from "timers/promises";

// src/media/sender/cumulativeResult.ts
var CumulativeResult = class {
  numPackets = 0;
  /**byte */
  totalSize = 0;
  firstPacketSentAtMs = 0;
  lastPacketSentAtMs = 0;
  firstPacketReceivedAtMs = 0;
  lastPacketReceivedAtMs = 0;
  /**
   *
   * @param size byte
   * @param sentAtMs
   * @param receivedAtMs
   */
  addPacket(size, sentAtMs, receivedAtMs) {
    if (this.numPackets === 0) {
      this.firstPacketSentAtMs = sentAtMs;
      this.firstPacketReceivedAtMs = receivedAtMs;
      this.lastPacketSentAtMs = sentAtMs;
      this.lastPacketReceivedAtMs = receivedAtMs;
    } else {
      if (sentAtMs < this.firstPacketSentAtMs)
        this.firstPacketSentAtMs = sentAtMs;
      if (receivedAtMs < this.firstPacketReceivedAtMs)
        this.firstPacketReceivedAtMs = receivedAtMs;
      if (sentAtMs > this.lastPacketSentAtMs)
        this.lastPacketSentAtMs = sentAtMs;
      if (receivedAtMs > this.lastPacketReceivedAtMs)
        this.lastPacketReceivedAtMs = receivedAtMs;
    }
    this.numPackets++;
    this.totalSize += size;
  }
  reset() {
    this.numPackets = 0;
    this.totalSize = 0;
    this.firstPacketSentAtMs = 0;
    this.lastPacketSentAtMs = 0;
    this.firstPacketReceivedAtMs = 0;
    this.lastPacketReceivedAtMs = 0;
  }
  get receiveBitrate() {
    const recvIntervalMs = this.lastPacketReceivedAtMs - this.firstPacketReceivedAtMs;
    const bitrate = this.totalSize / recvIntervalMs * 8 * 1e3;
    return Int(bitrate);
  }
  get sendBitrate() {
    const sendIntervalMs = this.lastPacketSentAtMs - this.firstPacketSentAtMs;
    const bitrate = this.totalSize / sendIntervalMs * 8 * 1e3;
    return Int(bitrate);
  }
};

// src/media/sender/senderBWE.ts
var COUNTER_MAX = 20;
var SCORE_MAX = 10;
var SenderBandwidthEstimator = class {
  congestion = false;
  onAvailableBitrate = new Event2();
  /**congestion occur or not */
  onCongestion = new Event2();
  onCongestionScore = new Event2();
  congestionCounter = 0;
  cumulativeResult = new CumulativeResult();
  sentInfos = {};
  _congestionScore = 1;
  /**1~10 big is worth*/
  get congestionScore() {
    return this._congestionScore;
  }
  set congestionScore(v) {
    this._congestionScore = v;
    this.onCongestionScore.execute(v);
  }
  _availableBitrate = 0;
  get availableBitrate() {
    return this._availableBitrate;
  }
  set availableBitrate(v) {
    this._availableBitrate = v;
    this.onAvailableBitrate.execute(v);
  }
  constructor() {
  }
  receiveTWCC(feedback) {
    const nowMs = milliTime();
    const elapsedMs = nowMs - this.cumulativeResult.firstPacketSentAtMs;
    if (elapsedMs > 1e3) {
      this.cumulativeResult.reset();
      if (this.congestionCounter < COUNTER_MAX) {
        this.congestionCounter++;
      } else if (this.congestionScore < SCORE_MAX) {
        this.congestionScore++;
      }
      if (this.congestionCounter >= COUNTER_MAX && !this.congestion) {
        this.congestion = true;
        this.onCongestion.execute(this.congestion);
      }
    }
    for (const result of feedback.packetResults) {
      if (!result.received) continue;
      const wideSeq = result.sequenceNumber;
      const info = this.sentInfos[wideSeq];
      if (!info) continue;
      if (!result.receivedAtMs) continue;
      this.cumulativeResult.addPacket(
        info.size,
        info.sendingAtMs,
        result.receivedAtMs
      );
    }
    if (elapsedMs >= 100 && this.cumulativeResult.numPackets >= 20) {
      this.availableBitrate = Math.min(
        this.cumulativeResult.sendBitrate,
        this.cumulativeResult.receiveBitrate
      );
      this.cumulativeResult.reset();
      if (this.congestionCounter > -COUNTER_MAX) {
        const maxBonus = Int(COUNTER_MAX / 2) + 1;
        const minBonus = Int(COUNTER_MAX / 4) + 1;
        const bonus = maxBonus - (maxBonus - minBonus) / 10 * this.congestionScore;
        this.congestionCounter = this.congestionCounter - bonus;
      }
      if (this.congestionCounter <= -COUNTER_MAX) {
        if (this.congestionScore > 1) {
          this.congestionScore--;
          this.onCongestion.execute(false);
        }
        this.congestionCounter = 0;
      }
      if (this.congestionCounter <= 0 && this.congestion) {
        this.congestion = false;
        this.onCongestion.execute(this.congestion);
      }
    }
  }
  rtpPacketSent(sentInfo) {
    Object.keys(sentInfo).map((v) => Number(v)).sort().filter((seq) => seq < sentInfo.wideSeq).forEach((seq) => {
      delete this.sentInfos[seq];
    });
    this.sentInfos[sentInfo.wideSeq] = sentInfo;
  }
};

// src/media/rtpSender.ts
var log34 = debug("werift:packages/webrtc/src/media/rtpSender.ts");
var RTP_HISTORY_SIZE = 128;
var RTT_ALPHA = 0.85;
var RTCRtpSender = class {
  constructor(trackOrKind) {
    this.trackOrKind = trackOrKind;
    this.kind = typeof this.trackOrKind === "string" ? this.trackOrKind : this.trackOrKind.kind;
    if (typeof trackOrKind !== "string") {
      this.registerTrack(trackOrKind);
    }
  }
  type = "sender";
  kind;
  ssrc = randomBytes10(4).readUInt32BE(0);
  rtxSsrc = randomBytes10(4).readUInt32BE(0);
  trackId = randomUUID10().toString();
  onReady = new Event2();
  onRtcp = new Event2();
  onPictureLossIndication = new Event2();
  onGenericNack = new Event2();
  senderBWE = new SenderBandwidthEstimator();
  cname;
  mid;
  rtpStreamId;
  repairedRtpStreamId;
  rtxPayloadType;
  rtxSequenceNumber = random16();
  redRedundantPayloadType;
  _redDistance = 2;
  redEncoder = new RedEncoder(this._redDistance);
  headerExtensions = [];
  disposeTrack;
  sendEncodings = [{}];
  // # stats
  lastSRtimestamp;
  lastSentSRTimestamp;
  ntpTimestamp = 0n;
  rtpTimestamp = 0;
  octetCount = 0;
  packetCount = 0;
  headerBytesSent = 0;
  rtt;
  totalRoundTripTime = 0;
  roundTripTimeMeasurements = 0;
  retransmittedPacketsSent = 0;
  retransmittedBytesSent = 0;
  nackCount = 0;
  pliCount = 0;
  firCount = 0;
  remotePacketsLost;
  remoteFractionLost;
  receiverEstimatedMaxBitrate = 0n;
  // rtp
  sequenceNumber;
  timestamp;
  timestampOffset = 0;
  seqOffset = 0;
  rtpCache = [];
  codec;
  dtlsTransport;
  dtlsDisposer = [];
  track = null;
  streamIds = [];
  stopped = false;
  rtcpRunning = false;
  rtcpCancel = new AbortController();
  get transport() {
    return this.dtlsTransport ?? null;
  }
  get streamId() {
    return this.streamIds[0];
  }
  set streamId(value) {
    this.streamIds = value ? [value] : [];
  }
  setDtlsTransport(dtlsTransport) {
    if (this.dtlsTransport) {
      this.dtlsDisposer.forEach((dispose) => dispose());
    }
    this.dtlsTransport = dtlsTransport;
    this.dtlsDisposer = [
      this.dtlsTransport.onStateChange.subscribe((state) => {
        if (state === "connected") {
          this.onReady.execute();
        }
      }).unSubscribe
    ];
  }
  get redDistance() {
    return this._redDistance;
  }
  set redDistance(n) {
    this._redDistance = n;
    this.redEncoder.distance = n;
  }
  prepareSend(params) {
    this.cname = params.rtcp?.cname;
    this.mid = params.muxId;
    this.headerExtensions = params.headerExtensions;
    this.rtpStreamId = params.rtpStreamId;
    this.repairedRtpStreamId = params.repairedRtpStreamId;
    this.codec = params.codecs[0];
    if (this.track) {
      this.track.codec = this.codec;
    }
    params.codecs.forEach((codec) => {
      const codecParams = codecParametersFromString(codec.parameters ?? "");
      if (codec.name.toLowerCase() === "rtx" && codecParams["apt"] === this.codec?.payloadType) {
        this.rtxPayloadType = codec.payloadType;
      }
      if (codec.name.toLowerCase() === "red") {
        this.redRedundantPayloadType = Number(
          (codec.parameters ?? "").split("/")[0]
        );
      }
    });
  }
  registerTrack(track) {
    if (track.stopped) throw new Error("track is ended");
    if (this.disposeTrack) {
      this.disposeTrack();
    }
    track.id = this.trackId;
    const { unSubscribe } = track.onReceiveRtp.subscribe(async (rtp) => {
      await this.sendRtp(rtp);
    });
    this.track = track;
    this.disposeTrack = unSubscribe;
    if (this.codec) {
      track.codec = this.codec;
    }
    track.onSourceChanged.subscribe((header) => {
      this.replaceRTP(header);
    });
  }
  setStreams(streams = []) {
    this.streamIds = [...new Set(streams.map((stream) => stream.id))];
  }
  setSendEncodings(encodings = []) {
    this.sendEncodings = encodings.length > 0 ? encodings.map((encoding) => ({ ...encoding })) : [{}];
  }
  async replaceTrack(track) {
    if (track === null) {
      if (this.disposeTrack) {
        this.disposeTrack();
      }
      this.track = null;
      return;
    }
    if (track.stopped) throw new Error("track is ended");
    if (this.sequenceNumber != void 0) {
      const header = track.header || (await track.onReceiveRtp.asPromise())[0].header;
      this.replaceRTP(header);
    }
    this.registerTrack(track);
    log34("replaceTrack", "ssrc", track.ssrc, "rid", track.rid);
  }
  stop() {
    this.stopped = true;
    this.rtcpRunning = false;
    this.rtcpCancel.abort();
    if (this.disposeTrack) {
      this.disposeTrack();
    }
    this.track = null;
  }
  async runRtcp() {
    if (this.rtcpRunning || this.stopped) return;
    this.rtcpRunning = true;
    try {
      while (this.rtcpRunning) {
        await setTimeout9(500 + Math.random() * 1e3, void 0, {
          signal: this.rtcpCancel.signal
        });
        const packets = [
          new RtcpSrPacket({
            ssrc: this.ssrc,
            senderInfo: new RtcpSenderInfo({
              ntpTimestamp: this.ntpTimestamp,
              rtpTimestamp: this.rtpTimestamp,
              packetCount: this.packetCount,
              octetCount: this.octetCount
            })
          })
        ];
        this.lastSRtimestamp = compactNtp(this.ntpTimestamp);
        this.lastSentSRTimestamp = timestampSeconds();
        if (this.cname) {
          packets.push(
            new RtcpSourceDescriptionPacket({
              chunks: [
                new SourceDescriptionChunk({
                  source: this.ssrc,
                  items: [
                    new SourceDescriptionItem({ type: 1, text: this.cname })
                  ]
                })
              ]
            })
          );
        }
        try {
          await this.dtlsTransport.sendRtcp(packets);
        } catch (error) {
          log34("sendRtcp failed", error);
          await setTimeout9(500 + Math.random() * 1e3);
        }
      }
    } catch (error) {
    }
  }
  replaceRTP({
    sequenceNumber,
    timestamp
  }, discontinuity = false) {
    if (this.sequenceNumber != void 0) {
      this.seqOffset = uint16Add(this.sequenceNumber, -sequenceNumber);
      if (discontinuity) {
        this.seqOffset = uint16Add(this.seqOffset, 2);
      }
    }
    if (this.timestamp != void 0) {
      this.timestampOffset = uint32Add(this.timestamp, -timestamp);
      if (discontinuity) {
        this.timestampOffset = uint16Add(this.timestampOffset, 1);
      }
    }
    this.rtpCache = [];
    log34("replaceRTP", this.sequenceNumber, sequenceNumber, this.seqOffset);
  }
  async sendRtp(rtp) {
    if (this.dtlsTransport.state !== "connected" || !this.codec) {
      return;
    }
    rtp = Buffer.isBuffer(rtp) ? RtpPacket.deSerialize(rtp) : rtp;
    const { header, payload } = rtp;
    header.ssrc = this.ssrc;
    header.payloadType = this.codec.payloadType;
    header.timestamp = uint32Add(header.timestamp, this.timestampOffset);
    header.sequenceNumber = uint16Add(header.sequenceNumber, this.seqOffset);
    this.timestamp = header.timestamp;
    this.sequenceNumber = header.sequenceNumber;
    const ntpTimestamp = ntpTime();
    const originalHeaderExtensions = [...header.extensions];
    header.extensions = this.headerExtensions.map((extension) => {
      const payload2 = (() => {
        switch (extension.uri) {
          case RTP_EXTENSION_URI.sdesMid:
            if (this.mid) {
              return serializeSdesMid(this.mid);
            }
            return;
          // todo : sender simulcast unsupported now
          case RTP_EXTENSION_URI.sdesRTPStreamID:
            if (this.rtpStreamId) {
              return serializeSdesRTPStreamID(this.rtpStreamId);
            }
            return;
          // todo : sender simulcast unsupported now
          case RTP_EXTENSION_URI.repairedRtpStreamId:
            if (this.repairedRtpStreamId) {
              return serializeRepairedRtpStreamId(this.repairedRtpStreamId);
            }
            return;
          case RTP_EXTENSION_URI.transportWideCC:
            this.dtlsTransport.transportSequenceNumber = uint16Add(
              this.dtlsTransport.transportSequenceNumber,
              1
            );
            return serializeTransportWideCC(
              this.dtlsTransport.transportSequenceNumber
            );
          case RTP_EXTENSION_URI.absSendTime:
            return serializeAbsSendTime(ntpTimestamp);
        }
      })();
      if (payload2) return { id: extension.id, payload: payload2 };
    }).filter((v) => v);
    for (const ext of originalHeaderExtensions) {
      const exist = header.extensions.find((v) => v.id === ext.id);
      if (exist) {
        exist.payload = ext.payload;
      } else {
        header.extensions.push(ext);
      }
    }
    header.extensions = header.extensions.sort((a, b) => a.id - b.id);
    this.ntpTimestamp = ntpTimestamp;
    this.rtpTimestamp = header.timestamp;
    this.octetCount += payload.length;
    this.headerBytesSent += header.serializeSize;
    this.packetCount = uint32Add(this.packetCount, 1);
    this.rtpCache[header.sequenceNumber % RTP_HISTORY_SIZE] = rtp;
    let rtpPayload = payload;
    if (this.redRedundantPayloadType) {
      this.redEncoder.push({
        block: rtpPayload,
        timestamp: header.timestamp,
        blockPT: this.redRedundantPayloadType
      });
      const red = this.redEncoder.build();
      rtpPayload = red.serialize();
    }
    const size = await this.dtlsTransport.sendRtp(rtpPayload, header);
    this.runRtcp();
    const millitime = milliTime();
    const sentInfo = {
      wideSeq: this.dtlsTransport.transportSequenceNumber,
      size,
      sendingAtMs: millitime,
      sentAtMs: millitime
    };
    this.senderBWE.rtpPacketSent(sentInfo);
  }
  handleRtcpPacket(rtcpPacket) {
    switch (rtcpPacket.type) {
      case RtcpSrPacket.type:
      case RtcpRrPacket.type:
        {
          const packet = rtcpPacket;
          packet.reports.filter((report) => report.ssrc === this.ssrc).forEach((report) => {
            this.remotePacketsLost = report.packetsLost;
            this.remoteFractionLost = report.fractionLost / 256;
            if (this.lastSRtimestamp === report.lsr && report.dlsr) {
              if (this.lastSentSRTimestamp) {
                const rtt = timestampSeconds() - this.lastSentSRTimestamp - report.dlsr / 65536;
                this.totalRoundTripTime += rtt;
                this.roundTripTimeMeasurements++;
                if (this.rtt === void 0) {
                  this.rtt = rtt;
                } else {
                  this.rtt = RTT_ALPHA * this.rtt + (1 - RTT_ALPHA) * rtt;
                }
              }
            }
          });
        }
        break;
      case RtcpTransportLayerFeedback.type:
        {
          const packet = rtcpPacket;
          switch (packet.feedback.count) {
            case TransportWideCC.count:
              {
                const feedback = packet.feedback;
                this.senderBWE.receiveTWCC(feedback);
              }
              break;
            case GenericNack.count:
              {
                const feedback = packet.feedback;
                this.nackCount++;
                feedback.lost.forEach(async (seqNum) => {
                  let packet2 = this.rtpCache[seqNum % RTP_HISTORY_SIZE];
                  if (packet2 && packet2.header.sequenceNumber !== seqNum) {
                    packet2 = void 0;
                  }
                  if (packet2) {
                    if (this.rtxPayloadType != void 0) {
                      packet2 = wrapRtx(
                        packet2,
                        this.rtxPayloadType,
                        this.rtxSequenceNumber,
                        this.rtxSsrc
                      );
                      this.rtxSequenceNumber = uint16Add(
                        this.rtxSequenceNumber,
                        1
                      );
                    }
                    this.retransmittedPacketsSent++;
                    this.retransmittedBytesSent += packet2.payload.length;
                    this.headerBytesSent += packet2.header.serializeSize;
                    await this.dtlsTransport.sendRtp(
                      packet2.payload,
                      packet2.header
                    );
                  }
                });
                this.onGenericNack.execute(feedback);
              }
              break;
          }
        }
        break;
      case RtcpPayloadSpecificFeedback.type:
        {
          const packet = rtcpPacket;
          switch (packet.feedback.count) {
            case ReceiverEstimatedMaxBitrate.count:
              {
                const feedback = packet.feedback;
                this.receiverEstimatedMaxBitrate = feedback.bitrate;
              }
              break;
            case PictureLossIndication.count:
              {
                this.pliCount++;
                this.onPictureLossIndication.execute();
              }
              break;
          }
        }
        break;
    }
    this.onRtcp.execute(rtcpPacket);
  }
  // todo impl
  getParameters() {
    return {
      encodings: this.sendEncodings.map((encoding) => ({ ...encoding }))
    };
  }
  // todo impl
  setParameters(params) {
    if (params.encodings) {
      this.setSendEncodings(params.encodings);
    }
  }
  get outboundRtpStatsId() {
    return generateStatsId("outbound-rtp", this.trackId);
  }
  get mediaSourceStatsId() {
    return generateStatsId("media-source", this.trackId);
  }
  get remoteInboundRtpStatsId() {
    return generateStatsId("remote-inbound-rtp", this.trackId);
  }
  getStatsRootIds() {
    return [this.outboundRtpStatsId];
  }
  collectStats(timestamp) {
    const stats = [];
    const transportId = this.dtlsTransport ? generateStatsId("transport", this.dtlsTransport.id) : void 0;
    const codecId = this.codec && transportId ? generateCodecStatsId(
      transportId,
      this.codec.payloadType,
      this.trackId
    ) : void 0;
    const outboundRtpStats = {
      type: "outbound-rtp",
      id: this.outboundRtpStatsId,
      timestamp,
      ssrc: this.ssrc,
      kind: this.kind,
      transportId,
      codecId,
      mid: this.mid,
      packetsSent: this.packetCount,
      bytesSent: this.octetCount,
      headerBytesSent: this.headerBytesSent,
      retransmittedPacketsSent: this.retransmittedPacketsSent || void 0,
      retransmittedBytesSent: this.retransmittedBytesSent || void 0,
      rtxSsrc: this.rtxPayloadType ? this.rtxSsrc : void 0,
      mediaSourceId: this.track ? this.mediaSourceStatsId : void 0,
      remoteId: this.rtt !== void 0 || this.remotePacketsLost !== void 0 || this.remoteFractionLost !== void 0 ? this.remoteInboundRtpStatsId : void 0,
      nackCount: this.nackCount || void 0,
      pliCount: this.pliCount || void 0,
      firCount: this.firCount || void 0
    };
    stats.push(outboundRtpStats);
    if (this.track) {
      const mediaSourceStats = {
        type: "media-source",
        id: this.mediaSourceStatsId,
        timestamp,
        trackIdentifier: this.track.id ?? this.trackId,
        kind: this.kind
      };
      stats.push(mediaSourceStats);
    }
    if (this.codec && transportId) {
      const codecStats = {
        type: "codec",
        id: codecId,
        timestamp,
        payloadType: this.codec.payloadType,
        transportId,
        mimeType: this.codec.mimeType,
        clockRate: this.codec.clockRate,
        channels: this.codec.channels,
        sdpFmtpLine: this.codec.parameters
      };
      stats.push(codecStats);
    }
    if (this.rtt !== void 0 || this.remotePacketsLost !== void 0 || this.remoteFractionLost !== void 0) {
      const remoteInboundStats = {
        type: "remote-inbound-rtp",
        id: this.remoteInboundRtpStatsId,
        timestamp,
        ssrc: this.ssrc,
        kind: this.kind,
        transportId,
        codecId: outboundRtpStats.codecId,
        localId: outboundRtpStats.id,
        roundTripTime: this.rtt,
        totalRoundTripTime: this.totalRoundTripTime,
        roundTripTimeMeasurements: this.roundTripTimeMeasurements,
        packetsLost: this.remotePacketsLost,
        fractionLost: this.remoteFractionLost
      };
      stats.push(remoteInboundStats);
    }
    return stats;
  }
  async getStats() {
    const timestamp = getStatsTimestamp();
    const stats = this.collectStats(timestamp);
    if (this.dtlsTransport) {
      stats.push(...await this.dtlsTransport.getStats(timestamp));
    }
    return buildStatsReport(stats, this.getStatsRootIds());
  }
};

// src/errors.ts
function createWebRtcDomException(name, message = name) {
  return new DOMException(message, name);
}
function createWebRtcTypeError(message) {
  return new TypeError(message);
}

// src/peerConnection.ts
import { randomUUID as randomUUID11 } from "crypto";

// src/sctpManager.ts
var log35 = debug("werift:packages/webrtc/src/transport/sctpManager.ts");
var SctpTransportManager = class {
  sctpTransport;
  sctpRemotePort;
  dataChannelsOpened = 0;
  dataChannelsClosed = 0;
  dataChannels = [];
  onDataChannel = new Event2();
  constructor() {
  }
  createSctpTransport(maxMessageSize) {
    const sctp = new RTCSctpTransport(5e3, maxMessageSize);
    sctp.mid = void 0;
    sctp.onDataChannel.subscribe((channel) => {
      this.dataChannelsOpened++;
      this.dataChannels.push(channel);
      this.onDataChannel.execute(channel);
    });
    this.sctpTransport = sctp;
    return sctp;
  }
  createDataChannel(label, options = {}) {
    const maxPacketLifeTime = coerceUnsignedShortOption(
      options.maxPacketLifeTime,
      "maxPacketLifeTime"
    );
    const maxRetransmits = coerceUnsignedShortOption(
      options.maxRetransmits,
      "maxRetransmits"
    );
    const base = {
      protocol: "",
      ordered: true,
      negotiated: false
    };
    const settings = {
      ...base,
      ...options,
      maxPacketLifeTime,
      maxRetransmits
    };
    if (settings.maxPacketLifeTime != null && settings.maxRetransmits != null) {
      throw createWebRtcTypeError(
        "maxPacketLifeTime and maxRetransmits cannot both be set"
      );
    }
    if (!this.sctpTransport) {
      this.sctpTransport = this.createSctpTransport();
    }
    const parameters = new RTCDataChannelParameters({
      id: settings.id,
      label,
      maxPacketLifeTime: settings.maxPacketLifeTime,
      maxRetransmits: settings.maxRetransmits,
      negotiated: settings.negotiated,
      ordered: settings.ordered,
      protocol: settings.protocol
    });
    const channel = new RTCDataChannel(this.sctpTransport, parameters);
    this.dataChannelsOpened++;
    this.dataChannels.push(channel);
    channel.stateChange.subscribe((state) => {
      if (state === "closed") {
        this.dataChannelsClosed++;
        const index = this.dataChannels.indexOf(channel);
        if (index !== -1) {
          this.dataChannels.splice(index, 1);
        }
      }
    });
    return channel;
  }
  async connectSctp() {
    if (!this.sctpTransport || !this.sctpRemotePort) {
      return;
    }
    await this.sctpTransport.start(this.sctpRemotePort);
    await this.sctpTransport.sctp.stateChanged.connected.asPromise();
    log35("sctp connected");
  }
  setRemoteSCTP(remoteMedia, mLineIndex) {
    if (!this.sctpTransport) {
      return;
    }
    this.sctpTransport.setRemoteMaxMessageSize(
      remoteMedia.sctpCapabilities?.maxMessageSize
    );
    this.sctpRemotePort = remoteMedia.sctpPort;
    if (!this.sctpRemotePort) {
      throw new Error("sctpRemotePort not exist");
    }
    this.sctpTransport.setRemotePort(this.sctpRemotePort);
    this.sctpTransport.mLineIndex = mLineIndex;
    if (!this.sctpTransport.mid) {
      this.sctpTransport.mid = remoteMedia.rtp.muxId;
    }
  }
  async close() {
    if (this.sctpTransport) {
      await this.sctpTransport.stop();
    }
    this.onDataChannel.allUnsubscribe();
  }
  async getStats(timestamp = getStatsTimestamp()) {
    const stats = [];
    for (const channel of this.dataChannels) {
      const channelStats = {
        type: "data-channel",
        id: generateStatsId("data-channel", channel.id ?? channel.statsId),
        timestamp,
        label: channel.label,
        protocol: channel.protocol,
        dataChannelIdentifier: channel.id ?? void 0,
        state: channel.readyState,
        messagesSent: channel.messagesSent || 0,
        bytesSent: channel.bytesSent || 0,
        messagesReceived: channel.messagesReceived || 0,
        bytesReceived: channel.bytesReceived || 0
      };
      stats.push(channelStats);
    }
    return stats;
  }
};
function coerceUnsignedShortOption(value, name) {
  if (value === void 0) {
    return void 0;
  }
  const coerced = Number(value);
  if (!Number.isFinite(coerced) || !Number.isInteger(coerced) || coerced < 0 || coerced > 65535) {
    throw createWebRtcTypeError(`${name} must be an unsigned short`);
  }
  return coerced;
}

// src/sdpManager.ts
var SDPManager = class {
  currentLocalDescription;
  currentRemoteDescription;
  pendingLocalDescription;
  pendingRemoteDescription;
  cname;
  midSuffix;
  bundlePolicy;
  seenMid = /* @__PURE__ */ new Set();
  constructor({
    cname,
    midSuffix,
    bundlePolicy
  }) {
    this.cname = cname;
    this.midSuffix = midSuffix ?? false;
    this.bundlePolicy = bundlePolicy;
  }
  get localDescription() {
    if (!this._localDescription) {
      return void 0;
    }
    return this._localDescription.toJSON();
  }
  get remoteDescription() {
    if (!this._remoteDescription) {
      return void 0;
    }
    return this._remoteDescription.toJSON();
  }
  /**@private */
  get _localDescription() {
    return this.pendingLocalDescription || this.currentLocalDescription;
  }
  /**@private */
  get _remoteDescription() {
    return this.pendingRemoteDescription || this.currentRemoteDescription;
  }
  get inactiveRemoteMedia() {
    return this._remoteDescription?.media?.find?.(
      (m) => m.direction === "inactive"
    );
  }
  /**
   * MediaDescriptionをトランシーバー用に作成
   */
  createMediaDescriptionForTransceiver(transceiver, direction) {
    const media = new MediaDescription(
      transceiver.kind,
      9,
      "UDP/TLS/RTP/SAVPF",
      transceiver.codecs.map((c) => c.payloadType)
    );
    media.direction = direction;
    media.msids = transceiver.msids;
    media.rtp = {
      codecs: transceiver.codecs,
      headerExtensions: transceiver.headerExtensions,
      muxId: transceiver.mid ?? void 0
    };
    media.rtcpHost = "0.0.0.0";
    media.rtcpPort = 9;
    media.rtcpMux = true;
    media.ssrc = [
      new SsrcDescription({ ssrc: transceiver.sender.ssrc, cname: this.cname })
    ];
    if (transceiver.options.simulcast) {
      media.simulcastParameters = transceiver.options.simulcast.map(
        (o) => new RTCRtpSimulcastParameters(o)
      );
    }
    if (media.rtp.codecs.find((c) => c.name.toLowerCase() === "rtx")) {
      media.ssrc.push(
        new SsrcDescription({
          ssrc: transceiver.sender.rtxSsrc,
          cname: this.cname
        })
      );
      media.ssrcGroup = [
        new GroupDescription("FID", [
          transceiver.sender.ssrc.toString(),
          transceiver.sender.rtxSsrc.toString()
        ])
      ];
    }
    this.addTransportDescription(media, transceiver.dtlsTransport);
    return media;
  }
  /**
   * MediaDescriptionをSCTP用に作成
   */
  createMediaDescriptionForSctp(sctp) {
    const media = new MediaDescription(
      "application",
      DISCARD_PORT,
      "UDP/DTLS/SCTP",
      ["webrtc-datachannel"]
    );
    media.sctpPort = sctp.port;
    media.rtp.muxId = sctp.mid;
    media.sctpCapabilities = sctp.getCapabilities();
    this.addTransportDescription(media, sctp.dtlsTransport);
    return media;
  }
  /**
   * トランスポートの情報をMediaDescriptionに追加
   */
  addTransportDescription(media, dtlsTransport) {
    const iceTransport = dtlsTransport.iceTransport;
    media.iceCandidates = iceTransport.localCandidates;
    media.iceCandidatesComplete = iceTransport.gatheringState === "complete";
    media.iceParams = iceTransport.localParameters;
    media.iceOptions = "trickle";
    media.host = DISCARD_HOST;
    media.port = DISCARD_PORT;
    if (media.direction === "inactive") {
      media.port = 0;
      media.msids = [];
    }
    if (!media.dtlsParams) {
      media.dtlsParams = dtlsTransport.localParameters;
      if (!media.dtlsParams.fingerprints) {
        media.dtlsParams.fingerprints = dtlsTransport.localParameters.fingerprints;
      }
    }
  }
  /**
   * 一意のMIDを割り当て
   */
  allocateMid(type = "") {
    let mid = "";
    for (let i = 0; ; ) {
      mid = (i++).toString() + type;
      if (!this.seenMid.has(mid)) break;
    }
    this.seenMid.add(mid);
    return mid;
  }
  parseSdp({
    sdp,
    isLocal,
    signalingState,
    type
  }) {
    const description = SessionDescription.parse(sdp);
    this.validateDescription({ description, isLocal, signalingState, type });
    description.type = type;
    return description;
  }
  validateDescription({
    description,
    isLocal,
    signalingState,
    type
  }) {
    if (isLocal) {
      if (type === "offer") {
        if (!["stable", "have-local-offer"].includes(signalingState))
          throw createWebRtcDomException(
            "InvalidStateError",
            "Cannot handle offer in signaling state"
          );
      } else if (["answer", "pranswer"].includes(type)) {
        if (!["have-remote-offer", "have-local-pranswer"].includes(signalingState)) {
          throw createWebRtcDomException(
            "InvalidStateError",
            "Cannot handle answer in signaling state"
          );
        }
      }
    } else {
      if (type === "offer") {
        if (!["stable", "have-remote-offer", "have-local-offer"].includes(
          signalingState
        )) {
          throw createWebRtcDomException(
            "InvalidStateError",
            "Cannot handle offer in signaling state"
          );
        }
      } else if (["answer", "pranswer"].includes(type)) {
        if (!["have-local-offer", "have-remote-pranswer"].includes(signalingState)) {
          throw createWebRtcDomException(
            "InvalidStateError",
            "Cannot handle answer in signaling state"
          );
        }
      }
    }
  }
  /**
   * オファーSDPを構築
   */
  buildOfferSdp(transceivers, sctpTransport) {
    const description = new SessionDescription();
    addSDPHeader("offer", description);
    const currentMedia = this.currentLocalDescription?.media ?? [];
    currentMedia.forEach((m, i) => {
      const mid = m.rtp.muxId;
      if (!mid) {
        return;
      }
      if (m.kind === "application") {
        if (!sctpTransport) {
          throw new Error("sctpTransport not found");
        }
        sctpTransport.mLineIndex = i;
        description.media.push(
          this.createMediaDescriptionForSctp(sctpTransport)
        );
      } else {
        const transceiver = transceivers.find((t) => t.mid === mid);
        if (!transceiver) {
          if (m.direction === "inactive") {
            description.media.push(m);
            return;
          }
          throw new Error("transceiver not found");
        }
        transceiver.mLineIndex = i;
        description.media.push(
          this.createMediaDescriptionForTransceiver(
            transceiver,
            transceiver.direction
          )
        );
      }
    });
    for (const transceiver of transceivers.filter(
      (t) => !description.media.find((m) => m.rtp.muxId === t.mid)
    )) {
      if (transceiver.mid == void 0) {
        transceiver.mid = this.allocateMid(this.midSuffix ? "av" : "");
      }
      const mediaDescription = this.createMediaDescriptionForTransceiver(
        transceiver,
        transceiver.direction
      );
      if (transceiver.mLineIndex === void 0) {
        transceiver.mLineIndex = description.media.length;
        description.media.push(mediaDescription);
      } else {
        description.media[transceiver.mLineIndex] = mediaDescription;
      }
    }
    if (sctpTransport && !description.media.find((m) => m.kind === "application")) {
      sctpTransport.mLineIndex = description.media.length;
      if (sctpTransport.mid == void 0) {
        sctpTransport.mid = this.allocateMid(this.midSuffix ? "dc" : "");
      }
      description.media.push(this.createMediaDescriptionForSctp(sctpTransport));
    }
    if (this.bundlePolicy !== "disable") {
      const mids = description.media.map((m) => m.rtp.muxId).filter((v) => v);
      if (mids.length) {
        const bundle = new GroupDescription("BUNDLE", mids);
        description.group.push(bundle);
      }
    }
    return description;
  }
  /**
   * アンサーSDPを構築
   */
  buildAnswerSdp({
    transceivers,
    sctpTransport,
    signalingState
  }) {
    if (!["have-remote-offer", "have-local-pranswer"].includes(signalingState)) {
      throw new Error("createAnswer failed");
    }
    if (!this._remoteDescription) {
      throw new Error("wrong state");
    }
    const description = new SessionDescription();
    addSDPHeader("answer", description);
    for (const remoteMedia of this._remoteDescription.media) {
      let dtlsTransport;
      let media;
      if (["audio", "video"].includes(remoteMedia.kind)) {
        const transceiver = transceivers.find(
          (t) => t.mid === remoteMedia.rtp.muxId
        );
        if (!transceiver) {
          throw new Error(
            `Transceiver with mid=${remoteMedia.rtp.muxId} not found`
          );
        }
        media = this.createMediaDescriptionForTransceiver(
          transceiver,
          andDirection(transceiver.direction, transceiver.offerDirection)
        );
        dtlsTransport = transceiver.dtlsTransport;
      } else if (remoteMedia.kind === "application") {
        if (!sctpTransport || !sctpTransport.mid) {
          throw new Error("sctpTransport not found");
        }
        media = this.createMediaDescriptionForSctp(sctpTransport);
        dtlsTransport = sctpTransport.dtlsTransport;
      } else {
        throw new Error("invalid kind");
      }
      if (media.dtlsParams) {
        if (dtlsTransport.role === "auto") {
          media.dtlsParams.role = "client";
        } else {
          media.dtlsParams.role = dtlsTransport.role;
        }
      }
      if (remoteMedia.simulcastParameters && remoteMedia.simulcastParameters.length > 0) {
        media.simulcastParameters = remoteMedia.simulcastParameters.map(
          (v) => ({
            ...v,
            direction: v.direction === "send" ? "recv" : "send"
          })
        );
      }
      description.media.push(media);
    }
    if (this.bundlePolicy !== "disable") {
      const bundle = new GroupDescription("BUNDLE", []);
      for (const media of description.media) {
        if (media.rtp.muxId) {
          bundle.items.push(media.rtp.muxId);
        }
      }
      description.group.push(bundle);
    }
    return description;
  }
  setLocalDescription(description) {
    if (description.type === "offer" || description.type === "pranswer") {
      this.pendingLocalDescription = description;
      return;
    }
    this.currentLocalDescription = description;
    if (this.pendingRemoteDescription) {
      this.currentRemoteDescription = this.pendingRemoteDescription;
    }
    this.pendingLocalDescription = void 0;
    this.pendingRemoteDescription = void 0;
  }
  setRemoteDescription(sessionDescription, signalingState) {
    if (!sessionDescription.type) {
      throw new Error("invalid sessionDescription");
    }
    if (sessionDescription.type === "rollback") {
      if (!["have-remote-offer", "have-local-pranswer"].includes(signalingState)) {
        throw createWebRtcDomException(
          "InvalidStateError",
          "Cannot rollback remote description in signaling state"
        );
      }
      this.pendingLocalDescription = void 0;
      this.pendingRemoteDescription = void 0;
      return;
    }
    if (!sessionDescription.sdp) {
      throw new Error("invalid sessionDescription");
    }
    const remoteSdp = this.parseSdp({
      sdp: sessionDescription.sdp,
      isLocal: false,
      signalingState,
      type: sessionDescription.type
    });
    if (remoteSdp.type === "offer" || remoteSdp.type === "pranswer") {
      this.pendingRemoteDescription = remoteSdp;
    } else {
      if (this.pendingLocalDescription) {
        this.currentLocalDescription = this.pendingLocalDescription;
      }
      this.currentRemoteDescription = remoteSdp;
      this.pendingRemoteDescription = void 0;
      this.pendingLocalDescription = void 0;
    }
    return remoteSdp;
  }
  rollbackLocalDescription(signalingState) {
    if (!["have-local-offer", "have-local-pranswer"].includes(signalingState)) {
      throw createWebRtcDomException(
        "InvalidStateError",
        "Cannot rollback local description in signaling state"
      );
    }
    this.pendingLocalDescription = void 0;
    this.pendingRemoteDescription = void 0;
  }
  registerMid(mid) {
    this.seenMid.add(mid);
  }
  get remoteIsBundled() {
    const remoteSdp = this._remoteDescription;
    if (!remoteSdp) {
      return void 0;
    }
    const bundle = remoteSdp.group.find(
      (g) => g.semantic === "BUNDLE" && this.bundlePolicy !== "disable"
    );
    return bundle;
  }
  /**
   * ローカルセッション記述を設定し、トランスポート情報を追加する
   */
  setLocal(description, transceivers, sctpTransport) {
    const transceiverByMLineIndex = new Map(
      transceivers.map((transceiver) => [transceiver?.mLineIndex, transceiver])
    );
    const fallbackDtlsTransport = transceivers.find((transceiver) => transceiver?.dtlsTransport)?.dtlsTransport ?? sctpTransport?.dtlsTransport;
    description.media.filter((m) => ["audio", "video"].includes(m.kind)).forEach((m, i) => {
      const transceiver = transceiverByMLineIndex.get(i) ?? transceivers[i];
      const dtlsTransport = transceiver?.dtlsTransport ?? fallbackDtlsTransport;
      if (!dtlsTransport) {
        throw new Error(`dtls transport not found for media index ${i}`);
      }
      this.addTransportDescription(m, dtlsTransport);
    });
    const sctpMedia = description.media.find((m) => m.kind === "application");
    if (sctpTransport && sctpMedia) {
      this.addTransportDescription(sctpMedia, sctpTransport.dtlsTransport);
    }
    this.setLocalDescription(description);
  }
};

// src/secureTransportManager.ts
var log36 = debug(
  "werift:packages/webrtc/src/transport/secureTransportManager.ts"
);
var SecureTransportManager = class {
  connectionState = "new";
  iceConnectionState = "new";
  iceGatheringState = "new";
  certificate;
  iceGatheringStateChange = new Event2();
  iceConnectionStateChange = new Event2();
  onIceCandidate = new Event2();
  connectionStateChange = new Event2();
  config;
  transceiverManager;
  sctpManager;
  constructor({
    config,
    transceiverManager,
    sctpManager
  }) {
    this.config = config;
    this.transceiverManager = transceiverManager;
    this.sctpManager = sctpManager;
    if (this.config.dtls) {
      const { keys } = this.config.dtls;
      if (this.config.certificates[0]) {
        this.certificate = this.config.certificates[0];
      } else if (keys) {
        this.setupCertificate(keys);
      }
    }
  }
  get dtlsTransports() {
    const transports = [
      ...this.transceiverManager.getTransceivers().map((t) => t?.dtlsTransport),
      this.sctpManager.sctpTransport?.dtlsTransport
    ].filter((t) => t != void 0);
    return transports.reduce((acc, cur) => {
      if (!acc.map((d) => d.id).includes(cur.id)) {
        acc.push(cur);
      }
      return acc;
    }, []);
  }
  get iceTransports() {
    return this.dtlsTransports.map((d) => d.iceTransport);
  }
  setupCertificate(keys) {
    this.certificate = new RTCCertificate(
      keys.keyPem,
      keys.certPem,
      keys.signatureHash
    );
  }
  createTransport() {
    const existing = this.iceTransports.find(
      (transport) => transport.state !== "closed"
    );
    const iceServerOptions = parseIceServers(this.config.iceServers);
    const turnTransport = resolveTurnTransport({
      parsedTurnTransport: iceServerOptions.turnTransport,
      configuredTurnTransport: this.config.turnTransport,
      forceTurnTCP: this.config.forceTurnTCP
    });
    const iceGatherer = new RTCIceGatherer({
      ...iceServerOptions,
      iceLite: this.config.iceLite,
      forceTurn: this.config.iceTransportPolicy === "relay",
      portRange: this.config.icePortRange,
      interfaceAddresses: this.config.iceInterfaceAddresses,
      additionalHostAddresses: this.config.iceAdditionalHostAddresses,
      filterStunResponse: this.config.iceFilterStunResponse,
      filterCandidatePair: this.config.iceFilterCandidatePair,
      localPasswordPrefix: this.config.icePasswordPrefix,
      useIpv4: this.config.iceUseIpv4,
      useIpv6: this.config.iceUseIpv6,
      useTcp: this.config.iceUseTcp,
      turnTransport,
      turnTlsOptions: this.config.turnTlsOptions,
      useLinkLocalAddress: this.config.iceUseLinkLocalAddress
    });
    if (existing) {
      iceGatherer.connection.localUsername = existing.connection.localUsername;
      iceGatherer.connection.localPassword = existing.connection.localPassword;
    }
    iceGatherer.onGatheringStateChange.subscribe(() => {
      this.updateIceGatheringState();
    });
    this.updateIceGatheringState();
    const iceTransport = new RTCIceTransport(iceGatherer);
    iceTransport.onStateChange.subscribe(() => {
      this.updateIceConnectionState();
    });
    const dtlsTransport = new RTCDtlsTransport(
      this.config,
      iceTransport,
      this.certificate,
      srtpProfiles
    );
    return dtlsTransport;
  }
  handleNewIceCandidate({
    candidate,
    media,
    remoteIsBundled,
    transceiver,
    sctpTransport,
    bundlePolicy
  }) {
    if (bundlePolicy === "max-bundle" || remoteIsBundled) {
      candidate.sdpMLineIndex = 0;
      if (media) {
        candidate.sdpMid = media.rtp.muxId;
      }
    } else {
      if (transceiver) {
        candidate.sdpMLineIndex = transceiver.mLineIndex;
        candidate.sdpMid = transceiver.mid ?? void 0;
      }
      if (sctpTransport) {
        candidate.sdpMLineIndex = sctpTransport.mLineIndex;
        candidate.sdpMid = sctpTransport.mid;
      }
    }
    if (candidate.foundation && !candidate.foundation.startsWith("candidate:")) {
      candidate.foundation = "candidate:" + candidate.foundation;
    }
    this.onIceCandidate.execute(candidate);
    return candidate;
  }
  async addIceCandidate(sdp, candidateMessage) {
    const candidateText = candidateMessage?.candidate;
    const sdpMid = candidateMessage?.sdpMid;
    const sdpMLineIndex = candidateMessage?.sdpMLineIndex;
    const usernameFragment = candidateMessage?.usernameFragment;
    const isEndOfCandidates = candidateMessage == null || candidateText == null || candidateText === "";
    const mediaIndices = this.resolveCandidateMediaIndices({
      sdp,
      isEndOfCandidates,
      sdpMid,
      sdpMLineIndex,
      usernameFragment
    });
    if (isEndOfCandidates) {
      const candidateTarget = mediaIndices.map((index) => this.getTransportByMLineIndex(sdp, index)).filter(
        (iceTransport2) => !!iceTransport2
      ).reduce((acc, transport) => {
        if (!acc.find(({ id }) => id === transport.id)) {
          acc.push(transport);
        }
        return acc;
      }, []);
      await Promise.all(
        candidateTarget.map(
          (iceTransport2) => iceTransport2.addRemoteCandidate(void 0)
        )
      );
      return {
        kind: "end-of-candidates",
        mediaIndices
      };
    }
    const candidate = IceCandidate.fromJSON(candidateMessage);
    if (!candidate) {
      throw createWebRtcDomException(
        "OperationError",
        "Failed to parse ICE candidate"
      );
    }
    const targetMediaIndex = mediaIndices[0];
    const targetMedia = sdp.media[targetMediaIndex];
    if (!targetMedia) {
      throw createWebRtcDomException(
        "OperationError",
        "ICE media section not found"
      );
    }
    candidate.sdpMid = targetMedia.rtp.muxId ?? void 0;
    candidate.sdpMLineIndex = targetMediaIndex;
    const iceTransport = this.getTransportByMLineIndex(sdp, targetMediaIndex);
    if (!iceTransport) {
      throw createWebRtcDomException(
        "OperationError",
        "ICE transport not found for candidate"
      );
    }
    await iceTransport.addRemoteCandidate(candidate);
    return {
      kind: "candidate",
      candidate,
      mediaIndices: [targetMediaIndex]
    };
  }
  resolveCandidateMediaIndices({
    sdp,
    isEndOfCandidates,
    sdpMid,
    sdpMLineIndex,
    usernameFragment
  }) {
    let mediaIndices;
    if (typeof sdpMid === "string") {
      const mediaIndex = sdp.media.findIndex(
        (media) => media.rtp.muxId === sdpMid
      );
      if (mediaIndex < 0) {
        throw createWebRtcDomException(
          "OperationError",
          "Media section for sdpMid was not found"
        );
      }
      mediaIndices = [mediaIndex];
    } else if (typeof sdpMLineIndex === "number") {
      if (sdpMLineIndex < 0 || sdpMLineIndex >= sdp.media.length) {
        throw createWebRtcDomException(
          "OperationError",
          "Media section for sdpMLineIndex was not found"
        );
      }
      mediaIndices = [sdpMLineIndex];
    } else if (isEndOfCandidates) {
      mediaIndices = sdp.media.map((_, index) => index);
    } else {
      throw createWebRtcTypeError(
        "sdpMid or sdpMLineIndex must be provided with a candidate"
      );
    }
    if (typeof usernameFragment === "string") {
      const matchingIndices = mediaIndices.filter(
        (index) => sdp.media[index]?.iceParams?.usernameFragment === usernameFragment
      );
      if (matchingIndices.length === 0) {
        throw createWebRtcDomException(
          "OperationError",
          "No media section matched the ICE usernameFragment"
        );
      }
      mediaIndices = matchingIndices;
    }
    return mediaIndices;
  }
  getTransportByMid(mid) {
    if (!mid) {
      return;
    }
    let iceTransport;
    const transceiver = this.transceiverManager.getTransceivers().find((t) => t.mid === mid);
    if (transceiver) {
      iceTransport = transceiver.dtlsTransport.iceTransport;
    } else if (!iceTransport && this.sctpManager.sctpTransport?.mid === mid) {
      iceTransport = this.sctpManager.sctpTransport.dtlsTransport.iceTransport;
    }
    return iceTransport;
  }
  getTransportByMLineIndex(sdp, index) {
    const media = sdp.media[index];
    if (!media) {
      return;
    }
    const transport = this.getTransportByMid(media.rtp.muxId);
    return transport;
  }
  restartIce() {
    for (const transport of this.iceTransports) {
      transport.restart();
    }
  }
  setLocalRole({
    type,
    role
  }) {
    for (const dtlsTransport of this.dtlsTransports) {
      const iceTransport = dtlsTransport.iceTransport;
      if (iceTransport.connection.iceLite) {
        iceTransport.connection.iceControlling = false;
      } else if (iceTransport.connection.remoteIsLite) {
        iceTransport.connection.iceControlling = true;
      } else if (type === "offer") {
        iceTransport.connection.iceControlling = true;
      } else {
        iceTransport.connection.iceControlling = false;
      }
      if (type === "answer") {
        if (role) {
          dtlsTransport.role = role;
        }
      }
    }
  }
  // https://w3c.github.io/webrtc-pc/#dom-rtcicegatheringstate
  updateIceGatheringState() {
    const all = this.iceTransports;
    function allMatch(...state) {
      return all.filter((check) => state.includes(check.gatheringState)).length === all.length;
    }
    let newState;
    if (all.length && allMatch("complete")) {
      newState = "complete";
    } else if (!all.length || allMatch("new", "complete")) {
      newState = "new";
    } else if (all.map((check) => check.gatheringState).includes("gathering")) {
      newState = "gathering";
    } else {
      newState = "new";
    }
    if (this.iceGatheringState === newState) {
      return;
    }
    this.iceGatheringState = newState;
    this.iceGatheringStateChange.execute(newState);
  }
  // https://w3c.github.io/webrtc-pc/#dom-rtciceconnectionstate
  updateIceConnectionState() {
    const all = this.iceTransports;
    let newState;
    function allMatch(...state) {
      return all.filter((check) => state.includes(check.state)).length === all.length;
    }
    function anyMatch(...state) {
      return all.some((check) => state.includes(check.state));
    }
    if (this.connectionState === "closed") {
      newState = "closed";
    } else if (anyMatch("failed")) {
      newState = "failed";
    } else if (anyMatch("disconnected")) {
      newState = "disconnected";
    } else if (allMatch("new", "closed")) {
      newState = "new";
    } else if (anyMatch("new", "checking")) {
      newState = "checking";
    } else if (allMatch("completed", "closed")) {
      newState = "completed";
    } else if (allMatch("connected", "completed", "closed")) {
      newState = "connected";
    } else {
      newState = "new";
    }
    if (this.iceConnectionState === newState) {
      return;
    }
    log36("iceConnectionStateChange", newState);
    this.iceConnectionState = newState;
    this.iceConnectionStateChange.execute(newState);
    if (newState === "failed" && this.connectionState !== "closed") {
      this.setConnectionState("failed");
    } else if (newState === "disconnected" && this.connectionState === "connected") {
      this.setConnectionState("disconnected");
    }
  }
  async gatherCandidates(remoteIsBundled) {
    const connected = this.iceTransports.find(
      (transport) => transport.state === "connected" || transport.state === "completed"
    );
    if (remoteIsBundled && connected) {
      log36("skipping ICE gathering for bundled connection");
    } else {
      await Promise.allSettled(
        this.iceTransports.map((iceTransport) => iceTransport.gather())
      ).catch((e) => {
        log36("gatherCandidates failed", e);
      });
    }
  }
  setConnectionState(state) {
    if (this.connectionState === state) {
      return;
    }
    log36("connectionStateChange", state);
    this.connectionState = state;
    this.connectionStateChange.execute(state);
  }
  async getStats(timestamp) {
    const stats = [];
    for (const dtlsTransport of this.dtlsTransports) {
      const transportStats = await dtlsTransport.getStats(timestamp);
      if (transportStats) {
        stats.push(...transportStats);
      }
    }
    return stats;
  }
  async ensureCerts() {
    if (!this.certificate) {
      this.certificate = await RTCDtlsTransport.SetupCertificate();
    }
    for (const dtlsTransport of this.dtlsTransports) {
      dtlsTransport.localCertificate = this.certificate;
    }
  }
  async close() {
    this.setConnectionState("closed");
    await Promise.allSettled([...this.dtlsTransports.map((t) => t.stop())]);
    this.iceGatheringStateChange.allUnsubscribe();
    this.iceConnectionStateChange.allUnsubscribe();
    this.onIceCandidate.allUnsubscribe();
    this.connectionStateChange.allUnsubscribe();
  }
};
var srtpProfiles = [
  SRTP_PROFILE.SRTP_AEAD_AES_128_GCM,
  // prefer
  SRTP_PROFILE.SRTP_AES128_CM_HMAC_SHA1_80
];

// src/peerConnection.ts
var log37 = debug("werift:packages/webrtc/src/peerConnection.ts");
var RTCPeerConnection = class extends EventTarget {
  id = randomUUID11().toString();
  cname = randomUUID11().toString();
  config = generateDefaultPeerConfig();
  signalingState = "stable";
  negotiationneeded = false;
  needRestart = false;
  router = new RtpRouter();
  sdpManager;
  transceiverManager;
  sctpManager;
  secureManager;
  isClosed = false;
  shouldNegotiationneeded = false;
  lastCreatedAnswer;
  lastCreatedOffer;
  pendingRemoteCandidates = [];
  iceGatheringStateChange = new Event2();
  iceConnectionStateChange = new Event2();
  signalingStateChange = new Event2();
  connectionStateChange = new Event2();
  onDataChannel = new Event2();
  onRemoteTransceiverAdded = new Event2();
  onTransceiverAdded = new Event2();
  onIceCandidate = new Event2();
  onNegotiationneeded = new Event2();
  onTrack = new Event2();
  eventHandlers = {};
  get ondatachannel() {
    return this.eventHandlers.ondatachannel ?? null;
  }
  set ondatachannel(value) {
    this.eventHandlers.ondatachannel = value ?? void 0;
  }
  get onicecandidate() {
    return this.eventHandlers.onicecandidate ?? null;
  }
  set onicecandidate(value) {
    this.eventHandlers.onicecandidate = value ?? void 0;
  }
  get onicecandidateerror() {
    return this.eventHandlers.onicecandidateerror ?? null;
  }
  set onicecandidateerror(value) {
    this.eventHandlers.onicecandidateerror = value ?? void 0;
  }
  get onicegatheringstatechange() {
    return this.eventHandlers.onicegatheringstatechange ?? null;
  }
  set onicegatheringstatechange(value) {
    this.eventHandlers.onicegatheringstatechange = value ?? void 0;
  }
  get onnegotiationneeded() {
    return this.eventHandlers.onnegotiationneeded ?? null;
  }
  set onnegotiationneeded(value) {
    this.eventHandlers.onnegotiationneeded = value ?? void 0;
  }
  get onsignalingstatechange() {
    return this.eventHandlers.onsignalingstatechange ?? null;
  }
  set onsignalingstatechange(value) {
    this.eventHandlers.onsignalingstatechange = value ?? void 0;
  }
  get ontrack() {
    return this.eventHandlers.ontrack ?? null;
  }
  set ontrack(value) {
    this.eventHandlers.ontrack = value ?? void 0;
  }
  get onconnectionstatechange() {
    return this.eventHandlers.onconnectionstatechange ?? null;
  }
  set onconnectionstatechange(value) {
    this.eventHandlers.onconnectionstatechange = value ?? void 0;
  }
  get oniceconnectionstatechange() {
    return this.eventHandlers.oniceconnectionstatechange ?? null;
  }
  set oniceconnectionstatechange(value) {
    this.eventHandlers.oniceconnectionstatechange = value ?? void 0;
  }
  constructor(config = {}) {
    super();
    this.setConfiguration(config);
    this.sdpManager = new SDPManager({
      cname: this.cname,
      bundlePolicy: this.config.bundlePolicy
    });
    this.transceiverManager = new TransceiverManager(
      this.cname,
      this.config,
      this.router
    );
    this.transceiverManager.onTransceiverAdded.pipe(this.onTransceiverAdded);
    this.transceiverManager.onRemoteTransceiverAdded.pipe(
      this.onRemoteTransceiverAdded
    );
    this.transceiverManager.onTrack.subscribe(
      ({ track, streams, transceiver }) => {
        const event = new RTCTrackEvent({
          track,
          streams,
          transceiver,
          receiver: transceiver.receiver
        });
        this.onTrack.execute(track);
        this.emit("track", event);
        if (this.ontrack) {
          this.ontrack(event);
        }
      }
    );
    this.transceiverManager.onNegotiationNeeded.subscribe(
      () => this.needNegotiation()
    );
    this.sctpManager = new SctpTransportManager();
    this.sctpManager.onDataChannel.subscribe((channel) => {
      this.onDataChannel.execute(channel);
      const event = { type: "datachannel", channel };
      this.ondatachannel?.(event);
      this.emit("datachannel", event);
    });
    this.secureManager = new SecureTransportManager({
      config: this.config,
      sctpManager: this.sctpManager,
      transceiverManager: this.transceiverManager
    });
    this.secureManager.iceGatheringStateChange.subscribe((state) => {
      this.iceGatheringStateChange.execute(state);
      this.onicegatheringstatechange?.(
        new globalThis.Event("icegatheringstatechange")
      );
      this.emit("icegatheringstatechange");
    });
    this.secureManager.iceConnectionStateChange.subscribe((state) => {
      if (state === "closed") {
        this.close();
      }
      this.iceConnectionStateChange.execute(state);
      this.oniceconnectionstatechange?.();
      this.emit("iceconnectionstatechange");
    });
    this.secureManager.connectionStateChange.subscribe((state) => {
      this.connectionStateChange.execute(state);
      this.onconnectionstatechange?.();
      this.emit("connectionstatechange");
    });
    this.secureManager.onIceCandidate.subscribe((candidate) => {
      const iceCandidate = candidate ? candidate.toJSON() : void 0;
      this.onIceCandidate.execute(iceCandidate);
      const event = {
        type: "icecandidate",
        candidate: iceCandidate
      };
      this.onicecandidate?.(event);
      this.emit("icecandidate", event);
    });
  }
  get connectionState() {
    return this.secureManager.connectionState;
  }
  get iceConnectionState() {
    return this.secureManager.iceConnectionState;
  }
  get iceGathererState() {
    return this.secureManager.iceGatheringState;
  }
  get iceGatheringState() {
    return this.secureManager.iceGatheringState;
  }
  get dtlsTransports() {
    return this.secureManager.dtlsTransports;
  }
  get sctpTransport() {
    return this.sctpManager.sctpTransport;
  }
  get sctp() {
    return this.sctpTransport ?? null;
  }
  get sctpRemotePort() {
    return this.sctpManager.sctpRemotePort;
  }
  get iceTransports() {
    return this.secureManager.iceTransports;
  }
  get extIdUriMap() {
    return this.router.extIdUriMap;
  }
  get iceGeneration() {
    return this.iceTransports[0].connection.generation;
  }
  get localDescription() {
    return this.sdpManager.localDescription ?? null;
  }
  get currentLocalDescription() {
    return this.sdpManager.currentLocalDescription?.toJSON() ?? null;
  }
  get pendingLocalDescription() {
    return this.sdpManager.pendingLocalDescription?.toJSON() ?? null;
  }
  get remoteDescription() {
    return this.sdpManager.remoteDescription ?? null;
  }
  get currentRemoteDescription() {
    return this.sdpManager.currentRemoteDescription?.toJSON() ?? null;
  }
  get pendingRemoteDescription() {
    return this.sdpManager.pendingRemoteDescription?.toJSON() ?? null;
  }
  get canTrickleIceCandidates() {
    const remoteDescription = this.sdpManager._remoteDescription;
    if (!remoteDescription) {
      return null;
    }
    const iceOptions = [
      remoteDescription.iceOptions,
      ...remoteDescription.media.map((media) => media.iceOptions)
    ].filter((value) => !!value).join(" ");
    return iceOptions.split(/\s+/).includes("trickle");
  }
  get remoteIsBundled() {
    return this.sdpManager.remoteIsBundled;
  }
  /**@private */
  get _localDescription() {
    return this.sdpManager._localDescription;
  }
  /**@private */
  get _remoteDescription() {
    return this.sdpManager._remoteDescription;
  }
  getTransceivers() {
    return this.transceiverManager.getTransceivers();
  }
  getSenders() {
    return this.transceiverManager.getSenders();
  }
  getReceivers() {
    return this.transceiverManager.getReceivers();
  }
  setConfiguration(config) {
    const normalizedConfig = normalizePeerConfiguration(config);
    const isReconfiguration = !!this.sdpManager;
    if (normalizedConfig.rtcpMuxPolicy && normalizedConfig.rtcpMuxPolicy !== "require") {
      throw new Error("rtcpMuxPolicy must be require");
    }
    if (normalizedConfig.iceCandidatePoolSize !== void 0 && (!Number.isInteger(normalizedConfig.iceCandidatePoolSize) || normalizedConfig.iceCandidatePoolSize < 0)) {
      throw new Error("iceCandidatePoolSize must be a non-negative integer");
    }
    if (isReconfiguration && normalizedConfig.bundlePolicy !== void 0 && normalizedConfig.bundlePolicy !== this.config.bundlePolicy) {
      throw new Error("bundlePolicy cannot be changed");
    }
    if (isReconfiguration && normalizedConfig.rtcpMuxPolicy !== void 0 && normalizedConfig.rtcpMuxPolicy !== this.config.rtcpMuxPolicy) {
      throw new Error("rtcpMuxPolicy cannot be changed");
    }
    if (isReconfiguration && normalizedConfig.certificates !== void 0 && !hasSameCertificates(
      normalizedConfig.certificates,
      this.config.certificates
    )) {
      throw new Error("certificates cannot be changed");
    }
    if (isReconfiguration && normalizedConfig.iceCandidatePoolSize !== void 0 && this.localDescription && normalizedConfig.iceCandidatePoolSize !== this.config.iceCandidatePoolSize) {
      throw new Error(
        "iceCandidatePoolSize cannot be changed after setLocalDescription"
      );
    }
    if ((normalizedConfig.iceCandidatePoolSize ?? 0) > 0) {
      throw new Error("iceCandidatePoolSize > 0 is not supported");
    }
    deepMerge(this.config, normalizedConfig);
    if (this.config.icePortRange) {
      const [min, max] = this.config.icePortRange;
      if (min === max) throw new Error("should not be same value");
      if (min >= max) throw new Error("The min must be less than max");
    }
    if (!Number.isInteger(this.config.maxMessageSize) || this.config.maxMessageSize < 0) {
      throw new Error("maxMessageSize must be a non-negative integer");
    }
    if (this.sctpManager?.sctpTransport) {
      this.sctpManager.sctpTransport.maxMessageSize = this.config.maxMessageSize;
    }
    for (const [i, codecParams] of enumerate2([
      ...this.config.codecs.audio || [],
      ...this.config.codecs.video || []
    ])) {
      if (codecParams.payloadType != void 0) {
        continue;
      }
      codecParams.payloadType = 96 + i;
      switch (codecParams.name.toLowerCase()) {
        case "rtx":
          {
            codecParams.parameters = `apt=${codecParams.payloadType - 1}`;
          }
          break;
        case "red":
          {
            if (codecParams.contentType === "audio") {
              const redundant = codecParams.payloadType + 1;
              codecParams.parameters = `${redundant}/${redundant}`;
              codecParams.payloadType = 63;
            }
          }
          break;
      }
    }
    [
      ...this.config.headerExtensions.audio || [],
      ...this.config.headerExtensions.video || []
    ].forEach((v, i) => {
      v.id = 1 + i;
    });
  }
  getConfiguration() {
    return clonePeerConfiguration(this.config);
  }
  async createOffer({ iceRestart } = {}) {
    if (iceRestart || this.needRestart) {
      this.needRestart = false;
      this.secureManager.restartIce();
    }
    await this.secureManager.ensureCerts();
    for (const transceiver of this.transceiverManager.getTransceivers()) {
      if (transceiver.codecs.length === 0) {
        this.transceiverManager.assignTransceiverCodecs(transceiver);
      }
      if (transceiver.headerExtensions.length === 0) {
        transceiver.headerExtensions = this.config.headerExtensions[transceiver.kind] ?? [];
      }
    }
    const description = this.sdpManager.buildOfferSdp(
      this.transceiverManager.getTransceivers(),
      this.sctpTransport
    );
    const createdOffer = description.toJSON();
    this.lastCreatedOffer = createdOffer;
    return createdOffer;
  }
  createSctpTransport() {
    const sctp = this.sctpManager.createSctpTransport(
      this.config.maxMessageSize
    );
    const dtlsTransport = this.findOrCreateTransport();
    sctp.setDtlsTransport(dtlsTransport);
    return sctp;
  }
  createDataChannel(label, options = {}) {
    if (!this.sctpTransport) {
      this.createSctpTransport();
      this.needNegotiation();
    }
    const channel = this.sctpManager.createDataChannel(label, options);
    if (!channel.sctp.dtlsTransport) {
      const dtlsTransport = this.findOrCreateTransport();
      channel.sctp.setDtlsTransport(dtlsTransport);
    }
    return channel;
  }
  removeTrack(sender) {
    if (this.isClosed) {
      throw createWebRtcDomException("InvalidStateError", "peer closed");
    }
    this.transceiverManager.removeTrack(sender);
    this.needNegotiation();
  }
  needNegotiation = async () => {
    this.invalidateLastCreatedDescriptions();
    this.shouldNegotiationneeded = true;
    if (this.negotiationneeded || this.signalingState !== "stable") {
      return;
    }
    this.shouldNegotiationneeded = false;
    setImmediate(() => {
      this.negotiationneeded = true;
      this.onNegotiationneeded.execute();
      if (this.onnegotiationneeded) {
        this.onnegotiationneeded(new globalThis.Event("negotiationneeded"));
      }
      this.emit("negotiationneeded");
    });
  };
  invalidateLastCreatedDescriptions() {
    this.lastCreatedAnswer = void 0;
    this.lastCreatedOffer = void 0;
  }
  async waitForPendingDescriptionTask() {
    this.assertNotClosed();
    await Promise.resolve();
    if (this.isClosed) {
      await new Promise(() => void 0);
    }
  }
  findOrCreateTransport() {
    const existingDtlsTransport = this.dtlsTransports.find(
      (transport) => transport.state !== "closed"
    );
    const existing = existingDtlsTransport?.iceTransport;
    if (this.sdpManager.bundlePolicy === "max-bundle" || this.sdpManager.bundlePolicy !== "disable" && this.remoteIsBundled) {
      if (existingDtlsTransport) {
        return existingDtlsTransport;
      }
    }
    const dtlsTransport = this.secureManager.createTransport();
    dtlsTransport.onRtp.subscribe((rtp) => {
      this.router.routeRtp(rtp);
    });
    dtlsTransport.onRtcp.subscribe((rtcp) => {
      this.router.routeRtcp(rtcp);
    });
    const iceTransport = dtlsTransport.iceTransport;
    iceTransport.onNegotiationNeeded.subscribe(() => {
      this.needNegotiation();
    });
    iceTransport.onIceCandidate.subscribe((candidate) => {
      if (!this.localDescription) {
        log37("localDescription not found when ice candidate was gathered");
        return;
      }
      if (!candidate) {
        this.sdpManager.setLocal(
          this._localDescription,
          this.transceiverManager.getTransceivers(),
          this.sctpTransport
        );
        this.onIceCandidate.execute(void 0);
        if (this.onicecandidate) {
          this.onicecandidate({ candidate: void 0 });
        }
        this.emit("icecandidate", { candidate: void 0 });
        return;
      }
      if (!this._localDescription) {
        log37("localDescription not found when ice candidate was gathered");
        return;
      }
      this.secureManager.handleNewIceCandidate({
        candidate,
        bundlePolicy: this.sdpManager.bundlePolicy,
        remoteIsBundled: !!this.sdpManager.remoteIsBundled,
        media: this._localDescription.media[0],
        transceiver: this.transceiverManager.getTransceivers().find((t) => t?.dtlsTransport?.iceTransport.id === iceTransport.id),
        sctpTransport: this.sctpTransport?.dtlsTransport.iceTransport.id === iceTransport.id ? this.sctpTransport : void 0
      });
    });
    return dtlsTransport;
  }
  async setLocalDescription(sessionDescription) {
    const implicitOfferState = [
      "stable",
      "have-local-offer",
      "have-remote-pranswer"
    ];
    await this.waitForPendingDescriptionTask();
    if (sessionDescription?.type === "rollback") {
      this.sdpManager.rollbackLocalDescription(this.signalingState);
      this.setSignalingState("stable");
      if (this.shouldNegotiationneeded) {
        this.needNegotiation();
      }
      this.invalidateLastCreatedDescriptions();
      return;
    }
    const needsGeneratedDescription = !sessionDescription?.type || !sessionDescription.sdp || sessionDescription.sdp.length === 0;
    const generatedDescription = needsGeneratedDescription ? sessionDescription?.type === "offer" ? this.lastCreatedOffer ?? await this.createOffer() : sessionDescription?.type === "answer" || sessionDescription?.type === "pranswer" ? this.lastCreatedAnswer ?? await this.createAnswer() : implicitOfferState.includes(this.signalingState) ? this.lastCreatedOffer ?? await this.createOffer() : this.lastCreatedAnswer ?? await this.createAnswer() : void 0;
    sessionDescription = {
      type: sessionDescription?.type ?? generatedDescription.type,
      sdp: sessionDescription?.sdp && sessionDescription.sdp.length > 0 ? sessionDescription.sdp : generatedDescription.sdp
    };
    if (sessionDescription.type === "offer" && this.lastCreatedOffer && sessionDescription.sdp !== this.lastCreatedOffer.sdp) {
      throw createWebRtcDomException(
        "InvalidModificationError",
        "setLocalDescription must use the latest created offer"
      );
    }
    const descriptionType = sessionDescription.type;
    const descriptionSdp = sessionDescription.sdp;
    const description = this.sdpManager.parseSdp({
      sdp: descriptionSdp,
      isLocal: true,
      signalingState: this.signalingState,
      type: descriptionType
    });
    if (description.type === "offer") {
      this.setSignalingState("have-local-offer");
    } else if (description.type === "answer") {
      this.setSignalingState("stable");
    } else if (description.type === "pranswer") {
      this.setSignalingState("have-local-pranswer");
    }
    for (const [i, media] of enumerate2(description.media)) {
      const mid = media.rtp.muxId;
      this.sdpManager.registerMid(mid);
      if (["audio", "video"].includes(media.kind)) {
        const transceiver = this.transceiverManager.getTransceiverByMLineIndex(i);
        if (transceiver) {
          transceiver.mid = mid;
        }
      }
      if (media.kind === "application" && this.sctpTransport) {
        this.sctpTransport.mid = mid;
      }
    }
    const role = description.media.find((media) => media.dtlsParams)?.dtlsParams?.role;
    this.secureManager.setLocalRole({
      type: description.type === "offer" ? "offer" : "answer",
      role
    });
    if (["answer", "pranswer"].includes(description.type)) {
      for (const t of this.transceiverManager.getTransceivers()) {
        const direction = andDirection(t.direction, t.offerDirection);
        t.setCurrentDirection(direction);
      }
    }
    this.sdpManager.setLocal(
      description,
      this.transceiverManager.getTransceivers(),
      this.sctpTransport
    );
    await this.gatherCandidates().catch((e) => {
      log37("gatherCandidates failed", e);
    });
    if (description.type === "answer") {
      this.connect().catch((err5) => {
        log37("connect failed", err5);
        this.secureManager.setConnectionState("failed");
      });
    }
    this.sdpManager.setLocal(
      description,
      this.transceiverManager.getTransceivers(),
      this.sctpTransport
    );
    if (this.shouldNegotiationneeded) {
      this.needNegotiation();
    }
    this.invalidateLastCreatedDescriptions();
    return description;
  }
  async gatherCandidates() {
    await this.secureManager.gatherCandidates(
      !!this.sdpManager.remoteIsBundled
    );
  }
  async addIceCandidate(candidateMessage = {}) {
    if (this.isClosed) {
      throw createWebRtcDomException("InvalidStateError", "is closed");
    }
    if (!this.remoteDescription || !this.sdpManager._remoteDescription) {
      this.pendingRemoteCandidates.push(candidateMessage);
      return;
    }
    await this.applyRemoteIceCandidate(candidateMessage);
  }
  async applyRemoteIceCandidate(candidateMessage) {
    const sdp = this.sdpManager._remoteDescription;
    if (!sdp) {
      return;
    }
    const appliedCandidate = await this.secureManager.addIceCandidate(
      sdp,
      candidateMessage
    );
    const remoteDescription = this.sdpManager._remoteDescription;
    if (!remoteDescription || !appliedCandidate) {
      return;
    }
    if (appliedCandidate.kind === "end-of-candidates") {
      for (const mediaIndex of appliedCandidate.mediaIndices) {
        const media = remoteDescription.media[mediaIndex];
        if (media) {
          media.iceCandidatesComplete = true;
        }
      }
      return;
    }
    for (const mediaIndex of appliedCandidate.mediaIndices) {
      const media = remoteDescription.media[mediaIndex];
      if (!media) {
        continue;
      }
      media.iceCandidates.push(appliedCandidate.candidate);
    }
  }
  async flushPendingRemoteCandidates() {
    while (this.pendingRemoteCandidates.length > 0 && this.remoteDescription && this.sdpManager._remoteDescription) {
      const candidate = this.pendingRemoteCandidates.shift();
      await this.applyRemoteIceCandidate(candidate ?? null);
    }
  }
  async connect() {
    log37("start connect");
    const res = await Promise.allSettled(
      this.dtlsTransports.map(async (dtlsTransport) => {
        const { iceTransport } = dtlsTransport;
        if (iceTransport.state === "connected") {
          return;
        }
        const checkDtlsConnected = () => dtlsTransport.state === "connected";
        if (checkDtlsConnected()) {
          return;
        }
        this.secureManager.setConnectionState("connecting");
        await iceTransport.start().catch((err5) => {
          log37("iceTransport.start failed", err5);
          throw err5;
        });
        if (checkDtlsConnected()) {
          return;
        }
        await dtlsTransport.start().catch((err5) => {
          log37("dtlsTransport.start failed", err5);
          throw err5;
        });
        if (this.sctpTransport && this.sctpTransport.dtlsTransport.id === dtlsTransport.id) {
          await this.sctpManager.connectSctp();
        }
      })
    );
    if (res.find((r) => r.status === "rejected")) {
      this.secureManager.setConnectionState("failed");
    } else {
      this.secureManager.setConnectionState("connected");
    }
  }
  restartIce() {
    this.needRestart = true;
    this.needNegotiation();
  }
  async setRemoteDescription(sessionDescription) {
    if (sessionDescription instanceof SessionDescription) {
      sessionDescription = sessionDescription.toSdp();
    }
    await this.waitForPendingDescriptionTask();
    const needsImplicitLocalRollback = sessionDescription.type === "offer" && ["have-local-offer", "have-local-pranswer"].includes(this.signalingState);
    if (needsImplicitLocalRollback) {
      this.sdpManager.rollbackLocalDescription(this.signalingState);
      this.shouldNegotiationneeded = true;
      this.setSignalingState("stable");
      await Promise.resolve();
    }
    const remoteSdp = this.sdpManager.setRemoteDescription(
      sessionDescription,
      this.signalingState
    );
    if (!remoteSdp) {
      this.setSignalingState("stable");
      if (this.shouldNegotiationneeded) {
        this.needNegotiation();
      }
      this.invalidateLastCreatedDescriptions();
      return;
    }
    let bundleTransport;
    const matchTransceiverWithMedia = (transceiver, media) => transceiver.kind === media.kind && [null, media.rtp.muxId].includes(transceiver.mid);
    let transports = remoteSdp.media.map((remoteMedia, i) => {
      let dtlsTransport;
      if (["audio", "video"].includes(remoteMedia.kind)) {
        let transceiver = this.transceiverManager.getTransceivers().find((t) => matchTransceiverWithMedia(t, remoteMedia));
        if (!transceiver) {
          transceiver = this.addTransceiver(remoteMedia.kind, {
            direction: "recvonly"
          });
          transceiver.mid = remoteMedia.rtp.muxId ?? null;
          this.onRemoteTransceiverAdded.execute(transceiver);
        } else {
          if (transceiver.direction === "inactive" && transceiver.stopping) {
            transceiver.stopped = true;
            if (sessionDescription.type === "answer") {
              transceiver.setCurrentDirection("inactive");
            }
            return;
          }
        }
        if (this.sdpManager.remoteIsBundled) {
          if (!bundleTransport) {
            bundleTransport = transceiver.dtlsTransport;
          } else {
            transceiver.setDtlsTransport(bundleTransport);
          }
        }
        dtlsTransport = transceiver.dtlsTransport;
        this.transceiverManager.setRemoteRTP(
          transceiver,
          remoteMedia,
          remoteSdp.type,
          i
        );
      } else if (remoteMedia.kind === "application") {
        let sctpTransport = this.sctpTransport;
        if (!sctpTransport) {
          sctpTransport = this.createSctpTransport();
          sctpTransport.mid = remoteMedia.rtp.muxId;
        }
        if (this.sdpManager.remoteIsBundled) {
          if (!bundleTransport) {
            bundleTransport = sctpTransport.dtlsTransport;
          } else {
            sctpTransport.setDtlsTransport(bundleTransport);
          }
        }
        dtlsTransport = sctpTransport.dtlsTransport;
        this.sctpManager.setRemoteSCTP(remoteMedia, i);
      } else {
        throw new Error("invalid media kind");
      }
      const iceTransport = dtlsTransport.iceTransport;
      if (remoteMedia.iceParams) {
        const renomination = !!this.sdpManager.inactiveRemoteMedia;
        iceTransport.setRemoteParams(remoteMedia.iceParams, renomination);
        if (remoteMedia.iceParams.iceLite && !iceTransport.connection.iceLite) {
          iceTransport.connection.iceControlling = true;
        }
      }
      if (remoteMedia.dtlsParams) {
        dtlsTransport.setRemoteParams(remoteMedia.dtlsParams);
      }
      remoteMedia.iceCandidates.forEach(iceTransport.addRemoteCandidate);
      if (remoteMedia.iceCandidatesComplete) {
        iceTransport.addRemoteCandidate(void 0);
      }
      if (remoteSdp.type === "answer" && remoteMedia.dtlsParams?.role) {
        dtlsTransport.role = remoteMedia.dtlsParams.role === "client" ? "server" : "client";
      }
      return iceTransport;
    });
    transports = transports.filter((iceTransport) => !!iceTransport);
    const removedTransceivers = this.transceiverManager.getTransceivers().filter(
      (t) => remoteSdp.media.find((m) => matchTransceiverWithMedia(t, m)) == void 0
    );
    if (sessionDescription.type === "answer") {
      for (const transceiver of removedTransceivers) {
        transceiver.stop();
        transceiver.stopped = true;
      }
    }
    if (remoteSdp.type === "offer") {
      this.setSignalingState("have-remote-offer");
    } else if (remoteSdp.type === "answer") {
      this.setSignalingState("stable");
    } else if (remoteSdp.type === "pranswer") {
      this.setSignalingState("have-remote-pranswer");
    }
    await this.flushPendingRemoteCandidates();
    if (remoteSdp.type === "answer") {
      log37("caller start connect");
      this.connect().catch((err5) => {
        log37("connect failed", err5);
        this.secureManager.setConnectionState("failed");
      });
    }
    this.negotiationneeded = false;
    if (this.shouldNegotiationneeded) {
      this.needNegotiation();
    }
    this.invalidateLastCreatedDescriptions();
  }
  addTransceiver(trackOrKind, options = {}) {
    const dtlsTransport = this.findOrCreateTransport();
    const transceiver = this.transceiverManager.addTransceiver(
      trackOrKind,
      dtlsTransport,
      options
    );
    this.secureManager.updateIceConnectionState();
    this.needNegotiation();
    return transceiver;
  }
  // todo fix
  addTrack(track, ...streams) {
    if (this.isClosed) {
      throw createWebRtcDomException("InvalidStateError", "is closed");
    }
    const transceiver = this.transceiverManager.addTrack(track, streams);
    if (!transceiver.dtlsTransport) {
      const dtlsTransport = this.findOrCreateTransport();
      transceiver.setDtlsTransport(dtlsTransport);
    }
    this.needNegotiation();
    return transceiver.sender;
  }
  async createAnswer() {
    this.assertNotClosed();
    await this.secureManager.ensureCerts();
    const description = this.sdpManager.buildAnswerSdp({
      transceivers: this.transceiverManager.getTransceivers(),
      sctpTransport: this.sctpTransport,
      signalingState: this.signalingState
    });
    const createdAnswer = description.toJSON();
    this.lastCreatedAnswer = createdAnswer;
    return createdAnswer;
  }
  assertNotClosed() {
    if (this.isClosed) {
      throw createWebRtcDomException(
        "InvalidStateError",
        "RTCPeerConnection is closed"
      );
    }
  }
  setSignalingState(state) {
    if (this.signalingState === state) {
      return;
    }
    log37("signalingStateChange", state);
    this.signalingState = state;
    this.signalingStateChange.execute(state);
    if (this.onsignalingstatechange) {
      this.onsignalingstatechange(new globalThis.Event("signalingstatechange"));
    }
    this.emit("signalingstatechange");
  }
  createPeerConnectionStats(timestamp) {
    return {
      type: "peer-connection",
      id: generateStatsId("peer-connection", this.id),
      timestamp,
      dataChannelsOpened: this.sctpManager.dataChannelsOpened,
      dataChannelsClosed: this.sctpManager.dataChannelsClosed
    };
  }
  async getStats(selector) {
    const timestamp = getStatsTimestamp();
    const stats = [];
    if (!selector) {
      stats.push(this.createPeerConnectionStats(timestamp));
    }
    stats.push(...this.transceiverManager.collectStats(timestamp));
    const transportStats = await this.secureManager.getStats(timestamp);
    stats.push(...transportStats);
    if (!selector && this.sctpTransport) {
      const dataChannelStats = await this.sctpManager.getStats(timestamp);
      if (dataChannelStats) {
        stats.push(...dataChannelStats);
      }
    }
    if (!selector) {
      return buildStatsReport(stats);
    }
    return buildStatsReport(
      stats,
      this.transceiverManager.getStatsRootIds(selector)
    );
  }
  async close() {
    if (this.isClosed) return;
    this.isClosed = true;
    this.pendingRemoteCandidates.length = 0;
    this.setSignalingState("closed");
    this.transceiverManager.close();
    await this.secureManager.close();
    await this.sctpManager.close();
    this.completePeerEvents();
    log37("peerConnection closed");
  }
  completePeerEvents() {
    const events = [
      this.onDataChannel,
      this.iceGatheringStateChange,
      this.iceConnectionStateChange,
      this.signalingStateChange,
      this.connectionStateChange,
      this.onTransceiverAdded,
      this.onRemoteTransceiverAdded,
      this.onIceCandidate,
      this.onNegotiationneeded
    ];
    for (const event of events) {
      if (!event.ended) {
        event.complete();
      }
    }
  }
};
var findCodecByMimeType = (codecs, target) => codecs.find(
  (localCodec) => localCodec.mimeType.toLowerCase() === target.mimeType.toLowerCase()
) ? target : void 0;
function generateDefaultPeerConfig() {
  return {
    codecs: {
      audio: [useOPUS(), usePCMU()],
      video: [useVP8()]
    },
    headerExtensions: {
      audio: [],
      video: []
    },
    iceTransportPolicy: "all",
    iceLite: false,
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    icePortRange: void 0,
    iceInterfaceAddresses: void 0,
    iceAdditionalHostAddresses: void 0,
    iceUseIpv4: true,
    iceUseIpv6: true,
    iceUseTcp: false,
    turnTransport: void 0,
    turnTlsOptions: void 0,
    iceFilterStunResponse: void 0,
    iceFilterCandidatePair: void 0,
    icePasswordPrefix: void 0,
    iceUseLinkLocalAddress: void 0,
    dtls: {},
    bundlePolicy: "max-compat",
    rtcpMuxPolicy: "require",
    iceCandidatePoolSize: 0,
    certificates: [],
    debug: {},
    midSuffix: false,
    forceTurnTCP: false,
    maxMessageSize: DEFAULT_MAX_MESSAGE_SIZE
  };
}
var defaultPeerConfig = generateDefaultPeerConfig();
function normalizePeerConfiguration(config) {
  const input = Object(config ?? {});
  const normalizedConfig = { ...input };
  if (input.bundlePolicy === "balanced") {
    normalizedConfig.bundlePolicy = "max-compat";
  }
  if ("certificates" in input) {
    if (input.certificates === void 0) {
      normalizedConfig.certificates = void 0;
    } else if (!Array.isArray(input.certificates) || input.certificates.some((certificate) => certificate == null)) {
      throw createWebRtcTypeError(
        "certificates must be an array of RTCCertificate"
      );
    } else {
      normalizedConfig.certificates = [...input.certificates];
    }
  }
  if ("iceCandidatePoolSize" in input) {
    normalizedConfig.iceCandidatePoolSize = coerceUnsignedShort(
      input.iceCandidatePoolSize,
      "iceCandidatePoolSize"
    );
  }
  return normalizedConfig;
}
function coerceUnsignedShort(value, name) {
  const coerced = Number(value);
  if (!Number.isFinite(coerced) || !Number.isInteger(coerced) || coerced < 0 || coerced > 65535) {
    throw createWebRtcTypeError(`${name} must be an unsigned short`);
  }
  return coerced;
}
function hasSameCertificates(left, right) {
  return left.length === right.length && left.every((certificate, index) => certificate === right[index]);
}
function clonePeerConfiguration(config) {
  return {
    ...config,
    codecs: {
      audio: config.codecs.audio ? [...config.codecs.audio] : void 0,
      video: config.codecs.video ? [...config.codecs.video] : void 0
    },
    headerExtensions: {
      audio: config.headerExtensions.audio ? [...config.headerExtensions.audio] : void 0,
      video: config.headerExtensions.video ? [...config.headerExtensions.video] : void 0
    },
    iceServers: config.iceServers.map((server) => ({
      ...server,
      urls: Array.isArray(server.urls) ? [...server.urls] : server.urls
    })),
    icePortRange: config.icePortRange ? [...config.icePortRange] : void 0,
    iceAdditionalHostAddresses: config.iceAdditionalHostAddresses ? [...config.iceAdditionalHostAddresses] : void 0,
    dtls: { ...config.dtls },
    certificates: [...config.certificates],
    debug: { ...config.debug }
  };
}
var RTCTrackEvent = class {
  type = "track";
  track;
  streams;
  transceiver;
  receiver;
  constructor(init) {
    this.track = init.track;
    this.streams = [...init.streams];
    this.transceiver = init.transceiver;
    this.receiver = init.receiver;
  }
};

// src/transceiverManager.ts
var log38 = debug("werift:packages/webrtc/src/media/rtpTransceiverManager.ts");
var TransceiverManager = class {
  constructor(cname, config, router) {
    this.cname = cname;
    this.config = config;
    this.router = router;
  }
  transceivers = [];
  onTransceiverAdded = new Event2();
  onRemoteTransceiverAdded = new Event2();
  onTrack = new Event2();
  onNegotiationNeeded = new Event2();
  getTransceivers() {
    return this.transceivers;
  }
  getSenders() {
    return this.getTransceivers().map((t) => t.sender);
  }
  getReceivers() {
    return this.getTransceivers().map((t) => t.receiver);
  }
  getTransceiverByMLineIndex(index) {
    return this.transceivers.find(
      (transceiver) => transceiver.mLineIndex === index
    );
  }
  pushTransceiver(t) {
    this.transceivers.push(t);
  }
  replaceTransceiver(t, index) {
    this.transceivers[index] = t;
  }
  addTransceiver(trackOrKind, dtlsTransport, options = {}) {
    const kind = typeof trackOrKind === "string" ? trackOrKind : trackOrKind.kind;
    const direction = options.direction || "sendrecv";
    const sender = new RTCRtpSender(trackOrKind);
    const receiver = new RTCRtpReceiver(this.config, kind, sender.ssrc);
    const newTransceiver = new RTCRtpTransceiver(
      kind,
      dtlsTransport,
      receiver,
      sender,
      direction
    );
    newTransceiver.options = options;
    newTransceiver.sender.setStreams(options.streams ?? []);
    newTransceiver.sender.setSendEncodings(
      (options.sendEncodings ?? []).map((encoding) => ({ ...encoding }))
    );
    this.router.registerRtpSender(newTransceiver.sender);
    const inactiveTransceiverIndex = this.transceivers.findIndex(
      (t) => t.currentDirection === "inactive" && !t.usedForSender
    );
    const inactiveTransceiver = this.transceivers.find(
      (t) => t.currentDirection === "inactive" && !t.usedForSender
    );
    if (inactiveTransceiverIndex > -1 && inactiveTransceiver) {
      this.replaceTransceiver(newTransceiver, inactiveTransceiverIndex);
      newTransceiver.mLineIndex = inactiveTransceiver.mLineIndex;
      newTransceiver.mid = inactiveTransceiver.mid;
      inactiveTransceiver.setCurrentDirection(void 0);
    } else {
      this.pushTransceiver(newTransceiver);
    }
    this.onTransceiverAdded.execute(newTransceiver);
    return newTransceiver;
  }
  addTrack(track, streams = []) {
    if (this.getSenders().find((sender) => sender.track?.uuid === track.uuid)) {
      throw createWebRtcDomException(
        "InvalidAccessError",
        "Track already added"
      );
    }
    const emptyTrackSenderTransceiver = this.transceivers.find(
      (t) => t.sender.track == void 0 && t.kind === track.kind && SenderDirections.includes(t.direction) === true
    );
    if (emptyTrackSenderTransceiver) {
      const sender = emptyTrackSenderTransceiver.sender;
      sender.setStreams(streams);
      sender.registerTrack(track);
      emptyTrackSenderTransceiver.options = {
        ...emptyTrackSenderTransceiver.options,
        streams
      };
      return emptyTrackSenderTransceiver;
    }
    const notSendTransceiver = this.transceivers.find(
      (t) => t.sender.track == void 0 && t.kind === track.kind && SenderDirections.includes(t.direction) === false && !t.usedForSender
    );
    if (notSendTransceiver) {
      const sender = notSendTransceiver.sender;
      sender.setStreams(streams);
      sender.registerTrack(track);
      notSendTransceiver.options = {
        ...notSendTransceiver.options,
        streams
      };
      switch (notSendTransceiver.direction) {
        case "recvonly":
          notSendTransceiver.setDirection("sendrecv");
          break;
        case "inactive":
          notSendTransceiver.setDirection("sendonly");
          break;
      }
      return notSendTransceiver;
    } else {
      const transceiver = this.addTransceiver(track, void 0, {
        direction: "sendrecv",
        streams
      });
      return transceiver;
    }
  }
  removeTrack(sender) {
    if (!this.getSenders().find(({ ssrc }) => sender.ssrc === ssrc)) {
      throw createWebRtcDomException(
        "InvalidAccessError",
        "Sender does not exist"
      );
    }
    const transceiver = this.transceivers.find(
      ({ sender: { ssrc } }) => sender.ssrc === ssrc
    );
    if (!transceiver) throw new Error("No matching transceiver found");
    if (transceiver.stopping || transceiver.stopped) {
      return;
    }
    sender.stop();
    if (["recvonly", "inactive"].includes(transceiver.currentDirection ?? "")) {
      this.onNegotiationNeeded.execute();
      return;
    }
    if (transceiver.direction === "sendrecv") {
      transceiver.setDirection("recvonly");
    } else if (transceiver.direction === "sendonly" || transceiver.direction === "recvonly") {
      transceiver.setDirection("inactive");
    }
  }
  assignTransceiverCodecs(transceiver) {
    const codecs = this.config.codecs[transceiver.kind].filter((codecCandidate) => {
      switch (codecCandidate.direction) {
        case "recvonly": {
          if (ReceiverDirection.includes(transceiver.direction)) return true;
          return false;
        }
        case "sendonly": {
          if (SenderDirections.includes(transceiver.direction)) return true;
          return false;
        }
        case "sendrecv": {
          if ([Sendrecv, Recvonly, Sendonly].includes(transceiver.direction))
            return true;
          return false;
        }
        case "all": {
          return true;
        }
        default:
          return false;
      }
    });
    transceiver.codecs = codecs;
  }
  getLocalRtpParams(transceiver) {
    if (transceiver.mid == void 0) throw new Error("mid not assigned");
    const rtp = {
      codecs: transceiver.codecs,
      muxId: transceiver.mid,
      headerExtensions: transceiver.headerExtensions,
      rtcp: { cname: this.cname, ssrc: transceiver.sender.ssrc, mux: true }
    };
    return rtp;
  }
  getRemoteRtpParams(media, transceiver) {
    const receiveParameters = {
      muxId: media.rtp.muxId,
      rtcp: media.rtp.rtcp,
      codecs: transceiver.codecs,
      headerExtensions: transceiver.headerExtensions,
      encodings: Object.values(
        transceiver.codecs.reduce(
          (acc, codec) => {
            if (codec.name.toLowerCase() === "rtx") {
              const params = codecParametersFromString(codec.parameters ?? "");
              const apt = acc[params["apt"]];
              if (apt && media.ssrc.length === 2) {
                apt.rtx = new RTCRtpRtxParameters({ ssrc: media.ssrc[1].ssrc });
              }
              return acc;
            }
            acc[codec.payloadType] = new RTCRtpCodingParameters({
              ssrc: media.ssrc[0]?.ssrc,
              payloadType: codec.payloadType
            });
            return acc;
          },
          {}
        )
      )
    };
    return receiveParameters;
  }
  setRemoteRTP(transceiver, remoteMedia, type, mLineIndex) {
    if (!transceiver.mid) {
      transceiver.mid = remoteMedia.rtp.muxId ?? null;
    }
    transceiver.mLineIndex = mLineIndex;
    transceiver.codecs = remoteMedia.rtp.codecs.filter((remoteCodec) => {
      const localCodecs = this.config.codecs[remoteMedia.kind] || [];
      const existCodec = findCodecByMimeType(localCodecs, remoteCodec);
      if (!existCodec) {
        return false;
      }
      if (existCodec?.name.toLowerCase() === "rtx") {
        const params = codecParametersFromString(existCodec.parameters ?? "");
        const pt = params["apt"];
        const origin = remoteMedia.rtp.codecs.find((c) => c.payloadType === pt);
        if (!origin) {
          return false;
        }
        return !!findCodecByMimeType(localCodecs, origin);
      }
      return true;
    });
    log38("negotiated codecs", transceiver.codecs);
    if (transceiver.codecs.length === 0) {
      throw new Error("negotiate codecs failed.");
    }
    transceiver.headerExtensions = remoteMedia.rtp.headerExtensions.filter(
      (extension) => (this.config.headerExtensions[remoteMedia.kind] || []).find((v) => v.uri === extension.uri)
    );
    const mediaDirection = remoteMedia.direction ?? "inactive";
    const direction = reverseDirection(mediaDirection);
    if (["answer", "pranswer"].includes(type)) {
      transceiver.setCurrentDirection(direction);
    } else {
      transceiver.offerDirection = direction;
    }
    const localParams = this.getLocalRtpParams(transceiver);
    transceiver.sender.prepareSend(localParams);
    if (["recvonly", "sendrecv"].includes(transceiver.direction)) {
      const remotePrams = this.getRemoteRtpParams(remoteMedia, transceiver);
      for (const param of remoteMedia.simulcastParameters) {
        this.router.registerRtpReceiverByRid(transceiver, param, remotePrams);
      }
      transceiver.receiver.prepareReceive(remotePrams);
      this.router.registerRtpReceiverBySsrc(transceiver, remotePrams);
    }
    if (remoteMedia.port !== 0 && ["sendonly", "sendrecv"].includes(mediaDirection)) {
      const remoteStreamIds = [
        ...new Set(remoteMedia.msids.map((msid) => msid.split(" ")[0]))
      ];
      const remoteTrackId = remoteMedia.msids[0]?.split(" ")[1];
      transceiver.receiver.remoteStreamId = remoteStreamIds[0];
      transceiver.receiver.remoteStreamIds = remoteStreamIds;
      transceiver.receiver.remoteTrackId = remoteTrackId;
      this.onTrack.execute({
        track: transceiver.receiver.track,
        transceiver,
        streams: remoteStreamIds.map(
          (id) => new MediaStream({
            id,
            tracks: [transceiver.receiver.track]
          })
        )
      });
    }
    if (remoteMedia.ssrc[0]?.ssrc) {
      transceiver.receiver.setupTWCC(remoteMedia.ssrc[0].ssrc);
    }
  }
  collectStats(timestamp) {
    const stats = [];
    for (const transceiver of this.transceivers) {
      if (transceiver.sender) {
        stats.push(...transceiver.sender.collectStats(timestamp));
      }
      if (transceiver.receiver) {
        stats.push(...transceiver.receiver.collectStats(timestamp));
      }
      const codecStats = transceiver.collectCodecStats(timestamp);
      if (codecStats) {
        stats.push(...codecStats);
      }
    }
    return stats;
  }
  getStatsRootIds(selector) {
    if (!selector) {
      return [];
    }
    const rootIds = [];
    for (const transceiver of this.transceivers) {
      if (transceiver.sender.track === selector) {
        rootIds.push(...transceiver.sender.getStatsRootIds());
      }
      if (transceiver.receiver.tracks.includes(selector)) {
        rootIds.push(...transceiver.receiver.getStatsRootIds(selector));
      }
    }
    return rootIds;
  }
  /**
   * 全トランシーバーのreceiver/senderのstopを呼ぶcloseメソッド
   */
  close() {
    for (const transceiver of this.transceivers) {
      transceiver.forceStop();
    }
    this.onTransceiverAdded.allUnsubscribe();
    this.onRemoteTransceiverAdded.allUnsubscribe();
    this.onTrack.allUnsubscribe();
    this.onNegotiationNeeded.allUnsubscribe();
  }
};

// src/types/domain.ts
var SignalingStates = [
  "stable",
  "have-local-offer",
  "have-remote-offer",
  "have-local-pranswer",
  "have-remote-pranswer",
  "closed"
];
var ConnectionStates = [
  "closed",
  "failed",
  "disconnected",
  "new",
  "connecting",
  "connected"
];
export {
  AV1Obu,
  AV1RtpPayload,
  AttributeKeys,
  BitStream,
  BitWriter,
  BitWriter2,
  BufferChain,
  CONSENT_FAILURES,
  CONSENT_INTERVAL,
  CONSENT_RESPONSE_TIMEOUT,
  CONSENT_RESPONSE_TIMEOUT_MIN,
  CONSENT_TIMEOUT,
  COOKIE,
  Candidate,
  CandidatePair,
  CandidatePairState,
  CipherContext,
  CipherSuite,
  CipherSuiteList,
  Connection,
  ConnectionStates,
  CurveType,
  DEFAULT_MAX_MESSAGE_SIZE,
  DePacketizerBase,
  Directions,
  DtlsClient,
  DtlsServer,
  DtlsSocket,
  DtlsStates,
  Event2 as Event,
  EventDisposer,
  ExtensionProfiles,
  FINGERPRINT_LENGTH,
  FINGERPRINT_XOR,
  GenericNack,
  GroupDescription,
  H264RtpPayload,
  HEADER_LENGTH,
  HashAlgorithm,
  ICE_COMPLETED,
  ICE_FAILED,
  INTEGRITY_LENGTH,
  IPV4_PROTOCOL,
  IPV6_PROTOCOL,
  IceCandidate,
  IceGathererStates,
  IceTransportStates,
  Inactive,
  Int,
  MediaDescription,
  MediaStream,
  MediaStreamTrack,
  MediaStreamTrackFactory,
  Message,
  NalUnitType,
  NamedCurveAlgorithm,
  NamedCurveAlgorithmList,
  OpusRtpPayload,
  PacketChunk,
  PacketResult,
  PacketStatus,
  PictureLossIndication,
  Profiles,
  PromiseQueue,
  ProtectionProfileAeadAes128Gcm,
  ProtectionProfileAes128CmHmacSha1_80,
  RETRY_MAX,
  RETRY_RTO,
  RTCCertificate,
  RTCDataChannel,
  RTCDataChannelParameters,
  RTCDtlsFingerprint,
  RTCDtlsParameters,
  RTCDtlsTransport,
  RTCIceCandidate,
  RTCIceGatherer,
  RTCIceParameters,
  RTCIceTransport,
  RTCP_HEADER_SIZE,
  RTCPeerConnection,
  RTCRtcpFeedback,
  RTCRtcpParameters,
  RTCRtpCodecParameters,
  RTCRtpCodingParameters,
  RTCRtpHeaderExtensionParameters,
  RTCRtpReceiver,
  RTCRtpRtxParameters,
  RTCRtpSender,
  RTCRtpSimulcastParameters,
  RTCRtpTransceiver,
  RTCSctpCapabilities2 as RTCSctpCapabilities,
  RTCSctpTransport,
  RTCSessionDescription,
  RTCStatsReport,
  RTCTrackEvent,
  RTP_EXTENSION_URI,
  ReceiverEstimatedMaxBitrate,
  RecvDelta,
  Recvonly,
  Red,
  RedEncoder,
  RedHandler,
  RedHeader,
  RtcpHeader,
  RtcpPacketConverter,
  RtcpPayloadSpecificFeedback,
  RtcpReceiverInfo,
  RtcpRrPacket,
  RtcpSenderInfo,
  RtcpSourceDescriptionPacket,
  RtcpSrPacket,
  RtcpTransportLayerFeedback,
  RtpBuilder,
  RtpHeader,
  RtpPacket,
  RtpRouter,
  RunLengthChunk,
  SDPManager,
  Sendonly,
  Sendrecv,
  SessionDescription,
  SignalingStates,
  SignatureAlgorithm,
  SignatureScheme,
  SourceDescriptionChunk,
  SourceDescriptionItem,
  SrtcpSession,
  SrtpAuthenticationError,
  SrtpContext,
  SrtpSession,
  SsrcDescription,
  StatusVectorChunk,
  StunOverTurnProtocol,
  StunProtocol,
  TcpActiveProtocol,
  TcpPassiveProtocol,
  TcpTransport,
  TlsTransport,
  TransceiverManager,
  TransportWideCC,
  TurnProtocol,
  UdpTransport,
  Vp8RtpPayload,
  Vp9RtpPayload,
  WeriftError,
  addSDPHeader,
  andDirection,
  buffer2ArrayBuffer,
  bufferArrayXor,
  bufferReader,
  bufferWriter,
  bufferWriterLE,
  bufferXor,
  buildStatsReport,
  candidateFoundation,
  candidateFromIce,
  candidateFromSdp,
  candidateLocalPreference,
  candidatePairPriority,
  candidatePriority,
  candidateToIce,
  candidateToSdp,
  certificateTypes,
  classes,
  codecParametersFromString,
  codecParametersToString,
  compactNtp,
  consentResponseTimeoutMs,
  crc32,
  crc32c,
  createBufferWriter,
  createSelfSignedCertificate,
  createStunOverTurnClient,
  createTurnClient,
  dePacketizeRtpPackets,
  debug,
  deepMerge,
  defaultOptions,
  defaultPeerConfig,
  depacketizerCodecs,
  deserializeAbsSendTime,
  deserializeAudioLevelIndication,
  deserializeString,
  deserializeUint16BE,
  deserializeVideoOrientation,
  dumpBuffer,
  encodeTcpFrame,
  enumerate,
  findCodecByMimeType,
  findPort,
  fingerprint,
  generateCodecStatsId,
  generateStatsId,
  getBit,
  getDataChannelMessageSize,
  getGlobalIp,
  getHostAddresses,
  getReferencedStatsIds,
  getStatsTimestamp,
  growBufferSize,
  int,
  interfaceAddress,
  isComprehensionRequiredAttribute,
  isDtls,
  isLinkLocalAddress,
  isMedia,
  isRtcp,
  isStunMessage,
  keyLength,
  leb128decode,
  makeIntegrityKey,
  methods,
  microTime,
  milliTime,
  nodeIpAddress,
  normalizeFamilyNodeV18,
  normalizeFingerprintAlgorithm,
  normalizeFingerprintValue,
  ntpTime,
  ntpTime2Sec,
  ntpTimeToEpochMs,
  paddingBits,
  paddingByte,
  paddingLength,
  parseGroup,
  parseIceServers,
  parseMessage,
  random16,
  random32,
  randomPort,
  randomPorts,
  remoteTcpTypeForIncoming,
  resolveTurnTransport,
  reverseDirection,
  reverseSimulcastDirection,
  rtpHeaderExtensionsParser,
  saltLength,
  serializeAbsSendTime,
  serializeAudioLevelIndication,
  serializeRepairedRtpStreamId,
  serializeSdesMid,
  serializeSdesRTPStreamID,
  serializeTransportWideCC,
  serverReflexiveCandidate,
  signatures,
  sortCandidatePairs,
  splitTcpFrames,
  supportedAudioCodecs,
  supportedCodecs,
  supportedVideoCodecs,
  timer,
  timestampSeconds,
  uint16Add,
  uint16Gt,
  uint16Gte,
  uint24,
  uint32Add,
  uint32Gt,
  uint32Gte,
  uint8Add,
  unwrapRtx,
  url2Address,
  useAV1X,
  useAbsSendTime,
  useAudioLevelIndication,
  useDependencyDescriptor,
  useFIR,
  useH264,
  useNACK,
  useOPUS,
  usePCMU,
  usePLI,
  useREMB,
  useRepairedRtpStreamId,
  useSdesMid,
  useSdesRTPStreamId,
  useTWCC,
  useTransportWideCC,
  useVP8,
  useVP9,
  useVideoOrientation,
  validateAddress,
  validateRemoteCandidate,
  wrapRtx
};
