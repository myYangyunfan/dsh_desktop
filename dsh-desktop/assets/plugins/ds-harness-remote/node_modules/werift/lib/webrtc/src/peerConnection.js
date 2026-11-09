"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RTCTrackEvent = exports.defaultPeerConfig = exports.findCodecByMimeType = exports.RTCPeerConnection = void 0;
const crypto_1 = require("crypto");
const errors_1 = require("./errors");
const helper_1 = require("./helper");
const common_1 = require("./imports/common");
const media_1 = require("./media");
const stats_1 = require("./media/stats");
const sctpManager_1 = require("./sctpManager");
const sdp_1 = require("./sdp");
const sdpManager_1 = require("./sdpManager");
const secureTransportManager_1 = require("./secureTransportManager");
const sctp_1 = require("./transport/sctp");
const utils_1 = require("./utils");
const log = (0, common_1.debug)("werift:packages/webrtc/src/peerConnection.ts");
/**
 * W3C compatibility notes kept near the public RTCPeerConnection surface so the
 * reviewable diff does not depend on external PR text.
 *
 * - `current/pending*Description`, `canTrickleIceCandidates`, `sctp`,
 *   `addIceCandidate(null)`, and `RTCConfiguration` round-trip behavior are
 *   implemented here and covered by `tests/wpt/peerConnectionApiCompatibility.test.ts`.
 * - `addIceCandidate()` also validates `sdpMid` / `sdpMLineIndex` /
 *   `usernameFragment` against the applied remote description and appends
 *   candidates or end-of-candidates markers to the corresponding m-section.
 *   The public API keeps werift's historical pre-SRD buffering behavior, while
 *   the WPT runner wraps the class to exercise strict spec rejection.
 * - `bundlePolicy: "balanced"` is accepted for input compatibility but is
 *   normalized to werift's `"max-compat"` behavior, so `getConfiguration()`
 *   returns the normalized value.
 * - `setLocalDescription()` keeps the historical `SessionDescription` return
 *   value for non-rollback calls, while `{ type: "rollback" }` resolves `void`
 *   to match the actual behavior without pretending to return a description.
 * - API reference markdown is regenerated with `cd packages/webrtc && npm run doc`.
 *   The generated output lives under `packages/webrtc/doc/`; compatibility
 *   notes remain here and in the package README so review context is visible
 *   even when generated docs are not committed in the same change.
 */
