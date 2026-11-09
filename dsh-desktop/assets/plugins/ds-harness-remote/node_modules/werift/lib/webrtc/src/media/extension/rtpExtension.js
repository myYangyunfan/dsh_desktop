"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useSdesMid = useSdesMid;
exports.useSdesRTPStreamId = useSdesRTPStreamId;
exports.useRepairedRtpStreamId = useRepairedRtpStreamId;
exports.useTransportWideCC = useTransportWideCC;
exports.useAbsSendTime = useAbsSendTime;
exports.useDependencyDescriptor = useDependencyDescriptor;
exports.useAudioLevelIndication = useAudioLevelIndication;
exports.useVideoOrientation = useVideoOrientation;
const rtp_1 = require("../../imports/rtp");
const parameters_1 = require("../parameters");
function useSdesMid() {
    return new parameters_1.RTCRtpHeaderExtensionParameters({
        uri: rtp_1.RTP_EXTENSION_URI.sdesMid,
    });
}
function useSdesRTPStreamId() {
    return new parameters_1.RTCRtpHeaderExtensionParameters({
        uri: rtp_1.RTP_EXTENSION_URI.sdesRTPStreamID,
    });
}
function useRepairedRtpStreamId() {
    return new parameters_1.RTCRtpHeaderExtensionParameters({
        uri: rtp_1.RTP_EXTENSION_URI.repairedRtpStreamId,
    });
}
function useTransportWideCC() {
    return new parameters_1.RTCRtpHeaderExtensionParameters({
        uri: rtp_1.RTP_EXTENSION_URI.transportWideCC,
    });
}
function useAbsSendTime() {
    return new parameters_1.RTCRtpHeaderExtensionParameters({
        uri: rtp_1.RTP_EXTENSION_URI.absSendTime,
    });
}
function useDependencyDescriptor() {
    return new parameters_1.RTCRtpHeaderExtensionParameters({
        uri: rtp_1.RTP_EXTENSION_URI.dependencyDescriptor,
    });
}
function useAudioLevelIndication() {
    return new parameters_1.RTCRtpHeaderExtensionParameters({
        uri: rtp_1.RTP_EXTENSION_URI.audioLevelIndication,
    });
}
function useVideoOrientation() {
    return new parameters_1.RTCRtpHeaderExtensionParameters({
        uri: rtp_1.RTP_EXTENSION_URI.videoOrientation,
    });
}
//# sourceMappingURL=rtpExtension.js.map