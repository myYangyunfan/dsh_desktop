"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.depacketizerCodecs = void 0;
exports.dePacketizeRtpPackets = dePacketizeRtpPackets;
const av1_1 = require("./av1");
const h264_1 = require("./h264");
const opus_1 = require("./opus");
const vp8_1 = require("./vp8");
const vp9_1 = require("./vp9");
__exportStar(require("./av1"), exports);
__exportStar(require("./base"), exports);
__exportStar(require("./h264"), exports);
__exportStar(require("./opus"), exports);
__exportStar(require("./vp8"), exports);
__exportStar(require("./vp9"), exports);
function dePacketizeRtpPackets(codec, packets, frameFragmentBuffer) {
    const basicCodecParser = (Depacketizer) => {
        const partitions = [];
        for (const p of packets) {
            const codec = Depacketizer.deSerialize(p.payload, frameFragmentBuffer);
            if (codec.fragment) {
                frameFragmentBuffer ?? (frameFragmentBuffer = Buffer.alloc(0));
                frameFragmentBuffer = codec.fragment;
            }
            else if (codec.payload) {
                frameFragmentBuffer = undefined;
            }
            partitions.push(codec);
        }
        const isKeyframe = !!partitions.find((f) => f.isKeyframe);
        const data = Buffer.concat(partitions.map((f) => f.payload).filter((p) => p));
        return {
            isKeyframe,
            data,
            sequence: packets.at(-1)?.header.sequenceNumber ?? 0,
            timestamp: packets.at(-1)?.header.timestamp ?? 0,
            frameFragmentBuffer,
        };
    };
    switch (codec.toUpperCase()) {
        case "AV1": {
            const chunks = packets.map((p) => av1_1.AV1RtpPayload.deSerialize(p.payload));
            const isKeyframe = !!chunks.find((f) => f.isKeyframe);
            const data = av1_1.AV1RtpPayload.getFrame(chunks);
            return {
                isKeyframe,
                data,
                sequence: packets.at(-1)?.header.sequenceNumber ?? 0,
                timestamp: packets.at(-1)?.header.timestamp ?? 0,
            };
        }
        case "MPEG4/ISO/AVC":
            return basicCodecParser(h264_1.H264RtpPayload);
        case "VP8":
            return basicCodecParser(vp8_1.Vp8RtpPayload);
        case "VP9":
            return basicCodecParser(vp9_1.Vp9RtpPayload);
        case "OPUS":
            return basicCodecParser(opus_1.OpusRtpPayload);
        default:
            throw new Error();
    }
}
exports.depacketizerCodecs = [
    "MPEG4/ISO/AVC",
    "VP8",
    "VP9",
    "OPUS",
    "AV1",
];
//# sourceMappingURL=index.js.map