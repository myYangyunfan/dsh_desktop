"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SrtpContext = void 0;
const const_1 = require("../const");
const packet_1 = require("../packet");
const context_1 = require("./context");
class SrtpContext extends context_1.Context {
    constructor(masterKey, masterSalt, profile) {
        super(masterKey, masterSalt, profile);
    }
    encryptRtp(payload, header) {
        const s = this.getSrtpSsrcState(header.ssrc);
        this.updateRolloverCount(header.sequenceNumber, s);
        const enc = this.cipher.encryptRtp(header, payload, s.rolloverCounter);
        return enc;
    }
    decryptRtp(cipherText) {
        const header = (0, packet_1.parseSrtpRtpHeader)(cipherText, this.rtpAuthTagLength);
        const existingState = this.srtpSSRCStates[header.ssrc];
        const nextState = existingState
            ? { ...existingState }
            : {
                ssrc: header.ssrc,
                rolloverCounter: 0,
                lastSequenceNumber: 0,
            };
        this.updateRolloverCount(header.sequenceNumber, nextState);
        const dec = this.cipher.decryptRtp(cipherText, nextState.rolloverCounter, header);
        if (existingState) {
            Object.assign(existingState, nextState);
        }
        else {
            this.srtpSSRCStates[header.ssrc] = nextState;
        }
        return dec;
    }
    get rtpAuthTagLength() {
        return this.profile === const_1.ProtectionProfileAeadAes128Gcm ? 16 : 10;
    }
}
exports.SrtpContext = SrtpContext;
//# sourceMappingURL=srtp.js.map