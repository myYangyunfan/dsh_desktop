"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PictureLossIndication = void 0;
const src_1 = require("../../../../common/src");
class PictureLossIndication {
    constructor(props = {}) {
        Object.defineProperty(this, "count", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: PictureLossIndication.count
        });
        Object.defineProperty(this, "length", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 2
        });
        Object.defineProperty(this, "senderSsrc", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "mediaSsrc", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.assign(this, props);
    }
    static deSerialize(data) {
        const [senderSsrc, mediaSsrc] = (0, src_1.bufferReader)(data, [4, 4]);
        return new PictureLossIndication({ senderSsrc, mediaSsrc });
    }
    serialize() {
        return (0, src_1.bufferWriter)([4, 4], [this.senderSsrc, this.mediaSsrc]);
    }
}
exports.PictureLossIndication = PictureLossIndication;
Object.defineProperty(PictureLossIndication, "count", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: 1
});
//# sourceMappingURL=pictureLossIndication.js.map