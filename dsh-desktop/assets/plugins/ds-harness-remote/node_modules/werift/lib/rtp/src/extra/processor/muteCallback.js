"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MuteCallback = void 0;
const mute_1 = require("./mute");
class MuteCallback extends mute_1.MuteHandlerBase {
    constructor(props) {
        super((o) => {
            if (this.cb) {
                this.cb(o);
            }
        }, props);
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
        Object.defineProperty(this, "pipe", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: (cb, destructor) => {
                this.cb = cb;
                this.destructor = destructor;
                return this;
            }
        });
        Object.defineProperty(this, "input", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: (input) => {
                for (const output of this.processInput(input)) {
                    if (this.cb) {
                        this.cb(output);
                    }
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
            }
        });
    }
}
exports.MuteCallback = MuteCallback;
//# sourceMappingURL=muteCallback.js.map