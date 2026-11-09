"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.depacketizeTransformer = void 0;
const web_1 = require("stream/web");
const depacketizer_1 = require("./depacketizer");
const depacketizeTransformer = (...args) => new DepacketizeTransformer(...args).transform;
exports.depacketizeTransformer = depacketizeTransformer;
class DepacketizeTransformer extends depacketizer_1.DepacketizeBase {
    constructor(codec, options = {}) {
        super(codec, options);
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
//# sourceMappingURL=depacketizerTransformer.js.map