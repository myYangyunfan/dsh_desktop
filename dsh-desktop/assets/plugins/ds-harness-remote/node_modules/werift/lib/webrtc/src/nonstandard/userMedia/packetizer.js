"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.supportedSourceCodecs = void 0;
exports.toSupportedMimeType = toSupportedMimeType;
exports.createPacketizer = createPacketizer;
const rtp_1 = require("../../imports/rtp");
const rtpExtra_1 = require("../../imports/rtpExtra");
const DEFAULT_MAX_RTP_PAYLOAD_SIZE = 1200;
exports.supportedSourceCodecs = [
    "avc",
    "vp8",
    "vp9",
    "av1",
    "opus",
];
function toSupportedMimeType(codec) {
    switch (codec) {
        case "avc":
            return "video/h264";
        case "vp8":
            return "video/vp8";
        case "vp9":
            return "video/vp9";
        case "av1":
            return "video/av1x";
        case "opus":
            return "audio/opus";
    }
}
function createPacketizer({ codec, sourceCodec, decoderDescription, }) {
    switch (sourceCodec) {
        case "avc":
            return new H264Packetizer(codec, decoderDescription ?? null);
        case "vp8":
            return new Vp8Packetizer(codec);
        case "vp9":
            return new Vp9Packetizer(codec);
        case "av1":
            return new Av1Packetizer(codec);
        case "opus":
            return new OpusPacketizer(codec);
    }
}
class BasePacketizer {
    constructor(codec, maxPayloadSize = DEFAULT_MAX_RTP_PAYLOAD_SIZE) {
        Object.defineProperty(this, "codec", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: codec
        });
        Object.defineProperty(this, "maxPayloadSize", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: maxPayloadSize
        });
        Object.defineProperty(this, "sequenceNumber", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: (0, rtp_1.random16)()
        });
    }
    buildPacket(payload, timestamp, marker) {
        const packet = new rtp_1.RtpPacket(new rtp_1.RtpHeader({
            payloadType: this.codec.payloadType ?? 96,
            sequenceNumber: this.sequenceNumber,
            timestamp,
            marker,
        }), payload);
        this.sequenceNumber = (this.sequenceNumber + 1) & 0xffff;
        return packet;
    }
}
class OpusPacketizer extends BasePacketizer {
    packetize(packet, rtpTimestamp) {
        return [this.buildPacket(toBuffer(packet.data), rtpTimestamp, true)];
    }
}
class Vp8Packetizer extends BasePacketizer {
    packetize(packet, rtpTimestamp) {
        const frame = toBuffer(packet.data);
        const chunkSize = this.maxPayloadSize - 1;
        if (chunkSize <= 0) {
            throw new Error("invalid VP8 RTP payload size");
        }
        const packets = [];
        for (let offset = 0; offset < frame.length; offset += chunkSize) {
            const chunk = frame.subarray(offset, Math.min(frame.length, offset + chunkSize));
            const descriptor = Buffer.from([offset === 0 ? 0x10 : 0x00]);
            packets.push(this.buildPacket(Buffer.concat([descriptor, chunk]), rtpTimestamp, offset + chunk.length >= frame.length));
        }
        return packets;
    }
}
class Vp9Packetizer extends BasePacketizer {
    packetize(packet, rtpTimestamp) {
        const frame = toBuffer(packet.data);
        const chunkSize = this.maxPayloadSize - 1;
        if (chunkSize <= 0) {
            throw new Error("invalid VP9 RTP payload size");
        }
        const packets = [];
        for (let offset = 0; offset < frame.length; offset += chunkSize) {
            const chunk = frame.subarray(offset, Math.min(frame.length, offset + chunkSize));
            const descriptor = new rtp_1.BitWriter(8)
                .set(1, 0, 0)
                .set(1, 1, packet.type === "delta" ? 1 : 0)
                .set(1, 2, 0)
                .set(1, 3, 0)
                .set(1, 4, offset === 0 ? 1 : 0)
                .set(1, 5, offset + chunk.length >= frame.length ? 1 : 0)
                .set(1, 6, 0)
                .set(1, 7, 0).buffer;
            packets.push(this.buildPacket(Buffer.concat([descriptor, chunk]), rtpTimestamp, offset + chunk.length >= frame.length));
        }
        return packets;
    }
}
class Av1Packetizer extends BasePacketizer {
    packetize(packet, rtpTimestamp) {
        const obus = splitAv1Obus(toBuffer(packet.data));
        const packets = [];
        const fragmentSize = this.maxPayloadSize - 1;
        if (fragmentSize <= 0) {
            throw new Error("invalid AV1 RTP payload size");
        }
        let firstPacketInFrame = true;
        const startsNewCodedVideoSequence = packet.type === "key";
        for (const obu of obus) {
            if (obu.length <= fragmentSize) {
                const aggregationHeader = createAv1AggregationHeader({
                    startsWithFragment: false,
                    endsWithFragment: false,
                    startsNewCodedVideoSequence: firstPacketInFrame && startsNewCodedVideoSequence,
                });
                packets.push(this.buildPacket(Buffer.concat([aggregationHeader, obu]), rtpTimestamp, false));
                firstPacketInFrame = false;
                continue;
            }
            for (let offset = 0; offset < obu.length; offset += fragmentSize) {
                const chunk = obu.subarray(offset, Math.min(obu.length, offset + fragmentSize));
                const aggregationHeader = createAv1AggregationHeader({
                    startsWithFragment: offset > 0,
                    endsWithFragment: offset + chunk.length < obu.length,
                    startsNewCodedVideoSequence: firstPacketInFrame && startsNewCodedVideoSequence,
                });
                packets.push(this.buildPacket(Buffer.concat([aggregationHeader, chunk]), rtpTimestamp, false));
                firstPacketInFrame = false;
            }
        }
        if (packets.length === 0) {
            throw new Error("AV1 sample did not contain any OBU data");
        }
        packets.at(-1).header.marker = true;
        return packets;
    }
}
class H264Packetizer extends BasePacketizer {
    constructor(codec, decoderDescription) {
        super(codec);
        Object.defineProperty(this, "naluLengthSize", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "parameterSets", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        const packetizationMode = getH264PacketizationMode(codec.parameters);
        if (packetizationMode !== 1) {
            throw new Error(`Unsupported H264 packetization-mode=${packetizationMode}. File playback requires packetization-mode=1.`);
        }
        const avcConfig = parseAvcDecoderConfiguration(decoderDescription);
        this.naluLengthSize = avcConfig?.naluLengthSize ?? 4;
        this.parameterSets = avcConfig
            ? [...avcConfig.sps.map(Buffer.from), ...avcConfig.pps.map(Buffer.from)]
            : [];
    }
    packetize(packet, rtpTimestamp) {
        let nalUnits = splitH264Sample(toBuffer(packet.data), this.naluLengthSize);
        if (packet.type === "key" &&
            this.parameterSets.length > 0 &&
            !containsH264ParameterSets(nalUnits)) {
            nalUnits = [...this.parameterSets, ...nalUnits];
        }
        const packets = [];
        nalUnits.forEach((nalUnit, index) => {
            const marker = index === nalUnits.length - 1;
            if (nalUnit.length <= this.maxPayloadSize) {
                packets.push(this.buildPacket(nalUnit, rtpTimestamp, marker));
                return;
            }
            const nalHeader = nalUnit[0];
            const fragmentPayload = nalUnit.subarray(1);
            const fragmentSize = this.maxPayloadSize - 2;
            if (fragmentSize <= 0) {
                throw new Error("invalid H264 RTP payload size");
            }
            const fuIndicator = (nalHeader & 0xe0) | 28;
            const nalType = nalHeader & 0x1f;
            for (let offset = 0; offset < fragmentPayload.length; offset += fragmentSize) {
                const chunk = fragmentPayload.subarray(offset, Math.min(fragmentPayload.length, offset + fragmentSize));
                const fuHeader = Buffer.from([
                    (offset === 0 ? 0x80 : 0x00) |
                        (offset + chunk.length >= fragmentPayload.length ? 0x40 : 0x00) |
                        nalType,
                ]);
                packets.push(this.buildPacket(Buffer.concat([Buffer.from([fuIndicator]), fuHeader, chunk]), rtpTimestamp, marker && offset + chunk.length >= fragmentPayload.length));
            }
        });
        return packets;
    }
}
function createAv1AggregationHeader({ startsWithFragment, endsWithFragment, startsNewCodedVideoSequence, }) {
    return new rtp_1.BitWriter(8)
        .set(1, 0, startsWithFragment ? 1 : 0)
        .set(1, 1, endsWithFragment ? 1 : 0)
        .set(2, 2, 1)
        .set(1, 4, startsNewCodedVideoSequence ? 1 : 0)
        .set(3, 5, 0).buffer;
}
function parseAvcDecoderConfiguration(decoderDescription) {
    if (!decoderDescription) {
        return null;
    }
    const description = toDescriptionBuffer(decoderDescription);
    if (description.length < 7) {
        throw new Error("invalid H264 decoder configuration");
    }
    const naluLengthSize = (description[4] & 0x03) + 1;
    const spsCount = description[5] & 0x1f;
    let offset = 6;
    const sps = [];
    for (let index = 0; index < spsCount; index++) {
        const length = description.readUInt16BE(offset);
        offset += 2;
        sps.push(description.subarray(offset, offset + length));
        offset += length;
    }
    const ppsCount = description[offset] ?? 0;
    offset++;
    const pps = [];
    for (let index = 0; index < ppsCount; index++) {
        const length = description.readUInt16BE(offset);
        offset += 2;
        pps.push(description.subarray(offset, offset + length));
        offset += length;
    }
    return { naluLengthSize, sps, pps };
}
function splitH264Sample(sample, naluLengthSize) {
    if (looksLikeAnnexB(sample)) {
        const nalUnits = [];
        const parser = new rtpExtra_1.H264AnnexBParser(sample);
        let payload = parser.readNextNaluPayload();
        while (payload) {
            nalUnits.push(Buffer.from(payload.data));
            payload = parser.readNextNaluPayload();
        }
        return nalUnits;
    }
    const nalUnits = [];
    let offset = 0;
    while (offset < sample.length) {
        const length = readUintLength(sample, offset, naluLengthSize);
        offset += naluLengthSize;
        const end = offset + length;
        if (end > sample.length) {
            throw new Error("invalid H264 sample length");
        }
        nalUnits.push(sample.subarray(offset, end));
        offset = end;
    }
    return nalUnits;
}
function splitAv1Obus(sample) {
    const obus = [];
    let offset = 0;
    while (offset < sample.length) {
        const start = offset;
        const header = sample[offset];
        offset += 1;
        if (header == undefined) {
            break;
        }
        const extensionFlag = (0, rtp_1.getBit)(header, 5);
        const hasSizeField = (0, rtp_1.getBit)(header, 6);
        if (extensionFlag) {
            offset += 1;
        }
        if (!hasSizeField) {
            obus.push(sample.subarray(start));
            break;
        }
        const [obuSize, leb128Length] = (0, rtp_1.leb128decode)(sample.subarray(offset));
        offset += leb128Length;
        const end = offset + obuSize;
        if (end > sample.length) {
            throw new Error("invalid AV1 OBU size");
        }
        obus.push(sample.subarray(start, end));
        offset = end;
    }
    return obus;
}
function containsH264ParameterSets(nalUnits) {
    return nalUnits.some((nalUnit) => {
        const nalType = nalUnit[0] & 0x1f;
        return nalType === 7 || nalType === 8;
    });
}
function looksLikeAnnexB(sample) {
    return (sample.length >= 4 &&
        sample[0] === 0x00 &&
        sample[1] === 0x00 &&
        ((sample[2] === 0x00 && sample[3] === 0x01) || sample[2] === 0x01));
}
function readUintLength(buffer, offset, length) {
    switch (length) {
        case 1:
            return buffer.readUInt8(offset);
        case 2:
            return buffer.readUInt16BE(offset);
        case 3:
            return buffer.readUIntBE(offset, 3);
        case 4:
            return buffer.readUInt32BE(offset);
        default:
            throw new Error(`unsupported H264 NALU length size: ${length}`);
    }
}
function getH264PacketizationMode(parameters) {
    if (!parameters) {
        return 1;
    }
    const packetizationMode = parameters
        .split(";")
        .map((part) => part.trim())
        .find((part) => part.startsWith("packetization-mode="));
    if (!packetizationMode) {
        return 1;
    }
    return Number(packetizationMode.split("=")[1] ?? 1);
}
function toDescriptionBuffer(decoderDescription) {
    if (ArrayBuffer.isView(decoderDescription)) {
        return Buffer.from(decoderDescription.buffer, decoderDescription.byteOffset, decoderDescription.byteLength);
    }
    return Buffer.from(decoderDescription);
}
function toBuffer(data) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
}
//# sourceMappingURL=packetizer.js.map