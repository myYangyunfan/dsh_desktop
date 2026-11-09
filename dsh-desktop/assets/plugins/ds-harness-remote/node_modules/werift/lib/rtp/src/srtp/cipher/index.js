"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CipherAesBase = void 0;
class CipherAesBase {
    constructor(srtpSessionKey, srtpSessionSalt, srtcpSessionKey, srtcpSessionSalt) {
        Object.defineProperty(this, "srtpSessionKey", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: srtpSessionKey
        });
        Object.defineProperty(this, "srtpSessionSalt", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: srtpSessionSalt
        });
        Object.defineProperty(this, "srtcpSessionKey", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: srtcpSessionKey
        });
        Object.defineProperty(this, "srtcpSessionSalt", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: srtcpSessionSalt
        });
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
}
exports.CipherAesBase = CipherAesBase;
//# sourceMappingURL=index.js.map