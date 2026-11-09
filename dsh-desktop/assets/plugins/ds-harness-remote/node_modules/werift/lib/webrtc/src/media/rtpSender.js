"use strict";
/**
   [10 Nov 1995 11:33:25.125 UTC]       [10 Nov 1995 11:33:36.5 UTC]
   n                 SR(n)              A=b710:8000 (46864.500 s)
   ---------------------------------------------------------------->
                      v                 ^
   ntp_sec =0xb44db705 v               ^ dlsr=0x0005:4000 (    5.250s)
   ntp_frac=0x20000000  v             ^  lsr =0xb705:2000 (46853.125s)
     (3024992005.125 s)  v           ^
   r                      v         ^ RR(n)
   ---------------------------------------------------------------->
                          |<-DLSR->|
                           (5.250 s)
        
   A     0xb710:8000 (46864.500 s)
   DLSR -0x0005:4000 (    5.250 s)
   LSR  -0xb705:2000 (46853.125 s)
   -------------------------------
   delay 0x0006:2000 (    6.125 s)
        
Figure 2: Example for round-trip time computation
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.RTCRtpSender = void 0;
const crypto_1 = require("crypto");
const crypto_2 = require("crypto");
const promises_1 = require("timers/promises");
const common_1 = require("../imports/common");
const __1 = require("..");
const rtp_1 = require("../imports/rtp");
const utils_1 = require("../utils");
const senderBWE_1 = require("./sender/senderBWE");
const stats_1 = require("./stats");
const log = (0, rtp_1.debug)("werift:packages/webrtc/src/media/rtpSender.ts");
const RTP_HISTORY_SIZE = 128;
const RTT_ALPHA = 0.85;
class RTCRtpSender {
    constructor(trackOrKind) {
        Object.defineProperty(this, "trackOrKind", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: trackOrKind
        });
        Object.defineProperty(this, "type", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: "sender"
        });
        Object.defineProperty(this, "kind", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "ssrc", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: (0, crypto_1.randomBytes)(4).readUInt32BE(0)
        });
        Object.defineProperty(this, "rtxSsrc", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: (0, crypto_1.randomBytes)(4).readUInt32BE(0)
        });
        Object.defineProperty(this, "trackId", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: (0, crypto_2.randomUUID)().toString()
        });
        Object.defineProperty(this, "onReady", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new common_1.Event()
        });
        Object.defineProperty(this, "onRtcp", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new common_1.Event()
        });
        Object.defineProperty(this, "onPictureLossIndication", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new common_1.Event()
        });
        Object.defineProperty(this, "onGenericNack", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new common_1.Event()
        });
        Object.defineProperty(this, "senderBWE", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new senderBWE_1.SenderBandwidthEstimator()
        });
        Object.defineProperty(this, "cname", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "mid", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "rtpStreamId", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "repairedRtpStreamId", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "rtxPayloadType", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "rtxSequenceNumber", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: (0, common_1.random16)()
        });
        Object.defineProperty(this, "redRedundantPayloadType", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "_redDistance", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 2
        });
        Object.defineProperty(this, "redEncoder", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new rtp_1.RedEncoder(this._redDistance)
        });
        Object.defineProperty(this, "headerExtensions", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        Object.defineProperty(this, "disposeTrack", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "sendEncodings", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: [{}]
        });
        // # stats
        Object.defineProperty(this, "lastSRtimestamp", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "lastSentSRTimestamp", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "ntpTimestamp", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0n
        });
        Object.defineProperty(this, "rtpTimestamp", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "octetCount", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "packetCount", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "headerBytesSent", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "rtt", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "totalRoundTripTime", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "roundTripTimeMeasurements", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "retransmittedPacketsSent", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "retransmittedBytesSent", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "nackCount", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "pliCount", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "firCount", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "remotePacketsLost", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "remoteFractionLost", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "receiverEstimatedMaxBitrate", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0n
        });
        // rtp
        Object.defineProperty(this, "sequenceNumber", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "timestamp", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "timestampOffset", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "seqOffset", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "rtpCache", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        Object.defineProperty(this, "codec", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "dtlsTransport", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "dtlsDisposer", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        Object.defineProperty(this, "track", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: null
        });
        Object.defineProperty(this, "streamIds", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        Object.defineProperty(this, "stopped", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
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
        this.kind =
            typeof this.trackOrKind === "string"
                ? this.trackOrKind
                : this.trackOrKind.kind;
        if (typeof trackOrKind !== "string") {
            this.registerTrack(trackOrKind);
        }
    }
    get transport() {
        return this.dtlsTransport ?? null;
    }
    get streamId() {
        return this.streamIds[0];
    }
    set streamId(value) {
        this.streamIds = value ? [value] : [];
    }
    setDtlsTransport(dtlsTransport) {
        if (this.dtlsTransport) {
            this.dtlsDisposer.forEach((dispose) => dispose());
        }
        this.dtlsTransport = dtlsTransport;
        this.dtlsDisposer = [
            this.dtlsTransport.onStateChange.subscribe((state) => {
                if (state === "connected") {
                    this.onReady.execute();
                }
            }).unSubscribe,
        ];
    }
    get redDistance() {
        return this._redDistance;
    }
    set redDistance(n) {
        this._redDistance = n;
        this.redEncoder.distance = n;
    }
    prepareSend(params) {
        this.cname = params.rtcp?.cname;
        this.mid = params.muxId;
        this.headerExtensions = params.headerExtensions;
        this.rtpStreamId = params.rtpStreamId;
        this.repairedRtpStreamId = params.repairedRtpStreamId;
        this.codec = params.codecs[0];
        if (this.track) {
            this.track.codec = this.codec;
        }
        params.codecs.forEach((codec) => {
            const codecParams = (0, __1.codecParametersFromString)(codec.parameters ?? "");
            if (codec.name.toLowerCase() === "rtx" &&
                codecParams["apt"] === this.codec?.payloadType) {
                this.rtxPayloadType = codec.payloadType;
            }
            if (codec.name.toLowerCase() === "red") {
                this.redRedundantPayloadType = Number((codec.parameters ?? "").split("/")[0]);
            }
        });
    }
    registerTrack(track) {
        if (track.stopped)
            throw new Error("track is ended");
        if (this.disposeTrack) {
            this.disposeTrack();
        }
        track.id = this.trackId;
        const { unSubscribe } = track.onReceiveRtp.subscribe(async (rtp) => {
            await this.sendRtp(rtp);
        });
        this.track = track;
        this.disposeTrack = unSubscribe;
        if (this.codec) {
            track.codec = this.codec;
        }
        track.onSourceChanged.subscribe((header) => {
            this.replaceRTP(header);
        });
    }
    setStreams(streams = []) {
        this.streamIds = [...new Set(streams.map((stream) => stream.id))];
    }
    setSendEncodings(encodings = []) {
        this.sendEncodings =
            encodings.length > 0
                ? encodings.map((encoding) => ({ ...encoding }))
                : [{}];
    }
    async replaceTrack(track) {
        if (track === null) {
            if (this.disposeTrack) {
                this.disposeTrack();
            }
            this.track = null;
            return;
        }
        if (track.stopped)
            throw new Error("track is ended");
        if (this.sequenceNumber != undefined) {
            const header = track.header || (await track.onReceiveRtp.asPromise())[0].header;
            this.replaceRTP(header);
        }
        this.registerTrack(track);
        log("replaceTrack", "ssrc", track.ssrc, "rid", track.rid);
    }
    stop() {
        this.stopped = true;
        this.rtcpRunning = false;
        this.rtcpCancel.abort();
        if (this.disposeTrack) {
            this.disposeTrack();
        }
        this.track = null;
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
                const packets = [
                    new rtp_1.RtcpSrPacket({
                        ssrc: this.ssrc,
                        senderInfo: new rtp_1.RtcpSenderInfo({
                            ntpTimestamp: this.ntpTimestamp,
                            rtpTimestamp: this.rtpTimestamp,
                            packetCount: this.packetCount,
                            octetCount: this.octetCount,
                        }),
                    }),
                ];
                this.lastSRtimestamp = (0, utils_1.compactNtp)(this.ntpTimestamp);
                this.lastSentSRTimestamp = (0, utils_1.timestampSeconds)();
                if (this.cname) {
                    packets.push(new rtp_1.RtcpSourceDescriptionPacket({
                        chunks: [
                            new rtp_1.SourceDescriptionChunk({
                                source: this.ssrc,
                                items: [
                                    new rtp_1.SourceDescriptionItem({ type: 1, text: this.cname }),
                                ],
                            }),
                        ],
                    }));
                }
                try {
                    await this.dtlsTransport.sendRtcp(packets);
                }
                catch (error) {
                    log("sendRtcp failed", error);
                    await (0, promises_1.setTimeout)(500 + Math.random() * 1000);
                }
            }
        }
        catch (error) { }
    }
    replaceRTP({ sequenceNumber, timestamp, }, discontinuity = false) {
        if (this.sequenceNumber != undefined) {
            this.seqOffset = (0, common_1.uint16Add)(this.sequenceNumber, -sequenceNumber);
            if (discontinuity) {
                this.seqOffset = (0, common_1.uint16Add)(this.seqOffset, 2);
            }
        }
        if (this.timestamp != undefined) {
            this.timestampOffset = (0, common_1.uint32Add)(this.timestamp, -timestamp);
            if (discontinuity) {
                this.timestampOffset = (0, common_1.uint16Add)(this.timestampOffset, 1);
            }
        }
        this.rtpCache = [];
        log("replaceRTP", this.sequenceNumber, sequenceNumber, this.seqOffset);
    }
    async sendRtp(rtp) {
        if (this.dtlsTransport.state !== "connected" || !this.codec) {
            return;
        }
        rtp = Buffer.isBuffer(rtp) ? rtp_1.RtpPacket.deSerialize(rtp) : rtp;
        const { header, payload } = rtp;
        header.ssrc = this.ssrc;
        header.payloadType = this.codec.payloadType;
        header.timestamp = (0, common_1.uint32Add)(header.timestamp, this.timestampOffset);
        header.sequenceNumber = (0, common_1.uint16Add)(header.sequenceNumber, this.seqOffset);
        this.timestamp = header.timestamp;
        this.sequenceNumber = header.sequenceNumber;
        const ntpTimestamp = (0, utils_1.ntpTime)();
        const originalHeaderExtensions = [...header.extensions];
        header.extensions = this.headerExtensions
            .map((extension) => {
            const payload = (() => {
                switch (extension.uri) {
                    case rtp_1.RTP_EXTENSION_URI.sdesMid:
                        if (this.mid) {
                            return (0, rtp_1.serializeSdesMid)(this.mid);
                        }
                        return;
                    // todo : sender simulcast unsupported now
                    case rtp_1.RTP_EXTENSION_URI.sdesRTPStreamID:
                        if (this.rtpStreamId) {
                            return (0, rtp_1.serializeSdesRTPStreamID)(this.rtpStreamId);
                        }
                        return;
                    // todo : sender simulcast unsupported now
                    case rtp_1.RTP_EXTENSION_URI.repairedRtpStreamId:
                        if (this.repairedRtpStreamId) {
                            return (0, rtp_1.serializeRepairedRtpStreamId)(this.repairedRtpStreamId);
                        }
                        return;
                    case rtp_1.RTP_EXTENSION_URI.transportWideCC:
                        this.dtlsTransport.transportSequenceNumber = (0, common_1.uint16Add)(this.dtlsTransport.transportSequenceNumber, 1);
                        return (0, rtp_1.serializeTransportWideCC)(this.dtlsTransport.transportSequenceNumber);
                    case rtp_1.RTP_EXTENSION_URI.absSendTime:
                        return (0, rtp_1.serializeAbsSendTime)(ntpTimestamp);
                }
            })();
            if (payload)
                return { id: extension.id, payload };
        })
            .filter((v) => v);
        for (const ext of originalHeaderExtensions) {
            const exist = header.extensions.find((v) => v.id === ext.id);
            if (exist) {
                exist.payload = ext.payload;
            }
            else {
                header.extensions.push(ext);
            }
        }
        header.extensions = header.extensions.sort((a, b) => a.id - b.id);
        this.ntpTimestamp = ntpTimestamp;
        this.rtpTimestamp = header.timestamp;
        this.octetCount += payload.length;
        this.headerBytesSent += header.serializeSize;
        this.packetCount = (0, common_1.uint32Add)(this.packetCount, 1);
        this.rtpCache[header.sequenceNumber % RTP_HISTORY_SIZE] = rtp;
        let rtpPayload = payload;
        if (this.redRedundantPayloadType) {
            this.redEncoder.push({
                block: rtpPayload,
                timestamp: header.timestamp,
                blockPT: this.redRedundantPayloadType,
            });
            const red = this.redEncoder.build();
            rtpPayload = red.serialize();
        }
        const size = await this.dtlsTransport.sendRtp(rtpPayload, header);
        this.runRtcp();
        const millitime = (0, utils_1.milliTime)();
        const sentInfo = {
            wideSeq: this.dtlsTransport.transportSequenceNumber,
            size,
            sendingAtMs: millitime,
            sentAtMs: millitime,
        };
        this.senderBWE.rtpPacketSent(sentInfo);
    }
    handleRtcpPacket(rtcpPacket) {
        switch (rtcpPacket.type) {
            case rtp_1.RtcpSrPacket.type:
            case rtp_1.RtcpRrPacket.type:
                {
                    const packet = rtcpPacket;
                    packet.reports
                        .filter((report) => report.ssrc === this.ssrc)
                        .forEach((report) => {
                        this.remotePacketsLost = report.packetsLost;
                        this.remoteFractionLost = report.fractionLost / 256;
                        if (this.lastSRtimestamp === report.lsr && report.dlsr) {
                            if (this.lastSentSRTimestamp) {
                                const rtt = (0, utils_1.timestampSeconds)() -
                                    this.lastSentSRTimestamp -
                                    report.dlsr / 65536;
                                this.totalRoundTripTime += rtt;
                                this.roundTripTimeMeasurements++;
                                if (this.rtt === undefined) {
                                    this.rtt = rtt;
                                }
                                else {
                                    this.rtt = RTT_ALPHA * this.rtt + (1 - RTT_ALPHA) * rtt;
                                }
                            }
                        }
                    });
                }
                break;
            case rtp_1.RtcpTransportLayerFeedback.type:
                {
                    const packet = rtcpPacket;
                    switch (packet.feedback.count) {
                        case rtp_1.TransportWideCC.count:
                            {
                                const feedback = packet.feedback;
                                this.senderBWE.receiveTWCC(feedback);
                            }
                            break;
                        case rtp_1.GenericNack.count:
                            {
                                const feedback = packet.feedback;
                                this.nackCount++;
                                feedback.lost.forEach(async (seqNum) => {
                                    let packet = this.rtpCache[seqNum % RTP_HISTORY_SIZE];
                                    if (packet && packet.header.sequenceNumber !== seqNum) {
                                        packet = undefined;
                                    }
                                    if (packet) {
                                        if (this.rtxPayloadType != undefined) {
                                            packet = (0, rtp_1.wrapRtx)(packet, this.rtxPayloadType, this.rtxSequenceNumber, this.rtxSsrc);
                                            this.rtxSequenceNumber = (0, common_1.uint16Add)(this.rtxSequenceNumber, 1);
                                        }
                                        this.retransmittedPacketsSent++;
                                        this.retransmittedBytesSent += packet.payload.length;
                                        this.headerBytesSent += packet.header.serializeSize;
                                        await this.dtlsTransport.sendRtp(packet.payload, packet.header);
                                    }
                                });
                                this.onGenericNack.execute(feedback);
                            }
                            break;
                    }
                }
                break;
            case rtp_1.RtcpPayloadSpecificFeedback.type:
                {
                    const packet = rtcpPacket;
                    switch (packet.feedback.count) {
                        case rtp_1.ReceiverEstimatedMaxBitrate.count:
                            {
                                const feedback = packet.feedback;
                                this.receiverEstimatedMaxBitrate = feedback.bitrate;
                            }
                            break;
                        case rtp_1.PictureLossIndication.count:
                            {
                                this.pliCount++;
                                this.onPictureLossIndication.execute();
                            }
                            break;
                    }
                }
                break;
        }
        this.onRtcp.execute(rtcpPacket);
    }
    // todo impl
    getParameters() {
        return {
            encodings: this.sendEncodings.map((encoding) => ({ ...encoding })),
        };
    }
    // todo impl
    setParameters(params) {
        if (params.encodings) {
            this.setSendEncodings(params.encodings);
        }
    }
    get outboundRtpStatsId() {
        return (0, stats_1.generateStatsId)("outbound-rtp", this.trackId);
    }
    get mediaSourceStatsId() {
        return (0, stats_1.generateStatsId)("media-source", this.trackId);
    }
    get remoteInboundRtpStatsId() {
        return (0, stats_1.generateStatsId)("remote-inbound-rtp", this.trackId);
    }
    getStatsRootIds() {
        return [this.outboundRtpStatsId];
    }
    collectStats(timestamp) {
        const stats = [];
        const transportId = this.dtlsTransport
            ? (0, stats_1.generateStatsId)("transport", this.dtlsTransport.id)
            : undefined;
        const codecId = this.codec && transportId
            ? (0, stats_1.generateCodecStatsId)(transportId, this.codec.payloadType, this.trackId)
            : undefined;
        // Outbound RTP stats
        const outboundRtpStats = {
            type: "outbound-rtp",
            id: this.outboundRtpStatsId,
            timestamp,
            ssrc: this.ssrc,
            kind: this.kind,
            transportId,
            codecId,
            mid: this.mid,
            packetsSent: this.packetCount,
            bytesSent: this.octetCount,
            headerBytesSent: this.headerBytesSent,
            retransmittedPacketsSent: this.retransmittedPacketsSent || undefined,
            retransmittedBytesSent: this.retransmittedBytesSent || undefined,
            rtxSsrc: this.rtxPayloadType ? this.rtxSsrc : undefined,
            mediaSourceId: this.track ? this.mediaSourceStatsId : undefined,
            remoteId: this.rtt !== undefined ||
                this.remotePacketsLost !== undefined ||
                this.remoteFractionLost !== undefined
                ? this.remoteInboundRtpStatsId
                : undefined,
            nackCount: this.nackCount || undefined,
            pliCount: this.pliCount || undefined,
            firCount: this.firCount || undefined,
        };
        stats.push(outboundRtpStats);
        // Media source stats
        if (this.track) {
            const mediaSourceStats = {
                type: "media-source",
                id: this.mediaSourceStatsId,
                timestamp,
                trackIdentifier: this.track.id ?? this.trackId,
                kind: this.kind,
            };
            stats.push(mediaSourceStats);
        }
        if (this.codec && transportId) {
            const codecStats = {
                type: "codec",
                id: codecId,
                timestamp,
                payloadType: this.codec.payloadType,
                transportId,
                mimeType: this.codec.mimeType,
                clockRate: this.codec.clockRate,
                channels: this.codec.channels,
                sdpFmtpLine: this.codec.parameters,
            };
            stats.push(codecStats);
        }
        // Remote inbound RTP stats (if we have RTT)
        if (this.rtt !== undefined ||
            this.remotePacketsLost !== undefined ||
            this.remoteFractionLost !== undefined) {
            const remoteInboundStats = {
                type: "remote-inbound-rtp",
                id: this.remoteInboundRtpStatsId,
                timestamp,
                ssrc: this.ssrc,
                kind: this.kind,
                transportId,
                codecId: outboundRtpStats.codecId,
                localId: outboundRtpStats.id,
                roundTripTime: this.rtt,
                totalRoundTripTime: this.totalRoundTripTime,
                roundTripTimeMeasurements: this.roundTripTimeMeasurements,
                packetsLost: this.remotePacketsLost,
                fractionLost: this.remoteFractionLost,
            };
            stats.push(remoteInboundStats);
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
}
exports.RTCRtpSender = RTCRtpSender;
//# sourceMappingURL=rtpSender.js.map