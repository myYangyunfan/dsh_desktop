"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RTCSctpCapabilities = exports.RTCSctpTransport = exports.DEFAULT_MAX_MESSAGE_SIZE = void 0;
const crypto_1 = require("crypto");
const common_1 = require("../imports/common");
const src_1 = require("../../../sctp/src");
const const_1 = require("../const");
const dataChannel_1 = require("../dataChannel");
const log = (0, common_1.debug)("werift:packages/webrtc/src/transport/sctp.ts");
exports.DEFAULT_MAX_MESSAGE_SIZE = 65536;
class RTCSctpTransport {
    constructor(port = 5000, maxMessageSize = exports.DEFAULT_MAX_MESSAGE_SIZE) {
        Object.defineProperty(this, "port", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: port
        });
        Object.defineProperty(this, "maxMessageSize", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: maxMessageSize
        });
        Object.defineProperty(this, "dtlsTransport", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "sctp", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "onDataChannel", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new common_1.Event()
        });
        Object.defineProperty(this, "id", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: (0, crypto_1.randomUUID)().toString()
        });
        Object.defineProperty(this, "mid", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "mLineIndex", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "bundled", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        Object.defineProperty(this, "dataChannels", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: {}
        });
        Object.defineProperty(this, "remoteMaxMessageSize", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: exports.DEFAULT_MAX_MESSAGE_SIZE
        });
        Object.defineProperty(this, "dataChannelQueue", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        Object.defineProperty(this, "dataChannelId", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "eventDisposer", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        Object.defineProperty(this, "datachannelReceive", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: async (streamId, ppId, data) => {
                if (ppId === const_1.WEBRTC_DCEP && data.length > 0) {
                    log("DCEP", streamId, ppId, data);
                    switch (data[0]) {
                        case const_1.DATA_CHANNEL_OPEN:
                            {
                                if (data.length < 12) {
                                    log("DATA_CHANNEL_OPEN data.length not enough");
                                    return;
                                }
                                if (!Object.keys(this.dataChannels).includes(streamId.toString())) {
                                    // !BBHLHH — 12 byte DCEP OPEN header (big-endian)
                                    const channelType = data.readUInt8(1);
                                    const reliability = data.readUInt32BE(4);
                                    const labelLength = data.readUInt16BE(8);
                                    const protocolLength = data.readUInt16BE(10);
                                    let pos = 12;
                                    const label = data.slice(pos, pos + labelLength).toString("utf8");
                                    pos += labelLength;
                                    const protocol = data
                                        .slice(pos, pos + protocolLength)
                                        .toString("utf8");
                                    log("DATA_CHANNEL_OPEN", {
                                        channelType,
                                        reliability,
                                        streamId,
                                        label,
                                        protocol,
                                    });
                                    const maxRetransmits = (channelType & 0x03) === 1 ? reliability : undefined;
                                    const maxPacketLifeTime = (channelType & 0x03) === 2 ? reliability : undefined;
                                    // # register channel
                                    const parameters = new dataChannel_1.RTCDataChannelParameters({
                                        label,
                                        ordered: (channelType & 0x80) === 0,
                                        maxPacketLifeTime,
                                        maxRetransmits,
                                        protocol,
                                        id: streamId,
                                    });
                                    const channel = new dataChannel_1.RTCDataChannel(this, parameters, false);
                                    channel.isCreatedByRemote = true;
                                    this.dataChannels[streamId] = channel;
                                    this.onDataChannel.execute(channel);
                                    channel.setReadyState("open");
                                }
                                else {
                                    log("datachannel already opened", "retransmit ack");
                                }
                                const channel = this.dataChannels[streamId];
                                const ack = Buffer.allocUnsafe(1);
                                ack.writeUInt8(const_1.DATA_CHANNEL_ACK, 0);
                                this.dataChannelQueue.push([channel, const_1.WEBRTC_DCEP, ack]);
                                await this.dataChannelFlush();
                            }
                            break;
                        case const_1.DATA_CHANNEL_ACK:
                            {
                                log("DATA_CHANNEL_ACK", streamId, ppId);
                                const channel = this.dataChannels[streamId];
                                if (!channel) {
                                    throw new Error("channel not found");
                                }
                                channel.setReadyState("open");
                            }
                            break;
                    }
                }
                else {
                    const channel = this.dataChannels[streamId];
                    if (channel) {
                        const msg = (() => {
                            switch (ppId) {
                                case const_1.WEBRTC_STRING:
                                    return data.toString("utf8");
                                case const_1.WEBRTC_STRING_EMPTY:
                                    return "";
                                case const_1.WEBRTC_BINARY:
                                    return data;
                                case const_1.WEBRTC_BINARY_EMPTY:
                                    return Buffer.from([]);
                                default:
                                    throw new Error();
                            }
                        })();
                        // Update reception statistics
                        channel.messagesReceived++;
                        channel.bytesReceived += data.length;
                        channel.onMessage.execute(msg);
                        channel.emit("message", { data: msg });
                        if (channel.onmessage) {
                            channel.onmessage({ data: msg });
                        }
                    }
                }
            }
        });
        Object.defineProperty(this, "datachannelSend", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: (channel, data) => {
                const userData = Buffer.isBuffer(data) ? data : Buffer.from(data);
                const size = (0, dataChannel_1.getDataChannelMessageSize)(data);
                this.assertSendableMessageSize(size);
                channel.addBufferedAmount(size);
                this.dataChannelQueue.push(typeof data === "string"
                    ? [channel, const_1.WEBRTC_STRING, userData]
                    : [channel, const_1.WEBRTC_BINARY, userData]);
                if (this.sctp.associationState !== src_1.SCTP_STATE.ESTABLISHED) {
                    log("sctp not established", this.sctp.associationState);
                }
                this.dataChannelFlush();
                return size;
            }
        });
    }
    get transport() {
        return this.dtlsTransport;
    }
    setDtlsTransport(dtlsTransport) {
        if (this.dtlsTransport && this.dtlsTransport.id === dtlsTransport.id) {
            return;
        }
        this.eventDisposer.forEach((dispose) => dispose());
        this.dtlsTransport = dtlsTransport;
        this.sctp = new src_1.SCTP(new BridgeDtls(this.dtlsTransport), this.port);
        this.eventDisposer = [
            ...[
                this.sctp.onReceive.subscribe(this.datachannelReceive),
                this.sctp.onReconfigStreams.subscribe((ids) => {
                    ids.forEach((id) => {
                        const dc = this.dataChannels[id];
                        if (!dc)
                            return;
                        // todo fix
                        dc.setReadyState("closing");
                        dc.setReadyState("closed");
                        delete this.dataChannels[id];
                    });
                }),
                this.sctp.stateChanged.connected.subscribe(() => {
                    Object.values(this.dataChannels).forEach((channel) => {
                        if (channel.negotiated && channel.readyState !== "open") {
                            channel.setReadyState("open");
                        }
                    });
                    this.dataChannelFlush();
                }),
                this.sctp.stateChanged.closed.subscribe(() => {
                    Object.values(this.dataChannels).forEach((dc) => {
                        dc.setReadyState("closed");
                    });
                    this.dataChannels = {};
                }),
                this.dtlsTransport.onStateChange.subscribe((state) => {
                    if (state === "closed") {
                        this.sctp.setState(src_1.SCTP_STATE.CLOSED);
                    }
                }),
            ].map((e) => e.unSubscribe),
            () => (this.sctp.onSackReceived = async () => { }),
        ];
        this.sctp.onSackReceived = async () => {
            await this.dataChannelFlush();
        };
    }
    get isServer() {
        return this.dtlsTransport.iceTransport.role !== "controlling";
    }
    channelByLabel(label) {
        return Object.values(this.dataChannels).find((d) => d.label === label);
    }
    dataChannelAddNegotiated(channel) {
        if (channel.id == undefined) {
            throw new Error();
        }
        if (this.dataChannels[channel.id]) {
            throw new Error();
        }
        this.dataChannels[channel.id] = channel;
        if (this.sctp.associationState === src_1.SCTP_STATE.ESTABLISHED) {
            channel.setReadyState("open");
        }
    }
    dataChannelOpen(channel) {
        if (channel.id !== undefined) {
            if (this.dataChannels[channel.id])
                throw new Error(`Data channel with ID ${channel.id} already registered`);
            this.dataChannels[channel.id] = channel;
        }
        let channelType = const_1.DATA_CHANNEL_RELIABLE;
        const priority = 0;
        let reliability = 0;
        if (!channel.ordered) {
            channelType = 0x80;
        }
        if (channel.maxRetransmits !== null) {
            channelType = 1;
            reliability = channel.maxRetransmits;
        }
        else if (channel.maxPacketLifeTime !== null) {
            channelType = 2;
            reliability = channel.maxPacketLifeTime;
        }
        // 5.1.  DATA_CHANNEL_OPEN Message
        // !BBHLHH — message type / channel type / priority / reliability / label len / protocol len
        const data = Buffer.allocUnsafe(12);
        data.writeUInt8(const_1.DATA_CHANNEL_OPEN, 0);
        data.writeUInt8(channelType, 1);
        data.writeUInt16BE(priority, 2);
        data.writeUInt32BE(reliability, 4);
        data.writeUInt16BE(channel.label.length, 8);
        data.writeUInt16BE(channel.protocol.length, 10);
        const send = Buffer.concat([
            data,
            Buffer.from(channel.label, "utf8"),
            Buffer.from(channel.protocol, "utf8"),
        ]);
        this.dataChannelQueue.push([channel, const_1.WEBRTC_DCEP, send]);
        this.dataChannelFlush();
    }
    async dataChannelFlush() {
        // """
        // Try to flush buffered data to the SCTP layer.
        // We wait until the association is established, as we need to know
        // whether we are a client or a server to correctly assign an odd/even ID
        // to the data channels.
        // """
        if (this.sctp.associationState != src_1.SCTP_STATE.ESTABLISHED)
            return;
        while (this.dataChannelQueue.length > 0) {
            const [channel, protocol, userData] = this.dataChannelQueue.shift();
            let streamId = channel.id;
            if (streamId === undefined) {
                streamId = this.dataChannelId;
                while (Object.keys(this.dataChannels).includes(streamId.toString())) {
                    streamId += 2;
                }
                this.dataChannels[streamId] = channel;
                channel.setId(streamId);
            }
            if (protocol === const_1.WEBRTC_DCEP) {
                await this.sctp.send(streamId, protocol, userData, {
                    ordered: true,
                });
            }
            else {
                const expiry = channel.maxPacketLifeTime !== null
                    ? Date.now() + channel.maxPacketLifeTime / 1000
                    : undefined;
                await this.sctp.send(streamId, protocol, userData, {
                    expiry,
                    maxRetransmits: channel.maxRetransmits ?? undefined,
                    ordered: channel.ordered,
                });
                channel.addBufferedAmount(-userData.length);
            }
        }
        // Resetting the queue to empty array mitigates this.
        this.dataChannelQueue = [];
    }
    assertSendableMessageSize(size) {
        if (this.remoteMaxMessageSize !== 0 && size > this.remoteMaxMessageSize) {
            throw new Error(`max-message-size exceeded: ${size} > ${this.remoteMaxMessageSize}`);
        }
    }
    getCapabilities() {
        return RTCSctpTransport.getCapabilities(this.maxMessageSize);
    }
    static getCapabilities(maxMessageSize = exports.DEFAULT_MAX_MESSAGE_SIZE) {
        return new RTCSctpCapabilities(maxMessageSize);
    }
    setRemoteMaxMessageSize(maxMessageSize) {
        this.remoteMaxMessageSize = maxMessageSize ?? exports.DEFAULT_MAX_MESSAGE_SIZE;
    }
    setRemotePort(port) {
        this.sctp.setRemotePort(port);
    }
    async start(remotePort) {
        if (this.isServer) {
            this.dataChannelId = 0;
        }
        else {
            this.dataChannelId = 1;
        }
        this.sctp.isServer = this.isServer;
        await this.sctp.start(remotePort);
    }
    async stop() {
        this.dtlsTransport.dataReceiver = () => { };
        await this.sctp.stop();
    }
    dataChannelClose(channel) {
        if (!["closing", "closed"].includes(channel.readyState)) {
            channel.setReadyState("closing");
            if (this.sctp.associationState === src_1.SCTP_STATE.ESTABLISHED) {
                // Check if channel.id is already in reconfigQueue to prevent duplicates
                if (!this.sctp.reconfigQueue.includes(channel.id)) {
                    this.sctp.reconfigQueue.push(channel.id);
                }
                if (this.sctp.reconfigQueue.length === 1) {
                    this.sctp.transmitReconfigRequest();
                }
            }
            else {
                this.dataChannelQueue = this.dataChannelQueue.filter((queueItem) => queueItem[0].id !== channel.id);
                // Remove any pending reconfiguration requests for this channel
                this.sctp.reconfigQueue = this.sctp.reconfigQueue.filter((streamId) => streamId !== channel.id);
                if (channel.id !== undefined) {
                    delete this.dataChannels[channel.id];
                }
                channel.setReadyState("closed");
            }
        }
    }
}
exports.RTCSctpTransport = RTCSctpTransport;
class RTCSctpCapabilities {
    constructor(maxMessageSize) {
        Object.defineProperty(this, "maxMessageSize", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: maxMessageSize
        });
    }
}
exports.RTCSctpCapabilities = RTCSctpCapabilities;
class BridgeDtls {
    constructor(dtls) {
        Object.defineProperty(this, "dtls", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: dtls
        });
        Object.defineProperty(this, "send", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: (data) => {
                return this.dtls.sendData(data);
            }
        });
    }
    set onData(onData) {
        this.dtls.dataReceiver = onData;
    }
    close() { }
}
//# sourceMappingURL=sctp.js.map