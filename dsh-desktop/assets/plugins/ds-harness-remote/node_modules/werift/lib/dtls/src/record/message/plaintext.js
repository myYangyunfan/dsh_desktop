"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DtlsPlaintext = void 0;
const helper_1 = require("../../helper");
const header_1 = require("./header");
class DtlsPlaintext {
    constructor(recordLayerHeader, fragment) {
        Object.defineProperty(this, "recordLayerHeader", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: recordLayerHeader
        });
        Object.defineProperty(this, "fragment", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: fragment
        });
    }
    get summary() {
        return {
            header: this.recordLayerHeader,
            fragment: (0, helper_1.dumpBuffer)(this.fragment),
        };
    }
    static createEmpty() {
        return new DtlsPlaintext(undefined, undefined);
    }
    static deSerialize(buf) {
        if (buf.length < 13) {
            throw new Error("Invalid DTLS record: buffer is too short");
        }
        const contentType = buf.readUInt8(0);
        const majorVersion = buf.readUInt8(1);
        const minorVersion = buf.readUInt8(2);
        const epoch = buf.readUInt16BE(3);
        // Read the 6-byte sequence number as a 48-bit integer
        const sequenceNumber = buf.slice(5, 11).readUIntBE(0, 6);
        const contentLen = buf.readUInt16BE(11);
        // Ensure the buffer has enough data for the fragment
        if (buf.length < 13 + contentLen) {
            throw new Error("Invalid DTLS record: fragment length exceeds buffer");
        }
        const fragment = buf.slice(13, 13 + contentLen);
        const r = new DtlsPlaintext({
            contentType,
            protocolVersion: { major: majorVersion, minor: minorVersion },
            epoch,
            sequenceNumber,
            contentLen,
        }, fragment);
        return r;
    }
    serialize() {
        const fragmentLength = this.fragment.length;
        // 13 bytes for headers + fragment length
        const totalLength = 13 + fragmentLength;
        const buffer = Buffer.alloc(totalLength);
        buffer.writeUInt8(this.recordLayerHeader.contentType, 0);
        buffer.writeUInt8(this.recordLayerHeader.protocolVersion.major, 1);
        buffer.writeUInt8(this.recordLayerHeader.protocolVersion.minor, 2);
        buffer.writeUInt16BE(this.recordLayerHeader.epoch, 3);
        buffer.writeUIntBE(this.recordLayerHeader.sequenceNumber, 5, 6);
        buffer.writeUInt16BE(fragmentLength, 11);
        this.fragment.copy(buffer, 13);
        return buffer;
    }
    computeMACHeader() {
        return new header_1.MACHeader(this.recordLayerHeader.epoch, this.recordLayerHeader.sequenceNumber, this.recordLayerHeader.contentType, this.recordLayerHeader.protocolVersion, this.recordLayerHeader.contentLen).serialize();
    }
}
exports.DtlsPlaintext = DtlsPlaintext;
//# sourceMappingURL=plaintext.js.map