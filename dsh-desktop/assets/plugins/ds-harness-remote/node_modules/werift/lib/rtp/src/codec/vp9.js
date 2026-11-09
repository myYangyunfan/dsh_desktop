"use strict";
// RTP Payload Format for VP9 Video draft-ietf-payload-vp9-16 https://datatracker.ietf.org/doc/html/draft-ietf-payload-vp9
Object.defineProperty(exports, "__esModule", { value: true });
exports.Vp9RtpPayload = void 0;
const src_1 = require("../../../common/src");
//          0 1 2 3 4 5 6 7
//         +-+-+-+-+-+-+-+-+
//         |I|P|L|F|B|E|V|Z| (REQUIRED)
//         +-+-+-+-+-+-+-+-+
//    I:   |M| PICTURE ID  | (REQUIRED)
//         +-+-+-+-+-+-+-+-+
//    M:   | EXTENDED PID  | (RECOMMENDED)
//         +-+-+-+-+-+-+-+-+
//    L:   | TID |U| SID |D| (Conditionally RECOMMENDED)
//         +-+-+-+-+-+-+-+-+                             -\
//    P,F: | P_DIFF      |N| (Conditionally REQUIRED)    - up to 3 times
//         +-+-+-+-+-+-+-+-+                             -/
//    V:   | SS            |
//         | ..            |
//         +-+-+-+-+-+-+-+-+
//          0 1 2 3 4 5 6 7
//         +-+-+-+-+-+-+-+-+
//         |I|P|L|F|B|E|V|Z| (REQUIRED)
//         +-+-+-+-+-+-+-+-+
//    I:   |M| PICTURE ID  | (RECOMMENDED)
//         +-+-+-+-+-+-+-+-+
//    M:   | EXTENDED PID  | (RECOMMENDED)
//         +-+-+-+-+-+-+-+-+
//    L:   | TID |U| SID |D| (Conditionally RECOMMENDED)
//         +-+-+-+-+-+-+-+-+
//         |   TL0PICIDX   | (Conditionally REQUIRED)
//         +-+-+-+-+-+-+-+-+
//    V:   | SS            |
//         | ..            |
//         +-+-+-+-+-+-+-+-+
class Vp9RtpPayload {
    constructor() {
        /**Picture ID (PID) present */
        Object.defineProperty(this, "iBit", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        /**Inter-picture predicted frame */
        Object.defineProperty(this, "pBit", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        /**Layer indices present */
        Object.defineProperty(this, "lBit", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        /**Flexible mode */
        Object.defineProperty(this, "fBit", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        /**Start of a frame */
        Object.defineProperty(this, "bBit", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        /**End of a frame */
        Object.defineProperty(this, "eBit", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        /**Scalability structure */
        Object.defineProperty(this, "vBit", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "zBit", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "m", {
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
        Object.defineProperty(this, "tid", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "u", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "sid", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        /**inter_layer_predicted */
        Object.defineProperty(this, "d", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "tl0PicIdx", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "pDiff", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        Object.defineProperty(this, "n_s", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "y", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "g", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "width", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        Object.defineProperty(this, "height", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        Object.defineProperty(this, "n_g", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "pgT", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        Object.defineProperty(this, "pgU", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        Object.defineProperty(this, "pgP_Diff", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        Object.defineProperty(this, "payload", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
    }
    static deSerialize(buf) {
        const { p, offset } = this.parseRtpPayload(buf);
        p.payload = buf.subarray(offset);
        return p;
    }
    static parseRtpPayload(buf) {
        const p = new Vp9RtpPayload();
        let offset = 0;
        p.iBit = (0, src_1.getBit)(buf[offset], 0); // PictureId present .
        p.pBit = (0, src_1.getBit)(buf[offset], 1); // Inter-picture predicted.
        p.lBit = (0, src_1.getBit)(buf[offset], 2); // Layer indices present.
        p.fBit = (0, src_1.getBit)(buf[offset], 3); // Flexible mode.
        p.bBit = (0, src_1.getBit)(buf[offset], 4); // Begins frame flag.
        p.eBit = (0, src_1.getBit)(buf[offset], 5); // Ends frame flag.
        p.vBit = (0, src_1.getBit)(buf[offset], 6); // Scalability structure present.
        p.zBit = (0, src_1.getBit)(buf[offset], 7); // Not used for inter-layer prediction
        offset++;
        if (p.iBit) {
            p.m = (0, src_1.getBit)(buf[offset], 0);
            if (p.m) {
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
            p.tid = (0, src_1.getBit)(buf[offset], 0, 3);
            p.u = (0, src_1.getBit)(buf[offset], 3);
            p.sid = (0, src_1.getBit)(buf[offset], 4, 3);
            p.d = (0, src_1.getBit)(buf[offset], 7);
            offset++;
            if (p.fBit === 0) {
                p.tl0PicIdx = buf[offset];
                offset++;
            }
        }
        if (p.fBit && p.pBit) {
            for (;;) {
                p.pDiff = [...p.pDiff, (0, src_1.getBit)(buf[offset], 0, 7)];
                const n = (0, src_1.getBit)(buf[offset], 7);
                offset++;
                if (n === 0)
                    break;
            }
        }
        // Scalability structure (SS):
        //
        //      +-+-+-+-+-+-+-+-+
        // V:   | N_S |Y|G|-|-|-|
        //      +-+-+-+-+-+-+-+-+              -|
        // Y:   |     WIDTH     | (OPTIONAL)    .
        //      +               +               .
        //      |               | (OPTIONAL)    .
        //      +-+-+-+-+-+-+-+-+               . N_S + 1 times
        //      |     HEIGHT    | (OPTIONAL)    .
        //      +               +               .
        //      |               | (OPTIONAL)    .
        //      +-+-+-+-+-+-+-+-+              -|
        // G:   |      N_G      | (OPTIONAL)
        //      +-+-+-+-+-+-+-+-+                           -|
        // N_G: |  T  |U| R |-|-| (OPTIONAL)                 .
        //      +-+-+-+-+-+-+-+-+              -|            . N_G times
        //      |    P_DIFF     | (OPTIONAL)    . R times    .
        //      +-+-+-+-+-+-+-+-+              -|           -|
        //
        if (p.vBit) {
            p.n_s = (0, src_1.getBit)(buf[offset], 0, 3);
            p.y = (0, src_1.getBit)(buf[offset], 3);
            p.g = (0, src_1.getBit)(buf[offset], 4);
            offset++;
            if (p.y) {
                [...Array(p.n_s + 1)].forEach(() => {
                    p.width.push(buf.readUInt16BE(offset));
                    offset += 2;
                    p.height.push(buf.readUInt16BE(offset));
                    offset += 2;
                });
            }
            if (p.g) {
                p.n_g = buf[offset];
                offset++;
            }
            if (p.n_g > 0) {
                [...Array(p.n_g).keys()].forEach((i) => {
                    p.pgT.push((0, src_1.getBit)(buf[offset], 0, 3));
                    p.pgU.push((0, src_1.getBit)(buf[offset], 3));
                    const r = (0, src_1.getBit)(buf[offset], 4, 2);
                    offset++;
                    p.pgP_Diff[i] = [];
                    if (r > 0) {
                        [...Array(r)].forEach(() => {
                            p.pgP_Diff[i].push(buf[offset]);
                            offset++;
                        });
                    }
                });
            }
        }
        return { offset, p };
    }
    static isDetectedFinalPacketInSequence(header) {
        return header.marker;
    }
    get isKeyframe() {
        return !!(!this.pBit && this.bBit && (!this.sid || !this.lBit));
    }
    get isPartitionHead() {
        return this.bBit && (!this.lBit || !this.d);
    }
}
exports.Vp9RtpPayload = Vp9RtpPayload;
//# sourceMappingURL=vp9.js.map