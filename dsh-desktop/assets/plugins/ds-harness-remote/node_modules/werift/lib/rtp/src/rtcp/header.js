"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RtcpHeader = exports.RTCP_HEADER_SIZE = void 0;
const src_1 = require("../../../common/src");
exports.RTCP_HEADER_SIZE = 4;
/*
 *  0                   1                   2                   3
 *  0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
 * +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
 * |V=2|P|    RC   |      PT       |             length            |
 * +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
 */
class RtcpHeader {
    constructor(props = {}) {
        Object.defineProperty(this, "version", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 2
        });
        Object.defineProperty(this, "padding", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        Object.defineProperty(this, "count", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "type", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        /**このパケットの長さは、ヘッダーと任意のパディングを含む32ビットワードから 1を引いたものである */
        Object.defineProperty(this, "length", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.assign(this, props);
    }
    static serialize(type, count, payload, length) {
        const header = new RtcpHeader({
            type,
            count,
            version: 2,
            length,
        });
        const buf = header.serialize();
        return Buffer.concat([buf, payload]);
    }
    serialize() {
        const v_p_rc = new src_1.BitWriter(8);
        v_p_rc.set(2, 0, this.version);
        if (this.padding)
            v_p_rc.set(1, 2, 1);
        v_p_rc.set(5, 3, this.count);
        const buf = (0, src_1.bufferWriter)([1, 1, 2], [v_p_rc.value, this.type, this.length]);
        return buf;
    }
    static deSerialize(buf) {
        const [v_p_rc, type, length] = (0, src_1.bufferReader)(buf, [1, 1, 2]);
        const version = (0, src_1.getBit)(v_p_rc, 0, 2);
        const padding = (0, src_1.getBit)(v_p_rc, 2, 1) > 0;
        const count = (0, src_1.getBit)(v_p_rc, 3, 5);
        return new RtcpHeader({ version, padding, count, type, length });
    }
}
exports.RtcpHeader = RtcpHeader;
//# sourceMappingURL=header.js.map