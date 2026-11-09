"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Session = void 0;
class Session {
    constructor(ContextCls) {
        Object.defineProperty(this, "ContextCls", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: ContextCls
        });
        Object.defineProperty(this, "localContext", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "remoteContext", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "onData", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
    }
    start(localMasterKey, localMasterSalt, remoteMasterKey, remoteMasterSalt, profile) {
        this.localContext = new this.ContextCls(localMasterKey, localMasterSalt, profile);
        this.remoteContext = new this.ContextCls(remoteMasterKey, remoteMasterSalt, profile);
    }
}
exports.Session = Session;
//# sourceMappingURL=session.js.map