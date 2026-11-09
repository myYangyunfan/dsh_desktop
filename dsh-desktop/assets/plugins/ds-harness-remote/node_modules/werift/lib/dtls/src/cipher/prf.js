"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.prfPreMasterSecret = prfPreMasterSecret;
exports.hmac = hmac;
exports.prfPHash = prfPHash;
exports.prfMasterSecret = prfMasterSecret;
exports.prfExtendedMasterSecret = prfExtendedMasterSecret;
exports.exportKeyingMaterial = exportKeyingMaterial;
exports.hash = hash;
exports.prfVerifyData = prfVerifyData;
exports.prfVerifyDataClient = prfVerifyDataClient;
exports.prfVerifyDataServer = prfVerifyDataServer;
exports.prfEncryptionKeys = prfEncryptionKeys;
const crypto_1 = require("crypto");
const binary_data_1 = require("@shinyoshiaki/binary-data");
const tweetnacl_1 = __importDefault(require("tweetnacl"));
const const_1 = require("./const");
const ec_1 = require("./ec");
function prfPreMasterSecret(publicKey, privateKey, curve) {
    switch (curve) {
        case const_1.NamedCurveAlgorithm.secp256r1_23:
            return (0, ec_1.p256PreMasterSecret)({ publicKey, privateKey });
        case const_1.NamedCurveAlgorithm.x25519_29:
            return Buffer.from(tweetnacl_1.default.scalarMult(privateKey, publicKey));
        default:
            throw new Error();
    }
}
function hmac(algorithm, secret, data) {
    const hash = (0, crypto_1.createHmac)(algorithm, secret);
    hash.update(data);
    return hash.digest();
}
function prfPHash(secret, seed, requestedLegth, algorithm = "sha256") {
    const totalLength = requestedLegth;
    const bufs = [];
    let Ai = seed; // A0
    do {
        Ai = hmac(algorithm, secret, Ai); // A(i) = HMAC(secret, A(i-1))
        const output = hmac(algorithm, secret, Buffer.concat([Ai, seed]));
        bufs.push(output);
        requestedLegth -= output.length; // eslint-disable-line no-param-reassign
    } while (requestedLegth > 0);
    return Buffer.concat(bufs, totalLength);
}
function prfMasterSecret(preMasterSecret, clientRandom, serverRandom) {
    const seed = Buffer.concat([
        Buffer.from("master secret"),
        clientRandom,
        serverRandom,
    ]);
    return prfPHash(preMasterSecret, seed, 48);
}
function prfExtendedMasterSecret(preMasterSecret, handshakes) {
    const sessionHash = hash("sha256", handshakes);
    const label = "extended master secret";
    return prfPHash(preMasterSecret, Buffer.concat([Buffer.from(label), sessionHash]), 48);
}
function exportKeyingMaterial(label, length, masterSecret, localRandom, remoteRandom, isClient) {
    const clientRandom = isClient ? localRandom : remoteRandom;
    const serverRandom = isClient ? remoteRandom : localRandom;
    const seed = Buffer.concat([Buffer.from(label), clientRandom, serverRandom]);
    return prfPHash(masterSecret, seed, length);
}
function hash(algorithm, data) {
    return (0, crypto_1.createHash)(algorithm).update(data).digest();
}
function prfVerifyData(masterSecret, handshakes, label, size = 12) {
    const bytes = hash("sha256", handshakes);
    return prfPHash(masterSecret, Buffer.concat([Buffer.from(label), bytes]), size);
}
function prfVerifyDataClient(masterSecret, handshakes) {
    return prfVerifyData(masterSecret, handshakes, "client finished");
}
function prfVerifyDataServer(masterSecret, handshakes) {
    return prfVerifyData(masterSecret, handshakes, "server finished");
}
function prfEncryptionKeys(masterSecret, clientRandom, serverRandom, prfKeyLen, prfIvLen, prfNonceLen, algorithm = "sha256") {
    const size = prfKeyLen * 2 + prfIvLen * 2;
    const secret = masterSecret;
    const seed = Buffer.concat([serverRandom, clientRandom]);
    const keyBlock = prfPHash(secret, Buffer.concat([Buffer.from("key expansion"), seed]), size, algorithm);
    const stream = (0, binary_data_1.createDecode)(keyBlock);
    const clientWriteKey = stream.readBuffer(prfKeyLen);
    const serverWriteKey = stream.readBuffer(prfKeyLen);
    const clientNonceImplicit = stream.readBuffer(prfIvLen);
    const serverNonceImplicit = stream.readBuffer(prfIvLen);
    const clientNonce = Buffer.alloc(prfNonceLen, 0);
    const serverNonce = Buffer.alloc(prfNonceLen, 0);
    clientNonceImplicit.copy(clientNonce, 0);
    serverNonceImplicit.copy(serverNonce, 0);
    return { clientWriteKey, serverWriteKey, clientNonce, serverNonce };
}
//# sourceMappingURL=prf.js.map