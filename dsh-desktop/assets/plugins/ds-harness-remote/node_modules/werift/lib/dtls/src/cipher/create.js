"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCipher = createCipher;
exports.createAEADCipher = createAEADCipher;
const key_exchange_1 = require("./key-exchange");
const aead_1 = __importDefault(require("./suites/aead"));
const cipherSuites = {
    TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256: 0xc02b,
    TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384: 0xc02c,
    TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256: 0xc02f,
    TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384: 0xc030,
    TLS_RSA_WITH_AES_128_GCM_SHA256: 0x009c,
    TLS_RSA_WITH_AES_256_GCM_SHA384: 0x009d,
    TLS_PSK_WITH_AES_128_GCM_SHA256: 0x00a8,
    TLS_PSK_WITH_AES_256_GCM_SHA384: 0x00a9,
    TLS_ECDHE_PSK_WITH_AES_128_GCM_SHA256: 0xd001,
    TLS_ECDHE_PSK_WITH_AES_256_GCM_SHA384: 0xd002,
    TLS_ECDHE_PSK_WITH_CHACHA20_POLY1305_SHA256: 0xccac,
    TLS_ECDHE_ECDSA_WITH_CHACHA20_POLY1305_SHA256: 0xcca9,
    TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256: 0xcca8,
    TLS_PSK_WITH_CHACHA20_POLY1305_SHA256: 0xccab,
};
const AEAD_AES_128_GCM = {
    K_LEN: 16, // Length of a key.
    N_MIN: 12, // Min nonce length.
    N_MAX: 12, // Max nonce length.
    P_MAX: 2 ** 36 - 31, // Max length of a plaintext.
    // Max safe int in js is 2 ** 53. So, use this value
    // instead of 2 ** 61 as described in rfc5116.
    A_MAX: 2 ** 53 - 1, // Max length of an additional data.
    C_MAX: 2 ** 36 - 15, // Cipher text length.
};
const AEAD_AES_256_GCM = {
    K_LEN: 32, // Length of a key.
    N_MIN: 12, // Min nonce length.
    N_MAX: 12, // Max nonce length.
    P_MAX: 2 ** 36 - 31, // Max length of a plaintext.
    // Note: see above.
    A_MAX: 2 ** 53 - 1, // Max length of an additional data.
    C_MAX: 2 ** 36 - 15, // Cipher text length.
};
const RSA_KEY_EXCHANGE = (0, key_exchange_1.createRSAKeyExchange)();
const ECDHE_RSA_KEY_EXCHANGE = (0, key_exchange_1.createECDHERSAKeyExchange)();
const ECDHE_ECDSA_KEY_EXCHANGE = (0, key_exchange_1.createECDHEECDSAKeyExchange)();
const PSK_KEY_EXCHANGE = (0, key_exchange_1.createPSKKeyExchange)();
const ECDHE_PSK_KEY_EXCHANGE = (0, key_exchange_1.createECDHEPSKKeyExchange)();
/**
 * Convert cipher value to cipher instance.
 * @param {number} cipher
 */
function createCipher(cipher) {
    switch (cipher) {
        case cipherSuites.TLS_RSA_WITH_AES_128_GCM_SHA256:
            return createAEADCipher(cipherSuites.TLS_RSA_WITH_AES_128_GCM_SHA256, "TLS_RSA_WITH_AES_128_GCM_SHA256", "aes-128-gcm", RSA_KEY_EXCHANGE, AEAD_AES_128_GCM);
        case cipherSuites.TLS_RSA_WITH_AES_256_GCM_SHA384:
            return createAEADCipher(cipherSuites.TLS_RSA_WITH_AES_256_GCM_SHA384, "TLS_RSA_WITH_AES_256_GCM_SHA384", "aes-256-gcm", RSA_KEY_EXCHANGE, AEAD_AES_256_GCM, "sha384");
        case cipherSuites.TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256:
            return createAEADCipher(cipherSuites.TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256, "TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256", "aes-128-gcm", ECDHE_RSA_KEY_EXCHANGE, AEAD_AES_128_GCM);
        case cipherSuites.TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384:
            return createAEADCipher(cipherSuites.TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384, "TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384", "aes-256-gcm", ECDHE_RSA_KEY_EXCHANGE, AEAD_AES_256_GCM, "sha384");
        case cipherSuites.TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256:
            return createAEADCipher(cipherSuites.TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256, "TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256", "aes-128-gcm", ECDHE_ECDSA_KEY_EXCHANGE, AEAD_AES_128_GCM);
        case cipherSuites.TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384:
            return createAEADCipher(cipherSuites.TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384, "TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384", "aes-256-gcm", ECDHE_ECDSA_KEY_EXCHANGE, AEAD_AES_256_GCM, "sha384");
        case cipherSuites.TLS_PSK_WITH_AES_128_GCM_SHA256:
            return createAEADCipher(cipherSuites.TLS_PSK_WITH_AES_128_GCM_SHA256, "TLS_PSK_WITH_AES_128_GCM_SHA256", "aes-128-gcm", PSK_KEY_EXCHANGE, AEAD_AES_128_GCM, "sha256");
        case cipherSuites.TLS_PSK_WITH_AES_256_GCM_SHA384:
            return createAEADCipher(cipherSuites.TLS_PSK_WITH_AES_256_GCM_SHA384, "TLS_PSK_WITH_AES_256_GCM_SHA384", "aes-256-gcm", PSK_KEY_EXCHANGE, AEAD_AES_256_GCM, "sha384");
        case cipherSuites.TLS_ECDHE_PSK_WITH_AES_128_GCM_SHA256:
            return createAEADCipher(cipherSuites.TLS_ECDHE_PSK_WITH_AES_128_GCM_SHA256, "TLS_ECDHE_PSK_WITH_AES_128_GCM_SHA256", "aes-128-gcm", ECDHE_PSK_KEY_EXCHANGE, AEAD_AES_128_GCM, "sha256");
        case cipherSuites.TLS_ECDHE_PSK_WITH_AES_256_GCM_SHA384:
            return createAEADCipher(cipherSuites.TLS_ECDHE_PSK_WITH_AES_256_GCM_SHA384, "TLS_ECDHE_PSK_WITH_AES_256_GCM_SHA384", "aes-256-gcm", ECDHE_PSK_KEY_EXCHANGE, AEAD_AES_256_GCM, "sha384");
        default:
            break;
    }
    return null;
}
/**
 * @param {number} id An internal id of cipher suite.
 * @param {string} name A valid cipher suite name.
 * @param {string} block A valid nodejs cipher name.
 * @param {KeyExchange} kx Key exchange type.
 * @param {Object} constants Cipher specific constants.
 * @param {string} hash
 * @returns {AEADCipher}
 */
function createAEADCipher(id, name, block, kx, constants, hash = "sha256") {
    const cipher = new aead_1.default();
    cipher.id = id;
    cipher.name = name;
    cipher.blockAlgorithm = block;
    cipher.kx = kx;
    cipher.hashAlgorithm = hash;
    cipher.keyLength = constants.K_LEN;
    cipher.nonceLength = constants.N_MAX;
    // RFC5288, sec. 3
    cipher.nonceImplicitLength = 4;
    cipher.nonceExplicitLength = 8;
    cipher.ivLength = cipher.nonceImplicitLength;
    cipher.authTagLength = 16;
    return cipher;
}
//# sourceMappingURL=create.js.map