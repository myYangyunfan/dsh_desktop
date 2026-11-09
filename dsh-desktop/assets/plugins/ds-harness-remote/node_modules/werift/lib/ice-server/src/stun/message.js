"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Message = void 0;
exports.parseMessage = parseMessage;
exports.paddingLength = paddingLength;
const crypto_1 = require("crypto");
const src_1 = require("../../../common/src");
const attributes_1 = require("./attributes");
const const_1 = require("./const");
function parseMessage(data, integrityKey) {
    if (!(0, const_1.isStunMessage)(data)) {
        return undefined;
    }
    const messageType = data.readUInt16BE(0);
    const transactionId = Buffer.from(data.slice(const_1.HEADER_LENGTH - 12, const_1.HEADER_LENGTH));
    const attributeRepository = new attributes_1.AttributeRepository();
    const rawAttributes = [];
    // When integrityKey is provided, MESSAGE-INTEGRITY must be present and valid
    // (RFC 5389 short-term credentials / RFC 7675 authenticated consent responses).
    let messageIntegrityVerified = false;
    for (let pos = const_1.HEADER_LENGTH; pos < data.length;) {
        if (pos + 4 > data.length) {
            return undefined;
        }
        const attrType = data.readUInt16BE(pos);
        const attrLen = data.readUInt16BE(pos + 2);
        const valueStart = pos + 4;
        const valueEnd = valueStart + attrLen;
        if (valueEnd > data.length) {
            return undefined;
        }
        const payload = data.slice(valueStart, valueEnd);
        const padLen = paddingLength(attrLen);
        if (valueEnd + padLen > data.length) {
            return undefined;
        }
        const attribute = attributes_1.ATTRIBUTES_BY_TYPE[attrType];
        if (attribute) {
            const [, attrName, , attrUnpack] = attribute;
            let value;
            try {
                value =
                    attrUnpack.name === attributes_1.unpackXorAddress.name
                        ? attrUnpack(payload, transactionId)
                        : attrUnpack(payload);
            }
            catch {
                return undefined;
            }
            attributeRepository.setAttribute(attrName, value);
            if (attrName === "FINGERPRINT") {
                const fingerprint = messageFingerprint(data.slice(0, pos));
                if (attributeRepository.getAttributeValue("FINGERPRINT") !== fingerprint) {
                    return undefined;
                }
            }
            else if (attrName === "MESSAGE-INTEGRITY" && integrityKey) {
                const integrity = messageIntegrity(data.slice(0, pos), integrityKey);
                const expected = attributeRepository.getAttributeValue("MESSAGE-INTEGRITY");
                if (!integrity.equals(expected)) {
                    return undefined;
                }
                messageIntegrityVerified = true;
            }
        }
        else {
            rawAttributes.push({
                type: attrType,
                length: attrLen,
                value: Buffer.from(payload),
            });
        }
        pos = valueEnd + padLen;
    }
    // Reject unsigned messages when the caller required authentication.
    if (integrityKey && !messageIntegrityVerified) {
        return undefined;
    }
    return new Message(messageType & 0x3eef, messageType & 0x0110, transactionId, attributeRepository.getAttributes(), rawAttributes);
}
class Message extends attributes_1.AttributeRepository {
    constructor(messageMethod, messageClass, transactionId = (0, crypto_1.randomBytes)(12), attributes = [], rawAttributes = []) {
        super(attributes);
        Object.defineProperty(this, "messageMethod", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: messageMethod
        });
        Object.defineProperty(this, "messageClass", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: messageClass
        });
        Object.defineProperty(this, "transactionId", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: transactionId
        });
        Object.defineProperty(this, "rawAttributes", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: rawAttributes
        });
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
                length: attribute.value.length,
            })),
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
        const body = Buffer.concat(this.serializedAttributes.map((attribute) => serializeAttribute(attribute.type, attribute.value)));
        const header = Buffer.alloc(8);
        header.writeUInt16BE(this.messageMethod | this.messageClass, 0);
        header.writeUInt16BE(body.length, 2);
        header.writeUInt32BE(const_1.COOKIE, 4);
        return Buffer.concat([header, this.transactionId, body]);
    }
    addMessageIntegrity(key) {
        this.setAttribute("MESSAGE-INTEGRITY", this.messageIntegrity(key));
        return this;
    }
    messageIntegrity(key) {
        const checkData = setBodyLength(this.bytes, this.bytes.length - const_1.HEADER_LENGTH + const_1.INTEGRITY_LENGTH);
        return Buffer.from((0, crypto_1.createHmac)("sha1", key).update(checkData).digest("hex"), "hex");
    }
    addFingerprint() {
        this.setAttribute("FINGERPRINT", messageFingerprint(this.bytes));
        return this;
    }
    get serializedAttributes() {
        const attributes = [];
        for (const attrName of this.attributesKeys) {
            const attrValue = this.getAttributeValue(attrName);
            const [attrType, , attrPack] = attributes_1.ATTRIBUTES_BY_NAME[attrName];
            const value = attrPack.name === attributes_1.packXorAddress.name
                ? attrPack(attrValue, this.transactionId)
                : attrPack(attrValue);
            attributes.push({ type: attrType, value });
        }
        attributes.push(...this.rawAttributes.map((attribute) => ({
            type: attribute.type,
            value: Buffer.from(attribute.value),
        })));
        return attributes;
    }
}
exports.Message = Message;
function serializeAttribute(type, value) {
    const attrLen = value.length;
    const padLen = paddingLength(attrLen);
    const header = Buffer.alloc(4);
    header.writeUInt16BE(type, 0);
    header.writeUInt16BE(attrLen, 2);
    return Buffer.concat([header, value, Buffer.alloc(padLen)]);
}
const setBodyLength = (data, length) => {
    const output = Buffer.alloc(data.length);
    data.copy(output, 0, 0, 2);
    output.writeUInt16BE(length, 2);
    data.copy(output, 4, 4);
    return output;
};
function messageFingerprint(data) {
    const checkData = setBodyLength(data, data.length - const_1.HEADER_LENGTH + const_1.FINGERPRINT_LENGTH);
    return ((0, src_1.crc32)(checkData) ^ const_1.FINGERPRINT_XOR) >>> 0;
}
function messageIntegrity(data, key) {
    const checkData = setBodyLength(data, data.length - const_1.HEADER_LENGTH + const_1.INTEGRITY_LENGTH);
    return Buffer.from((0, crypto_1.createHmac)("sha1", key).update(checkData).digest("hex"), "hex");
}
function paddingLength(length) {
    const rest = length % 4;
    return rest === 0 ? 0 : 4 - rest;
}
//# sourceMappingURL=message.js.map