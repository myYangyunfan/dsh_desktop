"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateKeyPair = generateKeyPair;
const tweetnacl_1 = __importDefault(require("tweetnacl"));
const const_1 = require("./const");
const ec_1 = require("./ec");
function generateKeyPair(namedCurve) {
    switch (namedCurve) {
        case const_1.NamedCurveAlgorithm.secp256r1_23: {
            const { privateKey, publicKey } = (0, ec_1.p256Keypair)();
            return {
                curve: namedCurve,
                privateKey,
                publicKey,
            };
        }
        case const_1.NamedCurveAlgorithm.x25519_29: {
            const keys = tweetnacl_1.default.box.keyPair();
            return {
                curve: namedCurve,
                privateKey: Buffer.from(keys.secretKey.buffer),
                publicKey: Buffer.from(keys.publicKey.buffer),
            };
        }
        default:
            throw new Error();
    }
}
//# sourceMappingURL=namedCurve.js.map