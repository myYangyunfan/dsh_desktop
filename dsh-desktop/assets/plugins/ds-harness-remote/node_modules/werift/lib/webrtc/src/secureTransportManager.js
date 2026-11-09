"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SecureTransportManager = void 0;
const const_1 = require("./const");
const errors_1 = require("./errors");
const common_1 = require("./imports/common");
const dtls_1 = require("./transport/dtls");
const ice_1 = require("./transport/ice");
const utils_1 = require("./utils");
const log = (0, common_1.debug)("werift:packages/webrtc/src/transport/secureTransportManager.ts");
class SecureTransportManager {
    constructor({ config, transceiverManager, sctpManager, }) {
        Object.defineProperty(this, "connectionState", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: "new"
        });
        Object.defineProperty(this, "iceConnectionState", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: "new"
        });
        Object.defineProperty(this, "iceGatheringState", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: "new"
        });
        Object.defineProperty(this, "certificate", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
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
        Object.defineProperty(this, "onIceCandidate", {
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
        Object.defineProperty(this, "config", {
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
        this.config = config;
        this.transceiverManager = transceiverManager;
        this.sctpManager = sctpManager;
        if (this.config.dtls) {
            const { keys } = this.config.dtls;
            if (this.config.certificates[0]) {
                this.certificate = this.config.certificates[0];
            }
            else if (keys) {
                this.setupCertificate(keys);
            }
        }
    }
    get dtlsTransports() {
        const transports = [
            ...this.transceiverManager.getTransceivers().map((t) => t?.dtlsTransport),
            this.sctpManager.sctpTransport?.dtlsTransport,
        ].filter((t) => t != undefined);
        return transports.reduce((acc, cur) => {
            if (!acc.map((d) => d.id).includes(cur.id)) {
                acc.push(cur);
            }
            return acc;
        }, []);
    }
    get iceTransports() {
        return this.dtlsTransports.map((d) => d.iceTransport);
    }
    setupCertificate(keys) {
        this.certificate = new dtls_1.RTCCertificate(keys.keyPem, keys.certPem, keys.signatureHash);
    }
    createTransport() {
        const existing = this.iceTransports.find((transport) => transport.state !== "closed");
        const iceServerOptions = (0, utils_1.parseIceServers)(this.config.iceServers);
        const turnTransport = (0, utils_1.resolveTurnTransport)({
            parsedTurnTransport: iceServerOptions.turnTransport,
            configuredTurnTransport: this.config.turnTransport,
            forceTurnTCP: this.config.forceTurnTCP,
        });
        const iceGatherer = new ice_1.RTCIceGatherer({
            ...iceServerOptions,
            iceLite: this.config.iceLite,
            forceTurn: this.config.iceTransportPolicy === "relay",
            portRange: this.config.icePortRange,
            interfaceAddresses: this.config.iceInterfaceAddresses,
            additionalHostAddresses: this.config.iceAdditionalHostAddresses,
            filterStunResponse: this.config.iceFilterStunResponse,
            filterCandidatePair: this.config.iceFilterCandidatePair,
            localPasswordPrefix: this.config.icePasswordPrefix,
            useIpv4: this.config.iceUseIpv4,
            useIpv6: this.config.iceUseIpv6,
            useTcp: this.config.iceUseTcp,
            turnTransport,
            turnTlsOptions: this.config.turnTlsOptions,
            useLinkLocalAddress: this.config.iceUseLinkLocalAddress,
        });
        if (existing) {
            iceGatherer.connection.localUsername = existing.connection.localUsername;
            iceGatherer.connection.localPassword = existing.connection.localPassword;
        }
        iceGatherer.onGatheringStateChange.subscribe(() => {
            this.updateIceGatheringState();
        });
        this.updateIceGatheringState();
        const iceTransport = new ice_1.RTCIceTransport(iceGatherer);
        iceTransport.onStateChange.subscribe(() => {
            this.updateIceConnectionState();
        });
        const dtlsTransport = new dtls_1.RTCDtlsTransport(this.config, iceTransport, this.certificate, srtpProfiles);
        return dtlsTransport;
    }
    handleNewIceCandidate({ candidate, media, remoteIsBundled, transceiver, sctpTransport, bundlePolicy, }) {
        // Assign sdpMid and sdpMLineIndex
        if (bundlePolicy === "max-bundle" || remoteIsBundled) {
            candidate.sdpMLineIndex = 0;
            if (media) {
                candidate.sdpMid = media.rtp.muxId;
            }
        }
        else {
            if (transceiver) {
                candidate.sdpMLineIndex = transceiver.mLineIndex;
                candidate.sdpMid = transceiver.mid ?? undefined;
            }
            if (sctpTransport) {
                candidate.sdpMLineIndex = sctpTransport.mLineIndex;
                candidate.sdpMid = sctpTransport.mid;
            }
        }
        if (candidate.foundation &&
            !candidate.foundation.startsWith("candidate:")) {
            candidate.foundation = "candidate:" + candidate.foundation;
        }
        this.onIceCandidate.execute(candidate);
        return candidate;
    }
    async addIceCandidate(sdp, candidateMessage) {
        const candidateText = candidateMessage?.candidate;
        const sdpMid = candidateMessage?.sdpMid;
        const sdpMLineIndex = candidateMessage?.sdpMLineIndex;
        const usernameFragment = candidateMessage?.usernameFragment;
        const isEndOfCandidates = candidateMessage == null || candidateText == null || candidateText === "";
        const mediaIndices = this.resolveCandidateMediaIndices({
            sdp,
            isEndOfCandidates,
            sdpMid,
            sdpMLineIndex,
            usernameFragment,
        });
        if (isEndOfCandidates) {
            const candidateTarget = mediaIndices
                .map((index) => this.getTransportByMLineIndex(sdp, index))
                .filter((iceTransport) => !!iceTransport)
                .reduce((acc, transport) => {
                if (!acc.find(({ id }) => id === transport.id)) {
                    acc.push(transport);
                }
                return acc;
            }, []);
            await Promise.all(candidateTarget.map((iceTransport) => iceTransport.addRemoteCandidate(undefined)));
            return {
                kind: "end-of-candidates",
                mediaIndices,
            };
        }
        const candidate = ice_1.IceCandidate.fromJSON(candidateMessage);
        if (!candidate) {
            throw (0, errors_1.createWebRtcDomException)("OperationError", "Failed to parse ICE candidate");
        }
        const targetMediaIndex = mediaIndices[0];
        const targetMedia = sdp.media[targetMediaIndex];
        if (!targetMedia) {
            throw (0, errors_1.createWebRtcDomException)("OperationError", "ICE media section not found");
        }
        candidate.sdpMid = targetMedia.rtp.muxId ?? undefined;
        candidate.sdpMLineIndex = targetMediaIndex;
        const iceTransport = this.getTransportByMLineIndex(sdp, targetMediaIndex);
        if (!iceTransport) {
            throw (0, errors_1.createWebRtcDomException)("OperationError", "ICE transport not found for candidate");
        }
        await iceTransport.addRemoteCandidate(candidate);
        return {
            kind: "candidate",
            candidate,
            mediaIndices: [targetMediaIndex],
        };
    }
    resolveCandidateMediaIndices({ sdp, isEndOfCandidates, sdpMid, sdpMLineIndex, usernameFragment, }) {
        let mediaIndices;
        if (typeof sdpMid === "string") {
            const mediaIndex = sdp.media.findIndex((media) => media.rtp.muxId === sdpMid);
            if (mediaIndex < 0) {
                throw (0, errors_1.createWebRtcDomException)("OperationError", "Media section for sdpMid was not found");
            }
            mediaIndices = [mediaIndex];
        }
        else if (typeof sdpMLineIndex === "number") {
            if (sdpMLineIndex < 0 || sdpMLineIndex >= sdp.media.length) {
                throw (0, errors_1.createWebRtcDomException)("OperationError", "Media section for sdpMLineIndex was not found");
            }
            mediaIndices = [sdpMLineIndex];
        }
        else if (isEndOfCandidates) {
            mediaIndices = sdp.media.map((_, index) => index);
        }
        else {
            throw (0, errors_1.createWebRtcTypeError)("sdpMid or sdpMLineIndex must be provided with a candidate");
        }
        if (typeof usernameFragment === "string") {
            const matchingIndices = mediaIndices.filter((index) => sdp.media[index]?.iceParams?.usernameFragment === usernameFragment);
            if (matchingIndices.length === 0) {
                throw (0, errors_1.createWebRtcDomException)("OperationError", "No media section matched the ICE usernameFragment");
            }
            mediaIndices = matchingIndices;
        }
        return mediaIndices;
    }
    getTransportByMid(mid) {
        if (!mid) {
            return;
        }
        let iceTransport;
        const transceiver = this.transceiverManager
            .getTransceivers()
            .find((t) => t.mid === mid);
        if (transceiver) {
            iceTransport = transceiver.dtlsTransport.iceTransport;
        }
        else if (!iceTransport && this.sctpManager.sctpTransport?.mid === mid) {
            iceTransport = this.sctpManager.sctpTransport.dtlsTransport.iceTransport;
        }
        return iceTransport;
    }
    getTransportByMLineIndex(sdp, index) {
        const media = sdp.media[index];
        if (!media) {
            return;
        }
        const transport = this.getTransportByMid(media.rtp.muxId);
        return transport;
    }
    restartIce() {
        for (const transport of this.iceTransports) {
            transport.restart();
        }
    }
    setLocalRole({ type, role, }) {
        for (const dtlsTransport of this.dtlsTransports) {
            const iceTransport = dtlsTransport.iceTransport;
            if (iceTransport.connection.iceLite) {
                iceTransport.connection.iceControlling = false;
            }
            else if (iceTransport.connection.remoteIsLite) {
                // RFC 8445 S6.1.1
                iceTransport.connection.iceControlling = true;
            }
            else if (type === "offer") {
                iceTransport.connection.iceControlling = true;
            }
            else {
                iceTransport.connection.iceControlling = false;
            }
            // # set DTLS role for mediasoup
            if (type === "answer") {
                if (role) {
                    dtlsTransport.role = role;
                }
            }
        }
    }
    // https://w3c.github.io/webrtc-pc/#dom-rtcicegatheringstate
    updateIceGatheringState() {
        const all = this.iceTransports;
        function allMatch(...state) {
            return (all.filter((check) => state.includes(check.gatheringState)).length ===
                all.length);
        }
        let newState;
        if (all.length && allMatch("complete")) {
            newState = "complete";
        }
        else if (!all.length || allMatch("new", "complete")) {
            newState = "new";
        }
        else if (all.map((check) => check.gatheringState).includes("gathering")) {
            newState = "gathering";
        }
        else {
            newState = "new";
        }
        if (this.iceGatheringState === newState) {
            return;
        }
        this.iceGatheringState = newState;
        this.iceGatheringStateChange.execute(newState);
    }
    // https://w3c.github.io/webrtc-pc/#dom-rtciceconnectionstate
    updateIceConnectionState() {
        const all = this.iceTransports;
        let newState;
        function allMatch(...state) {
            return (all.filter((check) => state.includes(check.state)).length === all.length);
        }
        function anyMatch(...state) {
            return all.some((check) => state.includes(check.state));
        }
        if (this.connectionState === "closed") {
            newState = "closed";
        }
        else if (anyMatch("failed")) {
            newState = "failed";
        }
        else if (anyMatch("disconnected")) {
            newState = "disconnected";
        }
        else if (allMatch("new", "closed")) {
            newState = "new";
        }
        else if (anyMatch("new", "checking")) {
            newState = "checking";
        }
        else if (allMatch("completed", "closed")) {
            newState = "completed";
        }
        else if (allMatch("connected", "completed", "closed")) {
            newState = "connected";
        }
        else {
            // unreachable?
            newState = "new";
        }
        if (this.iceConnectionState === newState) {
            return;
        }
        log("iceConnectionStateChange", newState);
        this.iceConnectionState = newState;
        this.iceConnectionStateChange.execute(newState);
        // Runtime ICE failure (e.g. RFC 7675 consent expiry) must surface on
        // PeerConnection.connectionState without treating it as an explicit close().
        if (newState === "failed" && this.connectionState !== "closed") {
            this.setConnectionState("failed");
        }
        else if (newState === "disconnected" &&
            this.connectionState === "connected") {
            this.setConnectionState("disconnected");
        }
    }
    async gatherCandidates(remoteIsBundled) {
        const connected = this.iceTransports.find((transport) => transport.state === "connected" || transport.state === "completed");
        if (remoteIsBundled && connected) {
            // no need to gather ice candidates on an existing bundled connection
            log("skipping ICE gathering for bundled connection");
        }
        else {
            await Promise.allSettled(this.iceTransports.map((iceTransport) => iceTransport.gather())).catch((e) => {
                // エラーハンドリングを追加 (例: ログ出力)
                log("gatherCandidates failed", e);
            });
        }
    }
    setConnectionState(state) {
        if (this.connectionState === state) {
            return;
        }
        log("connectionStateChange", state);
        this.connectionState = state;
        this.connectionStateChange.execute(state);
    }
    async getStats(timestamp) {
        const stats = [];
        for (const dtlsTransport of this.dtlsTransports) {
            const transportStats = await dtlsTransport.getStats(timestamp);
            if (transportStats) {
                stats.push(...transportStats);
            }
        }
        return stats;
    }
    async ensureCerts() {
        if (!this.certificate) {
            this.certificate = await dtls_1.RTCDtlsTransport.SetupCertificate();
        }
        for (const dtlsTransport of this.dtlsTransports) {
            dtlsTransport.localCertificate = this.certificate;
        }
    }
    async close() {
        this.setConnectionState("closed");
        await Promise.allSettled([...this.dtlsTransports.map((t) => t.stop())]);
        this.iceGatheringStateChange.allUnsubscribe();
        this.iceConnectionStateChange.allUnsubscribe();
        this.onIceCandidate.allUnsubscribe();
        this.connectionStateChange.allUnsubscribe();
    }
}
exports.SecureTransportManager = SecureTransportManager;
const srtpProfiles = [
    const_1.SRTP_PROFILE.SRTP_AEAD_AES_128_GCM, // prefer
    const_1.SRTP_PROFILE.SRTP_AES128_CM_HMAC_SHA1_80,
];
//# sourceMappingURL=secureTransportManager.js.map