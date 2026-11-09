"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Vp8RtpPayload = void 0;
const src_1 = require("../../../common/src");
// RFC 7741 - RTP Payload Format for VP8 Video
//        0 1 2 3 4 5 6 7                      0 1 2 3 4 5 6 7
//       +-+-+-+-+-+-+-+-+                   +-+-+-+-+-+-+-+-+
//       |X|R|N|S|R| PID | (REQUIRED)        |X|R|N|S|R| PID | (REQUIRED)
//       +-+-+-+-+-+-+-+-+                   +-+-+-+-+-+-+-+-+
//  X:   |I|L|T|K| RSV   | (OPTIONAL)   X:   |I|L|T|K| RSV   | (OPTIONAL)
//       +-+-+-+-+-+-+-+-+                   +-+-+-+-+-+-+-+-+
//  I:   |M| PictureID   | (OPTIONAL)   I:   |M| PictureID   | (OPTIONAL)
//       +-+-+-+-+-+-+-+-+                   +-+-+-+-+-+-+-+-+
//  L:   |   TL0PICIDX   | (OPTIONAL)        |   PictureID   |
//       +-+-+-+-+-+-+-+-+                   +-+-+-+-+-+-+-+-+
//  T/K: |TID|Y| KEYIDX  | (OPTIONAL)   L:   |   TL0PICIDX   | (OPTIONAL)
//       +-+-+-+-+-+-+-+-+                   +-+-+-+-+-+-+-+-+
//                                      T/K: |TID|Y| KEYIDX  | (OPTIONAL)
//                                           +-+-+-+-+-+-+-+-+
// 0 1 2 3 4 5 6 7
// +-+-+-+-+-+-+-+-+
// |Size0|H| VER |P|
// +-+-+-+-+-+-+-+-+
// |     Size1     |
// +-+-+-+-+-+-+-+-+
// |     Size2     |
// +-+-+-+-+-+-+-+-+
// | Octets 4..N of|
// | VP8 payload   |
// :               :
// +-+-+-+-+-+-+-+-+
// | OPTIONAL RTP  |
// | padding       |
// :               :
// +-+-+-+-+-+-+-+-+
class Vp8RtpPayload {
    constructor() {
        Object.defineProperty(this, "xBit", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "nBit", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "sBit", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "pid", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "iBit", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "lBit", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "tBit", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "kBit", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "mBit", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "pictureId", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "payload", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "size0", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "hBit", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "ver", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "pBit", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "size1", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "size2", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
    }
    static deSerialize(buf) {
        const p = new Vp8RtpPayload();
        let offset = 0;
        p.xBit = (0, src_1.getBit)(buf[offset], 0);
        p.nBit = (0, src_1.getBit)(buf[offset], 2);
        p.sBit = (0, src_1.getBit)(buf[offset], 3);
        p.pid = (0, src_1.getBit)(buf[offset], 5, 3);
        offset++;
        if (p.xBit) {
            p.iBit = (0, src_1.getBit)(buf[offset], 0);
            p.lBit = (0, src_1.getBit)(buf[offset], 1);
            p.tBit = (0, src_1.getBit)(buf[offset], 2);
            p.kBit = (0, src_1.getBit)(buf[offset], 3);
            offset++;
        }
        if (p.iBit) {
            p.mBit = (0, src_1.getBit)(buf[offset], 0);
            if (p.mBit) {
                const _7 = (0, src_1.paddingByte)((0, src_1.getBit)(buf[offset], 1, 7));
                const _8 = (0, src_1.paddingByte)(buf[offset + 1]);
                p.pictureId = Number.parseInt(_7 + _8, 2);
                offset += 2;
            }
            else {
                p.pictureId = (0, src_1.getBit)(buf[offset], 1, 7);
                offset++;
            }
        }
        if (p.lBit) {
            offset++;
        }
        if (p.lBit || p.kBit) {
            if (p.tBit) {
            }
            if (p.kBit) {
            }
            offset++;
        }
        p.payload = buf.subarray(offset);
        if (p.payloadHeaderExist) {
            p.size0 = (0, src_1.getBit)(buf[offset], 0, 3);
            p.hBit = (0, src_1.getBit)(buf[offset], 3);
            p.ver = (0, src_1.getBit)(buf[offset], 4, 3);
            p.pBit = (0, src_1.getBit)(buf[offset], 7);
            offset++;
            p.size1 = buf[offset];
            offset++;
            p.size2 = buf[offset];
        }
        return p;
    }
    static isDetectedFinalPacketInSequence(header) {
        return header.marker;
    }
    get isKeyframe() {
        return this.pBit === 0;
    }
    get isPartitionHead() {
        return this.sBit === 1;
    }
    get payloadHeaderExist() {
        return this.sBit === 1 && this.pid === 0;
    }
    get size() {
        if (this.payloadHeaderExist) {
            const size = this.size0 + 8 * this.size1 + 2048 * this.size2;
            return size;
        }
        return 0;
    }
}
exports.Vp8RtpPayload = Vp8RtpPayload;
//# sourceMappingURL=vp8.js.map