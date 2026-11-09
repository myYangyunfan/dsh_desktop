"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LipsyncCallback = void 0;
const lipsync_1 = require("./lipsync");
class LipsyncCallback extends lipsync_1.LipsyncBase {
    constructor(options = {}) {
        super((output) => {
            if (this.audioCb) {
                this.audioCb(output);
            }
        }, (output) => {
            if (this.videoCb) {
                this.videoCb(output);
            }
        }, options);
        Object.defineProperty(this, "audioCb", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "audioDestructor", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "videoCb", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "videoDestructor", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "pipeAudio", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: (cb, destructor) => {
                this.audioCb = cb;
                this.audioDestructor = destructor;
            }
        });
        Object.defineProperty(this, "pipeVideo", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: (cb, destructor) => {
                this.videoCb = cb;
                this.videoDestructor = destructor;
            }
        });
        Object.defineProperty(this, "inputAudio", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: (input) => {
                this.processAudioInput(input);
            }
        });
        Object.defineProperty(this, "inputVideo", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: (input) => {
                this.processVideoInput(input);
            }
        });
        Object.defineProperty(this, "destroy", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: () => {
                if (this.audioDestructor) {
                    this.audioDestructor();
                    this.audioDestructor = undefined;
                }
                if (this.videoDestructor) {
                    this.videoDestructor();
                    this.videoDestructor = undefined;
                }
                this.audioCb = undefined;
                this.videoCb = undefined;
            }
        });
    }
}
exports.LipsyncCallback = LipsyncCallback;
//# sourceMappingURL=lipsyncCallback.js.map