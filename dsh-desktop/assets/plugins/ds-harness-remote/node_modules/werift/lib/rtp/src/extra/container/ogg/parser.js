"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OggParser = void 0;
class OggParser {
    constructor() {
        Object.defineProperty(this, "pages", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
    }
    checkSegments(page) {
        if (!page) {
            return { ok: true };
        }
        for (let i = 0; i < page.segmentTable.length; i++) {
            const segment = page.segments[i];
            const table = page.segmentTable[i];
            if (segment.length !== table) {
                return { invalid: i };
            }
        }
        return { ok: true };
    }
    exportSegments() {
        let i = 0;
        const pages = [];
        for (; i < this.pages.length; i++) {
            const page = this.pages[i];
            const { invalid } = this.checkSegments(page);
            if (invalid) {
                break;
            }
            pages.push(page);
        }
        this.pages = this.pages.slice(i);
        return pages.flatMap((page) => page.segments);
    }
    read(buf) {
        for (let index = 0;;) {
            if (index > buf.length)
                break;
            try {
                const lastPage = this.pages.at(-1);
                const invalid = this.checkSegments(lastPage).invalid;
                if (lastPage && invalid) {
                    for (let i = invalid; i < lastPage.segmentTable.length; i++) {
                        const diff = lastPage.segmentTable[i] - lastPage.segments[i].length;
                        lastPage.segments[i] = Buffer.concat([
                            lastPage.segments[i],
                            buf.subarray(index, index + diff),
                        ]);
                        index += diff;
                    }
                }
                else {
                    const magic = buf.subarray(index, index + 4).toString();
                    if (magic !== "OggS") {
                        break;
                    }
                    index += 4; // skip magic
                    index += 1; // skip version
                    const headerType = buf.readUInt8(index);
                    index += 1; // skip header type
                    const granulePosition = buf.readBigInt64LE(index);
                    index += 8; // skip granule position
                    const bitstreamSerialNumber = buf.readUInt32LE(index);
                    index += 4; // skip bitstream serial number
                    const pageSequenceNumber = buf.readUInt32LE(index);
                    index += 4; // skip page sequence number
                    const pageChecksum = buf.readUInt32LE(index);
                    index += 4; // skip page checksum
                    const pageSegments = buf.readUInt8(index);
                    index += 1; // skip page segments
                    const segmentTable = buf.subarray(index, index + pageSegments);
                    index += pageSegments; // skip segment table
                    const segments = [];
                    for (let i = 0; i < pageSegments; i++) {
                        const segment = segmentTable.readUInt8(i);
                        const segmentData = buf.subarray(index, index + segment);
                        index += segment;
                        segments.push(segmentData);
                    }
                    this.pages.push({
                        segments,
                        granulePosition: Number(granulePosition),
                        segmentTable: [...segmentTable.map((s) => s)],
                    });
                }
            }
            catch (error) {
                break;
            }
        }
        return this;
    }
}
exports.OggParser = OggParser;
//# sourceMappingURL=parser.js.map