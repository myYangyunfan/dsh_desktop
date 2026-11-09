"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.leb128encode = leb128encode;
/**
 * Unsigned LEB128 encoder（package-private）。
 * `codec/index.ts` の public barrel からは re-export しない。decode は `av1.ts` 側の公開 API を維持する。
 */
function leb128encode(value) {
    if (!Number.isInteger(value) || value < 0 || !Number.isSafeInteger(value)) {
        throw new Error("LEB128 encode requires a non-negative safe integer");
    }
    const bytes = [];
    let remaining = value;
    do {
        let byte = remaining & 0x7f;
        remaining = Math.floor(remaining / 128);
        if (remaining !== 0) {
            byte |= 0x80;
        }
        bytes.push(byte);
    } while (remaining !== 0);
    return Buffer.from(bytes);
}
//# sourceMappingURL=leb128.js.map