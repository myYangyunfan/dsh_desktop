"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.navigator = exports.MediaDevices = exports.Navigator = void 0;
const dgram_1 = require("dgram");
const __1 = require("..");
const track_1 = require("../media/track");
const dummyMedia_1 = require("./dummyMedia");
class Navigator {
    constructor(props = {}) {
        Object.defineProperty(this, "mediaDevices", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        this.mediaDevices = new MediaDevices(props);
    }
}
exports.Navigator = Navigator;
class MediaDevices extends EventTarget {
    constructor(props = {}) {
        super();
        Object.defineProperty(this, "props", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: props
        });
        Object.defineProperty(this, "video", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "audio", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "activeSourceStops", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Map()
        });
        Object.defineProperty(this, "getUserMedia", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: async (constraints) => {
                const tracks = [
                    ...(constraints.audio
                        ? [this.createTrack("audio", constraints.audio)]
                        : []),
                    ...(constraints.video
                        ? [this.createTrack("video", constraints.video)]
                        : []),
                ];
                if (tracks.length === 0) {
                    throw new Error("At least one audio or video track is required");
                }
                return new track_1.MediaStream(tracks);
            }
        });
        Object.defineProperty(this, "getDisplayMedia", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: this.getUserMedia
        });
        Object.defineProperty(this, "getUdpMedia", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: ({ port, codec, }) => {
                const kind = codec.mimeType.toLowerCase().includes("video")
                    ? "video"
                    : "audio";
                const track = new track_1.MediaStreamTrack({
                    kind,
                    codec: new __1.RTCRtpCodecParameters(codec),
                });
                const udp = (0, dgram_1.createSocket)("udp4");
                udp.bind(port);
                udp.on("message", (data) => {
                    track.writeRtp(data);
                });
                const disposer = () => {
                    udp.close();
                };
                return { track, disposer };
            }
        });
        this.video = props.video;
        this.audio = props.audio;
    }
    cleanup() {
        for (const stop of this.activeSourceStops.values()) {
            stop();
        }
        this.activeSourceStops.clear();
    }
    createTrack(kind, constraints) {
        const existingTrack = kind === "audio" ? this.audio : this.video;
        if (existingTrack) {
            return this.createClonedTrack(kind, existingTrack);
        }
        if (this.props.dummyMedia?.enabled) {
            return this.createDummyTrack(kind, constraints);
        }
        throw new Error(`No ${kind} source configured for getUserMedia`);
    }
    createClonedTrack(kind, sourceTrack) {
        const track = new track_1.MediaStreamTrack({ kind });
        const { unSubscribe } = sourceTrack.onReceiveRtp.subscribe((rtp) => {
            track.onReceiveRtp.execute(rtp.clone());
        });
        this.attachTrackStop(track, () => {
            unSubscribe();
        });
        return track;
    }
    createDummyTrack(kind, constraints) {
        const dummy = kind === "audio"
            ? (0, dummyMedia_1.createDummyAudioTrack)(this.props.dummyMedia?.audio)
            : (0, dummyMedia_1.createDummyVideoTrack)({
                ...this.props.dummyMedia?.video,
                ...resolveVideoOptions(constraints),
            });
        this.attachTrackStop(dummy.track, () => {
            dummy.source.stop();
        });
        return dummy.track;
    }
    attachTrackStop(track, stop) {
        let disposed = false;
        const originalStop = track.stop;
        const dispose = () => {
            if (disposed) {
                return;
            }
            disposed = true;
            stop();
            this.activeSourceStops.delete(track);
        };
        track.stop = () => {
            dispose();
            originalStop();
        };
        this.activeSourceStops.set(track, dispose);
    }
}
exports.MediaDevices = MediaDevices;
exports.navigator = new Navigator();
function resolveVideoOptions(constraints) {
    if (typeof constraints === "boolean") {
        return {};
    }
    const fps = resolveConstrainNumber(constraints.frameRate);
    if (!fps) {
        return {};
    }
    return {
        fps,
        keyframeIntervalFrames: Math.max(1, Math.round(fps)),
    };
}
function resolveConstrainNumber(value) {
    if (typeof value === "number") {
        return value;
    }
    if (!value || typeof value !== "object") {
        return;
    }
    return value.exact ?? value.ideal ?? value.max ?? value.min;
}
//# sourceMappingURL=navigator.js.map