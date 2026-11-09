"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RtpSourceCallback = void 0;
const common_1 = require("../../imports/common");
const __1 = require("../..");
class RtpSourceCallback {
    constructor(options = {}) {
        Object.defineProperty(this, "options", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: options
        });
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
        Object.defineProperty(this, "stats", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: {}
        });
        Object.defineProperty(this, "buffer", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        Object.defineProperty(this, "bufferFulfilled", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        Object.defineProperty(this, "input", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: (packet) => {
                const rtp = Buffer.isBuffer(packet)
                    ? __1.RtpPacket.deSerialize(packet)
                    : packet;
                if (this.options.payloadType != undefined &&
                    this.options.payloadType !== rtp.header.payloadType) {
                    if (this.options.clearInvalidPTPacket) {
                        rtp.clear();
                    }
                    return;
                }
                this.stats["rtpSource"] =
                    new Date().toISOString() +
                        " timestamp:" +
                        rtp?.header.timestamp +
                        " seq:" +
                        rtp?.header.sequenceNumber;
                const cb = this.cb;
                if (cb) {
                    if (this.options.initialBufferLength) {
                        if (this.bufferFulfilled) {
                            cb({ rtp });
                            return;
                        }
                        this.buffer.push(rtp);
                        if (this.buffer.length > this.options.initialBufferLength) {
                            this.buffer.forEach((rtp) => {
                                cb({ rtp });
                            });
                            this.buffer = [];
                            this.bufferFulfilled = true;
                        }
                    }
                    else {
                        cb({ rtp });
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
                this.onStopped.allUnsubscribe();
            }
        });
        options.clearInvalidPTPacket = options.clearInvalidPTPacket ?? true;
    }
    toJSON() {
        return { ...this.stats };
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
exports.RtpSourceCallback = RtpSourceCallback;
//# sourceMappingURL=rtpCallback.js.map