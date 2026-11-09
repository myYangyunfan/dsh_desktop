"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SourceDescriptionItem = exports.SourceDescriptionChunk = exports.RtcpSourceDescriptionPacket = void 0;
const src_1 = require("../../../common/src");
const header_1 = require("./header");
class RtcpSourceDescriptionPacket {
    constructor(props) {
        Object.defineProperty(this, "type", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: RtcpSourceDescriptionPacket.type
        });
        Object.defineProperty(this, "chunks", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        Object.assign(this, props);
    }
    get length() {
        let length = 0;
        this.chunks.forEach((chunk) => (length += chunk.length));
        return length;
    }
    serialize() {
        let payload = Buffer.concat(this.chunks.map((chunk) => chunk.serialize()));
        while (payload.length % 4)
            payload = Buffer.concat([payload, Buffer.from([0])]);
        return header_1.RtcpHeader.serialize(this.type, this.chunks.length, payload, payload.length / 4);
    }
    static deSerialize(payload, header) {
        const chunks = [];
        for (let i = 0; i < payload.length;) {
            const chunk = SourceDescriptionChunk.deSerialize(payload.slice(i));
            chunks.push(chunk);
            i += chunk.length;
        }
        return new RtcpSourceDescriptionPacket({ chunks });
    }
}
exports.RtcpSourceDescriptionPacket = RtcpSourceDescriptionPacket;
Object.defineProperty(RtcpSourceDescriptionPacket, "type", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: 202
});
class SourceDescriptionChunk {
    constructor(props = {}) {
        Object.defineProperty(this, "source", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "items", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        Object.assign(this, props);
    }
    get length() {
        let length = 4;
        this.items.forEach((item) => (length += item.length));
        length += 1;
        length += getPadding(length);
        return length;
    }
    serialize() {
        const data = Buffer.concat([
            (0, src_1.bufferWriter)([4], [this.source]),
            Buffer.concat(this.items.map((item) => item.serialize())),
        ]);
        const res = Buffer.concat([data, Buffer.alloc(getPadding(data.length))]);
        return res;
    }
    static deSerialize(data) {
        const source = data.readUInt32BE();
        const items = [];
        for (let i = 4; i < data.length;) {
            const type = data[i];
            if (type === 0)
                break;
            const item = SourceDescriptionItem.deSerialize(data.slice(i));
            items.push(item);
            i += item.length;
        }
        return new SourceDescriptionChunk({ source, items });
    }
}
exports.SourceDescriptionChunk = SourceDescriptionChunk;
class SourceDescriptionItem {
    constructor(props) {
        Object.defineProperty(this, "type", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "text", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.assign(this, props);
    }
    get length() {
        return 1 + 1 + Buffer.from(this.text).length;
    }
    serialize() {
        const text = Buffer.from(this.text);
        return Buffer.concat([
            (0, src_1.bufferWriter)([1, 1], [this.type, text.length]),
            text,
        ]);
    }
    static deSerialize(data) {
        const type = data[0];
        const octetCount = data[1];
        const text = data.slice(2, 2 + octetCount).toString();
        return new SourceDescriptionItem({ type, text });
    }
}
exports.SourceDescriptionItem = SourceDescriptionItem;
function getPadding(len) {
    if (len % 4 == 0) {
        return 0;
    }
    return 4 - (len % 4);
}
//# sourceMappingURL=sdes.js.map