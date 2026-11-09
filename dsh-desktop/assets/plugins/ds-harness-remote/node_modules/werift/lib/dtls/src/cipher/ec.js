"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.p256PreMasterSecret = exports.p256Keypair = void 0;
const p256_1 = require("@noble/curves/p256");
const p256Keypair = () => {
    const priv = p256_1.p256.utils.randomPrivateKey();
    const pub = p256_1.p256.getPublicKey(priv, false);
    const privateKey = Buffer.from(priv);
    const publicKey = Buffer.from(pub);
    return {
        privateKey,
        publicKey,
    };
};
exports.p256Keypair = p256Keypair;
const p256PreMasterSecret = ({ publicKey, privateKey, }) => {
    const res = p256_1.p256.getSharedSecret(privateKey, publicKey);
    const secret = Buffer.from(res).subarray(1);
    return secret;
};
exports.p256PreMasterSecret = p256PreMasterSecret;
//# sourceMappingURL=ec.js.map