"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getObjectSummary = exports.dumpBuffer = void 0;
exports.enumerate = enumerate;
exports.divide = divide;
function enumerate(arr) {
    return arr.map((v, i) => [i, v]);
}
function divide(from, split) {
    const arr = from.split(split);
    return [arr[0], arr.slice(1).join(split)];
}
const dumpBuffer = (data) => "0x" +
    data
        .toString("hex")
        .replace(/(.)(.)/g, "$1$2 ")
        .split(" ")
        .filter((s) => s != undefined && s.length > 0)
        .join(",0x");
exports.dumpBuffer = dumpBuffer;
const getObjectSummary = (obj) => Object.entries({ ...obj }).reduce((acc, [key, value]) => {
    if (typeof value === "number" || typeof value === "string") {
        acc[key] = value;
    }
    if (Buffer.isBuffer(value)) {
        acc[key] = (0, exports.dumpBuffer)(value);
    }
    return acc;
}, {});
exports.getObjectSummary = getObjectSummary;
//# sourceMappingURL=helper.js.map