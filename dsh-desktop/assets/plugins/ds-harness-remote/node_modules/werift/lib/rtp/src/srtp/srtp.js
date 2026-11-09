"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SrtpSession = void 0;
const srtp_1 = require("./context/srtp");
const session_1 = require("./session");
class SrtpSession extends session_1.Session {
    constructor(config) {
        super(srtp_1.SrtpContext);
        Object.defineProperty(this, "config", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: config
        });
        Object.defineProperty(this, "decrypt", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: (buf) => {
                const [decrypted] = this.remoteContext.decryptRtp(buf);
                return decrypted;
            }
        });
        this.start(config.keys.localMasterKey, config.keys.localMasterSalt, config.keys.remoteMasterKey, config.keys.remoteMasterSalt, config.profile);
    }
    encrypt(payload, header) {
        return this.localContext.encryptRtp(payload, header);
    }
}
exports.SrtpSession = SrtpSession;
//# sourceMappingURL=srtp.js.map