"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FullIntraRequest = void 0;
const src_1 = require("../../../../common/src");
class FullIntraRequest {
    constructor(props = {}) {
        Object.defineProperty(this, "count", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: FullIntraRequest.count
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
        Object.defineProperty(this, "fir", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        Object.assign(this, props);
    }
    get length() {
        return Math.floor(this.serialize().length / 4 - 1);
    }
    static deSerialize(data) {
        const [senderSsrc, mediaSsrc] = (0, src_1.bufferReader)(data, [4, 4]);
        const fir = [];
        for (let i = 8; i < data.length; i += 8) {
            fir.push({ ssrc: data.readUInt32BE(i), sequenceNumber: data[i + 4] });
        }
        return new FullIntraRequest({ senderSsrc, mediaSsrc, fir });
    }
    serialize() {
        const ssrcs = (0, src_1.bufferWriter)([4, 4], [this.senderSsrc, this.mediaSsrc]);
        const fir = Buffer.alloc(this.fir.length * 8);
        this.fir.forEach(({ ssrc, sequenceNumber }, i) => {
            fir.writeUInt32BE(ssrc, i * 8);
            fir[i * 8 + 4] = sequenceNumber;
        });
        return Buffer.concat([ssrcs, fir]);
    }
}
exports.FullIntraRequest = FullIntraRequest;
Object.defineProperty(FullIntraRequest, "count", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: 4
});
//# sourceMappingURL=fullIntraRequest.js.map