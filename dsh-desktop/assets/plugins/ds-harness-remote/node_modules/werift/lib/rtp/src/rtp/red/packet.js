"use strict";
// rfc2198
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedHeader = exports.Red = void 0;
const common_1 = require("../../imports/common");
const log = (0, common_1.debug)("packages/rtp/src/rtp/red/packet.ts");
// 0                   1                    2                   3
// 0 1 2 3 4 5 6 7 8 9 0 1 2 3  4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
// +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
// |F|   block PT  |  timestamp offset         |   block length    |
// +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
// 0 1 2 3 4 5 6 7
// +-+-+-+-+-+-+-+-+
// |0|   Block PT  |
// +-+-+-+-+-+-+-+-+
class Red {
    constructor() {
        Object.defineProperty(this, "header", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "blocks", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
    }
    static deSerialize(bufferOrArrayBuffer) {
        const buf = bufferOrArrayBuffer instanceof ArrayBuffer
            ? Buffer.from(bufferOrArrayBuffer)
            : bufferOrArrayBuffer;
        const red = new Red();
        let offset = 0;
        [red.header, offset] = RedHeader.deSerialize(buf);
        red.header.fields.forEach(({ blockLength, timestampOffset, blockPT }) => {
            if (blockLength && timestampOffset) {
                const block = buf.subarray(offset, offset + blockLength);
                red.blocks.push({ block, blockPT, timestampOffset });
                offset += blockLength;
            }
            else {
                const block = buf.subarray(offset);
                red.blocks.push({ block, blockPT });
            }
        });
        return red;
    }
    serialize() {
        this.header = new RedHeader();
        for (const { timestampOffset, blockPT, block } of this.blocks) {
            if (timestampOffset) {
                this.header.fields.push({
                    fBit: 1,
                    blockPT,
                    blockLength: block.length,
                    timestampOffset,
                });
            }
            else {
                this.header.fields.push({ fBit: 0, blockPT });
            }
        }
        let buf = this.header.serialize();
        for (const { block } of this.blocks) {
            buf = Buffer.concat([buf, block]);
        }
        return buf;
    }
}
exports.Red = Red;
class RedHeader {
    constructor() {
        Object.defineProperty(this, "fields", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
    }
    static deSerialize(buf) {
        let offset = 0;
        const header = new RedHeader();
        for (;;) {
            const field = {};
            header.fields.push(field);
            const bitStream = new common_1.BitStream(buf.subarray(offset));
            field.fBit = bitStream.readBits(1);
            field.blockPT = bitStream.readBits(7);
            offset++;
            if (field.fBit === 0) {
                break;
            }
            field.timestampOffset = bitStream.readBits(14);
            field.blockLength = bitStream.readBits(10);
            offset += 3;
        }
        return [header, offset];
    }
    serialize() {
        let buf = Buffer.alloc(0);
        for (const field of this.fields) {
            try {
                if (field.timestampOffset && field.blockLength) {
                    const bitStream = new common_1.BitStream(Buffer.alloc(4))
                        .writeBits(1, field.fBit)
                        .writeBits(7, field.blockPT)
                        .writeBits(14, field.timestampOffset)
                        .writeBits(10, field.blockLength);
                    buf = Buffer.concat([buf, bitStream.uint8Array]);
                }
                else {
                    const bitStream = new common_1.BitStream(Buffer.alloc(1))
                        .writeBits(1, 0)
                        .writeBits(7, field.blockPT);
                    buf = Buffer.concat([buf, bitStream.uint8Array]);
                }
            }
            catch (error) {
                log(error?.message);
            }
        }
        return buf;
    }
}
exports.RedHeader = RedHeader;
//# sourceMappingURL=packet.js.map