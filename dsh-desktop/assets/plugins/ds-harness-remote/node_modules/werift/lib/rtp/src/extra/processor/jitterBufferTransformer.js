"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.JitterBufferTransformer = exports.jitterBufferTransformer = void 0;
const web_1 = require("stream/web");
const jitterBuffer_1 = require("./jitterBuffer");
const jitterBufferTransformer = (...args) => new JitterBufferTransformer(...args).transform;
exports.jitterBufferTransformer = jitterBufferTransformer;
class JitterBufferTransformer extends jitterBuffer_1.JitterBufferBase {
    constructor(clockRate, options = {}) {
        super(clockRate, options);
        Object.defineProperty(this, "clockRate", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: clockRate
        });
        Object.defineProperty(this, "transform", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        this.transform = new web_1.TransformStream({
            transform: (input, output) => {
                for (const res of this.processInput(input)) {
                    output.enqueue(res);
                }
            },
        });
    }
}
exports.JitterBufferTransformer = JitterBufferTransformer;
//# sourceMappingURL=jitterBufferTransformer.js.map