"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const crypto_1 = require("crypto");
const helper_1 = require("../../helper");
const common_1 = require("../../imports/common");
const prf_1 = require("../prf");
const abstract_1 = __importStar(require("./abstract"));
const err = (0, common_1.debug)("werift-dtls : packages/dtls/src/cipher/suites/aead.ts : err");
/**
 * This class implements AEAD cipher family.
 */
class AEADCipher extends abstract_1.default {
    constructor() {
        super();
        Object.defineProperty(this, "keyLength", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "nonceLength", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "ivLength", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "authTagLength", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "nonceImplicitLength", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "nonceExplicitLength", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "clientWriteKey", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "serverWriteKey", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "clientNonce", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "serverNonce", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
    }
    get summary() {
        return (0, helper_1.getObjectSummary)(this);
    }
    init(masterSecret, serverRandom, clientRandom) {
        const keys = (0, prf_1.prfEncryptionKeys)(masterSecret, clientRandom, serverRandom, this.keyLength, this.ivLength, this.nonceLength, this.hashAlgorithm);
        this.clientWriteKey = keys.clientWriteKey;
        this.serverWriteKey = keys.serverWriteKey;
        this.clientNonce = keys.clientNonce;
        this.serverNonce = keys.serverNonce;
    }
    /**
     * Encrypt message.
     */
    encrypt(type, data, header) {
        const isClient = type === abstract_1.SessionType.CLIENT;
        const iv = isClient ? this.clientNonce : this.serverNonce;
        const writeKey = isClient ? this.clientWriteKey : this.serverWriteKey;
        if (!iv || !writeKey)
            throw new Error();
        iv.writeUInt16BE(header.epoch, this.nonceImplicitLength);
        iv.writeUIntBE(header.sequenceNumber, this.nonceImplicitLength + 2, 6);
        const explicitNonce = iv.slice(this.nonceImplicitLength);
        const additionalBuffer = this.encodeAdditionalBuffer(header, data.length);
        const cipher = (0, crypto_1.createCipheriv)(this.blockAlgorithm, writeKey, iv, {
            authTagLength: this.authTagLength,
        });
        cipher.setAAD(additionalBuffer, {
            plaintextLength: data.length,
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
        const isClient = type === abstract_1.SessionType.CLIENT;
        const iv = isClient ? this.serverNonce : this.clientNonce;
        const writeKey = isClient ? this.serverWriteKey : this.clientWriteKey;
        if (!iv || !writeKey)
            throw new Error();
        const explicitNonce = data.subarray(0, this.nonceExplicitLength);
        explicitNonce.copy(iv, this.nonceImplicitLength);
        const encrypted = data.subarray(this.nonceExplicitLength, data.length - this.authTagLength);
        const authTag = data.subarray(data.length - this.authTagLength);
        const additionalBuffer = this.encodeAdditionalBuffer(header, encrypted.length);
        const decipher = (0, crypto_1.createDecipheriv)(this.blockAlgorithm, writeKey, iv, {
            authTagLength: this.authTagLength,
        });
        decipher.setAuthTag(authTag);
        decipher.setAAD(additionalBuffer, {
            plaintextLength: encrypted.length,
        });
        const headPart = decipher.update(encrypted);
        try {
            const finalPart = decipher.final();
            return finalPart.length > 0
                ? Buffer.concat([headPart, finalPart])
                : headPart;
        }
        catch (error) {
            err("decrypt failed", error, type, (0, helper_1.dumpBuffer)(data), header, this.summary);
            throw error;
        }
    }
}
exports.default = AEADCipher;
//# sourceMappingURL=aead.js.map