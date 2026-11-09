"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CipherAesCtr = void 0;
const crypto_1 = require("crypto");
const _1 = require(".");
const error_1 = require("../error");
const packet_1 = require("../packet");
class CipherAesCtr extends _1.CipherAesBase {
    constructor(srtpSessionKey, srtpSessionSalt, srtcpSessionKey, srtcpSessionSalt, srtpSessionAuthTag, srtcpSessionAuthTag) {
        super(srtpSessionKey, srtpSessionSalt, srtcpSessionKey, srtcpSessionSalt);
        Object.defineProperty(this, "srtpSessionAuthTag", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: srtpSessionAuthTag
        });
        Object.defineProperty(this, "srtcpSessionAuthTag", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: srtcpSessionAuthTag
        });
        Object.defineProperty(this, "authTagLength", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 10
        });
    }
    encryptRtp(header, payload, rolloverCounter) {
        const headerBuffer = header.serialize(header.serializeSize);
        const counter = this.generateCounter(header.sequenceNumber, rolloverCounter, header.ssrc, this.srtpSessionSalt);
        const cipher = (0, crypto_1.createCipheriv)("aes-128-ctr", this.srtpSessionKey, counter);
        const enc = cipher.update(payload);
        const authTag = this.generateSrtpAuthTag(rolloverCounter, headerBuffer, enc);
        return Buffer.concat([headerBuffer, enc, authTag]);
    }
    decryptRtp(cipherText, rolloverCounter, header = (0, packet_1.parseSrtpRtpHeader)(cipherText, this.authTagLength)) {
        const authTagOffset = cipherText.length - this.authTagLength;
        const encryptedPacket = cipherText.subarray(0, authTagOffset);
        const actualAuthTag = cipherText.subarray(authTagOffset);
        const expectedAuthTag = this.generateSrtpAuthTag(rolloverCounter, encryptedPacket.subarray(0, header.payloadOffset), encryptedPacket.subarray(header.payloadOffset));
        assertAuthTag(actualAuthTag, expectedAuthTag, "Failed to authenticate SRTP packet");
        const counter = this.generateCounter(header.sequenceNumber, rolloverCounter, header.ssrc, this.srtpSessionSalt);
        const cipher = (0, crypto_1.createDecipheriv)("aes-128-ctr", this.srtpSessionKey, counter);
        const payload = encryptedPacket.subarray(header.payloadOffset);
        const buf = cipher.update(payload);
        const dst = Buffer.concat([
            encryptedPacket.subarray(0, header.payloadOffset),
            buf,
        ]);
        return [
            dst,
            (0, packet_1.finalizeSrtpRtpHeader)(header, dst, "Failed to authenticate SRTP packet"),
        ];
    }
    encryptRTCP(rtcpPacket, srtcpIndex) {
        let out = Buffer.from(rtcpPacket);
        const ssrc = out.readUInt32BE(4);
        const counter = this.generateCounter(srtcpIndex & 0xffff, srtcpIndex >> 16, ssrc, this.srtcpSessionSalt);
        const cipher = (0, crypto_1.createCipheriv)("aes-128-ctr", this.srtcpSessionKey, counter);
        // Encrypt everything after header
        const buf = cipher.update(out.slice(8));
        buf.copy(out, 8);
        out = Buffer.concat([out, Buffer.alloc(4)]);
        out.writeUInt32BE(srtcpIndex, out.length - 4);
        out[out.length - 4] |= 0x80;
        const authTag = this.generateSrtcpAuthTag(out);
        out = Buffer.concat([out, authTag]);
        return out;
    }
    decryptRTCP(encrypted) {
        const header = (0, packet_1.parseSrtcpHeader)(encrypted, this.authTagLength, srtcpIndexSize);
        const tailOffset = encrypted.length - (this.authTagLength + srtcpIndexSize);
        const authenticatedPortion = encrypted.subarray(0, encrypted.length - this.authTagLength);
        const actualTag = encrypted.subarray(encrypted.length - this.authTagLength);
        const expectedTag = this.generateSrtcpAuthTag(authenticatedPortion);
        assertAuthTag(actualTag, expectedTag, "Failed to authenticate SRTCP packet");
        const out = Buffer.from(encrypted).slice(0, tailOffset);
        const isEncrypted = encrypted[tailOffset] >>> 7;
        if (isEncrypted === 0)
            return [out, header];
        let srtcpIndex = encrypted.readUInt32BE(tailOffset);
        srtcpIndex &= ~(1 << 31);
        const ssrc = encrypted.readUInt32BE(4);
        const counter = this.generateCounter(srtcpIndex & 0xffff, srtcpIndex >> 16, ssrc, this.srtcpSessionSalt);
        const cipher = (0, crypto_1.createDecipheriv)("aes-128-ctr", this.srtcpSessionKey, counter);
        const buf = cipher.update(out.subarray(8));
        buf.copy(out, 8);
        return [out, header];
    }
    generateSrtcpAuthTag(buf) {
        const srtcpSessionAuth = (0, crypto_1.createHmac)("sha1", this.srtcpSessionAuthTag);
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
        const srtpSessionAuth = (0, crypto_1.createHmac)("sha1", this.srtpSessionAuthTag);
        const rocRaw = Buffer.alloc(4);
        rocRaw.writeUInt32BE(roc);
        for (const buf of buffers) {
            srtpSessionAuth.update(buf);
        }
        return srtpSessionAuth.update(rocRaw).digest().subarray(0, 10);
    }
}
exports.CipherAesCtr = CipherAesCtr;
const srtcpIndexSize = 4;
function assertAuthTag(actual, expected, message) {
    if (actual.length !== expected.length || !(0, crypto_1.timingSafeEqual)(actual, expected)) {
        throw new error_1.SrtpAuthenticationError(message);
    }
}
//# sourceMappingURL=ctr.js.map