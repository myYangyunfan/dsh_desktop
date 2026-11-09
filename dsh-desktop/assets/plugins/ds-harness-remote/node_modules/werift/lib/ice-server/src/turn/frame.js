"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isChannelData = isChannelData;
exports.encodeChannelData = encodeChannelData;
exports.decodeChannelData = decodeChannelData;
exports.padTurnFrame = padTurnFrame;
exports.splitTurnTcpFrames = splitTurnTcpFrames;
const message_1 = require("../stun/message");
function isChannelData(data) {
    return data.length >= 4 && (data[0] & 0xc0) === 0x40;
}
function encodeChannelData(channelNumber, data) {
    const header = Buffer.alloc(4);
    header.writeUInt16BE(channelNumber, 0);
    header.writeUInt16BE(data.length, 2);
    return Buffer.concat([header, data]);
}
function decodeChannelData(data) {
    if (!isChannelData(data) || data.length < 4) {
        return undefined;
    }
    const channelNumber = data.readUInt16BE(0);
    const length = data.readUInt16BE(2);
    if (data.length < 4 + length) {
        return undefined;
    }
    return {
        channelNumber,
        data: data.subarray(4, 4 + length),
    };
}
function padTurnFrame(data) {
    const padding = (0, message_1.paddingLength)(data.length);
    return padding > 0 ? Buffer.concat([data, Buffer.alloc(padding)]) : data;
}
function splitTurnTcpFrames(buffer) {
    const frames = [];
    let offset = 0;
    let malformed = false;
    while (buffer.length - offset >= 4) {
        let frameLength;
        if (isChannelData(buffer.subarray(offset))) {
            const payloadLength = buffer.readUInt16BE(offset + 2);
            frameLength = 4 + payloadLength + (0, message_1.paddingLength)(payloadLength);
        }
        else if ((buffer[offset] & 0xc0) === 0) {
            if (buffer.length - offset < 20) {
                break;
            }
            const stunBodyLength = buffer.readUInt16BE(offset + 2);
            frameLength = 20 + stunBodyLength + (0, message_1.paddingLength)(stunBodyLength);
        }
        else {
            malformed = true;
            break;
        }
        if (buffer.length - offset < frameLength) {
            break;
        }
        frames.push(buffer.subarray(offset, offset + frameLength));
        offset += frameLength;
    }
    return {
        frames,
        malformed,
        rest: buffer.subarray(offset),
    };
}
//# sourceMappingURL=frame.js.map