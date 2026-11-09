"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebmStream = void 0;
const web_1 = require("stream/web");
const webm_1 = require("./webm");
class WebmStream extends webm_1.WebmBase {
    constructor(tracks, options = {}) {
        super(tracks, (output) => {
            this.controller.enqueue(output);
        }, options);
        Object.defineProperty(this, "audioStream", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "videoStream", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "webmStream", {
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
        const audioTrack = tracks.find((t) => t.kind === "audio");
        if (audioTrack) {
            this.audioStream = new web_1.WritableStream({
                write: (input) => {
                    this.processAudioInput(input);
                },
            });
        }
        const videoTrack = tracks.find((t) => t.kind === "video");
        if (videoTrack) {
            this.videoStream = new web_1.WritableStream({
                write: (input) => {
                    this.processVideoInput(input);
                },
            });
        }
        this.webmStream = new web_1.ReadableStream({
            start: (controller) => {
                this.controller = controller;
            },
        });
        this.start();
    }
}
exports.WebmStream = WebmStream;
//# sourceMappingURL=webmStream.js.map