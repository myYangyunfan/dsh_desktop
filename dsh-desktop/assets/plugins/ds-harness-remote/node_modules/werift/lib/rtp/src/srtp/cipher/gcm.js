"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CipherAesGcm = void 0;
const crypto_1 = require("crypto");
const _1 = require(".");
const src_1 = require("../../../../common/src");
const helper_1 = require("../../helper");
const error_1 = require("../error");
const packet_1 = require("../packet");
class CipherAesGcm extends _1.CipherAesBase {
    constructor(srtpSessionKey, srtpSessionSalt, srtcpSessionKey, srtcpSessionSalt) {
        super(srtpSessionKey, srtpSessionSalt, srtcpSessionKey, srtcpSessionSalt);
        Object.defineProperty(this, "aeadAuthTagLen", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 16
        });
        Object.defineProperty(this, "rtpIvWriter", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: (0, src_1.createBufferWriter)([2, 4, 4, 2], true)
        });
        Object.defineProperty(this, "rtcpIvWriter", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: (0, src_1.createBufferWriter)([2, 4, 2, 4], true)
        });
        Object.defineProperty(this, "aadWriter", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: (0, src_1.createBufferWriter)([4], true)
        });
    }
    encryptRtp(header, payload, rolloverCounter) {
        const hdr = header.serialize(header.serializeSize);
        const iv = this.rtpInitializationVector(header, rolloverCounter);
        const cipher = (0, crypto_1.createCipheriv)("aes-128-gcm", this.srtpSessionKey, iv);
        cipher.setAAD(hdr);
        const enc = cipher.update(payload);
        cipher.final();
        const authTag = cipher.getAuthTag();
        const dst = Buffer.concat([hdr, enc, authTag]);
        return dst;
    }
    decryptRtp(cipherText, rolloverCounter, header = (0, packet_1.parseSrtpRtpHeader)(cipherText, this.aeadAuthTagLen)) {
        const headerBuffer = cipherText.subarray(0, header.payloadOffset);
        const authTagOffset = cipherText.length - this.aeadAuthTagLen;
        const authTag = cipherText.subarray(authTagOffset);
        let dst = Buffer.from([]);
        dst = (0, helper_1.growBufferSize)(dst, cipherText.length - this.aeadAuthTagLen);
        headerBuffer.copy(dst);
        const iv = this.rtpInitializationVector(header, rolloverCounter);
        const enc = cipherText.slice(header.payloadOffset, authTagOffset);
        const decipher = (0, crypto_1.createDecipheriv)("aes-128-gcm", this.srtpSessionKey, iv);
        decipher.setAAD(headerBuffer);
        decipher.setAuthTag(authTag);
        const dec = decipher.update(enc);
        finalizeAuthenticatedDecryption(decipher, "SRTP");
        dec.copy(dst, header.payloadOffset);
        return [
            dst,
            (0, packet_1.finalizeSrtpRtpHeader)(header, dst, "Failed to authenticate SRTP packet"),
        ];
    }
    encryptRTCP(rtcpPacket, srtcpIndex) {
        const ssrc = rtcpPacket.readUInt32BE(4);
        const addPos = rtcpPacket.length + this.aeadAuthTagLen;
        let dst = Buffer.from([]);
        dst = (0, helper_1.growBufferSize)(dst, addPos + srtcpIndexSize);
        rtcpPacket.slice(0, 8).copy(dst);
        const iv = this.rtcpInitializationVector(ssrc, srtcpIndex);
        const aad = this.rtcpAdditionalAuthenticatedData(rtcpPacket, srtcpIndex);
        const cipher = (0, crypto_1.createCipheriv)("aes-128-gcm", this.srtcpSessionKey, iv);
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
        const header = (0, packet_1.parseSrtcpHeader)(encrypted, this.aeadAuthTagLen, srtcpIndexSize);
        const srtcpIndexOffset = encrypted.length - srtcpIndexSize;
        const authTagOffset = srtcpIndexOffset - this.aeadAuthTagLen;
        const ssrc = encrypted.readUInt32BE(4);
        const encodedSrtcpIndex = encrypted.readUInt32BE(srtcpIndexOffset);
        const isEncrypted = encodedSrtcpIndex >>> 31 === 1;
        const srtcpIndex = encodedSrtcpIndex & ~(rtcpEncryptionFlag << 24);
        const iv = this.rtcpInitializationVector(ssrc, srtcpIndex);
        const aad = isEncrypted
            ? Buffer.concat([
                encrypted.subarray(0, 8),
                encrypted.subarray(srtcpIndexOffset),
            ])
            : Buffer.concat([
                encrypted.subarray(0, authTagOffset),
                encrypted.subarray(srtcpIndexOffset),
            ]);
        const cipherText = isEncrypted
            ? encrypted.slice(8, authTagOffset)
            : Buffer.alloc(0);
        const dst = isEncrypted
            ? Buffer.alloc(authTagOffset)
            : Buffer.from(encrypted.subarray(0, authTagOffset));
        if (isEncrypted) {
            encrypted.slice(0, 8).copy(dst);
        }
        const decipher = (0, crypto_1.createDecipheriv)("aes-128-gcm", this.srtcpSessionKey, iv);
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
            header.sequenceNumber,
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
            this.aadWriter([srtcpIndex]),
        ]);
        aad[8] |= rtcpEncryptionFlag;
        return aad;
    }
}
exports.CipherAesGcm = CipherAesGcm;
const srtcpIndexSize = 4;
const rtcpEncryptionFlag = 0x80;
function finalizeAuthenticatedDecryption(decipher, packetType) {
    try {
        decipher.final();
    }
    catch {
        throw new error_1.SrtpAuthenticationError(`Failed to authenticate ${packetType} packet`);
    }
}
//# sourceMappingURL=gcm.js.map