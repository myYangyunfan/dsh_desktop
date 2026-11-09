"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Context = void 0;
exports.aes128EcbEncrypt = aes128EcbEncrypt;
const crypto_1 = require("crypto");
const ctr_1 = require("../cipher/ctr");
const gcm_1 = require("../cipher/gcm");
const const_1 = require("../const");
/** AES-128-ECB single-block encrypt for SRTP KDF (no padding). */
function aes128EcbEncrypt(key, plaintext) {
    const cipher = (0, crypto_1.createCipheriv)("aes-128-ecb", key, null);
    cipher.setAutoPadding(false);
    return Buffer.concat([cipher.update(plaintext), cipher.final()]);
}
class Context {
    constructor(masterKey, masterSalt, profile) {
        Object.defineProperty(this, "masterKey", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: masterKey
        });
        Object.defineProperty(this, "masterSalt", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: masterSalt
        });
        Object.defineProperty(this, "profile", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: profile
        });
        Object.defineProperty(this, "srtpSSRCStates", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: {}
        });
        Object.defineProperty(this, "srtpSessionKey", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "srtpSessionSalt", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "srtpSessionAuthTag", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "srtpSessionAuth", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "srtcpSSRCStates", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: {}
        });
        Object.defineProperty(this, "srtcpSessionKey", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "srtcpSessionSalt", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "srtcpSessionAuthTag", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "srtcpSessionAuth", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "cipher", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        {
            // AES-ECB plaintext require 16byte
            // so need to padding to 14 byte
            const diff = 14 - masterSalt.length;
            if (diff > 0) {
                this.masterSalt = Buffer.concat([masterSalt, Buffer.alloc(diff)]);
            }
        }
        this.srtpSessionKey = this.generateSessionKey(0);
        this.srtpSessionSalt = this.generateSessionSalt(2);
        this.srtpSessionAuthTag = this.generateSessionAuthTag(1);
        this.srtpSessionAuth = (0, crypto_1.createHmac)("sha1", this.srtpSessionAuthTag);
        this.srtcpSessionKey = this.generateSessionKey(3);
        this.srtcpSessionSalt = this.generateSessionSalt(5);
        this.srtcpSessionAuthTag = this.generateSessionAuthTag(4);
        this.srtcpSessionAuth = (0, crypto_1.createHmac)("sha1", this.srtcpSessionAuthTag);
        switch (profile) {
            case const_1.ProtectionProfileAes128CmHmacSha1_80:
                this.cipher = new ctr_1.CipherAesCtr(this.srtpSessionKey, this.srtpSessionSalt, this.srtcpSessionKey, this.srtcpSessionSalt, this.srtpSessionAuthTag, this.srtcpSessionAuthTag);
                break;
            case const_1.ProtectionProfileAeadAes128Gcm:
                this.cipher = new gcm_1.CipherAesGcm(this.srtpSessionKey, this.srtpSessionSalt, this.srtcpSessionKey, this.srtcpSessionSalt);
                break;
        }
    }
    generateSessionKey(label) {
        let sessionKey = Buffer.from(this.masterSalt);
        const labelAndIndexOverKdr = Buffer.from([
            label,
            0x00,
            0x00,
            0x00,
            0x00,
            0x00,
            0x00,
        ]);
        for (let i = labelAndIndexOverKdr.length - 1, j = sessionKey.length - 1; i >= 0; i--, j--) {
            sessionKey[j] = sessionKey[j] ^ labelAndIndexOverKdr[i];
        }
        sessionKey = Buffer.concat([sessionKey, Buffer.from([0x00, 0x00])]);
        return aes128EcbEncrypt(this.masterKey, sessionKey);
    }
    generateSessionSalt(label) {
        let sessionSalt = Buffer.from(this.masterSalt);
        const labelAndIndexOverKdr = Buffer.from([
            label,
            0x00,
            0x00,
            0x00,
            0x00,
            0x00,
            0x00,
        ]);
        for (let i = labelAndIndexOverKdr.length - 1, j = sessionSalt.length - 1; i >= 0; i--, j--) {
            sessionSalt[j] = sessionSalt[j] ^ labelAndIndexOverKdr[i];
        }
        sessionSalt = Buffer.concat([sessionSalt, Buffer.from([0x00, 0x00])]);
        sessionSalt = aes128EcbEncrypt(this.masterKey, sessionSalt);
        return sessionSalt.subarray(0, 14);
    }
    generateSessionAuthTag(label) {
        const sessionAuthTag = Buffer.from(this.masterSalt);
        const labelAndIndexOverKdr = Buffer.from([
            label,
            0x00,
            0x00,
            0x00,
            0x00,
            0x00,
            0x00,
        ]);
        for (let i = labelAndIndexOverKdr.length - 1, j = sessionAuthTag.length - 1; i >= 0; i--, j--) {
            sessionAuthTag[j] = sessionAuthTag[j] ^ labelAndIndexOverKdr[i];
        }
        let firstRun = Buffer.concat([
            sessionAuthTag,
            Buffer.from([0x00, 0x00]),
        ]);
        let secondRun = Buffer.concat([
            sessionAuthTag,
            Buffer.from([0x00, 0x01]),
        ]);
        firstRun = aes128EcbEncrypt(this.masterKey, firstRun);
        secondRun = aes128EcbEncrypt(this.masterKey, secondRun);
        return Buffer.concat([firstRun, secondRun.subarray(0, 4)]);
    }
    getSrtpSsrcState(ssrc) {
        let s = this.srtpSSRCStates[ssrc];
        if (s)
            return s;
        s = {
            ssrc,
            rolloverCounter: 0,
            lastSequenceNumber: 0,
        };
        this.srtpSSRCStates[ssrc] = s;
        return s;
    }
    getSrtcpSsrcState(ssrc) {
        let s = this.srtcpSSRCStates[ssrc];
        if (s)
            return s;
        s = {
            srtcpIndex: 0,
            ssrc,
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
        }
        else if (sequenceNumber === 0) {
            if (s.lastSequenceNumber > MaxROCDisorder) {
                s.rolloverCounter++;
            }
        }
        else if (s.lastSequenceNumber < MaxROCDisorder &&
            sequenceNumber > MaxSequenceNumber - MaxROCDisorder) {
            // https://github.com/shinyoshiaki/werift-webrtc/issues/94
            if (s.rolloverCounter > 0) {
                s.rolloverCounter--;
            }
        }
        else if (sequenceNumber < MaxROCDisorder &&
            s.lastSequenceNumber > MaxSequenceNumber - MaxROCDisorder) {
            s.rolloverCounter++;
        }
        s.lastSequenceNumber = sequenceNumber;
    }
    generateSrtpAuthTag(buf, roc) {
        this.srtpSessionAuth = (0, crypto_1.createHmac)("sha1", this.srtpSessionAuthTag);
        const rocRaw = Buffer.alloc(4);
        rocRaw.writeUInt32BE(roc);
        return this.srtpSessionAuth
            .update(buf)
            .update(rocRaw)
            .digest()
            .slice(0, 10);
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
        s.srtcpIndex = index % 0x7fffffff;
    }
}
exports.Context = Context;
const MaxROCDisorder = 100;
const MaxSequenceNumber = 65535;
//# sourceMappingURL=context.js.map