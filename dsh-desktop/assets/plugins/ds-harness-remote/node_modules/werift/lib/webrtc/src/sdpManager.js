"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SDPManager = void 0;
const const_1 = require("./const");
const errors_1 = require("./errors");
const parameters_1 = require("./media/parameters");
const sdp_1 = require("./sdp");
const utils_1 = require("./utils");
class SDPManager {
    constructor({ cname, midSuffix, bundlePolicy, }) {
        Object.defineProperty(this, "currentLocalDescription", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "currentRemoteDescription", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "pendingLocalDescription", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "pendingRemoteDescription", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "cname", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "midSuffix", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "bundlePolicy", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "seenMid", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Set()
        });
        this.cname = cname;
        this.midSuffix = midSuffix ?? false;
        this.bundlePolicy = bundlePolicy;
    }
    get localDescription() {
        if (!this._localDescription) {
            return undefined;
        }
        return this._localDescription.toJSON();
    }
    get remoteDescription() {
        if (!this._remoteDescription) {
            return undefined;
        }
        return this._remoteDescription.toJSON();
    }
    /**@private */
    get _localDescription() {
        return this.pendingLocalDescription || this.currentLocalDescription;
    }
    /**@private */
    get _remoteDescription() {
        return this.pendingRemoteDescription || this.currentRemoteDescription;
    }
    get inactiveRemoteMedia() {
        return this._remoteDescription?.media?.find?.((m) => m.direction === "inactive");
    }
    /**
     * MediaDescriptionをトランシーバー用に作成
     */
    createMediaDescriptionForTransceiver(transceiver, direction) {
        const media = new sdp_1.MediaDescription(transceiver.kind, 9, "UDP/TLS/RTP/SAVPF", transceiver.codecs.map((c) => c.payloadType));
        media.direction = direction;
        media.msids = transceiver.msids;
        media.rtp = {
            codecs: transceiver.codecs,
            headerExtensions: transceiver.headerExtensions,
            muxId: transceiver.mid ?? undefined,
        };
        media.rtcpHost = "0.0.0.0";
        media.rtcpPort = 9;
        media.rtcpMux = true;
        media.ssrc = [
            new sdp_1.SsrcDescription({ ssrc: transceiver.sender.ssrc, cname: this.cname }),
        ];
        if (transceiver.options.simulcast) {
            media.simulcastParameters = transceiver.options.simulcast.map((o) => new parameters_1.RTCRtpSimulcastParameters(o));
        }
        if (media.rtp.codecs.find((c) => c.name.toLowerCase() === "rtx")) {
            media.ssrc.push(new sdp_1.SsrcDescription({
                ssrc: transceiver.sender.rtxSsrc,
                cname: this.cname,
            }));
            media.ssrcGroup = [
                new sdp_1.GroupDescription("FID", [
                    transceiver.sender.ssrc.toString(),
                    transceiver.sender.rtxSsrc.toString(),
                ]),
            ];
        }
        this.addTransportDescription(media, transceiver.dtlsTransport);
        return media;
    }
    /**
     * MediaDescriptionをSCTP用に作成
     */
    createMediaDescriptionForSctp(sctp) {
        const media = new sdp_1.MediaDescription("application", const_1.DISCARD_PORT, "UDP/DTLS/SCTP", ["webrtc-datachannel"]);
        media.sctpPort = sctp.port;
        media.rtp.muxId = sctp.mid;
        media.sctpCapabilities = sctp.getCapabilities();
        this.addTransportDescription(media, sctp.dtlsTransport);
        return media;
    }
    /**
     * トランスポートの情報をMediaDescriptionに追加
     */
    addTransportDescription(media, dtlsTransport) {
        const iceTransport = dtlsTransport.iceTransport;
        media.iceCandidates = iceTransport.localCandidates;
        media.iceCandidatesComplete = iceTransport.gatheringState === "complete";
        media.iceParams = iceTransport.localParameters;
        media.iceOptions = "trickle";
        media.host = const_1.DISCARD_HOST;
        media.port = const_1.DISCARD_PORT;
        if (media.direction === "inactive") {
            media.port = 0;
            media.msids = [];
        }
        if (!media.dtlsParams) {
            media.dtlsParams = dtlsTransport.localParameters;
            if (!media.dtlsParams.fingerprints) {
                media.dtlsParams.fingerprints =
                    dtlsTransport.localParameters.fingerprints;
            }
        }
    }
    /**
     * 一意のMIDを割り当て
     */
    allocateMid(type = "") {
        let mid = "";
        for (let i = 0;;) {
            // rfc9143.html#name-security-considerations
            // SHOULD be 3 bytes or fewer to allow them to efficiently fit into the MID RTP header extension
            mid = (i++).toString() + type;
            if (!this.seenMid.has(mid))
                break;
        }
        this.seenMid.add(mid);
        return mid;
    }
    parseSdp({ sdp, isLocal, signalingState, type, }) {
        const description = sdp_1.SessionDescription.parse(sdp);
        this.validateDescription({ description, isLocal, signalingState, type });
        description.type = type;
        return description;
    }
    validateDescription({ description, isLocal, signalingState, type, }) {
        if (isLocal) {
            if (type === "offer") {
                if (!["stable", "have-local-offer"].includes(signalingState))
                    throw (0, errors_1.createWebRtcDomException)("InvalidStateError", "Cannot handle offer in signaling state");
            }
            else if (["answer", "pranswer"].includes(type)) {
                if (!["have-remote-offer", "have-local-pranswer"].includes(signalingState)) {
                    throw (0, errors_1.createWebRtcDomException)("InvalidStateError", "Cannot handle answer in signaling state");
                }
            }
        }
        else {
            if (type === "offer") {
                if (!["stable", "have-remote-offer", "have-local-offer"].includes(signalingState)) {
                    throw (0, errors_1.createWebRtcDomException)("InvalidStateError", "Cannot handle offer in signaling state");
                }
            }
            else if (["answer", "pranswer"].includes(type)) {
                if (!["have-local-offer", "have-remote-pranswer"].includes(signalingState)) {
                    throw (0, errors_1.createWebRtcDomException)("InvalidStateError", "Cannot handle answer in signaling state");
                }
            }
        }
    }
    /**
     * オファーSDPを構築
     */
    buildOfferSdp(transceivers, sctpTransport) {
        const description = new sdp_1.SessionDescription();
        (0, sdp_1.addSDPHeader)("offer", description);
        // # handle existing transceivers / sctp
        const currentMedia = this.currentLocalDescription?.media ?? [];
        currentMedia.forEach((m, i) => {
            const mid = m.rtp.muxId;
            if (!mid) {
                return;
            }
            if (m.kind === "application") {
                if (!sctpTransport) {
                    throw new Error("sctpTransport not found");
                }
                sctpTransport.mLineIndex = i;
                description.media.push(this.createMediaDescriptionForSctp(sctpTransport));
            }
            else {
                const transceiver = transceivers.find((t) => t.mid === mid);
                if (!transceiver) {
                    if (m.direction === "inactive") {
                        description.media.push(m);
                        return;
                    }
                    throw new Error("transceiver not found");
                }
                transceiver.mLineIndex = i;
                description.media.push(this.createMediaDescriptionForTransceiver(transceiver, transceiver.direction));
            }
        });
        // # handle new transceivers / sctp
        for (const transceiver of transceivers.filter((t) => !description.media.find((m) => m.rtp.muxId === t.mid))) {
            if (transceiver.mid == undefined) {
                transceiver.mid = this.allocateMid(this.midSuffix ? "av" : "");
            }
            const mediaDescription = this.createMediaDescriptionForTransceiver(transceiver, transceiver.direction);
            if (transceiver.mLineIndex === undefined) {
                transceiver.mLineIndex = description.media.length;
                description.media.push(mediaDescription);
            }
            else {
                description.media[transceiver.mLineIndex] = mediaDescription;
            }
        }
        if (sctpTransport &&
            !description.media.find((m) => m.kind === "application")) {
            sctpTransport.mLineIndex = description.media.length;
            if (sctpTransport.mid == undefined) {
                sctpTransport.mid = this.allocateMid(this.midSuffix ? "dc" : "");
            }
            description.media.push(this.createMediaDescriptionForSctp(sctpTransport));
        }
        if (this.bundlePolicy !== "disable") {
            const mids = description.media
                .map((m) => m.rtp.muxId)
                .filter((v) => v);
            if (mids.length) {
                const bundle = new sdp_1.GroupDescription("BUNDLE", mids);
                description.group.push(bundle);
            }
        }
        return description;
    }
    /**
     * アンサーSDPを構築
     */
    buildAnswerSdp({ transceivers, sctpTransport, signalingState, }) {
        if (!["have-remote-offer", "have-local-pranswer"].includes(signalingState)) {
            throw new Error("createAnswer failed");
        }
        if (!this._remoteDescription) {
            throw new Error("wrong state");
        }
        const description = new sdp_1.SessionDescription();
        (0, sdp_1.addSDPHeader)("answer", description);
        for (const remoteMedia of this._remoteDescription.media) {
            let dtlsTransport;
            let media;
            if (["audio", "video"].includes(remoteMedia.kind)) {
                const transceiver = transceivers.find((t) => t.mid === remoteMedia.rtp.muxId);
                if (!transceiver) {
                    throw new Error(`Transceiver with mid=${remoteMedia.rtp.muxId} not found`);
                }
                media = this.createMediaDescriptionForTransceiver(transceiver, (0, utils_1.andDirection)(transceiver.direction, transceiver.offerDirection));
                dtlsTransport = transceiver.dtlsTransport;
            }
            else if (remoteMedia.kind === "application") {
                if (!sctpTransport || !sctpTransport.mid) {
                    throw new Error("sctpTransport not found");
                }
                media = this.createMediaDescriptionForSctp(sctpTransport);
                dtlsTransport = sctpTransport.dtlsTransport;
            }
            else {
                throw new Error("invalid kind");
            }
            // # determine DTLS role, or preserve the currently configured role
            if (media.dtlsParams) {
                if (dtlsTransport.role === "auto") {
                    media.dtlsParams.role = "client";
                }
                else {
                    media.dtlsParams.role = dtlsTransport.role;
                }
            }
            // Simulcastに関する処理
            if (remoteMedia.simulcastParameters &&
                remoteMedia.simulcastParameters.length > 0) {
                media.simulcastParameters = remoteMedia.simulcastParameters.map((v) => ({
                    ...v,
                    direction: v.direction === "send" ? "recv" : "send",
                }));
            }
            description.media.push(media);
        }
        if (this.bundlePolicy !== "disable") {
            const bundle = new sdp_1.GroupDescription("BUNDLE", []);
            for (const media of description.media) {
                if (media.rtp.muxId) {
                    bundle.items.push(media.rtp.muxId);
                }
            }
            description.group.push(bundle);
        }
        return description;
    }
    setLocalDescription(description) {
        if (description.type === "offer" || description.type === "pranswer") {
            this.pendingLocalDescription = description;
            return;
        }
        this.currentLocalDescription = description;
        if (this.pendingRemoteDescription) {
            this.currentRemoteDescription = this.pendingRemoteDescription;
        }
        this.pendingLocalDescription = undefined;
        this.pendingRemoteDescription = undefined;
    }
    setRemoteDescription(sessionDescription, signalingState) {
        if (!sessionDescription.type) {
            throw new Error("invalid sessionDescription");
        }
        if (sessionDescription.type === "rollback") {
            if (!["have-remote-offer", "have-local-pranswer"].includes(signalingState)) {
                throw (0, errors_1.createWebRtcDomException)("InvalidStateError", "Cannot rollback remote description in signaling state");
            }
            this.pendingLocalDescription = undefined;
            this.pendingRemoteDescription = undefined;
            return;
        }
        if (!sessionDescription.sdp) {
            throw new Error("invalid sessionDescription");
        }
        // # parse and validate description
        const remoteSdp = this.parseSdp({
            sdp: sessionDescription.sdp,
            isLocal: false,
            signalingState,
            type: sessionDescription.type,
        });
        if (remoteSdp.type === "offer" || remoteSdp.type === "pranswer") {
            this.pendingRemoteDescription = remoteSdp;
        }
        else {
            if (this.pendingLocalDescription) {
                this.currentLocalDescription = this.pendingLocalDescription;
            }
            this.currentRemoteDescription = remoteSdp;
            this.pendingRemoteDescription = undefined;
            this.pendingLocalDescription = undefined;
        }
        return remoteSdp;
    }
    rollbackLocalDescription(signalingState) {
        if (!["have-local-offer", "have-local-pranswer"].includes(signalingState)) {
            throw (0, errors_1.createWebRtcDomException)("InvalidStateError", "Cannot rollback local description in signaling state");
        }
        this.pendingLocalDescription = undefined;
        this.pendingRemoteDescription = undefined;
    }
    registerMid(mid) {
        this.seenMid.add(mid);
    }
    get remoteIsBundled() {
        const remoteSdp = this._remoteDescription;
        if (!remoteSdp) {
            return undefined;
        }
        const bundle = remoteSdp.group.find((g) => g.semantic === "BUNDLE" && this.bundlePolicy !== "disable");
        return bundle;
    }
    /**
     * ローカルセッション記述を設定し、トランスポート情報を追加する
     */
    setLocal(description, transceivers, sctpTransport) {
        const transceiverByMLineIndex = new Map(transceivers.map((transceiver) => [transceiver?.mLineIndex, transceiver]));
        const fallbackDtlsTransport = transceivers.find((transceiver) => transceiver?.dtlsTransport)
            ?.dtlsTransport ?? sctpTransport?.dtlsTransport;
        description.media
            .filter((m) => ["audio", "video"].includes(m.kind))
            .forEach((m, i) => {
            const transceiver = transceiverByMLineIndex.get(i) ?? transceivers[i];
            const dtlsTransport = transceiver?.dtlsTransport ?? fallbackDtlsTransport;
            if (!dtlsTransport) {
                throw new Error(`dtls transport not found for media index ${i}`);
            }
            this.addTransportDescription(m, dtlsTransport);
        });
        const sctpMedia = description.media.find((m) => m.kind === "application");
        if (sctpTransport && sctpMedia) {
            this.addTransportDescription(sctpMedia, sctpTransport.dtlsTransport);
        }
        this.setLocalDescription(description);
    }
}
exports.SDPManager = SDPManager;
//# sourceMappingURL=sdpManager.js.map