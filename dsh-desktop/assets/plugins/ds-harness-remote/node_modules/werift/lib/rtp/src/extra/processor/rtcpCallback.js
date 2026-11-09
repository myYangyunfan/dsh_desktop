"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RtcpSourceCallback = void 0;
const common_1 = require("../../imports/common");
class RtcpSourceCallback {
    constructor() {
        Object.defineProperty(this, "cb", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "destructor", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "onStopped", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new common_1.Event()
        });
        Object.defineProperty(this, "input", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: (rtcp) => {
                if (this.cb) {
                    this.cb({ rtcp });
                }
            }
        });
        Object.defineProperty(this, "destroy", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: () => {
                if (this.destructor) {
                    this.destructor();
                    this.destructor = undefined;
                }
                this.cb = undefined;
                this.onStopped.allUnsubscribe();
            }
        });
    }
    toJSON() {
        return {};
    }
    pipe(cb, destructor) {
        this.cb = cb;
        this.destructor = destructor;
        return this;
    }
    stop() {
        if (this.cb) {
            this.cb({ eol: true });
        }
        this.onStopped.execute();
    }
}
exports.RtcpSourceCallback = RtcpSourceCallback;
//# sourceMappingURL=rtcpCallback.js.map