"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUserMedia = void 0;
const crypto_1 = require("crypto");
const os_1 = require("os");
const path_1 = require("path");
const stream_1 = require("stream");
const promises_1 = require("fs/promises");
const promises_2 = require("timers/promises");
const mediabunny_1 = require("mediabunny");
const common_1 = require("../imports/common");
const track_1 = require("../media/track");
const sdp_1 = require("../sdp");
const packetizer_1 = require("./userMedia/packetizer");
const getUserMedia = async (options) => {
    assertSupportedOptions(options);
    const replayableSource = await createReplayableSource(options);
    const input = await createInput(replayableSource);
    try {
        if (!(await input.canRead())) {
            throw new Error("Only MP4 and WebM file playback is supported");
        }
        const streamId = (0, crypto_1.randomUUID)().toString();
        const playbackTracks = await selectPlaybackTracks(input, streamId);
        if (playbackTracks.length === 0) {
            throw new Error("The media source does not contain playable audio or video tracks");
        }
        const mediaStartTimestamp = await input.getFirstTimestamp(playbackTracks.map(({ inputTrack }) => inputTrack));
        return new MediaPlayer({
            source: replayableSource,
            loop: options.loop ?? false,
            streamId,
            session: createPlaybackSession({
                input,
                mediaStartTimestamp,
                playbackTracks,
            }),
        });
    }
    catch (error) {
        input.dispose();
        throw error;
    }
};
exports.getUserMedia = getUserMedia;
class MediaPlayer {
    constructor({ source, loop, streamId, session, }) {
        Object.defineProperty(this, "audio", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "video", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "onError", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new common_1.Event()
        });
        Object.defineProperty(this, "source", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "loop", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "streamId", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "session", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "running", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "abortController", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "hasStartedPlayback", {
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
        this.source = source;
        this.loop = loop;
        this.streamId = streamId;
        this.session = session;
        this.audio = session.playbackTracks.find(({ track }) => track.kind === "audio")?.track;
        this.video = session.playbackTracks.find(({ track }) => track.kind === "video")?.track;
    }
    async start() {
        if (this.stopped) {
            throw new Error("The media source has already been stopped");
        }
        if (this.running) {
            return;
        }
        const abortController = new AbortController();
        this.abortController = abortController;
        let startupPending = true;
        let session;
        const playback = (async () => {
            session = await this.getOrCreateSession();
            if (abortController.signal.aborted || this.stopped) {
                return;
            }
            session.runners.forEach((runner) => runner.assertReady());
            const initialSourceChanged = this.hasStartedPlayback;
            this.hasStartedPlayback = true;
            await this.run(session, abortController, initialSourceChanged);
        })();
        const observedPlayback = playback.catch((error) => {
            if (abortController.signal.aborted) {
                return;
            }
            this.onError.execute(toError(error));
            if (startupPending) {
                throw error;
            }
        });
        this.running = observedPlayback.finally(() => {
            if (this.abortController === abortController) {
                this.abortController = undefined;
            }
            this.running = undefined;
            this.disposeSession(session);
        });
        try {
            await Promise.race([this.running, (0, promises_2.setImmediate)()]);
        }
        finally {
            startupPending = false;
        }
    }
    stop() {
        if (this.stopped) {
            return;
        }
        // File playback mirrors the previous process-backed behavior: stop() is terminal.
        this.stopped = true;
        this.abortController?.abort();
        if (!this.running) {
            this.disposeSession();
        }
    }
    async run(session, abortController, initialSourceChanged) {
        let sourceChanged = initialSourceChanged;
        do {
            const startedAt = performance.now();
            await Promise.all(session.runners.map((runner) => runner.play({
                startedAt,
                signal: abortController.signal,
                sourceChanged,
            })));
            if (!this.loop || abortController.signal.aborted) {
                break;
            }
            sourceChanged = true;
        } while (!abortController.signal.aborted);
    }
    async getOrCreateSession() {
        if (this.session) {
            return this.session;
        }
        const input = await createInput(this.source);
        try {
            if (!(await input.canRead())) {
                throw new Error("Only MP4 and WebM file playback is supported");
            }
            const playbackTracks = await selectPlaybackTracks(input, this.streamId, buildExistingTrackMap(this.audio, this.video));
            const mediaStartTimestamp = await input.getFirstTimestamp(playbackTracks.map(({ inputTrack }) => inputTrack));
            const session = createPlaybackSession({
                input,
                mediaStartTimestamp,
                playbackTracks,
            });
            this.session = session;
            return session;
        }
        catch (error) {
            input.dispose();
            throw error;
        }
    }
    disposeSession(session = this.session) {
        if (!session) {
            return;
        }
        session.input.dispose();
        if (this.session === session) {
            this.session = undefined;
        }
    }
}
class TrackPlaybackRunner {
    constructor(props) {
        Object.defineProperty(this, "props", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: props
        });
    }
    async play({ startedAt, signal, sourceChanged, }) {
        const codec = this.requireNegotiatedCodec();
        const packetizer = (0, packetizer_1.createPacketizer)({
            codec,
            sourceCodec: this.props.sourceCodec,
            decoderDescription: this.props.decoderDescription,
        });
        const packetSink = new mediabunny_1.EncodedPacketSink(this.props.inputTrack);
        let sourceChangeNotified = false;
        try {
            for await (const packet of packetSink.packets(undefined, undefined, {
                verifyKeyPackets: this.props.track.kind === "video",
            })) {
                signal.throwIfAborted?.();
                const dueAtMs = (packet.timestamp - this.props.mediaStartTimestamp) * 1000;
                const remainingMs = dueAtMs - (performance.now() - startedAt);
                if (remainingMs > 0) {
                    await (0, promises_2.setTimeout)(remainingMs, undefined, { signal });
                }
                const rtpTimestamp = toRtpTimestamp(packet.timestamp, this.props.mediaStartTimestamp, codec.clockRate);
                const packets = packetizer.packetize(packet, rtpTimestamp);
                if (packets.length === 0) {
                    continue;
                }
                if (sourceChanged && !sourceChangeNotified) {
                    this.props.track.onSourceChanged.execute(packets[0].header);
                    sourceChangeNotified = true;
                }
                for (const rtpPacket of packets) {
                    this.props.track.writeRtp(rtpPacket);
                }
            }
        }
        catch (error) {
            if (signal.aborted || isAbortError(error)) {
                return;
            }
            throw error;
        }
    }
    assertReady() {
        const codec = this.requireNegotiatedCodec();
        (0, packetizer_1.createPacketizer)({
            codec,
            sourceCodec: this.props.sourceCodec,
            decoderDescription: this.props.decoderDescription,
        });
    }
    requireNegotiatedCodec() {
        const codec = this.props.track.codec;
        if (!codec) {
            throw new Error(`Cannot start ${this.props.track.kind} playback before the track is attached to an RTCRtpSender`);
        }
        const expectedMimeType = (0, packetizer_1.toSupportedMimeType)(this.props.sourceCodec);
        const negotiatedMimeType = normalizeMimeType(codec.mimeType);
        if (negotiatedMimeType !== expectedMimeType) {
            throw new Error(`Input ${this.props.track.kind} codec ${expectedMimeType} does not match negotiated codec ${codec.mimeType}`);
        }
        const expectedClockRate = this.props.track.kind === "audio" ? 48000 : 90000;
        if (codec.clockRate !== expectedClockRate) {
            throw new Error(`Input ${this.props.track.kind} clock rate ${expectedClockRate} does not match negotiated clock rate ${codec.clockRate}`);
        }
        assertCodecParameters({
            trackKind: this.props.track.kind === "audio" ? "audio" : "video",
            codec,
            sourceCodec: this.props.sourceCodec,
            decoderDescription: this.props.decoderDescription,
            sourceChannels: this.props.sourceChannels,
        });
        return codec;
    }
}
async function selectPlaybackTracks(input, streamId, existingTracks = {}) {
    const primaryVideoTrack = await input.getPrimaryVideoTrack();
    const primaryAudioTrack = primaryVideoTrack
        ? ((await primaryVideoTrack.getPrimaryPairableAudioTrack()) ??
            (await input.getPrimaryAudioTrack()))
        : await input.getPrimaryAudioTrack();
    const playbackTracks = [];
    if (primaryAudioTrack) {
        playbackTracks.push(await createPlaybackTrack(primaryAudioTrack, streamId, existingTracks.audio));
    }
    if (primaryVideoTrack) {
        playbackTracks.push(await createPlaybackTrack(primaryVideoTrack, streamId, existingTracks.video));
    }
    if (!primaryVideoTrack && !primaryAudioTrack) {
        const fallbackAudioTrack = await input.getPrimaryAudioTrack();
        if (fallbackAudioTrack) {
            playbackTracks.push(await createPlaybackTrack(fallbackAudioTrack, streamId, existingTracks.audio));
        }
    }
    return playbackTracks;
}
async function createPlaybackTrack(inputTrack, streamId, track) {
    const sourceCodec = await requireSupportedCodec(inputTrack);
    const decoderConfig = await inputTrack.getDecoderConfig();
    const kind = inputTrack.isAudioTrack() ? "audio" : "video";
    return {
        inputTrack,
        sourceCodec,
        decoderDescription: decoderConfig && "description" in decoderConfig
            ? (decoderConfig.description ?? null)
            : null,
        sourceChannels: decoderConfig && "numberOfChannels" in decoderConfig
            ? decoderConfig.numberOfChannels
            : undefined,
        track: track ??
            new track_1.MediaStreamTrack({
                kind,
                streamId,
            }),
    };
}
async function requireSupportedCodec(inputTrack) {
    const codec = await inputTrack.getCodec();
    if (codec && packetizer_1.supportedSourceCodecs.includes(codec)) {
        return codec;
    }
    const codecLabel = codec ??
        (await inputTrack.getCodecParameterString()) ??
        String((await inputTrack.getInternalCodecId()) ?? "unknown");
    throw new Error(`Unsupported ${inputTrack.type} codec "${codecLabel}". File playback supports H264, VP8, VP9, AV1, and Opus only.`);
}
async function createReplayableSource(options) {
    if (typeof options.path === "string") {
        return { path: options.path };
    }
    const buffer = options.buffer != undefined
        ? toBuffer(options.buffer)
        : await readStreamToBuffer(options.stream);
    return { buffer };
}
async function createInput(options) {
    if (typeof options.path === "string") {
        const buffer = await (0, promises_1.readFile)(resolveUserMediaPath(options.path));
        return new mediabunny_1.Input({
            source: new mediabunny_1.BufferSource(buffer),
            formats: [mediabunny_1.MP4, mediabunny_1.WEBM],
        });
    }
    return new mediabunny_1.Input({
        source: new mediabunny_1.BufferSource(options.buffer),
        formats: [mediabunny_1.MP4, mediabunny_1.WEBM],
    });
}
function resolveUserMediaPath(path) {
    if (path === "~") {
        return (0, os_1.homedir)();
    }
    if (path.startsWith("~/")) {
        return (0, path_1.resolve)((0, os_1.homedir)(), path.slice(2));
    }
    return (0, path_1.isAbsolute)(path) ? path : (0, path_1.resolve)(path);
}
async function readStreamToBuffer(stream) {
    const chunks = [];
    if (stream instanceof stream_1.Readable) {
        for await (const chunk of stream) {
            chunks.push(toBuffer(chunk));
        }
        return Buffer.concat(chunks);
    }
    const reader = stream.getReader();
    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done) {
                break;
            }
            if (value) {
                chunks.push(Buffer.from(value.buffer, value.byteOffset, value.byteLength));
            }
        }
    }
    finally {
        reader.releaseLock();
    }
    return Buffer.concat(chunks);
}
function toBuffer(value) {
    if (Buffer.isBuffer(value)) {
        return value;
    }
    if (typeof value === "string") {
        return Buffer.from(value);
    }
    if (ArrayBuffer.isView(value)) {
        return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
    }
    return Buffer.from(new Uint8Array(value));
}
function normalizeMimeType(mimeType) {
    return mimeType.toLowerCase();
}
function assertSupportedOptions(options) {
    const legacyOptions = options;
    if (legacyOptions.width != undefined || legacyOptions.height != undefined) {
        throw new Error("getUserMedia({ width, height }) is no longer supported for file playback. Resize or re-encode the source before calling getUserMedia().");
    }
}
function createPlaybackSession({ input, mediaStartTimestamp, playbackTracks, }) {
    return {
        input,
        mediaStartTimestamp,
        playbackTracks,
        runners: playbackTracks.map((playbackTrack) => new TrackPlaybackRunner({
            mediaStartTimestamp,
            ...playbackTrack,
        })),
    };
}
function buildExistingTrackMap(audio, video) {
    return {
        ...(audio ? { audio } : {}),
        ...(video ? { video } : {}),
    };
}
function assertCodecParameters({ trackKind, codec, sourceCodec, decoderDescription, sourceChannels, }) {
    if (sourceCodec === "opus" && sourceChannels && codec.channels != undefined) {
        if (codec.channels !== sourceChannels) {
            throw new Error(`Input ${trackKind} channels ${sourceChannels} do not match negotiated channels ${codec.channels}`);
        }
        return;
    }
    if (sourceCodec !== "avc") {
        // mediabunny exposes codec-specific decoder configuration for H264 only here.
        return;
    }
    const negotiatedParameters = (0, sdp_1.codecParametersFromString)(codec.parameters ?? "");
    const negotiatedPacketizationMode = Number(negotiatedParameters["packetization-mode"] ?? 1);
    if (negotiatedPacketizationMode !== 1) {
        throw new Error(`Input ${trackKind} packetization-mode 1 does not match negotiated packetization-mode ${negotiatedPacketizationMode}`);
    }
    const sourceProfileLevelId = getH264ProfileLevelId(decoderDescription);
    const negotiatedProfileLevelId = normalizeOptionalHexParameter(negotiatedParameters["profile-level-id"]);
    if (!sourceProfileLevelId) {
        return;
    }
    if (!negotiatedProfileLevelId) {
        throw new Error(`Input ${trackKind} profile-level-id ${sourceProfileLevelId} does not match negotiated profile-level-id <missing>`);
    }
    if (sourceProfileLevelId !== negotiatedProfileLevelId) {
        throw new Error(`Input ${trackKind} profile-level-id ${sourceProfileLevelId} does not match negotiated profile-level-id ${negotiatedProfileLevelId}`);
    }
}
function getH264ProfileLevelId(decoderDescription) {
    if (!decoderDescription) {
        return undefined;
    }
    const description = toDescriptionBuffer(decoderDescription);
    if (description.length < 4) {
        throw new Error("invalid H264 decoder configuration");
    }
    return description.subarray(1, 4).toString("hex");
}
function normalizeOptionalHexParameter(value) {
    return typeof value === "string" ? value.toLowerCase() : undefined;
}
function toRtpTimestamp(packetTimestamp, mediaStartTimestamp, clockRate) {
    const relativeSeconds = Math.max(0, packetTimestamp - mediaStartTimestamp);
    return Math.round(relativeSeconds * clockRate) >>> 0;
}
function isAbortError(error) {
    return (error instanceof Error &&
        (error.name === "AbortError" ||
            error.message === "The operation was aborted"));
}
function toError(error) {
    return error instanceof Error ? error : new Error(String(error));
}
function toDescriptionBuffer(decoderDescription) {
    if (ArrayBuffer.isView(decoderDescription)) {
        return Buffer.from(decoderDescription.buffer, decoderDescription.byteOffset, decoderDescription.byteLength);
    }
    return Buffer.from(decoderDescription);
}
//# sourceMappingURL=userMedia.js.map