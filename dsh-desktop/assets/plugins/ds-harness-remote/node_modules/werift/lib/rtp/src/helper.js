"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.timer = void 0;
exports.enumerate = enumerate;
exports.growBufferSize = growBufferSize;
exports.Int = Int;
exports.isMedia = isMedia;
function enumerate(arr) {
    return arr.map((v, i) => [i, v]);
}
function growBufferSize(buf, size) {
    const glow = Buffer.alloc(size);
    buf.copy(glow);
    return glow;
}
function Int(v) {
    return Number.parseInt(v.toString(), 10);
}
exports.timer = {
    setTimeout: (...args) => {
        const id = setTimeout(...args);
        return () => clearTimeout(id);
    },
    setInterval: (...args) => {
        const id = setInterval(() => {
            args[0]();
        }, 
        //@ts-ignore
        ...args.slice(1));
        return () => clearInterval(id);
    },
};
function isMedia(buf) {
    const firstByte = buf[0];
    return firstByte > 127 && firstByte < 192;
}
//# sourceMappingURL=helper.js.map