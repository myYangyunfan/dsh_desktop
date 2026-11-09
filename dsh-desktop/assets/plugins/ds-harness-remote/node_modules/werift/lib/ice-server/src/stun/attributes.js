"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ATTRIBUTES_BY_NAME = exports.ATTRIBUTES_BY_TYPE = exports.AttributeRepository = void 0;
exports.unpackErrorCode = unpackErrorCode;
exports.unpackXorAddress = unpackXorAddress;
exports.packErrorCode = packErrorCode;
exports.packUnknownAttributes = packUnknownAttributes;
exports.unpackUnknownAttributes = unpackUnknownAttributes;
exports.packXorAddress = packXorAddress;
const const_1 = require("./const");
const ip_1 = require("./ip");
function packAddress(value) {
    const [address] = value;
    const protocol = (0, ip_1.isIpV4Address)(address) ? const_1.IPV4_PROTOCOL : const_1.IPV6_PROTOCOL;
    const buffer = Buffer.alloc(4);
    buffer.writeUInt8(0, 0);
    buffer.writeUInt8(protocol, 1);
    buffer.writeUInt16BE(value[1], 2);
    return Buffer.concat([buffer, (0, ip_1.ipAddressToBuffer)(address)]);
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
        case const_1.IPV4_PROTOCOL:
            if (address.length !== 4) {
                throw new Error("STUN address has invalid length for IPv4");
            }
            return [(0, ip_1.bufferToIpAddress)(address), port];
        case const_1.IPV6_PROTOCOL:
            if (address.length !== 16) {
                throw new Error("STUN address has invalid length for IPv6");
            }
            return [(0, ip_1.bufferToIpAddress)(address), port];
        default:
            throw new Error("STUN address has unknown protocol");
    }
}
const cookieBuffer = Buffer.alloc(6);
cookieBuffer.writeUInt16BE(const_1.COOKIE >> 16, 0);
cookieBuffer.writeUInt32BE(const_1.COOKIE, 2);
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
    const buffer = Buffer.alloc(4);
    buffer.writeUInt16BE(0, 0);
    buffer.writeUInt8(Math.floor(value[0] / 100), 2);
    buffer.writeUInt8(value[0] % 100, 3);
    const encoded = Buffer.from(value[1], "utf8");
    return Buffer.concat([buffer, encoded]);
}
function packUnknownAttributes(value) {
    const buffer = Buffer.alloc(value.length * 2);
    value.forEach((attributeType, index) => {
        buffer.writeUInt16BE(attributeType, index * 2);
    });
    return buffer;
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
const packUnsigned = (value) => {
    const buffer = Buffer.alloc(4);
    buffer.writeUInt32BE(value, 0);
    return buffer;
};
const unpackUnsigned = (data) => data.readUInt32BE(0);
const packUnsignedShort = (value) => {
    const buffer = Buffer.alloc(4);
    buffer.writeUInt16BE(value, 0);
    return buffer;
};
const unpackUnsignedShort = (data) => data.readUInt16BE(0);
const packUnsigned64 = (value) => {
    const buffer = Buffer.allocUnsafe(8);
    buffer.writeBigUInt64BE(value, 0);
    return buffer;
};
const unpackUnsigned64 = (data) => data.readBigUInt64BE(0);
const packString = (value) => Buffer.from(value, "utf8");
const unpackString = (data) => data.toString("utf8");
const packSoftware = (value) => {
    if ([...value].length >= 128) {
        throw new Error("SOFTWARE must be shorter than 128 characters");
    }
    return packString(value);
};
const packBytes = (value) => value;
const unpackBytes = (data) => data;
const packNone = () => Buffer.alloc(0);
const unpackNone = () => null;
const ATTRIBUTES = [
    [0x0001, "MAPPED-ADDRESS", packAddress, unpackAddress],
    [0x0003, "CHANGE-REQUEST", packUnsigned, unpackUnsigned],
    [0x0004, "SOURCE-ADDRESS", packAddress, unpackAddress],
    [0x0005, "CHANGED-ADDRESS", packAddress, unpackAddress],
    [0x0006, "USERNAME", packString, unpackString],
    [0x0008, "MESSAGE-INTEGRITY", packBytes, unpackBytes],
    [0x0009, "ERROR-CODE", packErrorCode, unpackErrorCode],
    [
        0x000a,
        "UNKNOWN-ATTRIBUTES",
        packUnknownAttributes,
        unpackUnknownAttributes,
    ],
    [0x000c, "CHANNEL-NUMBER", packUnsignedShort, unpackUnsignedShort],
    [0x000d, "LIFETIME", packUnsigned, unpackUnsigned],
    [0x0012, "XOR-PEER-ADDRESS", packXorAddress, unpackXorAddress],
    [0x0013, "DATA", packBytes, unpackBytes],
    [0x0014, "REALM", packString, unpackString],
    [0x0015, "NONCE", packBytes, unpackBytes],
    [0x0016, "XOR-RELAYED-ADDRESS", packXorAddress, unpackXorAddress],
    [0x0017, "REQUESTED-ADDRESS-FAMILY", packUnsigned, unpackUnsigned],
    [0x0018, "EVEN-PORT", packBytes, unpackBytes],
    [0x0019, "REQUESTED-TRANSPORT", packUnsigned, unpackUnsigned],
    [0x001c, "MESSAGE-INTEGRITY-SHA256", packBytes, unpackBytes],
    [0x001d, "PASSWORD-ALGORITHM", packBytes, unpackBytes],
    [0x001e, "USERHASH", packBytes, unpackBytes],
    [0x0020, "XOR-MAPPED-ADDRESS", packXorAddress, unpackXorAddress],
    [0x0022, "RESERVATION-TOKEN", packBytes, unpackBytes],
    [0x0024, "PRIORITY", packUnsigned, unpackUnsigned],
    [0x0025, "USE-CANDIDATE", packNone, unpackNone],
    [0x8002, "PASSWORD-ALGORITHMS", packBytes, unpackBytes],
    [0x8003, "ALTERNATE-DOMAIN", packString, unpackString],
    [0x8022, "SOFTWARE", packSoftware, unpackString],
    [0x8023, "ALTERNATE-SERVER", packAddress, unpackAddress],
    [0x8028, "FINGERPRINT", packUnsigned, unpackUnsigned],
    [0x8029, "ICE-CONTROLLED", packUnsigned64, unpackUnsigned64],
    [0x802a, "ICE-CONTROLLING", packUnsigned64, unpackUnsigned64],
    [0x802b, "RESPONSE-ORIGIN", packAddress, unpackAddress],
    [0x802c, "OTHER-ADDRESS", packAddress, unpackAddress],
];
class AttributeRepository {
    constructor(attributes = []) {
        Object.defineProperty(this, "attributes", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: attributes
        });
    }
    getAttributes() {
        return this.attributes;
    }
    setAttribute(key, value) {
        const existing = this.attributes.find((attribute) => attribute[0] === key);
        if (existing) {
            existing[1] = value;
        }
        else {
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
}
exports.AttributeRepository = AttributeRepository;
exports.ATTRIBUTES_BY_TYPE = ATTRIBUTES.reduce((acc, cur) => {
    acc[cur[0]] = cur;
    return acc;
}, {});
exports.ATTRIBUTES_BY_NAME = ATTRIBUTES.reduce((acc, cur) => {
    acc[cur[1]] = cur;
    return acc;
}, {});
//# sourceMappingURL=attributes.js.map