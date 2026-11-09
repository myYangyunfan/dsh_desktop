"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.supportedAudioCodecs = exports.supportedVideoCodecs = exports.supportedCodecs = exports.usePCMU = exports.useOPUS = exports.useAV1X = exports.useVP9 = exports.useVP8 = exports.useH264 = void 0;
const rtcpFeedback_1 = require("./extension/rtcpFeedback");
const parameters_1 = require("./parameters");
const useH264 = (props = {}) => new parameters_1.RTCRtpCodecParameters({
    mimeType: "video/h264",
    clockRate: 90000,
    rtcpFeedback: [(0, rtcpFeedback_1.useNACK)(), (0, rtcpFeedback_1.usePLI)(), (0, rtcpFeedback_1.useREMB)()],
    parameters: "profile-level-id=42e01f;packetization-mode=1;level-asymmetry-allowed=1",
    ...props,
});
exports.useH264 = useH264;
const useVP8 = (props = {}) => new parameters_1.RTCRtpCodecParameters({
    mimeType: "video/VP8",
    clockRate: 90000,
    rtcpFeedback: [(0, rtcpFeedback_1.useNACK)(), (0, rtcpFeedback_1.usePLI)(), (0, rtcpFeedback_1.useREMB)()],
    ...props,
});
exports.useVP8 = useVP8;
const useVP9 = (props = {}) => new parameters_1.RTCRtpCodecParameters({
    mimeType: "video/VP9",
    clockRate: 90000,
    rtcpFeedback: [(0, rtcpFeedback_1.useNACK)(), (0, rtcpFeedback_1.usePLI)(), (0, rtcpFeedback_1.useREMB)()],
    ...props,
});
exports.useVP9 = useVP9;
const useAV1X = (props = {}) => new parameters_1.RTCRtpCodecParameters({
    mimeType: "video/AV1X",
    clockRate: 90000,
    rtcpFeedback: [(0, rtcpFeedback_1.useNACK)(), (0, rtcpFeedback_1.usePLI)(), (0, rtcpFeedback_1.useREMB)()],
    ...props,
});
exports.useAV1X = useAV1X;
const useOPUS = (props = {}) => new parameters_1.RTCRtpCodecParameters({
    mimeType: "audio/OPUS",
    clockRate: 48000,
    channels: 2,
    ...props,
});
exports.useOPUS = useOPUS;
const usePCMU = (props = {}) => new parameters_1.RTCRtpCodecParameters({
    mimeType: "audio/PCMU",
    clockRate: 8000,
    channels: 1,
    payloadType: 0,
    ...props,
});
exports.usePCMU = usePCMU;
exports.supportedCodecs = [
    (0, exports.useAV1X)(),
    (0, exports.useVP9)(),
    (0, exports.useVP8)(),
    (0, exports.useH264)(),
    (0, exports.useOPUS)(),
    (0, exports.usePCMU)(),
].map((codec) => codec.mimeType);
exports.supportedVideoCodecs = exports.supportedCodecs.filter((codec) => codec.toLowerCase().startsWith("video/"));
exports.supportedAudioCodecs = exports.supportedCodecs.filter((codec) => codec.toLowerCase().startsWith("audio/"));
//# sourceMappingURL=codec.js.map