class RTCPeerConnection extends helper_1.EventTarget {
    get ondatachannel() {
        return this.eventHandlers.ondatachannel ?? null;
    }
    set ondatachannel(value) {
        this.eventHandlers.ondatachannel = value ?? undefined;
    }
    get onicecandidate() {
        return this.eventHandlers.onicecandidate ?? null;
    }
    set onicecandidate(value) {
        this.eventHandlers.onicecandidate = value ?? undefined;
    }
    get onicecandidateerror() {
        return this.eventHandlers.onicecandidateerror ?? null;
    }
    set onicecandidateerror(value) {
        this.eventHandlers.onicecandidateerror = value ?? undefined;
    }
    get onicegatheringstatechange() {
        return this.eventHandlers.onicegatheringstatechange ?? null;
    }
    set onicegatheringstatechange(value) {
        this.eventHandlers.onicegatheringstatechange = value ?? undefined;
    }
    get onnegotiationneeded() {
        return this.eventHandlers.onnegotiationneeded ?? null;
    }
    set onnegotiationneeded(value) {
        this.eventHandlers.onnegotiationneeded = value ?? undefined;
    }
    get onsignalingstatechange() {
        return this.eventHandlers.onsignalingstatechange ?? null;
    }
    set onsignalingstatechange(value) {
        this.eventHandlers.onsignalingstatechange = value ?? undefined;
    }
    get ontrack() {
        return this.eventHandlers.ontrack ?? null;
    }
    set ontrack(value) {
        this.eventHandlers.ontrack = value ?? undefined;
    }
    get onconnectionstatechange() {
        return this.eventHandlers.onconnectionstatechange ?? null;
    }
    set onconnectionstatechange(value) {
        this.eventHandlers.onconnectionstatechange = value ?? undefined;
    }
    get oniceconnectionstatechange() {
        return this.eventHandlers.oniceconnectionstatechange ?? null;
    }
    set oniceconnectionstatechange(value) {
        this.eventHandlers.oniceconnectionstatechange = value ?? undefined;
    }
    constructor(config = {}) {
        super();
        Object.defineProperty(this, "id", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: (0, crypto_1.randomUUID)().toString()
        });
        Object.defineProperty(this, "cname", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: (0, crypto_1.randomUUID)().toString()
        });
        Object.defineProperty(this, "config", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: generateDefaultPeerConfig()
        });
        Object.defineProperty(this, "signalingState", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: "stable"
        });
        Object.defineProperty(this, "negotiationneeded", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        Object.defineProperty(this, "needRestart", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        Object.defineProperty(this, "router", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new media_1.RtpRouter()
        });
        Object.defineProperty(this, "sdpManager", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "transceiverManager", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "sctpManager", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "secureManager", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "isClosed", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        Object.defineProperty(this, "shouldNegotiationneeded", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        Object.defineProperty(this, "lastCreatedAnswer", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "lastCreatedOffer", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "pendingRemoteCandidates", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        Object.defineProperty(this, "iceGatheringStateChange", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new common_1.Event()
        });
        Object.defineProperty(this, "iceConnectionStateChange", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new common_1.Event()
        });
        Object.defineProperty(this, "signalingStateChange", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new common_1.Event()
        });
        Object.defineProperty(this, "connectionStateChange", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new common_1.Event()
        });
        Object.defineProperty(this, "onDataChannel", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new common_1.Event()
        });
        Object.defineProperty(this, "onRemoteTransceiverAdded", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new common_1.Event()
        });
        Object.defineProperty(this, "onTransceiverAdded", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new common_1.Event()
        });
        Object.defineProperty(this, "onIceCandidate", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new common_1.Event()
        });
        Object.defineProperty(this, "onNegotiationneeded", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new common_1.Event()
        });
        Object.defineProperty(this, "onTrack", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new common_1.Event()
        });
        Object.defineProperty(this, "eventHandlers", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: {}
        });
        Object.defineProperty(this, "needNegotiation", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: async () => {
                this.invalidateLastCreatedDescriptions();
                this.shouldNegotiationneeded = true;
                if (this.negotiationneeded || this.signalingState !== "stable") {
                    return;
                }
                this.shouldNegotiationneeded = false;
                setImmediate(() => {
                    this.negotiationneeded = true;
                    this.onNegotiationneeded.execute();
                    if (this.onnegotiationneeded) {
                        this.onnegotiationneeded(new globalThis.Event("negotiationneeded"));
                    }
                    this.emit("negotiationneeded");
                });
            }
        });
        this.setConfiguration(config);
        this.sdpManager = new sdpManager_1.SDPManager({
            cname: this.cname,
            bundlePolicy: this.config.bundlePolicy,
        });
        this.transceiverManager = new media_1.TransceiverManager(this.cname, this.config, this.router);
        this.transceiverManager.onTransceiverAdded.pipe(this.onTransceiverAdded);
        this.transceiverManager.onRemoteTransceiverAdded.pipe(this.onRemoteTransceiverAdded);
        this.transceiverManager.onTrack.subscribe(({ track, streams, transceiver }) => {
            const event = new RTCTrackEvent({
                track,
                streams,
                transceiver,
                receiver: transceiver.receiver,
            });
            this.onTrack.execute(track);
            this.emit("track", event);
            if (this.ontrack) {
                this.ontrack(event);
            }
        });
        this.transceiverManager.onNegotiationNeeded.subscribe(() => this.needNegotiation());
        this.sctpManager = new sctpManager_1.SctpTransportManager();
        this.sctpManager.onDataChannel.subscribe((channel) => {
            this.onDataChannel.execute(channel);
            const event = { type: "datachannel", channel };
            this.ondatachannel?.(event);
            this.emit("datachannel", event);
        });
        this.secureManager = new secureTransportManager_1.SecureTransportManager({
            config: this.config,
            sctpManager: this.sctpManager,
            transceiverManager: this.transceiverManager,
        });
        this.secureManager.iceGatheringStateChange.subscribe((state) => {
            this.iceGatheringStateChange.execute(state);
            this.onicegatheringstatechange?.(new globalThis.Event("icegatheringstatechange"));
            this.emit("icegatheringstatechange");
        });
        this.secureManager.iceConnectionStateChange.subscribe((state) => {
            if (state === "closed") {
                this.close();
            }
            this.iceConnectionStateChange.execute(state);
            this.oniceconnectionstatechange?.();
            this.emit("iceconnectionstatechange");
        });
        this.secureManager.connectionStateChange.subscribe((state) => {
            this.connectionStateChange.execute(state);
            this.onconnectionstatechange?.();
            this.emit("connectionstatechange");
        });
        this.secureManager.onIceCandidate.subscribe((candidate) => {
            const iceCandidate = candidate ? candidate.toJSON() : undefined;
            this.onIceCandidate.execute(iceCandidate);
            const event = {
                type: "icecandidate",
                candidate: iceCandidate,
            };
            this.onicecandidate?.(event);
            this.emit("icecandidate", event);
        });
    }
    get connectionState() {
        return this.secureManager.connectionState;
    }
    get iceConnectionState() {
        return this.secureManager.iceConnectionState;
    }
    get iceGathererState() {
        return this.secureManager.iceGatheringState;
    }
    get iceGatheringState() {
        return this.secureManager.iceGatheringState;
    }
    get dtlsTransports() {
        return this.secureManager.dtlsTransports;
    }
    get sctpTransport() {
        return this.sctpManager.sctpTransport;
    }
    get sctp() {
        return this.sctpTransport ?? null;
    }
    get sctpRemotePort() {
        return this.sctpManager.sctpRemotePort;
    }
    get iceTransports() {
        return this.secureManager.iceTransports;
    }
    get extIdUriMap() {
        return this.router.extIdUriMap;
    }
    get iceGeneration() {
        return this.iceTransports[0].connection.generation;
    }
    get localDescription() {
        return this.sdpManager.localDescription ?? null;
    }
    get currentLocalDescription() {
        return this.sdpManager.currentLocalDescription?.toJSON() ?? null;
    }
    get pendingLocalDescription() {
        return this.sdpManager.pendingLocalDescription?.toJSON() ?? null;
    }
    get remoteDescription() {
        return this.sdpManager.remoteDescription ?? null;
    }
    get currentRemoteDescription() {
        return this.sdpManager.currentRemoteDescription?.toJSON() ?? null;
    }
    get pendingRemoteDescription() {
        return this.sdpManager.pendingRemoteDescription?.toJSON() ?? null;
    }
    get canTrickleIceCandidates() {
        const remoteDescription = this.sdpManager._remoteDescription;
        if (!remoteDescription) {
            return null;
        }
        const iceOptions = [
            remoteDescription.iceOptions,
            ...remoteDescription.media.map((media) => media.iceOptions),
        ]
            .filter((value) => !!value)
            .join(" ");
        return iceOptions.split(/\s+/).includes("trickle");
    }
    get remoteIsBundled() {
        return this.sdpManager.remoteIsBundled;
    }
    /**@private */
    get _localDescription() {
        return this.sdpManager._localDescription;
    }
    /**@private */
    get _remoteDescription() {
        return this.sdpManager._remoteDescription;
    }
    getTransceivers() {
        return this.transceiverManager.getTransceivers();
    }
    getSenders() {
        return this.transceiverManager.getSenders();
    }
    getReceivers() {
        return this.transceiverManager.getReceivers();
    }
    setConfiguration(config) {
        const normalizedConfig = normalizePeerConfiguration(config);
        const isReconfiguration = !!this.sdpManager;
        if (normalizedConfig.rtcpMuxPolicy &&
            normalizedConfig.rtcpMuxPolicy !== "require") {
            throw new Error("rtcpMuxPolicy must be require");
        }
        if (normalizedConfig.iceCandidatePoolSize !== undefined &&
            (!Number.isInteger(normalizedConfig.iceCandidatePoolSize) ||
                normalizedConfig.iceCandidatePoolSize < 0)) {
            throw new Error("iceCandidatePoolSize must be a non-negative integer");
        }
        if (isReconfiguration &&
            normalizedConfig.bundlePolicy !== undefined &&
            normalizedConfig.bundlePolicy !== this.config.bundlePolicy) {
            throw new Error("bundlePolicy cannot be changed");
        }
        if (isReconfiguration &&
            normalizedConfig.rtcpMuxPolicy !== undefined &&
            normalizedConfig.rtcpMuxPolicy !== this.config.rtcpMuxPolicy) {
            throw new Error("rtcpMuxPolicy cannot be changed");
        }
        if (isReconfiguration &&
            normalizedConfig.certificates !== undefined &&
            !hasSameCertificates(normalizedConfig.certificates, this.config.certificates)) {
            throw new Error("certificates cannot be changed");
        }
        if (isReconfiguration &&
            normalizedConfig.iceCandidatePoolSize !== undefined &&
            this.localDescription &&
            normalizedConfig.iceCandidatePoolSize !== this.config.iceCandidatePoolSize) {
            throw new Error("iceCandidatePoolSize cannot be changed after setLocalDescription");
        }
        if ((normalizedConfig.iceCandidatePoolSize ?? 0) > 0) {
            throw new Error("iceCandidatePoolSize > 0 is not supported");
        }
        (0, utils_1.deepMerge)(this.config, normalizedConfig);
        if (this.config.icePortRange) {
            const [min, max] = this.config.icePortRange;
            if (min === max)
                throw new Error("should not be same value");
            if (min >= max)
                throw new Error("The min must be less than max");
        }
        if (!Number.isInteger(this.config.maxMessageSize) ||
            this.config.maxMessageSize < 0) {
            throw new Error("maxMessageSize must be a non-negative integer");
        }
        if (this.sctpManager?.sctpTransport) {
            this.sctpManager.sctpTransport.maxMessageSize =
                this.config.maxMessageSize;
        }
        for (const [i, codecParams] of (0, helper_1.enumerate)([
            ...(this.config.codecs.audio || []),
            ...(this.config.codecs.video || []),
        ])) {
            if (codecParams.payloadType != undefined) {
                continue;
            }
            codecParams.payloadType = 96 + i;
            switch (codecParams.name.toLowerCase()) {
                case "rtx":
                    {
                        codecParams.parameters = `apt=${codecParams.payloadType - 1}`;
                    }
                    break;
                case "red":
                    {
                        if (codecParams.contentType === "audio") {
                            const redundant = codecParams.payloadType + 1;
                            codecParams.parameters = `${redundant}/${redundant}`;
                            codecParams.payloadType = 63;
                        }
                    }
                    break;
            }
        }
        [
            ...(this.config.headerExtensions.audio || []),
            ...(this.config.headerExtensions.video || []),
        ].forEach((v, i) => {
            v.id = 1 + i;
        });
    }
    getConfiguration() {
        return clonePeerConfiguration(this.config);
    }
    async createOffer({ iceRestart } = {}) {
        if (iceRestart || this.needRestart) {
            this.needRestart = false;
            this.secureManager.restartIce();
        }
        await this.secureManager.ensureCerts();
        for (const transceiver of this.transceiverManager.getTransceivers()) {
            if (transceiver.codecs.length === 0) {
                this.transceiverManager.assignTransceiverCodecs(transceiver);
            }
            if (transceiver.headerExtensions.length === 0) {
                transceiver.headerExtensions =
                    this.config.headerExtensions[transceiver.kind] ?? [];
            }
        }
        const description = this.sdpManager.buildOfferSdp(this.transceiverManager.getTransceivers(), this.sctpTransport);
        const createdOffer = description.toJSON();
        this.lastCreatedOffer = createdOffer;
        return createdOffer;
    }
    createSctpTransport() {
        const sctp = this.sctpManager.createSctpTransport(this.config.maxMessageSize);
        const dtlsTransport = this.findOrCreateTransport();
        sctp.setDtlsTransport(dtlsTransport);
        return sctp;
    }
    createDataChannel(label, options = {}) {
        if (!this.sctpTransport) {
            this.createSctpTransport();
            this.needNegotiation();
        }
        const channel = this.sctpManager.createDataChannel(label, options);
        if (!channel.sctp.dtlsTransport) {
            const dtlsTransport = this.findOrCreateTransport();
            channel.sctp.setDtlsTransport(dtlsTransport);
        }
        return channel;
    }
    removeTrack(sender) {
        if (this.isClosed) {
            throw (0, errors_1.createWebRtcDomException)("InvalidStateError", "peer closed");
        }
        this.transceiverManager.removeTrack(sender);
        this.needNegotiation();
    }
    invalidateLastCreatedDescriptions() {
        this.lastCreatedAnswer = undefined;
        this.lastCreatedOffer = undefined;
    }
    async waitForPendingDescriptionTask() {
        this.assertNotClosed();
        await Promise.resolve();
        if (this.isClosed) {
            await new Promise(() => undefined);
        }
    }
    findOrCreateTransport() {
        const existingDtlsTransport = this.dtlsTransports.find((transport) => transport.state !== "closed");
        const existing = existingDtlsTransport?.iceTransport;
        // Gather ICE candidates for only one track. If the remote endpoint is not bundle-aware, negotiate only one media track.
        // https://w3c.github.io/webrtc-pc/#rtcbundlepolicy-enum
        if (this.sdpManager.bundlePolicy === "max-bundle" ||
            (this.sdpManager.bundlePolicy !== "disable" && this.remoteIsBundled)) {
            if (existingDtlsTransport) {
                return existingDtlsTransport;
            }
        }
        const dtlsTransport = this.secureManager.createTransport();
        dtlsTransport.onRtp.subscribe((rtp) => {
            this.router.routeRtp(rtp);
        });
        dtlsTransport.onRtcp.subscribe((rtcp) => {
            this.router.routeRtcp(rtcp);
        });
        const iceTransport = dtlsTransport.iceTransport;
        iceTransport.onNegotiationNeeded.subscribe(() => {
            this.needNegotiation();
        });
        iceTransport.onIceCandidate.subscribe((candidate) => {
            if (!this.localDescription) {
                log("localDescription not found when ice candidate was gathered");
                return;
            }
            if (!candidate) {
                this.sdpManager.setLocal(this._localDescription, this.transceiverManager.getTransceivers(), this.sctpTransport);
                this.onIceCandidate.execute(undefined);
                if (this.onicecandidate) {
                    this.onicecandidate({ candidate: undefined });
                }
                this.emit("icecandidate", { candidate: undefined });
                return;
            }
            if (!this._localDescription) {
                log("localDescription not found when ice candidate was gathered");
                return;
            }
            this.secureManager.handleNewIceCandidate({
                candidate,
                bundlePolicy: this.sdpManager.bundlePolicy,
                remoteIsBundled: !!this.sdpManager.remoteIsBundled,
                media: this._localDescription.media[0],
                transceiver: this.transceiverManager
                    .getTransceivers()
                    .find((t) => t?.dtlsTransport?.iceTransport.id === iceTransport.id),
                sctpTransport: this.sctpTransport?.dtlsTransport.iceTransport.id === iceTransport.id
                    ? this.sctpTransport
                    : undefined,
            });
        });
        return dtlsTransport;
    }
    async setLocalDescription(sessionDescription) {
        // https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/setLocalDescription#type
        const implicitOfferState = [
            "stable",
            "have-local-offer",
            "have-remote-pranswer",
        ];
        await this.waitForPendingDescriptionTask();
        if (sessionDescription?.type === "rollback") {
            this.sdpManager.rollbackLocalDescription(this.signalingState);
            this.setSignalingState("stable");
            if (this.shouldNegotiationneeded) {
                this.needNegotiation();
            }
            this.invalidateLastCreatedDescriptions();
            return;
        }
        const needsGeneratedDescription = !sessionDescription?.type ||
            !sessionDescription.sdp ||
            sessionDescription.sdp.length === 0;
        const generatedDescription = needsGeneratedDescription
            ? sessionDescription?.type === "offer"
                ? (this.lastCreatedOffer ?? (await this.createOffer()))
                : sessionDescription?.type === "answer" ||
                    sessionDescription?.type === "pranswer"
                    ? (this.lastCreatedAnswer ?? (await this.createAnswer()))
                    : implicitOfferState.includes(this.signalingState)
                        ? (this.lastCreatedOffer ?? (await this.createOffer()))
                        : (this.lastCreatedAnswer ?? (await this.createAnswer()))
            : undefined;
        sessionDescription = {
            type: sessionDescription?.type ?? generatedDescription.type,
            sdp: sessionDescription?.sdp && sessionDescription.sdp.length > 0
                ? sessionDescription.sdp
                : generatedDescription.sdp,
        };
        if (sessionDescription.type === "offer" &&
            this.lastCreatedOffer &&
            sessionDescription.sdp !== this.lastCreatedOffer.sdp) {
            throw (0, errors_1.createWebRtcDomException)("InvalidModificationError", "setLocalDescription must use the latest created offer");
        }
        // # parse and validate description
        const descriptionType = sessionDescription.type;
        const descriptionSdp = sessionDescription.sdp;
        const description = this.sdpManager.parseSdp({
            sdp: descriptionSdp,
            isLocal: true,
            signalingState: this.signalingState,
            type: descriptionType,
        });
        // # update signaling state
        if (description.type === "offer") {
            this.setSignalingState("have-local-offer");
        }
        else if (description.type === "answer") {
            this.setSignalingState("stable");
        }
        else if (description.type === "pranswer") {
            this.setSignalingState("have-local-pranswer");
        }
        // # assign MID
        for (const [i, media] of (0, helper_1.enumerate)(description.media)) {
            const mid = media.rtp.muxId;
            this.sdpManager.registerMid(mid);
            if (["audio", "video"].includes(media.kind)) {
                const transceiver = this.transceiverManager.getTransceiverByMLineIndex(i);
                if (transceiver) {
                    transceiver.mid = mid;
                }
            }
            if (media.kind === "application" && this.sctpTransport) {
                this.sctpTransport.mid = mid;
            }
        }
        // setup ice,dtls role
        const role = description.media.find((media) => media.dtlsParams)?.dtlsParams
            ?.role;
        this.secureManager.setLocalRole({
            type: description.type === "offer" ? "offer" : "answer",
            role,
        });
        // # configure direction
        if (["answer", "pranswer"].includes(description.type)) {
            for (const t of this.transceiverManager.getTransceivers()) {
                const direction = (0, utils_1.andDirection)(t.direction, t.offerDirection);
                t.setCurrentDirection(direction);
            }
        }
        // for trickle ice
        this.sdpManager.setLocal(description, this.transceiverManager.getTransceivers(), this.sctpTransport);
        await this.gatherCandidates().catch((e) => {
            log("gatherCandidates failed", e);
        });
        // connect transports
        if (description.type === "answer") {
            this.connect().catch((err) => {
                log("connect failed", err);
                this.secureManager.setConnectionState("failed");
            });
        }
        this.sdpManager.setLocal(description, this.transceiverManager.getTransceivers(), this.sctpTransport);
        if (this.shouldNegotiationneeded) {
            this.needNegotiation();
        }
        this.invalidateLastCreatedDescriptions();
        return description;
    }
    async gatherCandidates() {
        await this.secureManager.gatherCandidates(!!this.sdpManager.remoteIsBundled);
    }
    async addIceCandidate(candidateMessage = {}) {
        if (this.isClosed) {
            throw (0, errors_1.createWebRtcDomException)("InvalidStateError", "is closed");
        }
        if (!this.remoteDescription || !this.sdpManager._remoteDescription) {
            this.pendingRemoteCandidates.push(candidateMessage);
            return;
        }
        await this.applyRemoteIceCandidate(candidateMessage);
    }
    async applyRemoteIceCandidate(candidateMessage) {
        const sdp = this.sdpManager._remoteDescription;
        if (!sdp) {
            return;
        }
        const appliedCandidate = await this.secureManager.addIceCandidate(sdp, candidateMessage);
        const remoteDescription = this.sdpManager._remoteDescription;
        if (!remoteDescription || !appliedCandidate) {
            return;
        }
        if (appliedCandidate.kind === "end-of-candidates") {
            for (const mediaIndex of appliedCandidate.mediaIndices) {
                const media = remoteDescription.media[mediaIndex];
                if (media) {
                    media.iceCandidatesComplete = true;
                }
            }
            return;
        }
        for (const mediaIndex of appliedCandidate.mediaIndices) {
            const media = remoteDescription.media[mediaIndex];
            if (!media) {
                continue;
            }
            media.iceCandidates.push(appliedCandidate.candidate);
        }
    }
    async flushPendingRemoteCandidates() {
        while (this.pendingRemoteCandidates.length > 0 &&
            this.remoteDescription &&
            this.sdpManager._remoteDescription) {
            const candidate = this.pendingRemoteCandidates.shift();
            await this.applyRemoteIceCandidate(candidate ?? null);
        }
    }
    async connect() {
        log("start connect");
        const res = await Promise.allSettled(this.dtlsTransports.map(async (dtlsTransport) => {
            const { iceTransport } = dtlsTransport;
            if (iceTransport.state === "connected") {
                return;
            }
            const checkDtlsConnected = () => dtlsTransport.state === "connected";
            if (checkDtlsConnected()) {
                return;
            }
            this.secureManager.setConnectionState("connecting");
            await iceTransport.start().catch((err) => {
                log("iceTransport.start failed", err);
                throw err;
            });
            if (checkDtlsConnected()) {
                return;
            }
            await dtlsTransport.start().catch((err) => {
                log("dtlsTransport.start failed", err);
                throw err;
            });
            if (this.sctpTransport &&
                this.sctpTransport.dtlsTransport.id === dtlsTransport.id) {
                await this.sctpManager.connectSctp();
            }
        }));
        if (res.find((r) => r.status === "rejected")) {
            this.secureManager.setConnectionState("failed");
        }
        else {
            this.secureManager.setConnectionState("connected");
        }
    }
    restartIce() {
        this.needRestart = true;
        this.needNegotiation();
    }
    async setRemoteDescription(sessionDescription) {
        if (sessionDescription instanceof sdp_1.SessionDescription) {
            sessionDescription = sessionDescription.toSdp();
        }
        await this.waitForPendingDescriptionTask();
        const needsImplicitLocalRollback = sessionDescription.type === "offer" &&
            ["have-local-offer", "have-local-pranswer"].includes(this.signalingState);
        if (needsImplicitLocalRollback) {
            this.sdpManager.rollbackLocalDescription(this.signalingState);
            this.shouldNegotiationneeded = true;
            this.setSignalingState("stable");
            await Promise.resolve();
        }
        // # parse and validate description
        const remoteSdp = this.sdpManager.setRemoteDescription(sessionDescription, this.signalingState);
        if (!remoteSdp) {
            this.setSignalingState("stable");
            if (this.shouldNegotiationneeded) {
                this.needNegotiation();
            }
            this.invalidateLastCreatedDescriptions();
            return;
        }
        let bundleTransport;
        // # apply description
        const matchTransceiverWithMedia = (transceiver, media) => transceiver.kind === media.kind &&
            [null, media.rtp.muxId].includes(transceiver.mid);
        let transports = remoteSdp.media.map((remoteMedia, i) => {
            let dtlsTransport;
            if (["audio", "video"].includes(remoteMedia.kind)) {
                let transceiver = this.transceiverManager
                    .getTransceivers()
                    .find((t) => matchTransceiverWithMedia(t, remoteMedia));
                if (!transceiver) {
                    // create remote transceiver
                    transceiver = this.addTransceiver(remoteMedia.kind, {
                        direction: "recvonly",
                    });
                    transceiver.mid = remoteMedia.rtp.muxId ?? null;
                    this.onRemoteTransceiverAdded.execute(transceiver);
                }
                else {
                    if (transceiver.direction === "inactive" && transceiver.stopping) {
                        transceiver.stopped = true;
                        if (sessionDescription.type === "answer") {
                            transceiver.setCurrentDirection("inactive");
                        }
                        return;
                    }
                }
                if (this.sdpManager.remoteIsBundled) {
                    if (!bundleTransport) {
                        bundleTransport = transceiver.dtlsTransport;
                    }
                    else {
                        transceiver.setDtlsTransport(bundleTransport);
                    }
                }
                dtlsTransport = transceiver.dtlsTransport;
                this.transceiverManager.setRemoteRTP(transceiver, remoteMedia, remoteSdp.type, i);
            }
            else if (remoteMedia.kind === "application") {
                let sctpTransport = this.sctpTransport;
                if (!sctpTransport) {
                    sctpTransport = this.createSctpTransport();
                    sctpTransport.mid = remoteMedia.rtp.muxId;
                }
                if (this.sdpManager.remoteIsBundled) {
                    if (!bundleTransport) {
                        bundleTransport = sctpTransport.dtlsTransport;
                    }
                    else {
                        sctpTransport.setDtlsTransport(bundleTransport);
                    }
                }
                dtlsTransport = sctpTransport.dtlsTransport;
                this.sctpManager.setRemoteSCTP(remoteMedia, i);
            }
            else {
                throw new Error("invalid media kind");
            }
            const iceTransport = dtlsTransport.iceTransport;
            if (remoteMedia.iceParams) {
                const renomination = !!this.sdpManager.inactiveRemoteMedia;
                iceTransport.setRemoteParams(remoteMedia.iceParams, renomination);
                // One agent full, one lite:  The full agent MUST take the controlling role, and the lite agent MUST take the controlled role
                // RFC 8445 S6.1.1
                if (remoteMedia.iceParams.iceLite && !iceTransport.connection.iceLite) {
                    iceTransport.connection.iceControlling = true;
                }
            }
            if (remoteMedia.dtlsParams) {
                dtlsTransport.setRemoteParams(remoteMedia.dtlsParams);
            }
            // # add ICE candidates
            remoteMedia.iceCandidates.forEach(iceTransport.addRemoteCandidate);
            if (remoteMedia.iceCandidatesComplete) {
                iceTransport.addRemoteCandidate(undefined);
            }
            // # set DTLS role
            if (remoteSdp.type === "answer" && remoteMedia.dtlsParams?.role) {
                dtlsTransport.role =
                    remoteMedia.dtlsParams.role === "client" ? "server" : "client";
            }
            return iceTransport;
        });
        // filter out inactive transports
        transports = transports.filter((iceTransport) => !!iceTransport);
        const removedTransceivers = this.transceiverManager
            .getTransceivers()
            .filter((t) => remoteSdp.media.find((m) => matchTransceiverWithMedia(t, m)) ==
            undefined);
        if (sessionDescription.type === "answer") {
            for (const transceiver of removedTransceivers) {
                // todo: handle answer side transceiver removal work.
                // event should trigger to notify media source to stop.
                transceiver.stop();
                transceiver.stopped = true;
            }
        }
        if (remoteSdp.type === "offer") {
            this.setSignalingState("have-remote-offer");
        }
        else if (remoteSdp.type === "answer") {
            this.setSignalingState("stable");
        }
        else if (remoteSdp.type === "pranswer") {
            this.setSignalingState("have-remote-pranswer");
        }
        await this.flushPendingRemoteCandidates();
        // connect transports
        if (remoteSdp.type === "answer") {
            log("caller start connect");
            this.connect().catch((err) => {
                log("connect failed", err);
                this.secureManager.setConnectionState("failed");
            });
        }
        this.negotiationneeded = false;
        if (this.shouldNegotiationneeded) {
            this.needNegotiation();
        }
        this.invalidateLastCreatedDescriptions();
    }
    addTransceiver(trackOrKind, options = {}) {
        const dtlsTransport = this.findOrCreateTransport();
        const transceiver = this.transceiverManager.addTransceiver(trackOrKind, dtlsTransport, options);
        this.secureManager.updateIceConnectionState();
        this.needNegotiation();
        return transceiver;
    }
    // todo fix
    addTrack(track, ...streams) {
        if (this.isClosed) {
            throw (0, errors_1.createWebRtcDomException)("InvalidStateError", "is closed");
        }
        const transceiver = this.transceiverManager.addTrack(track, streams);
        if (!transceiver.dtlsTransport) {
            const dtlsTransport = this.findOrCreateTransport();
            transceiver.setDtlsTransport(dtlsTransport);
        }
        this.needNegotiation();
        return transceiver.sender;
    }
    async createAnswer() {
        this.assertNotClosed();
        await this.secureManager.ensureCerts();
        const description = this.sdpManager.buildAnswerSdp({
            transceivers: this.transceiverManager.getTransceivers(),
            sctpTransport: this.sctpTransport,
            signalingState: this.signalingState,
        });
        const createdAnswer = description.toJSON();
        this.lastCreatedAnswer = createdAnswer;
        return createdAnswer;
    }
    assertNotClosed() {
        if (this.isClosed) {
            throw (0, errors_1.createWebRtcDomException)("InvalidStateError", "RTCPeerConnection is closed");
        }
    }
    setSignalingState(state) {
        if (this.signalingState === state) {
            return;
        }
        log("signalingStateChange", state);
        this.signalingState = state;
        this.signalingStateChange.execute(state);
        if (this.onsignalingstatechange) {
            this.onsignalingstatechange(new globalThis.Event("signalingstatechange"));
        }
        this.emit("signalingstatechange");
    }
    createPeerConnectionStats(timestamp) {
        return {
            type: "peer-connection",
            id: (0, stats_1.generateStatsId)("peer-connection", this.id),
            timestamp,
            dataChannelsOpened: this.sctpManager.dataChannelsOpened,
            dataChannelsClosed: this.sctpManager.dataChannelsClosed,
        };
    }
    async getStats(selector) {
        const timestamp = (0, stats_1.getStatsTimestamp)();
        const stats = [];
        if (!selector) {
            stats.push(this.createPeerConnectionStats(timestamp));
        }
        stats.push(...this.transceiverManager.collectStats(timestamp));
        const transportStats = await this.secureManager.getStats(timestamp);
        stats.push(...transportStats);
        if (!selector && this.sctpTransport) {
            const dataChannelStats = await this.sctpManager.getStats(timestamp);
            if (dataChannelStats) {
                stats.push(...dataChannelStats);
            }
        }
        if (!selector) {
            return (0, stats_1.buildStatsReport)(stats);
        }
        return (0, stats_1.buildStatsReport)(stats, this.transceiverManager.getStatsRootIds(selector));
    }
    async close() {
        if (this.isClosed)
            return;
        this.isClosed = true;
        this.pendingRemoteCandidates.length = 0;
        this.setSignalingState("closed");
        this.transceiverManager.close();
        await this.secureManager.close();
        await this.sctpManager.close();
        // 公開 Event を完了させ、購読者・クロージャが PeerConnection を保持し続けないようにする
        this.completePeerEvents();
        log("peerConnection closed");
    }
    completePeerEvents() {
        const events = [
            this.onDataChannel,
            this.iceGatheringStateChange,
            this.iceConnectionStateChange,
            this.signalingStateChange,
            this.connectionStateChange,
            this.onTransceiverAdded,
            this.onRemoteTransceiverAdded,
            this.onIceCandidate,
            this.onNegotiationneeded,
        ];
        for (const event of events) {
            if (!event.ended) {
                event.complete();
            }
        }
    }
}
exports.RTCPeerConnection = RTCPeerConnection;
const findCodecByMimeType = (codecs, target) => codecs.find((localCodec) => localCodec.mimeType.toLowerCase() === target.mimeType.toLowerCase())
    ? target
    : undefined;
