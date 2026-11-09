"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedEncoder = void 0;
const src_1 = require("../../../../common/src");
const packet_1 = require("./packet");
class RedEncoder {
    constructor(distance = 1) {
        Object.defineProperty(this, "distance", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: distance
        });
        Object.defineProperty(this, "cache", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        Object.defineProperty(this, "cacheSize", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 10
        });
    }
    push(payload) {
        this.cache.push(payload);
        if (this.cache.length > this.cacheSize) {
            this.cache.shift();
        }
    }
    build() {
        const red = new packet_1.Red();
        const redundantPayloads = this.cache.slice(-(this.distance + 1));
        const presentPayload = redundantPayloads.pop();
        if (!presentPayload) {
            return red;
        }
        redundantPayloads.forEach((redundant) => {
            const timestampOffset = (0, src_1.uint32Add)(presentPayload.timestamp, -redundant.timestamp);
            if (timestampOffset > Max14Uint) {
                return;
            }
            red.blocks.push({
                block: redundant.block,
                blockPT: redundant.blockPT,
                timestampOffset,
            });
        });
        red.blocks.push({
            block: presentPayload.block,
            blockPT: presentPayload.blockPT,
        });
        return red;
    }
}
exports.RedEncoder = RedEncoder;
const Max14Uint = (0x01 << 14) - 1;
//# sourceMappingURL=encoder.js.map