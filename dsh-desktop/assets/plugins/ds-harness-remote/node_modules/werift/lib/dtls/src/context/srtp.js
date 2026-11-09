"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SrtpContext = void 0;
class SrtpContext {
    constructor() {
        Object.defineProperty(this, "srtpProfile", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
    }
    static findMatchingSRTPProfile(remote, local) {
        for (const v of local) {
            if (remote.includes(v))
                return v;
        }
    }
}
exports.SrtpContext = SrtpContext;
//# sourceMappingURL=srtp.js.map