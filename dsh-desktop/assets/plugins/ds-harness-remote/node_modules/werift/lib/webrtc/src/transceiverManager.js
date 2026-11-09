"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TransceiverManager = void 0;
const const_1 = require("./const");
const errors_1 = require("./errors");
const common_1 = require("./imports/common");
const media_1 = require("./media");
const peerConnection_1 = require("./peerConnection");
const sdp_1 = require("./sdp");
const utils_1 = require("./utils");
const log = (0, common_1.debug)("werift:packages/webrtc/src/media/rtpTransceiverManager.ts");
class TransceiverManager {
    constructor(cname, config, router) {
        Object.defineProperty(this, "cname", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: cname
        });
        Object.defineProperty(this, "config", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: config
        });
        Object.defineProperty(this, "router", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: router
        });
        Object.defineProperty(this, "transceivers", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        Object.defineProperty(this, "onTransceiverAdded", {
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
        Object.defineProperty(this, "onTrack", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new common_1.Event()
        });
        Object.defineProperty(this, "onNegotiationNeeded", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new common_1.Event()
        });
    }
    getTransceivers() {
        return this.transceivers;
    }
    getSenders() {
        return this.getTransceivers().map((t) => t.sender);
    }
    getReceivers() {
        return this.getTransceivers().map((t) => t.receiver);
    }
    getTransceiverByMLineIndex(index) {
        return this.transceivers.find((transceiver) => transceiver.mLineIndex === index);
    }
    pushTransceiver(t) {
        this.transceivers.push(t);
    }
    replaceTransceiver(t, index) {
        this.transceivers[index] = t;
    }
    addTransceiver(trackOrKind, dtlsTransport, options = {}) {
        const kind = typeof trackOrKind === "string" ? trackOrKind : trackOrKind.kind;
        const direction = options.direction || "sendrecv";
        const sender = new media_1.RTCRtpSender(trackOrKind);
        const receiver = new media_1.RTCRtpReceiver(this.config, kind, sender.ssrc);
        const newTransceiver = new media_1.RTCRtpTransceiver(kind, dtlsTransport, receiver, sender, direction);
        newTransceiver.options = options;
        newTransceiver.sender.setStreams(options.streams ?? []);
        newTransceiver.sender.setSendEncodings((options.sendEncodings ?? []).map((encoding) => ({ ...encoding })));
        this.router.registerRtpSender(newTransceiver.sender);
        // reuse inactive
        const inactiveTransceiverIndex = this.transceivers.findIndex((t) => t.currentDirection === "inactive" && !t.usedForSender);
        const inactiveTransceiver = this.transceivers.find((t) => t.currentDirection === "inactive" && !t.usedForSender);
        if (inactiveTransceiverIndex > -1 && inactiveTransceiver) {
            this.replaceTransceiver(newTransceiver, inactiveTransceiverIndex);
            newTransceiver.mLineIndex = inactiveTransceiver.mLineIndex;
            newTransceiver.mid = inactiveTransceiver.mid;
            inactiveTransceiver.setCurrentDirection(undefined);
        }
        else {
            this.pushTransceiver(newTransceiver);
        }
        this.onTransceiverAdded.execute(newTransceiver);
        return newTransceiver;
    }
    addTrack(track, streams = []) {
        if (this.getSenders().find((sender) => sender.track?.uuid === track.uuid)) {
            throw (0, errors_1.createWebRtcDomException)("InvalidAccessError", "Track already added");
        }
        const emptyTrackSenderTransceiver = this.transceivers.find((t) => t.sender.track == undefined &&
            t.kind === track.kind &&
            const_1.SenderDirections.includes(t.direction) === true);
        if (emptyTrackSenderTransceiver) {
            const sender = emptyTrackSenderTransceiver.sender;
            sender.setStreams(streams);
            sender.registerTrack(track);
            emptyTrackSenderTransceiver.options = {
                ...emptyTrackSenderTransceiver.options,
                streams,
            };
            return emptyTrackSenderTransceiver;
        }
        const notSendTransceiver = this.transceivers.find((t) => t.sender.track == undefined &&
            t.kind === track.kind &&
            const_1.SenderDirections.includes(t.direction) === false &&
            !t.usedForSender);
        if (notSendTransceiver) {
            const sender = notSendTransceiver.sender;
            sender.setStreams(streams);
            sender.registerTrack(track);
            notSendTransceiver.options = {
                ...notSendTransceiver.options,
                streams,
            };
            switch (notSendTransceiver.direction) {
                case "recvonly":
                    notSendTransceiver.setDirection("sendrecv");
                    break;
                case "inactive":
                    notSendTransceiver.setDirection("sendonly");
                    break;
            }
            return notSendTransceiver;
        }
        else {
            const transceiver = this.addTransceiver(track, undefined, {
                direction: "sendrecv",
                streams,
            });
            return transceiver;
        }
    }
    removeTrack(sender) {
        if (!this.getSenders().find(({ ssrc }) => sender.ssrc === ssrc)) {
            throw (0, errors_1.createWebRtcDomException)("InvalidAccessError", "Sender does not exist");
        }
        const transceiver = this.transceivers.find(({ sender: { ssrc } }) => sender.ssrc === ssrc);
        if (!transceiver)
            throw new Error("No matching transceiver found");
        if (transceiver.stopping || transceiver.stopped) {
            return;
        }
        sender.stop();
        if (["recvonly", "inactive"].includes(transceiver.currentDirection ?? "")) {
            this.onNegotiationNeeded.execute();
            return;
        }
        if (transceiver.direction === "sendrecv") {
            transceiver.setDirection("recvonly");
        }
        else if (transceiver.direction === "sendonly" ||
            transceiver.direction === "recvonly") {
            transceiver.setDirection("inactive");
        }
    }
    assignTransceiverCodecs(transceiver) {
        const codecs = this.config.codecs[transceiver.kind].filter((codecCandidate) => {
            switch (codecCandidate.direction) {
                case "recvonly": {
                    if (const_1.ReceiverDirection.includes(transceiver.direction))
                        return true;
                    return false;
                }
                case "sendonly": {
                    if (const_1.SenderDirections.includes(transceiver.direction))
                        return true;
                    return false;
                }
                case "sendrecv": {
                    if ([media_1.Sendrecv, media_1.Recvonly, media_1.Sendonly].includes(transceiver.direction))
                        return true;
                    return false;
                }
                case "all": {
                    return true;
                }
                default:
                    return false;
            }
        });
        transceiver.codecs = codecs;
    }
    getLocalRtpParams(transceiver) {
        if (transceiver.mid == undefined)
            throw new Error("mid not assigned");
        const rtp = {
            codecs: transceiver.codecs,
            muxId: transceiver.mid,
            headerExtensions: transceiver.headerExtensions,
            rtcp: { cname: this.cname, ssrc: transceiver.sender.ssrc, mux: true },
        };
        return rtp;
    }
    getRemoteRtpParams(media, transceiver) {
        const receiveParameters = {
            muxId: media.rtp.muxId,
            rtcp: media.rtp.rtcp,
            codecs: transceiver.codecs,
            headerExtensions: transceiver.headerExtensions,
            encodings: Object.values(transceiver.codecs.reduce((acc, codec) => {
                if (codec.name.toLowerCase() === "rtx") {
                    const params = (0, sdp_1.codecParametersFromString)(codec.parameters ?? "");
                    const apt = acc[params["apt"]];
                    if (apt && media.ssrc.length === 2) {
                        apt.rtx = new media_1.RTCRtpRtxParameters({ ssrc: media.ssrc[1].ssrc });
                    }
                    return acc;
                }
                acc[codec.payloadType] = new media_1.RTCRtpCodingParameters({
                    ssrc: media.ssrc[0]?.ssrc,
                    payloadType: codec.payloadType,
                });
                return acc;
            }, {})),
        };
        return receiveParameters;
    }
    setRemoteRTP(transceiver, remoteMedia, type, mLineIndex) {
        if (!transceiver.mid) {
            transceiver.mid = remoteMedia.rtp.muxId ?? null;
        }
        transceiver.mLineIndex = mLineIndex;
        // # negotiate codecs
        transceiver.codecs = remoteMedia.rtp.codecs.filter((remoteCodec) => {
            const localCodecs = this.config.codecs[remoteMedia.kind] || [];
            const existCodec = (0, peerConnection_1.findCodecByMimeType)(localCodecs, remoteCodec);
            if (!existCodec) {
                return false;
            }
            if (existCodec?.name.toLowerCase() === "rtx") {
                const params = (0, sdp_1.codecParametersFromString)(existCodec.parameters ?? "");
                const pt = params["apt"];
                const origin = remoteMedia.rtp.codecs.find((c) => c.payloadType === pt);
                if (!origin) {
                    return false;
                }
                return !!(0, peerConnection_1.findCodecByMimeType)(localCodecs, origin);
            }
            return true;
        });
        log("negotiated codecs", transceiver.codecs);
        if (transceiver.codecs.length === 0) {
            throw new Error("negotiate codecs failed.");
        }
        transceiver.headerExtensions = remoteMedia.rtp.headerExtensions.filter((extension) => (this.config.headerExtensions[remoteMedia.kind] ||
            []).find((v) => v.uri === extension.uri));
        // # configure direction
        const mediaDirection = remoteMedia.direction ?? "inactive";
        const direction = (0, utils_1.reverseDirection)(mediaDirection);
        if (["answer", "pranswer"].includes(type)) {
            transceiver.setCurrentDirection(direction);
        }
        else {
            transceiver.offerDirection = direction;
        }
        const localParams = this.getLocalRtpParams(transceiver);
        transceiver.sender.prepareSend(localParams);
        if (["recvonly", "sendrecv"].includes(transceiver.direction)) {
            const remotePrams = this.getRemoteRtpParams(remoteMedia, transceiver);
            // register simulcast receiver
            for (const param of remoteMedia.simulcastParameters) {
                this.router.registerRtpReceiverByRid(transceiver, param, remotePrams);
            }
            transceiver.receiver.prepareReceive(remotePrams);
            // register ssrc receiver
            this.router.registerRtpReceiverBySsrc(transceiver, remotePrams);
        }
        if (remoteMedia.port !== 0 &&
            ["sendonly", "sendrecv"].includes(mediaDirection)) {
            const remoteStreamIds = [
                ...new Set(remoteMedia.msids.map((msid) => msid.split(" ")[0])),
            ];
            const remoteTrackId = remoteMedia.msids[0]?.split(" ")[1];
            transceiver.receiver.remoteStreamId = remoteStreamIds[0];
            transceiver.receiver.remoteStreamIds = remoteStreamIds;
            transceiver.receiver.remoteTrackId = remoteTrackId;
            this.onTrack.execute({
                track: transceiver.receiver.track,
                transceiver,
                streams: remoteStreamIds.map((id) => new media_1.MediaStream({
                    id,
                    tracks: [transceiver.receiver.track],
                })),
            });
        }
        if (remoteMedia.ssrc[0]?.ssrc) {
            transceiver.receiver.setupTWCC(remoteMedia.ssrc[0].ssrc);
        }
    }
    collectStats(timestamp) {
        const stats = [];
        for (const transceiver of this.transceivers) {
            if (transceiver.sender) {
                stats.push(...transceiver.sender.collectStats(timestamp));
            }
            if (transceiver.receiver) {
                stats.push(...transceiver.receiver.collectStats(timestamp));
            }
            const codecStats = transceiver.collectCodecStats(timestamp);
            if (codecStats) {
                stats.push(...codecStats);
            }
        }
        return stats;
    }
    getStatsRootIds(selector) {
        if (!selector) {
            return [];
        }
        const rootIds = [];
        for (const transceiver of this.transceivers) {
            if (transceiver.sender.track === selector) {
                rootIds.push(...transceiver.sender.getStatsRootIds());
            }
            if (transceiver.receiver.tracks.includes(selector)) {
                rootIds.push(...transceiver.receiver.getStatsRootIds(selector));
            }
        }
        return rootIds;
    }
    /**
     * 全トランシーバーのreceiver/senderのstopを呼ぶcloseメソッド
     */
    close() {
        for (const transceiver of this.transceivers) {
            transceiver.forceStop();
        }
        this.onTransceiverAdded.allUnsubscribe();
        this.onRemoteTransceiverAdded.allUnsubscribe();
        this.onTrack.allUnsubscribe();
        this.onNegotiationNeeded.allUnsubscribe();
    }
}
exports.TransceiverManager = TransceiverManager;
//# sourceMappingURL=transceiverManager.js.map