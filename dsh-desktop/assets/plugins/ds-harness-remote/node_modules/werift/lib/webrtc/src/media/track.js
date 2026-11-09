"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MediaStream = exports.MediaStreamTrack = void 0;
const crypto_1 = require("crypto");
const common_1 = require("../imports/common");
const helper_1 = require("../helper");
const rtp_1 = require("../imports/rtp");
class MediaStreamTrack extends helper_1.EventTarget {
    constructor(props) {
        super();
        Object.defineProperty(this, "uuid", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: (0, crypto_1.randomUUID)().toString()
        });
        /**MediaStream ID*/
        Object.defineProperty(this, "streamId", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "remote", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        Object.defineProperty(this, "label", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "kind", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "id", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        /**mediaSsrc */
        Object.defineProperty(this, "ssrc", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "rid", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "header", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "codec", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        /**todo impl */
        Object.defineProperty(this, "enabled", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: true
        });
        Object.defineProperty(this, "onReceiveRtp", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new common_1.Event()
        });
        Object.defineProperty(this, "onReceiveRtcp", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new common_1.Event()
        });
        Object.defineProperty(this, "onSourceChanged", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new common_1.Event()
        });
        Object.defineProperty(this, "stopped", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        Object.defineProperty(this, "muted", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: true
        });
        Object.defineProperty(this, "stop", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: () => {
                this.stopped = true;
                this.muted = true;
                this.onReceiveRtp.complete();
                this.emit("ended");
            }
        });
        Object.defineProperty(this, "writeRtp", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: (rtp) => {
                if (this.remote) {
                    throw new Error("this is remoteTrack");
                }
                if (this.stopped) {
                    return;
                }
                const packet = Buffer.isBuffer(rtp) ? rtp_1.RtpPacket.deSerialize(rtp) : rtp;
                packet.header.payloadType =
                    this.codec?.payloadType ?? packet.header.payloadType;
                this.onReceiveRtp.execute(packet);
            }
        });
        Object.assign(this, props);
        this.onReceiveRtp.subscribe((rtp) => {
            this.muted = false;
            this.header = rtp.header;
        });
        this.label = `${this.remote ? "remote" : "local"} ${this.kind}`;
    }
}
exports.MediaStreamTrack = MediaStreamTrack;
class MediaStream {
    constructor(props = {}) {
        Object.defineProperty(this, "id", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "tracks", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        if (Array.isArray(props)) {
            this.tracks = props;
        }
        else {
            Object.assign(this, props);
        }
        this.id ?? (this.id = (0, crypto_1.randomUUID)().toString());
    }
    addTrack(track) {
        track.streamId = this.id;
        this.tracks.push(track);
    }
    removeTrack(track) {
        this.tracks = this.tracks.filter((currentTrack) => currentTrack !== track);
        if (track.streamId === this.id) {
            track.streamId = undefined;
        }
    }
    getTracks() {
        return this.tracks;
    }
    getAudioTracks() {
        return this.tracks.filter((track) => track.kind === "audio");
    }
    getVideoTracks() {
        return this.tracks.filter((track) => track.kind === "video");
    }
}
exports.MediaStream = MediaStream;
//# sourceMappingURL=track.js.map