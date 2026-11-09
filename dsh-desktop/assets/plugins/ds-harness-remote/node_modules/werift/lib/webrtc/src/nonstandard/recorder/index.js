"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MediaRecorder = void 0;
const common_1 = require("../../imports/common");
const webm_1 = require("./writer/webm");
class MediaRecorder {
    constructor(props) {
        Object.defineProperty(this, "props", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: props
        });
        Object.defineProperty(this, "writer", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "ext", {
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
        Object.defineProperty(this, "started", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        Object.defineProperty(this, "onError", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new common_1.Event()
        });
        this.tracks = props.tracks ?? this.tracks;
        const { path, stream } = props;
        if (path) {
            this.ext = path.split(".").slice(-1)[0];
            this.writer = (() => {
                switch (this.ext) {
                    case "webm":
                        return new webm_1.WebmFactory({
                            ...props,
                            path: path,
                            stream: stream,
                        });
                    default:
                        throw new Error();
                }
            })();
        }
        else {
            this.writer = new webm_1.WebmFactory({
                ...props,
                path: path,
                stream: stream,
            });
        }
        if (this.tracks.length > 0) {
            this.props.numOfTracks = this.tracks.length;
            this.start().catch((error) => {
                this.onError.execute(error);
            });
        }
    }
    async addTrack(track) {
        this.tracks.push(track);
        await this.start();
    }
    async start() {
        if (this.tracks.length === this.props.numOfTracks &&
            this.started === false) {
            this.started = true;
            await this.writer.start(this.tracks);
        }
    }
    async stop() {
        await this.writer.stop();
    }
}
exports.MediaRecorder = MediaRecorder;
//# sourceMappingURL=index.js.map