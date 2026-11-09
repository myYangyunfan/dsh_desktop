"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RTP_EXTENSION_URI = void 0;
exports.rtpHeaderExtensionsParser = rtpHeaderExtensionsParser;
exports.serializeSdesMid = serializeSdesMid;
exports.serializeSdesRTPStreamID = serializeSdesRTPStreamID;
exports.serializeRepairedRtpStreamId = serializeRepairedRtpStreamId;
exports.serializeTransportWideCC = serializeTransportWideCC;
exports.serializeAbsSendTime = serializeAbsSendTime;
exports.serializeAudioLevelIndication = serializeAudioLevelIndication;
exports.deserializeString = deserializeString;
exports.deserializeUint16BE = deserializeUint16BE;
exports.deserializeAbsSendTime = deserializeAbsSendTime;
exports.deserializeAudioLevelIndication = deserializeAudioLevelIndication;
exports.deserializeVideoOrientation = deserializeVideoOrientation;
const src_1 = require("../../../common/src");
exports.RTP_EXTENSION_URI = {
    sdesMid: "urn:ietf:params:rtp-hdrext:sdes:mid",
    sdesRTPStreamID: "urn:ietf:params:rtp-hdrext:sdes:rtp-stream-id",
    repairedRtpStreamId: "urn:ietf:params:rtp-hdrext:sdes:repaired-rtp-stream-id",
    transportWideCC: "http://www.ietf.org/id/draft-holmer-rmcat-transport-wide-cc-extensions-01",
    absSendTime: "http://www.webrtc.org/experiments/rtp-hdrext/abs-send-time",
    dependencyDescriptor: "https://aomediacodec.github.io/av1-rtp-spec/#dependency-descriptor-rtp-header-extension",
    audioLevelIndication: "urn:ietf:params:rtp-hdrext:ssrc-audio-level",
    videoOrientation: "urn:3gpp:video-orientation",
};
function rtpHeaderExtensionsParser(extensions, extIdUriMap) {
    return extensions
        .map((extension) => {
        const uri = extIdUriMap[extension.id];
        if (!uri) {
            return { uri: "unknown", value: extension.payload };
        }
        switch (uri) {
            case exports.RTP_EXTENSION_URI.sdesMid:
            case exports.RTP_EXTENSION_URI.sdesRTPStreamID:
            case exports.RTP_EXTENSION_URI.repairedRtpStreamId:
                return { uri, value: deserializeString(extension.payload) };
            case exports.RTP_EXTENSION_URI.transportWideCC:
                return { uri, value: deserializeUint16BE(extension.payload) };
            case exports.RTP_EXTENSION_URI.absSendTime:
                return {
                    uri,
                    value: deserializeAbsSendTime(extension.payload),
                };
            case exports.RTP_EXTENSION_URI.audioLevelIndication: {
                return {
                    uri,
                    value: deserializeAudioLevelIndication(extension.payload),
                };
            }
            case exports.RTP_EXTENSION_URI.videoOrientation:
                return { uri, value: deserializeVideoOrientation(extension.payload) };
            default:
                return { uri, value: extension.payload };
        }
    })
        .reduce((acc, cur) => {
        if (cur)
            acc[cur.uri] = cur.value;
        return acc;
    }, {});
}
function serializeSdesMid(id) {
    return Buffer.from(id);
}
function serializeSdesRTPStreamID(id) {
    return Buffer.from(id);
}
function serializeRepairedRtpStreamId(id) {
    return Buffer.from(id);
}
function serializeTransportWideCC(transportSequenceNumber) {
    return (0, src_1.bufferWriter)([2], [transportSequenceNumber]);
}
function serializeAbsSendTime(ntpTime) {
    const buf = Buffer.alloc(3);
    const time = (ntpTime >> 14n) & 0x00ffffffn;
    buf.writeUIntBE(Number(time), 0, 3);
    return buf;
}
function serializeAudioLevelIndication(level) {
    const stream = new src_1.BitStream(Buffer.alloc(1));
    stream.writeBits(1, 1);
    stream.writeBits(7, level);
    return stream.uint8Array;
}
function deserializeString(buf) {
    return buf.toString();
}
function deserializeUint16BE(buf) {
    return buf.readUInt16BE();
}
function deserializeAbsSendTime(buf) {
    return (0, src_1.bufferReader)(buf, [3])[0];
}
function deserializeAudioLevelIndication(buf) {
    const stream = new src_1.BitStream(buf);
    const value = {
        v: stream.readBits(1) === 1,
        level: stream.readBits(7),
    };
    return value;
}
function deserializeVideoOrientation(payload) {
    const stream = new src_1.BitStream(payload);
    stream.readBits(4);
    const value = {
        c: stream.readBits(1),
        f: stream.readBits(1),
        r1: stream.readBits(1),
        r0: stream.readBits(1),
    };
    return value;
}
//# sourceMappingURL=headerExtension.js.map