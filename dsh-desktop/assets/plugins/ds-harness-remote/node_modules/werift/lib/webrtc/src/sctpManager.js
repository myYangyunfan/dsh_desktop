"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SctpTransportManager = void 0;
const errors_1 = require("./errors");
const common_1 = require("./imports/common");
const dataChannel_1 = require("./dataChannel");
const stats_1 = require("./media/stats");
const sctp_1 = require("./transport/sctp");
const log = (0, common_1.debug)("werift:packages/webrtc/src/transport/sctpManager.ts");
class SctpTransportManager {
    constructor() {
        Object.defineProperty(this, "sctpTransport", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "sctpRemotePort", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "dataChannelsOpened", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "dataChannelsClosed", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "dataChannels", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        Object.defineProperty(this, "onDataChannel", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new common_1.Event()
        });
    }
    createSctpTransport(maxMessageSize) {
        const sctp = new sctp_1.RTCSctpTransport(5000, maxMessageSize);
        sctp.mid = undefined;
        sctp.onDataChannel.subscribe((channel) => {
            this.dataChannelsOpened++;
            this.dataChannels.push(channel);
            this.onDataChannel.execute(channel);
        });
        this.sctpTransport = sctp;
        return sctp;
    }
    createDataChannel(label, options = {}) {
        const maxPacketLifeTime = coerceUnsignedShortOption(options.maxPacketLifeTime, "maxPacketLifeTime");
        const maxRetransmits = coerceUnsignedShortOption(options.maxRetransmits, "maxRetransmits");
        const base = {
            protocol: "",
            ordered: true,
            negotiated: false,
        };
        const settings = {
            ...base,
            ...options,
            maxPacketLifeTime,
            maxRetransmits,
        };
        if (settings.maxPacketLifeTime != null && settings.maxRetransmits != null) {
            throw (0, errors_1.createWebRtcTypeError)("maxPacketLifeTime and maxRetransmits cannot both be set");
        }
        if (!this.sctpTransport) {
            this.sctpTransport = this.createSctpTransport();
        }
        const parameters = new dataChannel_1.RTCDataChannelParameters({
            id: settings.id,
            label,
            maxPacketLifeTime: settings.maxPacketLifeTime,
            maxRetransmits: settings.maxRetransmits,
            negotiated: settings.negotiated,
            ordered: settings.ordered,
            protocol: settings.protocol,
        });
        const channel = new dataChannel_1.RTCDataChannel(this.sctpTransport, parameters);
        this.dataChannelsOpened++;
        this.dataChannels.push(channel);
        channel.stateChange.subscribe((state) => {
            if (state === "closed") {
                this.dataChannelsClosed++;
                const index = this.dataChannels.indexOf(channel);
                if (index !== -1) {
                    this.dataChannels.splice(index, 1);
                }
            }
        });
        return channel;
    }
    async connectSctp() {
        if (!this.sctpTransport || !this.sctpRemotePort) {
            return;
        }
        await this.sctpTransport.start(this.sctpRemotePort);
        await this.sctpTransport.sctp.stateChanged.connected.asPromise();
        log("sctp connected");
    }
    setRemoteSCTP(remoteMedia, mLineIndex) {
        if (!this.sctpTransport) {
            return;
        }
        // # configure sctp
        this.sctpTransport.setRemoteMaxMessageSize(remoteMedia.sctpCapabilities?.maxMessageSize);
        this.sctpRemotePort = remoteMedia.sctpPort;
        if (!this.sctpRemotePort) {
            throw new Error("sctpRemotePort not exist");
        }
        this.sctpTransport.setRemotePort(this.sctpRemotePort);
        this.sctpTransport.mLineIndex = mLineIndex;
        if (!this.sctpTransport.mid) {
            this.sctpTransport.mid = remoteMedia.rtp.muxId;
        }
    }
    async close() {
        if (this.sctpTransport) {
            await this.sctpTransport.stop();
        }
        this.onDataChannel.allUnsubscribe();
    }
    async getStats(timestamp = (0, stats_1.getStatsTimestamp)()) {
        const stats = [];
        for (const channel of this.dataChannels) {
            const channelStats = {
                type: "data-channel",
                id: (0, stats_1.generateStatsId)("data-channel", channel.id ?? channel.statsId),
                timestamp,
                label: channel.label,
                protocol: channel.protocol,
                dataChannelIdentifier: channel.id ?? undefined,
                state: channel.readyState,
                messagesSent: channel.messagesSent || 0,
                bytesSent: channel.bytesSent || 0,
                messagesReceived: channel.messagesReceived || 0,
                bytesReceived: channel.bytesReceived || 0,
            };
            stats.push(channelStats);
        }
        return stats;
    }
}
exports.SctpTransportManager = SctpTransportManager;
function coerceUnsignedShortOption(value, name) {
    if (value === undefined) {
        return undefined;
    }
    const coerced = Number(value);
    if (!Number.isFinite(coerced) ||
        !Number.isInteger(coerced) ||
        coerced < 0 ||
        coerced > 65535) {
        throw (0, errors_1.createWebRtcTypeError)(`${name} must be an unsigned short`);
    }
    return coerced;
}
//# sourceMappingURL=sctpManager.js.map