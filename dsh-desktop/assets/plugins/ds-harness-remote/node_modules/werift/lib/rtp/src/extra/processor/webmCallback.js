"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.saveToFileSystem = exports.WebmCallback = void 0;
const promises_1 = require("fs/promises");
const __1 = require("../..");
const webm_1 = require("./webm");
class WebmCallback extends webm_1.WebmBase {
    constructor(tracks, options = {}) {
        super(tracks, async (output) => {
            const cb = this.cb;
            if (cb) {
                await this.queue.push(() => cb(output));
            }
        }, options);
        Object.defineProperty(this, "cb", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "queue", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new __1.PromiseQueue()
        });
        Object.defineProperty(this, "pipe", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: (cb) => {
                this.cb = cb;
                this.start();
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
                this.cb = undefined;
                this.queue.cancel();
            }
        });
    }
}
exports.WebmCallback = WebmCallback;
/**
 *
 * @param path
 * @returns eol
 */
const saveToFileSystem = (path) => {
    const queue = new __1.PromiseQueue();
    return async (value) => {
        return await queue.push(async () => {
            if (value.saveToFile) {
                await (0, promises_1.appendFile)(path, value.saveToFile);
                return false;
            }
            else if (value.eol) {
                const { durationElement } = value.eol;
                const handler = await (0, promises_1.open)(path, "r+");
                // set duration
                await handler.write(durationElement, 0, durationElement.length, webm_1.DurationPosition);
                // set size
                const meta = await (0, promises_1.stat)(path);
                const resize = (0, webm_1.replaceSegmentSize)(meta.size);
                await handler.write(resize, 0, resize.length, webm_1.SegmentSizePosition);
                await handler.close();
                return true;
            }
            return false;
        });
    };
};
exports.saveToFileSystem = saveToFileSystem;
//# sourceMappingURL=webmCallback.js.map