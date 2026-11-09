"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SrtcpContext = void 0;
const context_1 = require("./context");
class SrtcpContext extends context_1.Context {
    constructor(masterKey, masterSalt, profile) {
        super(masterKey, masterSalt, profile);
    }
    encryptRTCP(rawRtcp) {
        const ssrc = rawRtcp.readUInt32BE(4);
        const s = this.getSrtcpSsrcState(ssrc);
        s.srtcpIndex++;
        if (s.srtcpIndex >> maxSRTCPIndex) {
            s.srtcpIndex = 0;
        }
        const enc = this.cipher.encryptRTCP(rawRtcp, s.srtcpIndex);
        return enc;
    }
    decryptRTCP(encrypted) {
        const dec = this.cipher.decryptRTCP(encrypted);
        return dec;
    }
}
exports.SrtcpContext = SrtcpContext;
const maxSRTCPIndex = 0x7fffffff;
//# sourceMappingURL=srtcp.js.map