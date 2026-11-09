"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.makeTurnIntegrityKey = makeTurnIntegrityKey;
const crypto_1 = require("crypto");
function makeTurnIntegrityKey(username, realm, password) {
    return (0, crypto_1.createHash)("md5")
        .update(Buffer.from([username, realm, password].join(":")))
        .digest();
}
//# sourceMappingURL=auth.js.map