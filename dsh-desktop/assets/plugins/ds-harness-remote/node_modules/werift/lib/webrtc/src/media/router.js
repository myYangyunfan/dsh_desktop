"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RtpRouter = void 0;
const rtp_1 = require("../imports/rtp");
const rtpReceiver_1 = require("./rtpReceiver");
const track_1 = require("./track");
const log = (0, rtp_1.debug)("werift:packages/webrtc/src/media/router.ts");
class RtpRouter {
    constructor() {
        Object.defineProperty(this, "ssrcTable", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: {}
        });
        Object.defineProperty(this, "ridTable", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: {}
        });
        Object.defineProperty(this, "extIdUriMap", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: {}
        });
        Object.defineProperty(this, "routeRtp", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: (packet) => {
                const extensions = (0, rtp_1.rtpHeaderExtensionsParser)(packet.header.extensions, this.extIdUriMap);
                let rtpReceiver = this.ssrcTable[packet.header.ssrc];
                const rid = extensions[rtp_1.RTP_EXTENSION_URI.sdesRTPStreamID];
                if (typeof rid === "string") {
                    rtpReceiver = this.ridTable[rid];
                    rtpReceiver.latestRid = rid;
                    rtpReceiver.handleRtpByRid(packet, rid, extensions);
                }
                else if (rtpReceiver) {
                    rtpReceiver.handleRtpBySsrc(packet, extensions);
                }
                else {
                    // simulcast after send receiver report
                    rtpReceiver = Object.values(this.ridTable)
                        .filter((r) => r instanceof rtpReceiver_1.RTCRtpReceiver)
                        .find((r) => r.trackBySSRC[packet.header.ssrc]);
                    if (rtpReceiver) {
                        log("simulcast register receiver by ssrc", packet.header.ssrc);
                        this.registerRtpReceiver(rtpReceiver, packet.header.ssrc);
                        rtpReceiver.handleRtpBySsrc(packet, extensions);
                    }
                    else {
                        // bug
                    }
                }
                if (!rtpReceiver) {
                    log("ssrcReceiver not found");
                    return;
                }
                const sdesMid = extensions[rtp_1.RTP_EXTENSION_URI.sdesMid];
                if (typeof sdesMid === "string") {
                    rtpReceiver.sdesMid = sdesMid;
                }
                const repairedRid = extensions[rtp_1.RTP_EXTENSION_URI.repairedRtpStreamId];
                if (typeof repairedRid === "string") {
                    rtpReceiver.latestRepairedRid = repairedRid;
                }
            }
        });
        Object.defineProperty(this, "routeRtcp", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: (packet) => {
                const recipients = [];
                switch (packet.type) {
                    case rtp_1.RtcpSrPacket.type:
                        {
                            packet = packet;
                            recipients.push(this.ssrcTable[packet.ssrc]);
                        }
                        break;
                    case rtp_1.RtcpRrPacket.type:
                        {
                            packet = packet;
                            packet.reports.forEach((report) => {
                                recipients.push(this.ssrcTable[report.ssrc]);
                            });
                        }
                        break;
                    case rtp_1.RtcpSourceDescriptionPacket.type:
                        {
                            const sdes = packet;
                            // log("sdes", JSON.stringify(sdes.chunks));
                        }
                        break;
                    case rtp_1.RtcpTransportLayerFeedback.type:
                        {
                            const rtpfb = packet;
                            if (rtpfb.feedback) {
                                recipients.push(this.ssrcTable[rtpfb.feedback.mediaSourceSsrc]);
                            }
                        }
                        break;
                    case rtp_1.RtcpPayloadSpecificFeedback.type:
                        {
                            const psfb = packet;
                            switch (psfb.feedback.count) {
                                case rtp_1.ReceiverEstimatedMaxBitrate.count:
                                    {
                                        const remb = psfb.feedback;
                                        recipients.push(this.ssrcTable[remb.ssrcFeedbacks[0]]);
                                    }
                                    break;
                                default:
                                    recipients.push(this.ssrcTable[psfb.feedback.senderSsrc] ||
                                        this.ssrcTable[psfb.feedback.mediaSsrc]);
                            }
                        }
                        break;
                }
                recipients
                    .filter((v) => v) // todo simulcast
                    .forEach((recipient) => recipient.handleRtcpPacket(packet));
            }
        });
    }
    registerRtpSender(sender) {
        this.ssrcTable[sender.ssrc] = sender;
    }
    registerRtpReceiver(receiver, ssrc) {
        log("registerRtpReceiver", ssrc);
        this.ssrcTable[ssrc] = receiver;
    }
    registerRtpReceiverBySsrc(transceiver, params) {
        log("registerRtpReceiverBySsrc", params);
        params.encodings
            .filter((e) => e.ssrc != undefined) // todo fix
            .forEach((encode, i) => {
            this.registerRtpReceiver(transceiver.receiver, encode.ssrc);
            transceiver.addTrack(new track_1.MediaStreamTrack({
                ssrc: encode.ssrc,
                kind: transceiver.kind,
                id: transceiver.sender.trackId,
                remote: true,
                codec: params.codecs[i],
            }));
            if (encode.rtx) {
                this.registerRtpReceiver(transceiver.receiver, encode.rtx.ssrc);
            }
        });
        params.headerExtensions.forEach((extension) => {
            this.extIdUriMap[extension.id] = extension.uri;
        });
    }
    registerRtpReceiverByRid(transceiver, param, params) {
        // サイマルキャスト利用時のRTXをサポートしていないのでcodecs/encodingsは常に一つ
        const [codec] = params.codecs;
        log("registerRtpReceiverByRid", param);
        transceiver.addTrack(new track_1.MediaStreamTrack({
            rid: param.rid,
            kind: transceiver.kind,
            id: transceiver.sender.trackId,
            remote: true,
            codec,
        }));
        this.ridTable[param.rid] = transceiver.receiver;
    }
}
exports.RtpRouter = RtpRouter;
//# sourceMappingURL=router.js.map