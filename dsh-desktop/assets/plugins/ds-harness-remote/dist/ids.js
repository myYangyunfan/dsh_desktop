import { randomBytes } from 'node:crypto';
export function uuidV7(now = Date.now()) {
    if (!Number.isSafeInteger(now) || now < 0 || now > 0xffffffffffff) {
        throw new RangeError('UUIDv7 timestamp must be a non-negative 48-bit integer');
    }
    const bytes = randomBytes(16);
    let timestamp = BigInt(now);
    for (let index = 5; index >= 0; index -= 1) {
        bytes[index] = Number(timestamp & 0xffn);
        timestamp >>= 8n;
    }
    bytes[6] = 0x70 | (bytes[6] & 0x0f);
    bytes[8] = 0x80 | (bytes[8] & 0x3f);
    const hex = bytes.toString('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
//# sourceMappingURL=ids.js.map