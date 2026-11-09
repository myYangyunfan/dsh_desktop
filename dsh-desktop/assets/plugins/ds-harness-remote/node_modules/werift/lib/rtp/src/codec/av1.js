"use strict";
// RTP Payload Format For AV1 https://aomediacodec.github.io/av1-rtp-spec/
Object.defineProperty(exports, "__esModule", { value: true });
exports.AV1Obu = exports.AV1RtpPayload = void 0;
exports.leb128decode = leb128decode;
const common_1 = require("../imports/common");
const leb128_1 = require("./leb128");
const log = (0, common_1.debug)("werift-rtp : packages/rtp/src/codec/av1.ts");
// 4.4 AV1 Aggregation Header
//  0 1 2 3 4 5 6 7
// +-+-+-+-+-+-+-+-+
// |Z|Y| W |N|-|-|-|
// +-+-+-+-+-+-+-+-+
// RTP payload syntax:
// 0                   1                   2                   3
// 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
// +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
// |Z|Y|0 0|N|-|-|-|  OBU element 1 size (leb128)  |               |
// +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+               |
// :                                                               :
// :                      OBU element 1 data                       :
// :                                                               :
// |                                                               |
// |                               +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
// |                               |  OBU element 2 size (leb128)  |
// +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
// :                                                               :
// :                       OBU element 2 data                      :
// :                                                               :
// |                                                               |
// +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
// :                                                               :
// :                              ...                              :
// :                                                               :
// +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
// |OBU e... N size|                                               |
// +-+-+-+-+-+-+-+-+       OBU element N data      +-+-+-+-+-+-+-+-+
// |                                               |
// +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
// OBU syntax:
//     0 1 2 3 4 5 6 7
//    +-+-+-+-+-+-+-+-+
//    |0| type  |X|S|-| (REQUIRED)
//    +-+-+-+-+-+-+-+-+
// X: | TID |SID|-|-|-| (OPTIONAL)
//    +-+-+-+-+-+-+-+-+
//    |1|             |
//    +-+ OBU payload |
// S: |1|             | (OPTIONAL, variable length leb128 encoded)
//    +-+    size     |
//    |0|             |
//    +-+-+-+-+-+-+-+-+
//    |  OBU payload  |
//    |     ...       |
class AV1RtpPayload {
    constructor() {
        /**
         * RtpStartsWithFragment
         * MUST be set to 1 if the first OBU element is an OBU fragment that is a continuation of an OBU fragment from the previous packet, and MUST be set to 0 otherwise.
         */
        Object.defineProperty(this, "zBit_RtpStartsWithFragment", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        /**
         * RtpEndsWithFragment
         * MUST be set to 1 if the last OBU element is an OBU fragment that will continue in the next packet, and MUST be set to 0 otherwise.
         */
        Object.defineProperty(this, "yBit_RtpEndsWithFragment", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        /**
         * RtpNumObus
         * two bit field that describes the number of OBU elements in the packet. This field MUST be set equal to 0 or equal to the number of OBU elements contained in the packet. If set to 0, each OBU element MUST be preceded by a length field.
         */
        Object.defineProperty(this, "w_RtpNumObus", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        /**
         * RtpStartsNewCodedVideoSequence
         * MUST be set to 1 if the packet is the first packet of a coded video sequence, and MUST be set to 0 otherwise.
         */
        Object.defineProperty(this, "nBit_RtpStartsNewCodedVideoSequence", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "obu_or_fragment", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
    }
    static isDetectedFinalPacketInSequence(header) {
        return header.marker;
    }
    get isKeyframe() {
        return this.nBit_RtpStartsNewCodedVideoSequence === 1;
    }
    static getFrame(payloads) {
        const frames = [];
        const objects = payloads
            .flatMap((p) => p.obu_or_fragment)
            .reduce((acc, cur, i) => {
            acc[i] = cur;
            return acc;
        }, {});
        const length = Object.keys(objects).length;
        for (const i of Object.keys(objects).map(Number)) {
            const exist = objects[i];
            if (!exist)
                continue;
            const { data, isFragment } = exist;
            if (isFragment) {
                let fragments = [];
                for (let head = i; head < length; head++) {
                    const target = objects[head];
                    if (target.isFragment) {
                        fragments.push(target.data);
                        delete objects[head];
                    }
                    else {
                        break;
                    }
                }
                if (fragments.length <= 1) {
                    log("fragment lost, maybe packet lost");
                    fragments = [];
                }
                frames.push(Buffer.concat(fragments));
            }
            else {
                frames.push(data);
            }
        }
        const obus = frames.map((f) => AV1Obu.deSerialize(f));
        const lastObu = obus.pop();
        return Buffer.concat([
            ...obus.map((o) => {
                o.obu_has_size_field = 1;
                return o.serialize();
            }),
            lastObu.serialize(),
        ]);
    }
}
exports.AV1RtpPayload = AV1RtpPayload;
Object.defineProperty(AV1RtpPayload, "deSerialize", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: (buf) => {
        const p = new AV1RtpPayload();
        let offset = 0;
        p.zBit_RtpStartsWithFragment = (0, common_1.getBit)(buf[offset], 0);
        p.yBit_RtpEndsWithFragment = (0, common_1.getBit)(buf[offset], 1);
        p.w_RtpNumObus = (0, common_1.getBit)(buf[offset], 2, 2);
        p.nBit_RtpStartsNewCodedVideoSequence = (0, common_1.getBit)(buf[offset], 4);
        offset++;
        if (p.nBit_RtpStartsNewCodedVideoSequence && p.zBit_RtpStartsWithFragment) {
            throw new Error();
        }
        [...Array(p.w_RtpNumObus - 1).keys()].forEach((i) => {
            const [elementSize, bytes] = leb128decode(buf.subarray(offset));
            const start = offset + bytes;
            const end = start + elementSize;
            let isFragment = false;
            if (p.zBit_RtpStartsWithFragment && i === 0) {
                isFragment = true;
            }
            p.obu_or_fragment.push({ data: buf.subarray(start, end), isFragment });
            offset += bytes + elementSize;
        });
        let isFragment = false;
        if (p.yBit_RtpEndsWithFragment ||
            (p.w_RtpNumObus === 1 && p.zBit_RtpStartsWithFragment)) {
            isFragment = true;
        }
        p.obu_or_fragment.push({
            data: buf.subarray(offset),
            isFragment: isFragment,
        });
        return p;
    }
});
class AV1Obu {
    constructor() {
        Object.defineProperty(this, "obu_forbidden_bit", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "obu_type", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "obu_extension_flag", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "obu_has_size_field", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "obu_reserved_1bit", {
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
    }
    static deSerialize(buf) {
        const obu = new AV1Obu();
        let offset = 0;
        obu.obu_forbidden_bit = (0, common_1.getBit)(buf[offset], 0);
        obu.obu_type =
            OBU_TYPES[(0, common_1.getBit)(buf[offset], 1, 4)];
        obu.obu_extension_flag = (0, common_1.getBit)(buf[offset], 5);
        obu.obu_has_size_field = (0, common_1.getBit)(buf[offset], 6);
        obu.obu_reserved_1bit = (0, common_1.getBit)(buf[offset], 7);
        offset++;
        obu.payload = buf.subarray(offset);
        return obu;
    }
    serialize() {
        const header = new common_1.BitWriter2(8)
            .set(this.obu_forbidden_bit)
            .set(OBU_TYPE_IDS[this.obu_type], 4)
            .set(this.obu_extension_flag)
            .set(this.obu_has_size_field)
            .set(this.obu_reserved_1bit).buffer;
        let obuSize = Buffer.alloc(0);
        if (this.obu_has_size_field) {
            obuSize = (0, leb128_1.leb128encode)(this.payload.length);
        }
        return Buffer.concat([header, obuSize, this.payload]);
    }
}
exports.AV1Obu = AV1Obu;
function leb128decode(buf) {
    let value = 0;
    let leb128bytes = 0;
    for (let i = 0; i < 8; i++) {
        if (i >= buf.length) {
            throw new Error("LEB128 decode incomplete");
        }
        const leb128byte = buf.readUInt8(i);
        value += (leb128byte & 0x7f) * 128 ** i;
        leb128bytes++;
        if (!(leb128byte & 0x80)) {
            if (!Number.isSafeInteger(value)) {
                throw new Error("LEB128 value exceeds safe integer");
            }
            return [value, leb128bytes];
        }
    }
    throw new Error("LEB128 decode incomplete");
}
const OBU_TYPES = {
    0: "Reserved",
    1: "OBU_SEQUENCE_HEADER",
    2: "OBU_TEMPORAL_DELIMITER",
    3: "OBU_FRAME_HEADER",
    4: "OBU_TILE_GROUP",
    5: "OBU_METADATA",
    6: "OBU_FRAME",
    7: "OBU_REDUNDANT_FRAME_HEADER",
    8: "OBU_TILE_LIST",
    15: "OBU_PADDING",
};
const OBU_TYPE_IDS = Object.entries(OBU_TYPES).reduce((acc, [key, value]) => {
    acc[value] = Number(key);
    return acc;
}, {});
//# sourceMappingURL=av1.js.map