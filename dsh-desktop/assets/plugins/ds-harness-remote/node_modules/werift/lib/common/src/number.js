"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.int = void 0;
exports.uint8Add = uint8Add;
exports.uint16Add = uint16Add;
exports.uint32Add = uint32Add;
exports.uint24 = uint24;
exports.uint16Gt = uint16Gt;
exports.uint16Gte = uint16Gte;
exports.uint32Gt = uint32Gt;
exports.uint32Gte = uint32Gte;
function uint8Add(a, b) {
    return (a + b) & 0xff;
}
function uint16Add(a, b) {
    return (a + b) & 0xffff;
}
function uint32Add(a, b) {
    return Number((BigInt(a) + BigInt(b)) & 0xffffffffn);
}
function uint24(v) {
    return v & 0xffffff;
}
/**Return a > b */
function uint16Gt(a, b) {
    const halfMod = 0x8000;
    return (a < b && b - a > halfMod) || (a > b && a - b < halfMod);
}
/**Return a >= b */
function uint16Gte(a, b) {
    return a === b || uint16Gt(a, b);
}
/**Return a > b */
function uint32Gt(a, b) {
    const halfMod = 0x80000000;
    return (a < b && b - a > halfMod) || (a > b && a - b < halfMod);
}
/**Return a >= b */
function uint32Gte(a, b) {
    return a === b || uint32Gt(a, b);
}
const int = (n) => Number.parseInt(n, 10);
exports.int = int;
//# sourceMappingURL=number.js.map