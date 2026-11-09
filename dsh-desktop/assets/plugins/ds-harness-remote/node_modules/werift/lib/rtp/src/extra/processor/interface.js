"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SimpleProcessorCallbackBase = void 0;
const SimpleProcessorCallbackBase = (Base) => {
    return class extends Base {
        constructor() {
            super(...arguments);
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
                    cb = undefined;
                    destructor = undefined;
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
    };
};
exports.SimpleProcessorCallbackBase = SimpleProcessorCallbackBase;
//# sourceMappingURL=interface.js.map