"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebmFactory = void 0;
const promises_1 = require("fs/promises");
const common_1 = require("../../../imports/common");
const _1 = require(".");
const __1 = require("../../..");
const rtpExtra_1 = require("../../../imports/rtpExtra");
const sourcePath = "packages/webrtc/src/nonstandard/recorder/writer/webm.ts";
class WebmFactory extends _1.MediaWriter {
    constructor() {
        super(...arguments);
        Object.defineProperty(this, "rtpSources", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        Object.defineProperty(this, "onEol", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new common_1.Event()
        });
        Object.defineProperty(this, "ended", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        Object.defineProperty(this, "unSubscribers", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new common_1.EventDisposer()
        });
    }
    async start(tracks) {
        if (this.props.path) {
            await (0, promises_1.unlink)(this.props.path).catch((e) => e);
        }
        const inputTracks = tracks.map((track, i) => {
            const trackNumber = i + 1;
            const payloadType = track.codec.payloadType;
            if (track.kind === "video") {
                const codec = (() => {
                    switch (track.codec?.name.toLowerCase()) {
                        case "vp8":
                            return "VP8";
                        case "vp9":
                            return "VP9";
                        case "h264":
                            return "MPEG4/ISO/AVC";
                        case "av1x":
                            return "AV1";
                        default:
                            throw new __1.WeriftError({
                                message: "unsupported codec",
                                payload: { track, path: sourcePath },
                            });
                    }
                })();
                return {
                    kind: "video",
                    codec,
                    clockRate: 90000,
                    trackNumber,
                    width: this.props.width ?? 640,
                    height: this.props.height ?? 360,
                    roll: this.props.roll,
                    payloadType,
                    track,
                };
            }
            else {
                return {
                    kind: "audio",
                    codec: "OPUS",
                    clockRate: 48000,
                    trackNumber,
                    payloadType,
                    track,
                };
            }
        });
        const webm = new rtpExtra_1.WebmCallback(inputTracks, {
            duration: this.props.defaultDuration ?? 1000 * 60 * 60 * 24,
        });
        const lipsync = new rtpExtra_1.LipsyncCallback(this.props.lipsync ?? {});
        this.rtpSources = inputTracks.map(({ track, clockRate, codec }) => {
            const rtpSource = new rtpExtra_1.RtpSourceCallback();
            const rtcpSource = new rtpExtra_1.RtcpSourceCallback();
            track.onReceiveRtp
                .subscribe((rtp) => {
                rtpSource.input(rtp.clone());
            })
                .disposer(this.unSubscribers);
            track.onReceiveRtcp
                .subscribe((rtcp) => {
                rtcpSource.input(rtcp);
            })
                .disposer(this.unSubscribers);
            const time = this.props.disableNtp
                ? new rtpExtra_1.RtpTimeCallback(clockRate)
                : new rtpExtra_1.NtpTimeCallback(clockRate);
            if (track.kind === "video") {
                const depacketizer = new rtpExtra_1.DepacketizeCallback(codec, {
                    isFinalPacketInSequence: (h) => h.marker,
                });
                const jitterBuffer = new rtpExtra_1.JitterBufferCallback(clockRate, this.props.jitterBuffer ?? {});
                rtpSource.pipe(jitterBuffer.input);
                rtcpSource.pipe(time.input);
                jitterBuffer.pipe(time.input);
                time.pipe(depacketizer.input);
                if (this.props.disableLipSync) {
                    depacketizer.pipe(webm.inputVideo);
                }
                else {
                    depacketizer.pipe(lipsync.inputVideo);
                    lipsync.pipeVideo(webm.inputVideo);
                }
            }
            else {
                const depacketizer = new rtpExtra_1.DepacketizeCallback(codec);
                rtpSource.pipe(time.input);
                rtcpSource.pipe(time.input);
                time.pipe(depacketizer.input);
                if (this.props.disableLipSync) {
                    depacketizer.pipe(webm.inputAudio);
                }
                else {
                    depacketizer.pipe(lipsync.inputAudio);
                    lipsync.pipeAudio(webm.inputAudio);
                }
            }
            return rtpSource;
        });
        if (this.props.path) {
            webm.pipe(async (o) => {
                const eol = await (0, rtpExtra_1.saveToFileSystem)(this.props.path)(o);
                if (this.props.stream) {
                    this.props.stream.execute(o);
                }
                if (eol) {
                    this.onEol.execute();
                    this.ended = true;
                }
            });
        }
        else if (this.props.stream) {
            webm.pipe(async (o) => {
                this.props.stream.execute(o);
            });
        }
    }
    async stop() {
        await Promise.all(this.rtpSources.map((r) => r.stop()));
        if (!this.ended) {
            await this.onEol.asPromise(5000).catch((e) => e);
        }
        this.unSubscribers.dispose();
    }
}
exports.WebmFactory = WebmFactory;
const supportedVideoCodecs = ["h264", "vp8", "vp9", "av1x"];
//# sourceMappingURL=webm.js.map