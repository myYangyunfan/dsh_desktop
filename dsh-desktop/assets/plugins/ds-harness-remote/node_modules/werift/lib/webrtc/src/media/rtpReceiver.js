"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RTCRtpReceiver = void 0;
const crypto_1 = require("crypto");
const promises_1 = require("timers/promises");
const common_1 = require("../imports/common");
const rtp_1 = require("../imports/rtp");
const utils_1 = require("../utils");
const nack_1 = require("./receiver/nack");
const receiverTwcc_1 = require("./receiver/receiverTwcc");
const statistics_1 = require("./receiver/statistics");
const sdp_1 = require("../sdp");
const rtcpFeedback_1 = require("./extension/rtcpFeedback");
const stats_1 = require("./stats");
const track_1 = require("./track");
const log = (0, rtp_1.debug)("werift:packages/webrtc/src/media/rtpReceiver.ts");
class RTCRtpReceiver {
    get codecArray() {
        return Object.values(this.codecs).sort((a, b) => a.payloadType - b.payloadType);
    }
    constructor(config, kind, rtcpSsrc) {
        Object.defineProperty(this, "config", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: config
        });
        Object.defineProperty(this, "kind", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: kind
        });
        Object.defineProperty(this, "rtcpSsrc", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: rtcpSsrc
        });
        Object.defineProperty(this, "codecs", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: {}
        });
        Object.defineProperty(this, "defaultTrack", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "ssrcByRtx", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: {}
        });
        Object.defineProperty(this, "nack", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new nack_1.NackHandler(this)
        });
        Object.defineProperty(this, "audioRedHandler", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new rtp_1.RedHandler()
        });
        Object.defineProperty(this, "type", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: "receiver"
        });
        Object.defineProperty(this, "uuid", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: (0, crypto_1.randomUUID)().toString()
        });
        Object.defineProperty(this, "tracks", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        Object.defineProperty(this, "trackBySSRC", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: {}
        });
        Object.defineProperty(this, "trackByRID", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: {}
        });
        /**last sender Report Timestamp
         * compactNtp
         */
        Object.defineProperty(this, "lastSRtimestamp", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: {}
        });
        /**seconds */
        Object.defineProperty(this, "receiveLastSRTimestamp", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: {}
        });
        Object.defineProperty(this, "onPacketLost", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: this.nack.onPacketLost
        });
        Object.defineProperty(this, "onRtcp", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new common_1.Event()
        });
        Object.defineProperty(this, "dtlsTransport", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "sdesMid", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "latestRid", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "latestRepairedRid", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "receiverTWCC", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "stopped", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        Object.defineProperty(this, "remoteStreamId", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "remoteStreamIds", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        Object.defineProperty(this, "remoteTrackId", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "rtcpRunning", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        Object.defineProperty(this, "rtcpCancel", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new AbortController()
        });
        Object.defineProperty(this, "remoteStreams", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: {}
        });
        Object.defineProperty(this, "senderReportsReceivedBySsrc", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: {}
        });
        Object.defineProperty(this, "remoteTimestampsBySsrc", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: {}
        });
        Object.defineProperty(this, "remotePacketCountBySsrc", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: {}
        });
        Object.defineProperty(this, "remoteOctetCountBySsrc", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: {}
        });
        Object.defineProperty(this, "nackCountBySsrc", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: {}
        });
        Object.defineProperty(this, "pliCountBySsrc", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: {}
        });
        Object.defineProperty(this, "handleRtpBySsrc", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: (packet, extensions) => {
                const track = this.trackBySSRC[packet.header.ssrc];
                this.handleRTP(packet, extensions, track);
            }
        });
        Object.defineProperty(this, "handleRtpByRid", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: (packet, rid, extensions) => {
                const track = this.trackByRID[rid];
                if (!this.trackBySSRC[packet.header.ssrc]) {
                    this.trackBySSRC[packet.header.ssrc] = track;
                }
                this.handleRTP(packet, extensions, track);
            }
        });
        this.defaultTrack = new track_1.MediaStreamTrack({ kind, remote: true });
        this.onPacketLost.subscribe((nack) => {
            this.nackCountBySsrc[nack.mediaSourceSsrc] =
                (this.nackCountBySsrc[nack.mediaSourceSsrc] ?? 0) + 1;
        });
    }
    get transport() {
        return this.dtlsTransport ?? null;
    }
    setDtlsTransport(dtls) {
        this.dtlsTransport = dtls;
    }
    // todo fix
    get track() {
        return this.tracks[0] ?? this.defaultTrack;
    }
    get nackEnabled() {
        return this.codecArray[0]?.rtcpFeedback.find((f) => f.type === "nack");
    }
    get twccEnabled() {
        return this.codecArray[0]?.rtcpFeedback.find((f) => f.type === (0, rtcpFeedback_1.useTWCC)().type);
    }
    get pliEnabled() {
        return this.codecArray[0]?.rtcpFeedback.find((f) => f.type === (0, rtcpFeedback_1.usePLI)().type);
    }
    prepareReceive(params) {
        params.codecs.forEach((c) => {
            this.codecs[c.payloadType] = c;
        });
        params.encodings.forEach((e) => {
            if (e.rtx) {
                this.ssrcByRtx[e.rtx.ssrc] = e.ssrc;
            }
        });
    }
    /**
     * setup TWCC if supported
     */
    setupTWCC(mediaSourceSsrc) {
        if (this.twccEnabled && !this.receiverTWCC) {
            this.receiverTWCC = new receiverTwcc_1.ReceiverTWCC(this.dtlsTransport, this.rtcpSsrc, mediaSourceSsrc);
        }
    }
    addTrack(track) {
        const exist = this.tracks.find((t) => {
            if (t.rid) {
                return t.rid === track.rid;
            }
            if (t.ssrc) {
                return t.ssrc === track.ssrc;
            }
        });
        if (exist) {
            return false;
        }
        this.tracks.push(track);
        if (track.ssrc) {
            this.trackBySSRC[track.ssrc] = track;
        }
        if (track.rid) {
            this.trackByRID[track.rid] = track;
        }
        return true;
    }
    stop() {
        this.stopped = true;
        this.rtcpRunning = false;
        this.rtcpCancel.abort();
        if (this.receiverTWCC)
            this.receiverTWCC.twccRunning = false;
        this.nack.close();
    }
    async runRtcp() {
        if (this.rtcpRunning || this.stopped)
            return;
        this.rtcpRunning = true;
        try {
            while (this.rtcpRunning) {
                await (0, promises_1.setTimeout)(500 + Math.random() * 1000, undefined, {
                    signal: this.rtcpCancel.signal,
                });
                const reports = Object.entries(this.remoteStreams).map(([ssrc, stream]) => {
                    let lastSRtimestamp = 0, delaySinceLastSR = 0;
                    if (this.lastSRtimestamp[ssrc]) {
                        lastSRtimestamp = this.lastSRtimestamp[ssrc];
                        const delaySeconds = (0, utils_1.timestampSeconds)() - this.receiveLastSRTimestamp[ssrc];
                        if (delaySeconds > 0 && delaySeconds < 65536) {
                            delaySinceLastSR = (0, common_1.int)(delaySeconds * 65536);
                        }
                    }
                    return new rtp_1.RtcpReceiverInfo({
                        ssrc: Number(ssrc),
                        fractionLost: stream.fraction_lost,
                        packetsLost: stream.packets_lost,
                        highestSequence: stream.max_seq,
                        jitter: stream.jitter,
                        lsr: lastSRtimestamp,
                        dlsr: delaySinceLastSR,
                    });
                });
                const packet = new rtp_1.RtcpRrPacket({ ssrc: this.rtcpSsrc, reports });
                try {
                    if (this.config.debug.receiverReportDelay) {
                        await (0, promises_1.setTimeout)(this.config.debug.receiverReportDelay);
                    }
                    await this.dtlsTransport.sendRtcp([packet]);
                }
                catch (error) {
                    log("sendRtcp failed", error);
                    await (0, promises_1.setTimeout)(500 + Math.random() * 1000);
                }
            }
        }
        catch (error) { }
    }
    getInboundRtpStatsId(track) {
        return (0, stats_1.generateStatsId)("inbound-rtp", track.id ?? track.uuid);
    }
    getRemoteOutboundRtpStatsId(track) {
        return (0, stats_1.generateStatsId)("remote-outbound-rtp", track.id ?? track.uuid);
    }
    getStatsRootIds(selector) {
        return this.tracks
            .filter((track) => (!selector ? true : track === selector))
            .filter((track) => track.ssrc)
            .map((track) => this.getInboundRtpStatsId(track));
    }
    collectStats(timestamp) {
        const stats = [];
        const transportId = this.dtlsTransport
            ? (0, stats_1.generateStatsId)("transport", this.dtlsTransport.id)
            : undefined;
        const activeCodec = this.codecArray[0];
        const emittedCodecIds = new Set();
        // Collect stats for each track
        for (const track of this.tracks) {
            if (!track.ssrc)
                continue;
            const streamStats = this.remoteStreams[track.ssrc];
            // Inbound RTP stats
            const hasRemoteTimestamp = this.remoteTimestampsBySsrc[track.ssrc] !== undefined;
            const remoteId = this.lastSRtimestamp[track.ssrc] !== undefined || hasRemoteTimestamp
                ? this.getRemoteOutboundRtpStatsId(track)
                : undefined;
            const codecId = activeCodec && transportId
                ? (0, stats_1.generateCodecStatsId)(transportId, activeCodec.payloadType, track.id ?? track.uuid)
                : undefined;
            if (activeCodec &&
                transportId &&
                codecId &&
                !emittedCodecIds.has(codecId)) {
                emittedCodecIds.add(codecId);
                const codecStats = {
                    type: "codec",
                    id: codecId,
                    timestamp,
                    payloadType: activeCodec.payloadType,
                    transportId,
                    mimeType: activeCodec.mimeType,
                    clockRate: activeCodec.clockRate,
                    channels: activeCodec.channels,
                    sdpFmtpLine: activeCodec.parameters,
                };
                stats.push(codecStats);
            }
            const inboundRtpStats = {
                type: "inbound-rtp",
                id: this.getInboundRtpStatsId(track),
                timestamp,
                ssrc: track.ssrc,
                kind: this.kind,
                transportId,
                codecId,
                mid: this.sdesMid,
                trackIdentifier: track.id ?? track.uuid,
                packetsReceived: streamStats?.packets_received ?? 0,
                bytesReceived: streamStats?.bytesReceived ?? 0,
                headerBytesReceived: streamStats?.headerBytesReceived ?? 0,
                packetsLost: streamStats?.packets_lost ?? 0,
                jitter: streamStats?.clockRate
                    ? streamStats.jitter / streamStats.clockRate
                    : undefined,
                lastPacketReceivedTimestamp: streamStats?.lastPacketReceivedTimestamp,
                remoteId,
                nackCount: this.nackCountBySsrc[track.ssrc] || undefined,
                pliCount: this.pliCountBySsrc[track.ssrc] || undefined,
            };
            stats.push(inboundRtpStats);
            // Remote outbound RTP stats (if we have SR info)
            if (remoteId) {
                const remoteOutboundStats = {
                    type: "remote-outbound-rtp",
                    id: this.getRemoteOutboundRtpStatsId(track),
                    timestamp,
                    ssrc: track.ssrc,
                    kind: this.kind,
                    transportId,
                    codecId: inboundRtpStats.codecId,
                    localId: inboundRtpStats.id,
                    remoteTimestamp: this.remoteTimestampsBySsrc[track.ssrc],
                    reportsSent: this.senderReportsReceivedBySsrc[track.ssrc] ?? 0,
                    packetsSent: this.remotePacketCountBySsrc[track.ssrc],
                    bytesSent: this.remoteOctetCountBySsrc[track.ssrc],
                };
                stats.push(remoteOutboundStats);
            }
        }
        return stats;
    }
    async getStats() {
        const timestamp = (0, stats_1.getStatsTimestamp)();
        const stats = this.collectStats(timestamp);
        if (this.dtlsTransport) {
            stats.push(...(await this.dtlsTransport.getStats(timestamp)));
        }
        return (0, stats_1.buildStatsReport)(stats, this.getStatsRootIds());
    }
    async sendRtcpPLI(mediaSsrc) {
        if (!this.pliEnabled) {
            log("pli not supported", { mediaSsrc });
            return;
        }
        if (this.stopped) {
            return;
        }
        log("sendRtcpPLI", { mediaSsrc });
        const packet = new rtp_1.RtcpPayloadSpecificFeedback({
            feedback: new rtp_1.PictureLossIndication({
                senderSsrc: this.rtcpSsrc,
                mediaSsrc,
            }),
        });
        try {
            this.pliCountBySsrc[mediaSsrc] =
                (this.pliCountBySsrc[mediaSsrc] ?? 0) + 1;
            await this.dtlsTransport.sendRtcp([packet]);
        }
        catch (error) {
            log(error);
        }
    }
    handleRtcpPacket(packet) {
        switch (packet.type) {
            case rtp_1.RtcpSrPacket.type:
                {
                    const sr = packet;
                    this.lastSRtimestamp[sr.ssrc] = (0, utils_1.compactNtp)(sr.senderInfo.ntpTimestamp);
                    this.receiveLastSRTimestamp[sr.ssrc] = (0, utils_1.timestampSeconds)();
                    this.senderReportsReceivedBySsrc[sr.ssrc] =
                        (this.senderReportsReceivedBySsrc[sr.ssrc] ?? 0) + 1;
                    this.remoteTimestampsBySsrc[sr.ssrc] = (0, utils_1.ntpTimeToEpochMs)(sr.senderInfo.ntpTimestamp);
                    this.remotePacketCountBySsrc[sr.ssrc] = sr.senderInfo.packetCount;
                    this.remoteOctetCountBySsrc[sr.ssrc] = sr.senderInfo.octetCount;
                    const track = this.trackBySSRC[packet.ssrc];
                    if (track) {
                        track.onReceiveRtcp.execute(packet);
                    }
                }
                break;
        }
        this.onRtcp.execute(packet);
    }
    handleRTP(packet, extensions, track) {
        if (this.stopped) {
            return;
        }
        const codec = this.codecs[packet.header.payloadType];
        if (!codec) {
            // log("unknown codec " + packet.header.payloadType);
            return;
        }
        this.remoteStreams[packet.header.ssrc] =
            this.remoteStreams[packet.header.ssrc] ??
                new statistics_1.StreamStatistics(codec.clockRate);
        this.remoteStreams[packet.header.ssrc].add(packet);
        if (this.receiverTWCC) {
            const transportSequenceNumber = extensions[rtp_1.RTP_EXTENSION_URI.transportWideCC];
            if (!transportSequenceNumber == undefined) {
                throw new Error("undefined");
            }
            this.receiverTWCC.handleTWCC(transportSequenceNumber);
        }
        else if (this.twccEnabled) {
            this.setupTWCC(packet.header.ssrc);
        }
        if (codec.name.toLowerCase() === "rtx") {
            const originalSsrc = this.ssrcByRtx[packet.header.ssrc];
            const codecParams = (0, sdp_1.codecParametersFromString)(codec.parameters ?? "");
            const rtxCodec = this.codecs[codecParams["apt"]];
            if (packet.payload.length < 2)
                return;
            packet = (0, rtp_1.unwrapRtx)(packet, rtxCodec.payloadType, originalSsrc);
            track = this.trackBySSRC[originalSsrc];
        }
        let red;
        if (codec.name.toLowerCase() === "red") {
            red = rtp_1.Red.deSerialize(packet.payload);
            if (!Object.keys(this.codecs).includes(red.header.fields[0].blockPT.toString())) {
                return;
            }
        }
        if (track?.kind === "video" && this.nackEnabled) {
            this.nack.addPacket(packet);
        }
        if (track) {
            if (red) {
                if (track.kind === "audio") {
                    const payloads = this.audioRedHandler.push(red, packet);
                    for (const packet of payloads) {
                        track.onReceiveRtp.execute(packet.clone(), extensions);
                    }
                }
                else {
                }
            }
            else {
                track.onReceiveRtp.execute(packet.clone(), extensions);
            }
        }
        this.runRtcp();
    }
}
exports.RTCRtpReceiver = RTCRtpReceiver;
//# sourceMappingURL=rtpReceiver.js.map