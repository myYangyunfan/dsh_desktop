"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.encodeTcpFrame = encodeTcpFrame;
exports.splitTcpFrames = splitTcpFrames;
function encodeTcpFrame(data) {
    const header = Buffer.alloc(2);
    header.writeUInt16BE(data.length, 0);
    return Buffer.concat([header, data]);
}
function splitTcpFrames(buffer) {
    const frames = [];
    let offset = 0;
    while (buffer.length - offset >= 2) {
        const length = buffer.readUInt16BE(offset);
        if (buffer.length - offset < length + 2) {
            break;
        }
        frames.push(buffer.subarray(offset + 2, offset + 2 + length));
        offset += 2 + length;
    }
    return {
        frames,
        rest: buffer.subarray(offset),
    };
}
//# sourceMappingURL=tcpFrame.js.map