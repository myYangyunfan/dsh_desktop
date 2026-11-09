"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RtpSourceStream = void 0;
const web_1 = require("stream/web");
const rtp_1 = require("../../rtp/rtp");
class RtpSourceStream {
    constructor(options = {}) {
        Object.defineProperty(this, "options", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: options
        });
        Object.defineProperty(this, "readable", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "write", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "controller", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "push", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: (packet) => {
                const rtp = Buffer.isBuffer(packet)
                    ? rtp_1.RtpPacket.deSerialize(packet)
                    : packet;
                if (this.options.payloadType != undefined &&
                    this.options.payloadType !== rtp.header.payloadType) {
                    if (this.options.clearInvalidPTPacket) {
                        rtp.clear();
                    }
                    return;
                }
                this.write({ rtp });
            }
        });
        options.clearInvalidPTPacket = options.clearInvalidPTPacket ?? true;
        this.readable = new web_1.ReadableStream({
            start: (controller) => {
                this.controller = controller;
                this.write = (chunk) => controller.enqueue(chunk);
            },
        });
    }
    stop() {
        this.controller.enqueue({ eol: true });
    }
}
exports.RtpSourceStream = RtpSourceStream;
//# sourceMappingURL=rtpStream.js.map