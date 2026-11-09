"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SrtcpSession = void 0;
const srtcp_1 = require("./context/srtcp");
const session_1 = require("./session");
class SrtcpSession extends session_1.Session {
    constructor(config) {
        super(srtcp_1.SrtcpContext);
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
                const [decrypted] = this.remoteContext.decryptRTCP(buf);
                return decrypted;
            }
        });
        this.start(config.keys.localMasterKey, config.keys.localMasterSalt, config.keys.remoteMasterKey, config.keys.remoteMasterSalt, config.profile);
    }
    encrypt(rawRtcp) {
        const enc = this.localContext.encryptRTCP(rawRtcp);
        return enc;
    }
}
exports.SrtcpSession = SrtcpSession;
//# sourceMappingURL=srtcp.js.map