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
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CipherContext = void 0;
const crypto_1 = require("crypto");
const x509_1 = require("@fidm/x509");
const x509 = __importStar(require("@peculiar/x509"));
const binary_data_1 = require("@shinyoshiaki/binary-data");
const const_1 = require("../cipher/const");
const prf_1 = require("../cipher/prf");
const abstract_1 = require("../cipher/suites/abstract");
const crypto = crypto_1.webcrypto;
x509.cryptoProvider.set(crypto);
class CipherContext {
    constructor(sessionType, certPem, keyPem, signatureHashAlgorithm) {
        Object.defineProperty(this, "sessionType", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: sessionType
        });
        Object.defineProperty(this, "certPem", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: certPem
        });
        Object.defineProperty(this, "keyPem", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: keyPem
        });
        Object.defineProperty(this, "localRandom", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "remoteRandom", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "cipherSuite", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "remoteCertificate", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "remoteKeyPair", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "localKeyPair", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "masterSecret", {
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
        Object.defineProperty(this, "namedCurve", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "signatureHashAlgorithm", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "localCert", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "localPrivateKey", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        if (certPem && keyPem && signatureHashAlgorithm) {
            this.parseX509(certPem, keyPem, signatureHashAlgorithm);
        }
    }
    encryptPacket(pkt) {
        const header = pkt.recordLayerHeader;
        const version = (header.protocolVersion.major << 8) | header.protocolVersion.minor;
        const enc = this.cipher.encrypt(this.sessionType, pkt.fragment, {
            type: header.contentType,
            version,
            epoch: header.epoch,
            sequenceNumber: header.sequenceNumber,
        });
        pkt.fragment = enc;
        pkt.recordLayerHeader.contentLen = enc.length;
        return pkt;
    }
    decryptPacket(pkt) {
        const header = pkt.recordLayerHeader;
        const version = (header.protocolVersion.major << 8) | header.protocolVersion.minor;
        const dec = this.cipher.decrypt(this.sessionType, pkt.fragment, {
            type: header.contentType,
            version,
            epoch: header.epoch,
            sequenceNumber: header.sequenceNumber,
        });
        return dec;
    }
    verifyData(buf) {
        if (this.sessionType === abstract_1.SessionType.CLIENT)
            return (0, prf_1.prfVerifyDataClient)(this.masterSecret, buf);
        else
            return (0, prf_1.prfVerifyDataServer)(this.masterSecret, buf);
    }
    signatureData(data, hash) {
        const signature = (0, crypto_1.createSign)(hash).update(data);
        const key = this.localPrivateKey.toPEM().toString();
        const signed = signature.sign(key);
        return signed;
    }
    generateKeySignature(hashAlgorithm) {
        const clientRandom = this.sessionType === abstract_1.SessionType.CLIENT
            ? this.localRandom
            : this.remoteRandom;
        const serverRandom = this.sessionType === abstract_1.SessionType.SERVER
            ? this.localRandom
            : this.remoteRandom;
        const sig = this.valueKeySignature(clientRandom.serialize(), serverRandom.serialize(), this.localKeyPair.publicKey, this.namedCurve);
        const enc = this.localPrivateKey.sign(sig, hashAlgorithm);
        return enc;
    }
    parseX509(certPem, keyPem, signatureHash) {
        const cert = x509_1.Certificate.fromPEM(Buffer.from(certPem));
        const sec = x509_1.PrivateKey.fromPEM(Buffer.from(keyPem));
        this.localCert = cert.raw;
        this.localPrivateKey = sec;
        this.signatureHashAlgorithm = signatureHash;
    }
    valueKeySignature(clientRandom, serverRandom, publicKey, namedCurve) {
        const serverParams = Buffer.from((0, binary_data_1.encode)({
            type: const_1.CurveType.named_curve_3,
            curve: namedCurve,
            len: publicKey.length,
        }, { type: binary_data_1.types.uint8, curve: binary_data_1.types.uint16be, len: binary_data_1.types.uint8 }).slice());
        return Buffer.concat([clientRandom, serverRandom, serverParams, publicKey]);
    }
}
exports.CipherContext = CipherContext;
_a = CipherContext;
/**
 *
 * @param signatureHash
 * @param namedCurveAlgorithm necessary when use ecdsa
 */
Object.defineProperty(CipherContext, "createSelfSignedCertificateWithKey", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: async (signatureHash, namedCurveAlgorithm) => {
        const signatureAlgorithmName = (() => {
            switch (signatureHash.signature) {
                case const_1.SignatureAlgorithm.rsa_1:
                    return "RSASSA-PKCS1-v1_5";
                case const_1.SignatureAlgorithm.ecdsa_3:
                    return "ECDSA";
            }
        })();
        const hash = (() => {
            switch (signatureHash.hash) {
                case const_1.HashAlgorithm.sha256_4:
                    return "SHA-256";
            }
        })();
        const namedCurve = (() => {
            switch (namedCurveAlgorithm) {
                case const_1.NamedCurveAlgorithm.secp256r1_23:
                    return "P-256";
                case const_1.NamedCurveAlgorithm.x25519_29:
                    // todo fix (X25519 not supported with ECDSA)
                    if (signatureAlgorithmName === "ECDSA") {
                        return "P-256";
                    }
                    return "X25519";
                default: {
                    if (signatureAlgorithmName === "ECDSA")
                        return "P-256";
                    if (signatureAlgorithmName === "RSASSA-PKCS1-v1_5")
                        return "X25519";
                }
            }
        })();
        const alg = (() => {
            switch (signatureAlgorithmName) {
                case "ECDSA":
                    return { name: signatureAlgorithmName, hash, namedCurve };
                case "RSASSA-PKCS1-v1_5":
                    return {
                        name: signatureAlgorithmName,
                        hash,
                        publicExponent: new Uint8Array([1, 0, 1]),
                        modulusLength: 2048,
                    };
            }
        })();
        const keys = (await crypto.subtle.generateKey(alg, true, [
            "sign",
            "verify",
        ]));
        const cert = await x509.X509CertificateGenerator.createSelfSigned({
            serialNumber: (0, crypto_1.randomBytes)(8).toString("hex"),
            name: "C=AU, ST=Some-State, O=Internet Widgits Pty Ltd",
            notBefore: new Date(),
            notAfter: new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000),
            signingAlgorithm: alg,
            keys,
        });
        const certPem = cert.toString("pem");
        const keyPem = x509.PemConverter.encode(await crypto.subtle.exportKey("pkcs8", keys.privateKey), "private key");
        return { certPem, keyPem, signatureHash };
    }
});
//# sourceMappingURL=cipher.js.map