"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SegmentSizePosition = exports.DurationPosition = exports.MaxSinged16Int = exports.Max32Uint = exports.WebmBase = void 0;
exports.replaceSegmentSize = replaceSegmentSize;
const common_1 = require("../../imports/common");
const container_1 = require("../container");
class WebmBase {
    constructor(tracks, output, options = {}) {
        Object.defineProperty(this, "tracks", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: tracks
        });
        Object.defineProperty(this, "output", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: output
        });
        Object.defineProperty(this, "options", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: options
        });
        Object.defineProperty(this, "builder", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "relativeTimestamp", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "timestamps", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: {}
        });
        Object.defineProperty(this, "cuePoints", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        Object.defineProperty(this, "position", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "clusterCounts", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        /**ms */
        Object.defineProperty(this, "elapsed", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "audioStopped", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        Object.defineProperty(this, "videoStopped", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        Object.defineProperty(this, "stopped", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        Object.defineProperty(this, "videoKeyframeReceived", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        Object.defineProperty(this, "internalStats", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: {}
        });
        Object.defineProperty(this, "onStopped", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new common_1.Event()
        });
        Object.defineProperty(this, "processAudioInput", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: (input) => {
                const track = this.tracks.find((t) => t.kind === "audio");
                if (track) {
                    this.internalStats["processAudioInput"] = new Date().toISOString();
                    this.processInput(input, track.trackNumber);
                }
            }
        });
        Object.defineProperty(this, "processVideoInput", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: (input) => {
                if (input.frame?.isKeyframe) {
                    this.videoKeyframeReceived = true;
                }
                if (!this.videoKeyframeReceived && input?.frame?.isKeyframe !== true) {
                    return;
                }
                const track = this.tracks.find((t) => t.kind === "video");
                if (track) {
                    this.internalStats["processVideoInput"] = new Date().toISOString();
                    this.processInput(input, track.trackNumber);
                }
            }
        });
        this.builder = new container_1.WEBMContainer(tracks, options.encryptionKey);
        tracks.forEach((t) => {
            this.timestamps[t.trackNumber] = new ClusterTimestamp();
        });
    }
    toJSON() {
        return {
            ...this.internalStats,
            videoKeyframeReceived: this.videoKeyframeReceived,
            videoStopped: this.videoStopped,
            audioStopped: this.audioStopped,
            stopped: this.stopped,
        };
    }
    processInput(input, trackNumber) {
        if (this.stopped) {
            return;
        }
        const track = this.tracks.find((t) => t.trackNumber === trackNumber);
        if (!track) {
            throw new Error("track not found");
        }
        if (!input.frame) {
            if (this.tracks.length === 2) {
                if (track.kind === "audio") {
                    this.audioStopped = true;
                    this.internalStats["audioStopped"] = new Date().toISOString();
                    if (this.videoStopped) {
                        this.stop();
                    }
                }
                else {
                    this.videoStopped = true;
                    this.internalStats["videoStopped"] = new Date().toISOString();
                    if (this.audioStopped) {
                        this.stop();
                    }
                }
            }
            else if (input.eol) {
                this.stop();
            }
            return;
        }
        if (track.kind === "audio") {
            this.audioStopped = false;
        }
        else {
            this.videoStopped = false;
        }
        this.onFrameReceived({ ...input.frame, trackNumber });
    }
    start() {
        const staticPart = Buffer.concat([
            this.builder.ebmlHeader,
            this.builder.createSegment(this.options.duration),
        ]);
        this.output({ saveToFile: staticPart, kind: "initial" });
        this.position += staticPart.length;
        const video = this.tracks.find((t) => t.kind === "video");
        if (video) {
            this.cuePoints.push(new CuePoint(this.builder, video.trackNumber, 0.0, this.position));
        }
    }
    onFrameReceived(frame) {
        const track = this.tracks.find((t) => t.trackNumber === frame.trackNumber);
        if (!track) {
            return;
        }
        this.internalStats["onFrameReceived_trackNumber" + frame.trackNumber] =
            new Date().toISOString();
        this.internalStats["onFrameReceived_count"] =
            (this.internalStats["onFrameReceived_count"] ?? 0) + 1;
        const timestampManager = this.timestamps[track.trackNumber];
        if (timestampManager.baseTime == undefined) {
            for (const t of Object.values(this.timestamps)) {
                t.baseTime = frame.time;
            }
        }
        // clusterの経過時間 ms
        let elapsed = timestampManager.update(frame.time);
        if (this.clusterCounts === 0) {
            this.createCluster(0.0, 0);
        }
        else if ((track.kind === "video" && frame.isKeyframe) ||
            // simpleBlockのタイムスタンプはsigned 16bitだから
            elapsed > exports.MaxSinged16Int) {
            this.relativeTimestamp += elapsed;
            if (elapsed !== 0) {
                this.cuePoints.push(new CuePoint(this.builder, track.trackNumber, this.relativeTimestamp, this.position));
                this.createCluster(this.relativeTimestamp, elapsed);
                Object.values(this.timestamps).forEach((t) => t.shift(elapsed));
                elapsed = timestampManager.update(frame.time);
            }
        }
        if (elapsed >= 0) {
            this.createSimpleBlock({
                frame,
                trackNumber: track.trackNumber,
                elapsed,
            });
        }
        else {
            this.internalStats["delayed_frame"] = {
                elapsed,
                trackNumber: track.trackNumber,
                timestamp: new Date().toISOString(),
                count: (this.internalStats["delayed_frame"]?.count ?? 0) + 1,
            };
        }
    }
    createCluster(timestamp, 
    /**ms */
    duration) {
        const cluster = this.builder.createCluster(timestamp);
        this.clusterCounts++;
        this.output({
            saveToFile: Buffer.from(cluster),
            kind: "cluster",
            previousDuration: duration,
        });
        this.position += cluster.length;
        this.elapsed = undefined;
    }
    createSimpleBlock({ frame, trackNumber, elapsed, }) {
        if (this.elapsed == undefined) {
            this.elapsed = elapsed;
        }
        if (elapsed < this.elapsed && this.options.strictTimestamp) {
            this.internalStats["previous_timestamp"] = {
                elapsed,
                present: this.elapsed,
                trackNumber,
                timestamp: new Date().toISOString(),
                count: (this.internalStats["previous_timestamp"]?.count ?? 0) + 1,
            };
            return;
        }
        if (elapsed > this.elapsed + 1000) {
            const key = "maybe_packetLost-" + trackNumber;
            this.internalStats[key] = {
                elapsed,
                present: this.elapsed,
                trackNumber,
                timestamp: new Date().toISOString(),
                count: (this.internalStats[key]?.count ?? 0) + 1,
            };
        }
        this.elapsed = elapsed;
        const block = this.builder.createSimpleBlock(frame.data, frame.isKeyframe, trackNumber, elapsed);
        this.internalStats["createSimpleBlock_trackNumber" + trackNumber] =
            new Date().toISOString();
        this.output({ saveToFile: block, kind: "block" });
        this.position += block.length;
        const [cuePoint] = this.cuePoints.slice(-1);
        if (cuePoint) {
            cuePoint.blockNumber++;
        }
    }
    stop() {
        if (this.stopped) {
            return;
        }
        this.videoStopped = true;
        this.audioStopped = true;
        this.stopped = true;
        this.internalStats["stopped"] = new Date().toISOString();
        const latestTimestamp = Object.values(this.timestamps)
            .sort((a, b) => a.elapsed - b.elapsed)
            .reverse()[0].elapsed;
        const duration = this.relativeTimestamp + latestTimestamp;
        const cues = this.builder.createCues(this.cuePoints.map((c) => c.build()));
        this.output({
            saveToFile: Buffer.from(cues),
            kind: "cuePoints",
            previousDuration: duration,
        });
        const durationElement = this.builder.createDuration(duration);
        const header = Buffer.concat([
            this.builder.ebmlHeader,
            this.builder.createSegment(duration),
        ]);
        this.output({ eol: { duration, durationElement, header } });
        this.timestamps = {};
        this.cuePoints = [];
        this.internalStats = {};
        this.output = undefined;
        this.onStopped.execute();
    }
}
exports.WebmBase = WebmBase;
class ClusterTimestamp {
    constructor() {
        /**ms */
        Object.defineProperty(this, "baseTime", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        /**ms */
        Object.defineProperty(this, "elapsed", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "offset", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
    }
    shift(
    /**ms */
    elapsed) {
        this.offset += elapsed;
    }
    update(
    /**ms */
    time) {
        if (this.baseTime == undefined) {
            throw new Error("baseTime not exist");
        }
        this.elapsed = time - this.baseTime - this.offset;
        return this.elapsed;
    }
}
class CuePoint {
    constructor(builder, trackNumber, relativeTimestamp, position) {
        Object.defineProperty(this, "builder", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: builder
        });
        Object.defineProperty(this, "trackNumber", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: trackNumber
        });
        Object.defineProperty(this, "relativeTimestamp", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: relativeTimestamp
        });
        Object.defineProperty(this, "position", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: position
        });
        /**
         * cuesの後のclusterのあるべき位置
         * cuesはclusterの前に挿入される
         */
        Object.defineProperty(this, "cuesLength", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "blockNumber", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
    }
    build() {
        return this.builder.createCuePoint(this.relativeTimestamp, this.trackNumber, this.position - 48 + this.cuesLength, this.blockNumber);
    }
}
/**4294967295 */
exports.Max32Uint = Number(0x01n << 32n) - 1;
/**32767 */
exports.MaxSinged16Int = (0x01 << 16) / 2 - 1;
exports.DurationPosition = 83;
exports.SegmentSizePosition = 40;
function replaceSegmentSize(totalFileSize) {
    const bodySize = totalFileSize - exports.SegmentSizePosition;
    const resize = [
        ...(0, container_1.vintEncode)((0, container_1.numberToByteArray)(bodySize, (0, container_1.getEBMLByteLength)(bodySize))),
    ];
    const todoFill = 8 - resize.length - 2;
    if (todoFill > 0) {
        resize.push(0xec);
        if (todoFill > 1) {
            const voidSize = (0, container_1.vintEncode)((0, container_1.numberToByteArray)(todoFill, (0, container_1.getEBMLByteLength)(todoFill)));
            [...voidSize].forEach((i) => resize.push(i));
        }
    }
    return Buffer.from(resize);
}
//# sourceMappingURL=webm.js.map