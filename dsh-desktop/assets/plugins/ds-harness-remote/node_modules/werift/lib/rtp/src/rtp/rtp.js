"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RtpPacket = exports.RtpHeader = exports.ExtensionProfiles = void 0;
const src_1 = require("../../../common/src");
exports.ExtensionProfiles = {
    OneByte: 0xbede, // 48862
    TwoByte: 0x1000, // 4096
};
const seqNumOffset = 2;
const timestampOffset = 4;
const ssrcOffset = 8;
const csrcOffset = 12;
const csrcSize = 4;
/*
 *  0                   1                   2                   3
 *  0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
 * +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
 * |V=2|P|X|  CC   |M|     PT      |       sequence number         |
 * +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
 * |                           timestamp                           |
 * +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
 * |           synchronization source (SSRC) identifier            |
 * +=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+
 * |            contributing source (CSRC) identifiers             |
 * |                             ....                              |
 * +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
 */
class RtpHeader {
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
        Object.defineProperty(this, "paddingSize", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "extension", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        Object.defineProperty(this, "marker", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        Object.defineProperty(this, "payloadOffset", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "payloadType", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        /**16bit, 初期値はランダムである必要があります*/
        Object.defineProperty(this, "sequenceNumber", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        /**32bit microsec (milli/1000), 初期値はランダムである必要があります*/
        Object.defineProperty(this, "timestamp", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "ssrc", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "csrcLength", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "csrc", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        Object.defineProperty(this, "extensionProfile", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: exports.ExtensionProfiles.OneByte
        });
        /**deserialize only */
        Object.defineProperty(this, "extensionLength", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "extensions", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        Object.assign(this, props);
    }
    static deSerialize(rawPacket) {
        const h = new RtpHeader();
        let currOffset = 0;
        const v_p_x_cc = rawPacket[currOffset++];
        h.version = (0, src_1.getBit)(v_p_x_cc, 0, 2);
        h.padding = (0, src_1.getBit)(v_p_x_cc, 2) > 0;
        h.extension = (0, src_1.getBit)(v_p_x_cc, 3) > 0;
        h.csrcLength = (0, src_1.getBit)(v_p_x_cc, 4, 4);
        h.csrc = [...Array(h.csrcLength)].map(() => {
            const csrc = rawPacket.readUInt32BE(currOffset);
            currOffset += 4;
            return csrc;
        });
        currOffset += csrcOffset - 1;
        const m_pt = rawPacket[1];
        h.marker = (0, src_1.getBit)(m_pt, 0) > 0;
        h.payloadType = (0, src_1.getBit)(m_pt, 1, 7);
        h.sequenceNumber = rawPacket.readUInt16BE(seqNumOffset);
        h.timestamp = rawPacket.readUInt32BE(timestampOffset);
        h.ssrc = rawPacket.readUInt32BE(ssrcOffset);
        for (let i = 0; i < h.csrc.length; i++) {
            const offset = csrcOffset + i * csrcSize;
            h.csrc[i] = rawPacket.subarray(offset).readUInt32BE();
        }
        if (h.extension) {
            h.extensionProfile = rawPacket
                .subarray(currOffset)
                .readUInt16BE();
            currOffset += 2;
            const extensionLength = rawPacket.subarray(currOffset).readUInt16BE() * 4;
            h.extensionLength = extensionLength;
            currOffset += 2;
            switch (h.extensionProfile) {
                // RFC 8285 RTP One Byte Header Extension
                case exports.ExtensionProfiles.OneByte:
                    {
                        const end = currOffset + extensionLength;
                        while (currOffset < end) {
                            if (rawPacket[currOffset] === 0x00) {
                                currOffset++;
                                continue;
                            }
                            const extId = rawPacket[currOffset] >> 4;
                            const len = (rawPacket[currOffset] & (rawPacket[currOffset] ^ 0xf0)) + 1; // and not &^
                            currOffset++;
                            if (extId === 0xf) {
                                break;
                            }
                            const extension = {
                                id: extId,
                                payload: rawPacket.subarray(currOffset, currOffset + len),
                            };
                            h.extensions = [...h.extensions, extension];
                            currOffset += len;
                        }
                    }
                    break;
                // RFC 8285 RTP Two Byte Header Extension
                case exports.ExtensionProfiles.TwoByte:
                    {
                        const end = currOffset + extensionLength;
                        while (currOffset < end) {
                            if (rawPacket[currOffset] === 0x00) {
                                currOffset++;
                                continue;
                            }
                            const extId = rawPacket[currOffset];
                            currOffset++;
                            const len = rawPacket[currOffset];
                            currOffset++;
                            const extension = {
                                id: extId,
                                payload: rawPacket.subarray(currOffset, currOffset + len),
                            };
                            h.extensions = [...h.extensions, extension];
                            currOffset += len;
                        }
                    }
                    break;
                default:
                    {
                        const extension = {
                            id: 0,
                            payload: rawPacket.subarray(currOffset, currOffset + extensionLength),
                        };
                        h.extensions = [...h.extensions, extension];
                        currOffset += h.extensions[0].payload.length;
                    }
                    break;
            }
        }
        h.payloadOffset = currOffset;
        if (h.padding) {
            h.paddingSize = rawPacket[rawPacket.length - 1];
        }
        return h;
    }
    get serializeSize() {
        const { csrc, extensionProfile, extensions } = this;
        let size = 12 + csrc.length * csrcSize;
        if (extensions.length > 0 || this.extension === true) {
            let extSize = 4;
            switch (extensionProfile) {
                case exports.ExtensionProfiles.OneByte:
                    for (const extension of extensions) {
                        extSize += 1 + extension.payload.length;
                    }
                    break;
                case exports.ExtensionProfiles.TwoByte:
                    for (const extension of extensions) {
                        extSize += 2 + extension.payload.length;
                    }
                    break;
                default:
                    extSize += extensions[0].payload.length;
            }
            size += Math.floor((extSize + 3) / 4) * 4;
        }
        return size;
    }
    serialize(size) {
        const buf = Buffer.alloc(size);
        let offset = 0;
        const v_p_x_cc = new src_1.BitWriter(8);
        v_p_x_cc.set(2, 0, this.version);
        if (this.padding)
            v_p_x_cc.set(1, 2, 1);
        if (this.extensions.length > 0)
            this.extension = true;
        if (this.extension)
            v_p_x_cc.set(1, 3, 1);
        v_p_x_cc.set(4, 4, this.csrc.length);
        buf.writeUInt8(v_p_x_cc.value, offset++);
        const m_pt = new src_1.BitWriter(8);
        if (this.marker)
            m_pt.set(1, 0, 1);
        m_pt.set(7, 1, this.payloadType);
        buf.writeUInt8(m_pt.value, offset++);
        buf.writeUInt16BE(this.sequenceNumber, seqNumOffset);
        offset += 2;
        buf.writeUInt32BE(this.timestamp, timestampOffset);
        offset += 4;
        buf.writeUInt32BE(this.ssrc, ssrcOffset);
        offset += 4;
        for (const csrc of this.csrc) {
            buf.writeUInt32BE(csrc, offset);
            offset += 4;
        }
        if (this.extension) {
            const extHeaderPos = offset;
            buf.writeUInt16BE(this.extensionProfile, offset);
            offset += 4;
            const startExtensionsPos = offset;
            switch (this.extensionProfile) {
                case exports.ExtensionProfiles.OneByte:
                    for (const extension of this.extensions) {
                        buf.writeUInt8((extension.id << 4) | (extension.payload.length - 1), offset++);
                        extension.payload.copy(buf, offset);
                        offset += extension.payload.length;
                    }
                    break;
                case exports.ExtensionProfiles.TwoByte: // 1バイトで収まらなくなった歴史的経緯
                    for (const extension of this.extensions) {
                        buf.writeUInt8(extension.id, offset++);
                        buf.writeUInt8(extension.payload.length, offset++);
                        extension.payload.copy(buf, offset);
                        offset += extension.payload.length;
                    }
                    break;
                default: {
                    const extLen = this.extensions[0].payload.length;
                    if (extLen % 4 != 0) {
                        throw new Error();
                    }
                    this.extensions[0].payload.copy(buf, offset);
                    offset += extLen;
                }
            }
            const extSize = offset - startExtensionsPos;
            const roundedExtSize = Math.trunc((extSize + 3) / 4) * 4;
            buf.writeUInt16BE(Math.trunc(roundedExtSize / 4), extHeaderPos + 2);
            // padding 4 bytes boundaries
            for (let i = 0; i < roundedExtSize - extSize; i++) {
                buf.writeUInt8(0, offset);
                offset++;
            }
        }
        this.payloadOffset = offset;
        return buf;
    }
}
exports.RtpHeader = RtpHeader;
class RtpPacket {
    constructor(header, payload) {
        Object.defineProperty(this, "header", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: header
        });
        Object.defineProperty(this, "payload", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: payload
        });
    }
    get serializeSize() {
        return this.header.serializeSize + this.payload.length;
    }
    clone() {
        return new RtpPacket(new RtpHeader({ ...this.header }), this.payload);
    }
    serialize() {
        let buf = this.header.serialize(this.header.serializeSize + this.payload.length);
        const { payloadOffset } = this.header;
        this.payload.copy(buf, payloadOffset);
        if (this.header.padding) {
            const padding = Buffer.alloc(this.header.paddingSize);
            padding.writeUInt8(this.header.paddingSize, this.header.paddingSize - 1);
            buf = Buffer.concat([buf, padding]);
        }
        return buf;
    }
    static deSerialize(buf) {
        const header = RtpHeader.deSerialize(buf);
        const p = new RtpPacket(header, buf.subarray(header.payloadOffset, buf.length - header.paddingSize));
        return p;
    }
    clear() {
        this.payload = null;
    }
}
exports.RtpPacket = RtpPacket;
//# sourceMappingURL=rtp.js.map