exports.findCodecByMimeType = findCodecByMimeType;
function generateDefaultPeerConfig() {
    return {
        codecs: {
            audio: [(0, media_1.useOPUS)(), (0, media_1.usePCMU)()],
            video: [(0, media_1.useVP8)()],
        },
        headerExtensions: {
            audio: [],
            video: [],
        },
        iceTransportPolicy: "all",
        iceLite: false,
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
        icePortRange: undefined,
        iceInterfaceAddresses: undefined,
        iceAdditionalHostAddresses: undefined,
        iceUseIpv4: true,
        iceUseIpv6: true,
        iceUseTcp: false,
        turnTransport: undefined,
        turnTlsOptions: undefined,
        iceFilterStunResponse: undefined,
        iceFilterCandidatePair: undefined,
        icePasswordPrefix: undefined,
        iceUseLinkLocalAddress: undefined,
        dtls: {},
        bundlePolicy: "max-compat",
        rtcpMuxPolicy: "require",
        iceCandidatePoolSize: 0,
        certificates: [],
        debug: {},
        midSuffix: false,
        forceTurnTCP: false,
        maxMessageSize: sctp_1.DEFAULT_MAX_MESSAGE_SIZE,
    };
}
exports.defaultPeerConfig = generateDefaultPeerConfig();
function normalizePeerConfiguration(config) {
    const input = Object(config ?? {});
    const normalizedConfig = { ...input };
    if (input.bundlePolicy === "balanced") {
        normalizedConfig.bundlePolicy = "max-compat";
    }
    if ("certificates" in input) {
        if (input.certificates === undefined) {
            normalizedConfig.certificates = undefined;
        }
        else if (!Array.isArray(input.certificates) ||
            input.certificates.some((certificate) => certificate == null)) {
            throw (0, errors_1.createWebRtcTypeError)("certificates must be an array of RTCCertificate");
        }
        else {
            normalizedConfig.certificates = [...input.certificates];
        }
    }
    if ("iceCandidatePoolSize" in input) {
        normalizedConfig.iceCandidatePoolSize = coerceUnsignedShort(input.iceCandidatePoolSize, "iceCandidatePoolSize");
    }
    return normalizedConfig;
}
function coerceUnsignedShort(value, name) {
    const coerced = Number(value);
    if (!Number.isFinite(coerced) ||
        !Number.isInteger(coerced) ||
        coerced < 0 ||
        coerced > 65535) {
        throw (0, errors_1.createWebRtcTypeError)(`${name} must be an unsigned short`);
    }
    return coerced;
}
function hasSameCertificates(left, right) {
    return (left.length === right.length &&
        left.every((certificate, index) => certificate === right[index]));
}
function clonePeerConfiguration(config) {
    return {
        ...config,
        codecs: {
            audio: config.codecs.audio ? [...config.codecs.audio] : undefined,
            video: config.codecs.video ? [...config.codecs.video] : undefined,
        },
        headerExtensions: {
            audio: config.headerExtensions.audio
                ? [...config.headerExtensions.audio]
                : undefined,
            video: config.headerExtensions.video
                ? [...config.headerExtensions.video]
                : undefined,
        },
        iceServers: config.iceServers.map((server) => ({
            ...server,
            urls: Array.isArray(server.urls) ? [...server.urls] : server.urls,
        })),
        icePortRange: config.icePortRange
            ? [...config.icePortRange]
            : undefined,
        iceAdditionalHostAddresses: config.iceAdditionalHostAddresses
            ? [...config.iceAdditionalHostAddresses]
            : undefined,
        dtls: { ...config.dtls },
        certificates: [...config.certificates],
        debug: { ...config.debug },
    };
}
class RTCTrackEvent {
    constructor(init) {
        Object.defineProperty(this, "type", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: "track"
        });
        Object.defineProperty(this, "track", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "streams", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "transceiver", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "receiver", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        this.track = init.track;
        this.streams = [...init.streams];
        this.transceiver = init.transceiver;
        this.receiver = init.receiver;
    }
}
exports.RTCTrackEvent = RTCTrackEvent;
//# sourceMappingURL=peerConnection.js.map