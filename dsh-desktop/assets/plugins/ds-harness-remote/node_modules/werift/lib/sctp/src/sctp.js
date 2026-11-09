"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RTCSctpCapabilities = exports.InboundStream = exports.SCTP = void 0;
const crypto_1 = require("crypto");
const chunk_1 = require("./chunk");
const const_1 = require("./const");
const helper_1 = require("./helper");
const common_1 = require("./imports/common");
const param_1 = require("./param");
const log = (0, common_1.debug)("werift/sctp/sctp");
// SSN: Stream Sequence Number
// # local constants
const COOKIE_LENGTH = 24;
const COOKIE_LIFETIME = 60;
const MAX_STREAMS = 65535;
const USERDATA_MAX_LENGTH = 1200;
// # protocol constants
const SCTP_DATA_LAST_FRAG = 0x01;
const SCTP_DATA_FIRST_FRAG = 0x02;
const SCTP_DATA_UNORDERED = 0x04;
const SCTP_MAX_ASSOCIATION_RETRANS = 10;
const SCTP_MAX_INIT_RETRANS = 8;
const SCTP_RTO_ALPHA = 1 / 8;
const SCTP_RTO_BETA = 1 / 4;
// RFC 9260 RTO.Initial/RTO.Min/RTO.Max defaults and bounds are in seconds.
const SCTP_RTO_INITIAL = 3;
const SCTP_RTO_MIN = 1;
const SCTP_RTO_MAX = 60;
const SCTP_TSN_MODULO = 2 ** 32;
// RFC 9260 delayed ACK guidance: send SACK within 200ms at the latest.
// Use a small default delay to keep request/response latency low while still delaying ACKs.
const SCTP_SACK_DELAY_MS = 200;
// RFC 9260 HB.interval recommended default is 30 seconds.
const SCTP_HEARTBEAT_INTERVAL = 30;
const RECONFIG_MAX_STREAMS = 135;
// # parameters
const SCTP_STATE_COOKIE = 0x0007;
const SCTP_SUPPORTED_CHUNK_EXT = 0x8008; //32778
const SCTP_PRSCTP_SUPPORTED = 0xc000; //49152
const SCTPConnectionStates = [
    "new",
    "closed",
    "connected",
    "connecting",
];
class SCTP {
    get peerRwnd() {
        // RFC 9260 §6.2.1(D-ii): available receiver window = a_rwnd - outstanding DATA.
        return Math.max(0, this.peerAdvertisedRwnd - this.flightSize);
    }
    constructor(transport, port = 5000) {
        Object.defineProperty(this, "transport", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: transport
        });
        Object.defineProperty(this, "port", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: port
        });
        Object.defineProperty(this, "flush", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new common_1.Event()
        });
        Object.defineProperty(this, "stateChanged", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: (0, helper_1.createEventsFromList)(SCTPConnectionStates)
        });
        Object.defineProperty(this, "onReconfigStreams", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new common_1.Event()
        });
        /**streamId: number, ppId: number, data: Buffer */
        Object.defineProperty(this, "onReceive", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new common_1.Event()
        });
        Object.defineProperty(this, "onSackReceived", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: async () => { }
        });
        Object.defineProperty(this, "associationState", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: const_1.SCTP_STATE.CLOSED
        });
        Object.defineProperty(this, "started", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        Object.defineProperty(this, "state", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: "new"
        });
        Object.defineProperty(this, "isServer", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: true
        });
        Object.defineProperty(this, "isStopping", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        Object.defineProperty(this, "isClosed", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        Object.defineProperty(this, "hmacKey", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: (0, crypto_1.randomBytes)(16)
        });
        Object.defineProperty(this, "localPartialReliability", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: true
        });
        Object.defineProperty(this, "localPort", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "localVerificationTag", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: (0, common_1.random32)()
        });
        Object.defineProperty(this, "remoteExtensions", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        Object.defineProperty(this, "remotePartialReliability", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: true
        });
        Object.defineProperty(this, "remotePort", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "remoteVerificationTag", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        // inbound
        Object.defineProperty(this, "advertisedRwnd", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 1024 * 1024
        }); // Receiver Window
        Object.defineProperty(this, "peerAdvertisedRwnd", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: this.advertisedRwnd
        });
        Object.defineProperty(this, "inboundStreams", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: {}
        });
        Object.defineProperty(this, "_inboundStreamsCount", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "_inboundStreamsMax", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: MAX_STREAMS
        });
        Object.defineProperty(this, "lastReceivedTsn", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        }); // Transmission Sequence Number
        Object.defineProperty(this, "sackDuplicates", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        Object.defineProperty(this, "sackMisOrdered", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Set()
        });
        Object.defineProperty(this, "sackNeeded", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        Object.defineProperty(this, "sackPacketCount", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "sackHasNewDataInPacket", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        Object.defineProperty(this, "sackImmediate", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        Object.defineProperty(this, "sackTimeout", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        // # outbound
        Object.defineProperty(this, "cwnd", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 3 * USERDATA_MAX_LENGTH
        }); // Congestion Window
        Object.defineProperty(this, "fastRecoveryExit", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "fastRecoveryTransmit", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        Object.defineProperty(this, "forwardTsnChunk", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "flightSize", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "outboundQueue", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        Object.defineProperty(this, "outboundStreamSeq", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: {}
        });
        Object.defineProperty(this, "_outboundStreamsCount", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: MAX_STREAMS
        });
        /**local transmission sequence number */
        Object.defineProperty(this, "localTsn", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: Number((0, common_1.random32)())
        });
        Object.defineProperty(this, "lastSackedTsn", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: tsnMinusOne(this.localTsn)
        });
        Object.defineProperty(this, "advancedPeerAckTsn", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: tsnMinusOne(this.localTsn)
        }); // acknowledgement
        Object.defineProperty(this, "partialBytesAcked", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "sentQueue", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        Object.defineProperty(this, "transmitting", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        Object.defineProperty(this, "transmitRequested", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        // # reconfiguration
        /**初期TSNと同じ値に初期化される単調に増加する数です. これは、新しいre-configuration requestパラメーターを送信するたびに1ずつ増加します */
        Object.defineProperty(this, "reconfigRequestSeq", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: this.localTsn
        });
        /**このフィールドは、incoming要求のre-configuration requestシーケンス番号を保持します. 他の場合では、次に予想されるre-configuration requestシーケンス番号から1を引いた値が保持されます */
        Object.defineProperty(this, "reconfigResponseSeq", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "reconfigRequest", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "reconfigQueue", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        // rtt calculation
        Object.defineProperty(this, "srtt", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "rttvar", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        // timers
        Object.defineProperty(this, "rto", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: SCTP_RTO_INITIAL
        });
        /**t1 is wait for initAck or cookieAck */
        Object.defineProperty(this, "timer1Handle", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "timer1Chunk", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "timer1Failures", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        /**t2 is wait for shutdown */
        Object.defineProperty(this, "timer2Handle", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "timer2Chunk", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "timer2Failures", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        /**t3 is wait for data sack */
        Object.defineProperty(this, "timer3Handle", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        /**Re-configuration Timer */
        Object.defineProperty(this, "timerReconfigHandle", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "timerReconfigFailures", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "timerHeartbeatHandle", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "heartbeatInterval", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: SCTP_HEARTBEAT_INTERVAL
        });
        // etc
        Object.defineProperty(this, "ssthresh", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        }); // slow start threshold
        Object.defineProperty(this, "send", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: async (streamId, ppId, userData, { expiry, maxRetransmits, ordered, } = { expiry: undefined, maxRetransmits: undefined, ordered: true }) => {
                const streamSeqNum = ordered ? this.outboundStreamSeq[streamId] || 0 : 0;
                const fragments = Math.ceil(userData.length / USERDATA_MAX_LENGTH);
                let pos = 0;
                const chunks = [];
                for (let fragment = 0; fragment < fragments; fragment++) {
                    const chunk = new chunk_1.DataChunk(0, undefined);
                    chunk.flags = 0;
                    if (!ordered) {
                        chunk.flags = SCTP_DATA_UNORDERED;
                    }
                    if (fragment === 0) {
                        chunk.flags |= SCTP_DATA_FIRST_FRAG;
                    }
                    if (fragment === fragments - 1) {
                        chunk.flags |= SCTP_DATA_LAST_FRAG;
                    }
                    chunk.tsn = this.localTsn;
                    chunk.streamId = streamId;
                    chunk.streamSeqNum = streamSeqNum;
                    chunk.protocol = ppId;
                    chunk.userData = userData.slice(pos, pos + USERDATA_MAX_LENGTH);
                    chunk.bookSize = chunk.userData.length;
                    chunk.expiry = expiry;
                    chunk.maxRetransmits = maxRetransmits;
                    pos += USERDATA_MAX_LENGTH;
                    this.localTsn = tsnPlusOne(this.localTsn);
                    chunks.push(chunk);
                }
                chunks.forEach((chunk) => {
                    this.outboundQueue.push(chunk);
                });
                if (ordered) {
                    this.outboundStreamSeq[streamId] = (0, common_1.uint16Add)(streamSeqNum, 1);
                }
                await this.transmit();
                while (this.outboundQueue.length) {
                    await this.flush.asPromise();
                }
            }
        });
        Object.defineProperty(this, "timer1Expired", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: () => {
                if (this.isStopped)
                    return;
                this.timer1Failures++;
                this.timer1Handle = undefined;
                if (this.timer1Failures > SCTP_MAX_INIT_RETRANS) {
                    this.setState(const_1.SCTP_STATE.CLOSED);
                }
                else {
                    setImmediate(() => {
                        if (this.isStopped)
                            return;
                        this.sendChunk(this.timer1Chunk).catch((err) => {
                            log("send timer1 chunk failed", err.message);
                        });
                    });
                    if (this.isStopped)
                        return;
                    this.timer1Handle = setTimeout(this.timer1Expired, this.rto * 1000);
                }
            }
        });
        Object.defineProperty(this, "timer2Expired", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: () => {
                if (this.isStopped)
                    return;
                this.timer2Failures++;
                this.timer2Handle = undefined;
                if (this.timer2Failures > SCTP_MAX_ASSOCIATION_RETRANS) {
                    this.setState(const_1.SCTP_STATE.CLOSED);
                }
                else {
                    setImmediate(() => {
                        if (this.isStopped)
                            return;
                        this.sendChunk(this.timer2Chunk).catch((err) => {
                            log("send timer2Chunk failed", err.message);
                        });
                    });
                    if (this.isStopped)
                        return;
                    this.timer2Handle = setTimeout(this.timer2Expired, this.rto * 1000);
                }
            }
        });
        Object.defineProperty(this, "timer3Expired", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: () => {
                if (this.isStopped)
                    return;
                this.timer3Handle = undefined;
                // # mark retransmit or abandoned chunks
                this.sentQueue.forEach((chunk) => {
                    if (!this.maybeAbandon(chunk)) {
                        chunk.retransmit = true;
                    }
                });
                this.updateAdvancedPeerAckPoint();
                // # adjust congestion window
                this.fastRecoveryExit = undefined;
                this.flightSize = 0;
                this.partialBytesAcked = 0;
                this.ssthresh = Math.max(Math.floor(this.cwnd / 2), 4 * USERDATA_MAX_LENGTH);
                this.cwnd = USERDATA_MAX_LENGTH;
                this.transmit();
            }
        });
        Object.defineProperty(this, "timerReconfigHandleExpired", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: async () => {
                if (this.isStopped)
                    return;
                this.timerReconfigFailures++;
                // back off
                this.rto = Math.ceil(this.rto * 1.5);
                if (this.timerReconfigFailures > SCTP_MAX_ASSOCIATION_RETRANS) {
                    log("timerReconfigFailures", this.timerReconfigFailures);
                    this.setState(const_1.SCTP_STATE.CLOSED);
                    this.timerReconfigHandle = undefined;
                }
                else if (this.reconfigRequest) {
                    log("timerReconfigHandleExpired", this.timerReconfigFailures, this.rto);
                    await this.sendReconfigParam(this.reconfigRequest);
                    if (this.isStopped)
                        return;
                    this.timerReconfigHandle = setTimeout(this.timerReconfigHandleExpired, this.rto * 1000);
                }
            }
        });
        Object.defineProperty(this, "timerHeartbeatExpired", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: async () => {
                this.timerHeartbeatHandle = undefined;
                if (this.associationState !== const_1.SCTP_STATE.ESTABLISHED)
                    return;
                if (this.flightSize === 0 && this.outboundQueue.length === 0) {
                    const heartbeat = new chunk_1.HeartbeatChunk();
                    const heartbeatTime = Buffer.allocUnsafe(4);
                    heartbeatTime.writeUInt32BE(Math.floor(Date.now() / 1000), 0);
                    heartbeat.params.push([1, heartbeatTime]);
                    await this.sendChunk(heartbeat).catch((err) => {
                        log("send heartbeat failed", err.message);
                    });
                }
                this.heartbeatStart();
            }
        });
        this.localPort = this.port;
        this.transport.onData = (buf) => {
            this.handleData(buf);
        };
    }
    get isStopped() {
        return this.isStopping || this.isClosed;
    }
    get maxChannels() {
        if (this._inboundStreamsCount > 0) {
            return Math.min(this._inboundStreamsCount, this._outboundStreamsCount);
        }
        return undefined;
    }
    static client(transport, port = 5000) {
        const sctp = new SCTP(transport, port);
        sctp.isServer = false;
        return sctp;
    }
    static server(transport, port = 5000) {
        const sctp = new SCTP(transport, port);
        sctp.isServer = true;
        return sctp;
    }
    // call from dtls transport
    async handleData(data) {
        if (this.isStopped)
            return;
        let expectedTag;
        const [, , verificationTag, chunks] = (0, chunk_1.parsePacket)(data);
        const initChunk = chunks.filter((v) => v.type === chunk_1.InitChunk.type).length;
        if (initChunk > 0) {
            if (chunks.length != 1) {
                throw new Error();
            }
            expectedTag = 0;
        }
        else {
            expectedTag = this.localVerificationTag;
        }
        if (verificationTag !== expectedTag) {
            return;
        }
        this.sackHasNewDataInPacket = false;
        for (const chunk of chunks) {
            await this.receiveChunk(chunk);
        }
        if (this.sackNeeded) {
            // RFC 9260 delayed ACK guidance is per packet ("every second packet").
            if (this.sackHasNewDataInPacket) {
                this.sackPacketCount++;
            }
            if (this.sackPacketCount >= 2) {
                this.sackImmediate = true;
            }
            await this.scheduleSack();
        }
    }
    async scheduleSack() {
        if (this.isStopped)
            return;
        if (!this.sackNeeded)
            return;
        if (this.sackImmediate) {
            if (this.sackTimeout) {
                clearTimeout(this.sackTimeout);
                this.sackTimeout = undefined;
            }
            await this.sendSack();
            return;
        }
        if (this.sackTimeout)
            return;
        // RFC 9260 delayed ACK path: defer SACK, but never beyond 200ms.
        this.sackTimeout = setTimeout(() => {
            this.sackTimeout = undefined;
            this.sendSack().catch((err) => {
                log("send delayed sack failed", err.message);
            });
        }, SCTP_SACK_DELAY_MS);
    }
    async sendSack() {
        if (this.isStopped)
            return;
        if (!this.sackNeeded)
            return;
        const gaps = [];
        let gapNext;
        [...this.sackMisOrdered].sort().forEach((tsn) => {
            const pos = (tsn - this.lastReceivedTsn) % SCTP_TSN_MODULO;
            if (tsn === gapNext) {
                gaps[gaps.length - 1][1] = pos;
            }
            else {
                gaps.push([pos, pos]);
            }
            gapNext = tsnPlusOne(tsn);
        });
        const sack = new chunk_1.SackChunk(0, undefined);
        sack.cumulativeTsn = this.lastReceivedTsn;
        sack.advertisedRwnd = Math.max(0, this.advertisedRwnd);
        sack.duplicates = [...this.sackDuplicates];
        sack.gaps = gaps;
        await this.sendChunk(sack).catch((err) => {
            log("send sack failed", err.message);
        });
        this.sackDuplicates = [];
        this.sackNeeded = false;
        this.sackPacketCount = 0;
        this.sackImmediate = false;
    }
    async receiveChunk(chunk) {
        switch (chunk.type) {
            case chunk_1.DataChunk.type:
                {
                    this.receiveDataChunk(chunk);
                }
                break;
            case chunk_1.InitChunk.type:
                {
                    if (!this.isServer)
                        return;
                    const init = chunk;
                    log("receive init", init);
                    this.lastReceivedTsn = tsnMinusOne(init.initialTsn);
                    this.reconfigResponseSeq = tsnMinusOne(init.initialTsn);
                    this.remoteVerificationTag = init.initiateTag;
                    this.ssthresh = init.advertisedRwnd;
                    this.peerAdvertisedRwnd = init.advertisedRwnd;
                    this.getExtensions(init.params);
                    this._inboundStreamsCount = Math.min(init.outboundStreams, this._inboundStreamsMax);
                    this._outboundStreamsCount = Math.min(this._outboundStreamsCount, init.inboundStreams);
                    const ack = new chunk_1.InitAckChunk();
                    ack.initiateTag = this.localVerificationTag;
                    ack.advertisedRwnd = this.advertisedRwnd;
                    ack.outboundStreams = this._outboundStreamsCount;
                    ack.inboundStreams = this._inboundStreamsCount;
                    ack.initialTsn = this.localTsn;
                    this.setExtensions(ack.params);
                    // cookie timestamp は秒単位の整数 (小数を混入させない)
                    const time = Math.floor(Date.now() / 1000);
                    const cookieTime = Buffer.allocUnsafe(4);
                    cookieTime.writeUInt32BE(time, 0);
                    let cookie = cookieTime;
                    cookie = Buffer.concat([
                        cookie,
                        (0, crypto_1.createHmac)("sha1", this.hmacKey).update(cookie).digest(),
                    ]);
                    ack.params.push([SCTP_STATE_COOKIE, cookie]);
                    log("send initAck", ack);
                    await this.sendChunk(ack).catch((err) => {
                        log("send initAck failed", err.message);
                    });
                }
                break;
            case chunk_1.InitAckChunk.type:
                {
                    if (this.associationState != const_1.SCTP_STATE.COOKIE_WAIT)
                        return;
                    const initAck = chunk;
                    this.timer1Cancel();
                    this.lastReceivedTsn = tsnMinusOne(initAck.initialTsn);
                    this.reconfigResponseSeq = tsnMinusOne(initAck.initialTsn);
                    this.remoteVerificationTag = initAck.initiateTag;
                    this.ssthresh = initAck.advertisedRwnd;
                    this.peerAdvertisedRwnd = initAck.advertisedRwnd;
                    this.getExtensions(initAck.params);
                    this._inboundStreamsCount = Math.min(initAck.outboundStreams, this._inboundStreamsMax);
                    this._outboundStreamsCount = Math.min(this._outboundStreamsCount, initAck.inboundStreams);
                    const echo = new chunk_1.CookieEchoChunk();
                    for (const [k, v] of initAck.params) {
                        if (k === SCTP_STATE_COOKIE) {
                            echo.body = v;
                            break;
                        }
                    }
                    await this.sendChunk(echo).catch((err) => {
                        log("send echo failed", err.message);
                    });
                    this.timer1Start(echo);
                    this.setState(const_1.SCTP_STATE.COOKIE_ECHOED);
                }
                break;
            case chunk_1.SackChunk.type:
                {
                    await this.receiveSackChunk(chunk);
                }
                break;
            case chunk_1.HeartbeatChunk.type:
                {
                    const ack = new chunk_1.HeartbeatAckChunk();
                    ack.params = chunk.params;
                    await this.sendChunk(ack).catch((err) => {
                        log("send heartbeat ack failed", err.message);
                    });
                }
                break;
            case chunk_1.AbortChunk.type:
                {
                    this.setState(const_1.SCTP_STATE.CLOSED);
                }
                break;
            case chunk_1.ShutdownChunk.type:
                {
                    this.timer2Cancel();
                    this.setState(const_1.SCTP_STATE.SHUTDOWN_RECEIVED);
                    const ack = new chunk_1.ShutdownAckChunk();
                    await this.sendChunk(ack).catch((err) => {
                        log("send shutdown ack failed", err.message);
                    });
                    this.t2Start(ack);
                    this.setState(const_1.SCTP_STATE.SHUTDOWN_SENT);
                }
                break;
            case chunk_1.ErrorChunk.type:
                {
                    // 3.3.10.  Operation Error (ERROR) (9)
                    // An Operation Error is not considered fatal in and of itself, but may be
                    // used with an ABORT chunk to report a fatal condition.  It has the
                    // following parameters:
                    log("ErrorChunk", chunk.descriptions);
                }
                break;
            case chunk_1.CookieEchoChunk.type:
                {
                    if (!this.isServer)
                        return;
                    const data = chunk;
                    const cookie = data.body;
                    const digest = (0, crypto_1.createHmac)("sha1", this.hmacKey)
                        .update(cookie.slice(0, 4))
                        .digest();
                    if (cookie?.length != COOKIE_LENGTH ||
                        !cookie.slice(4).equals(digest)) {
                        log("x State cookie is invalid");
                        return;
                    }
                    const now = Math.floor(Date.now() / 1000);
                    const stamp = cookie.readUInt32BE(0);
                    if (stamp < now - COOKIE_LIFETIME || stamp > now) {
                        const error = new chunk_1.ErrorChunk(0, undefined);
                        error.params.push([
                            chunk_1.ErrorChunk.CODE.StaleCookieError,
                            Buffer.concat([...Array(8)].map(() => Buffer.from("\x00"))),
                        ]);
                        await this.sendChunk(error).catch((err) => {
                            log("send errorChunk failed", err.message);
                        });
                        return;
                    }
                    const ack = new chunk_1.CookieAckChunk();
                    await this.sendChunk(ack).catch((err) => {
                        log("send cookieAck failed", err.message);
                    });
                    this.setState(const_1.SCTP_STATE.ESTABLISHED);
                }
                break;
            case chunk_1.CookieAckChunk.type:
                {
                    if (this.associationState != const_1.SCTP_STATE.COOKIE_ECHOED)
                        return;
                    this.timer1Cancel();
                    this.setState(const_1.SCTP_STATE.ESTABLISHED);
                }
                break;
            case chunk_1.ShutdownCompleteChunk.type:
                {
                    if (this.associationState != const_1.SCTP_STATE.SHUTDOWN_ACK_SENT)
                        return;
                    this.timer2Cancel();
                    this.setState(const_1.SCTP_STATE.CLOSED);
                }
                break;
            // extensions
            case chunk_1.ReconfigChunk.type:
                {
                    if (this.associationState != const_1.SCTP_STATE.ESTABLISHED)
                        return;
                    const reconfig = chunk;
                    for (const [type, body] of reconfig.params) {
                        const target = param_1.RECONFIG_PARAM_BY_TYPES[type];
                        if (target) {
                            await this.receiveReconfigParam(target.parse(body));
                        }
                    }
                }
                break;
            case chunk_1.ForwardTsnChunk.type:
                {
                    this.receiveForwardTsnChunk(chunk);
                }
                break;
        }
    }
    getExtensions(params) {
        for (const [k, v] of params) {
            if (k === SCTP_PRSCTP_SUPPORTED) {
                this.remotePartialReliability = true;
            }
            else if (k === SCTP_SUPPORTED_CHUNK_EXT) {
                this.remoteExtensions = [...v];
            }
        }
    }
    async receiveReconfigParam(param) {
        log("receiveReconfigParam", param_1.RECONFIG_PARAM_BY_TYPES[param.type]);
        switch (param.type) {
            case param_1.OutgoingSSNResetRequestParam.type:
                {
                    const p = param;
                    // # send response
                    const response = new param_1.ReconfigResponseParam(p.requestSequence, param_1.reconfigResult.ReconfigResultSuccessPerformed);
                    this.reconfigResponseSeq = p.requestSequence;
                    await this.sendReconfigParam(response);
                    // # mark closed inbound streams
                    await Promise.all(p.streams.map(async (streamId) => {
                        delete this.inboundStreams[streamId];
                        if (this.outboundStreamSeq[streamId]) {
                            // Only add to reconfigQueue if not already present
                            if (!this.reconfigQueue.includes(streamId)) {
                                this.reconfigQueue.push(streamId);
                            }
                            // await this.sendResetRequest(streamId);
                        }
                    }));
                    await this.transmitReconfigRequest();
                    // # close data channel
                    this.onReconfigStreams.execute(p.streams);
                }
                break;
            case param_1.ReconfigResponseParam.type:
                {
                    const reset = param;
                    if (reset.result !== param_1.reconfigResult.ReconfigResultSuccessPerformed) {
                        log("OutgoingSSNResetRequestParam failed", Object.keys(param_1.reconfigResult).find((key) => param_1.reconfigResult[key] === reset.result));
                    }
                    else if (reset.responseSequence === this.reconfigRequest?.requestSequence) {
                        const streamIds = this.reconfigRequest.streams.map((streamId) => {
                            delete this.outboundStreamSeq[streamId];
                            return streamId;
                        });
                        this.onReconfigStreams.execute(streamIds);
                        this.reconfigRequest = undefined;
                        this.timerReconfigCancel();
                        // Reset RTO backoff on successful reconfiguration
                        this.rto = SCTP_RTO_INITIAL;
                        this.timerReconfigFailures = 0;
                        if (this.reconfigQueue.length > 0) {
                            await this.transmitReconfigRequest();
                        }
                    }
                }
                break;
            case param_1.StreamAddOutgoingParam.type:
                {
                    const add = param;
                    this._inboundStreamsCount += add.newStreams;
                    const res = new param_1.ReconfigResponseParam(add.requestSequence, 1);
                    this.reconfigResponseSeq = add.requestSequence;
                    await this.sendReconfigParam(res);
                }
                break;
        }
    }
    receiveDataChunk(chunk) {
        this.sackNeeded = true;
        if (this.markReceived(chunk.tsn)) {
            this.sackImmediate = true;
            return;
        }
        this.sackHasNewDataInPacket = true;
        // RFC 9260 delayed ACK is optional; prefer immediate DATA ACK to keep ACK-clock responsive.
        this.sackImmediate = true;
        if ((chunk.flags & SCTP_DATA_LAST_FRAG) === 0) {
            // Keep fragmented-message feedback prompt to avoid long tail-loss recovery.
            this.sackImmediate = true;
        }
        if (this.sackMisOrdered.size > 0) {
            // RFC 9260 permits immediate SACK on gap/loss indicators.
            this.sackImmediate = true;
        }
        const inboundStream = this.getInboundStream(chunk.streamId);
        inboundStream.addChunk(chunk);
        this.advertisedRwnd -= chunk.userData.length;
        for (const message of inboundStream.popMessages()) {
            this.advertisedRwnd += message[2].length;
            this.receive(...message);
        }
    }
    async receiveSackChunk(chunk) {
        // """
        // Handle a SACK chunk.
        // """
        if ((0, common_1.uint32Gt)(this.lastSackedTsn, chunk.cumulativeTsn))
            return;
        const receivedTime = Date.now() / 1000;
        this.lastSackedTsn = chunk.cumulativeTsn;
        const cwndFullyUtilized = this.flightSize >= this.cwnd;
        let done = 0, doneBytes = 0;
        // # handle acknowledged data
        while (this.sentQueue.length > 0 &&
            (0, common_1.uint32Gte)(this.lastSackedTsn, this.sentQueue[0].tsn)) {
            const sChunk = this.sentQueue.shift();
            done++;
            if (!sChunk?.acked) {
                doneBytes += sChunk.bookSize;
                this.flightSizeDecrease(sChunk);
            }
            if (done === 1 && sChunk.sentCount === 1) {
                this.updateRto(receivedTime - sChunk.sentTime);
            }
        }
        // Furthermore, this exposed an issue I've seen in v8 in other projects: using an array as a queue seems to result in long calls to shift (it does an array copy under the hood?). The problem seems to get worse the more times it shifts. Resetting the queue to empty array mitigates this.
        if (!this.sentQueue.length) {
            this.sentQueue = [];
        }
        // # handle gap blocks
        let loss = false;
        if (chunk.gaps.length > 0) {
            const seen = new Set();
            let highestSeenTsn;
            chunk.gaps.forEach((gap) => {
                for (let pos = gap[0]; pos < gap[1] + 1; pos++) {
                    highestSeenTsn = (chunk.cumulativeTsn + pos) % SCTP_TSN_MODULO;
                    seen.add(highestSeenTsn);
                }
            });
            let highestNewlyAcked = chunk.cumulativeTsn;
            for (const sChunk of this.sentQueue) {
                if ((0, common_1.uint32Gt)(sChunk.tsn, highestSeenTsn)) {
                    break;
                }
                if (seen.has(sChunk.tsn) && !sChunk.acked) {
                    doneBytes += sChunk.bookSize;
                    sChunk.acked = true;
                    this.flightSizeDecrease(sChunk);
                    highestNewlyAcked = sChunk.tsn;
                }
            }
            // # strike missing chunks prior to HTNA
            for (const sChunk of this.sentQueue) {
                if ((0, common_1.uint32Gt)(sChunk.tsn, highestNewlyAcked)) {
                    break;
                }
                if (!seen.has(sChunk.tsn)) {
                    sChunk.misses++;
                    if (sChunk.misses === 3) {
                        sChunk.misses = 0;
                        if (!this.maybeAbandon(sChunk)) {
                            sChunk.retransmit = true;
                        }
                        sChunk.acked = false;
                        this.flightSizeDecrease(sChunk);
                        loss = true;
                    }
                }
            }
        }
        // # adjust congestion window
        if (this.fastRecoveryExit === undefined) {
            if (done && cwndFullyUtilized) {
                if (this.cwnd <= this.ssthresh) {
                    this.cwnd += Math.min(doneBytes, USERDATA_MAX_LENGTH);
                }
                else {
                    this.partialBytesAcked += doneBytes;
                    if (this.partialBytesAcked >= this.cwnd) {
                        this.partialBytesAcked -= this.cwnd;
                        this.cwnd += USERDATA_MAX_LENGTH;
                    }
                }
            }
            if (loss) {
                this.ssthresh = Math.max(Math.floor(this.cwnd / 2), 4 * USERDATA_MAX_LENGTH);
                this.cwnd = this.ssthresh;
                this.partialBytesAcked = 0;
                this.fastRecoveryExit = this.sentQueue[this.sentQueue.length - 1].tsn;
                this.fastRecoveryTransmit = true;
            }
        }
        else if ((0, common_1.uint32Gte)(chunk.cumulativeTsn, this.fastRecoveryExit)) {
            this.fastRecoveryExit = undefined;
        }
        if (this.sentQueue.length === 0) {
            this.timer3Cancel();
        }
        else if (done > 0) {
            this.timer3Restart();
        }
        // RFC 9260 §6.2.1(D-ii): keep latest peer a_rwnd; available window is derived via flightSize.
        this.peerAdvertisedRwnd = chunk.advertisedRwnd;
        this.updateAdvancedPeerAckPoint();
        await this.onSackReceived();
        await this.transmit();
    }
    receiveForwardTsnChunk(chunk) {
        this.sackNeeded = true;
        this.sackImmediate = true;
        if ((0, common_1.uint32Gte)(this.lastReceivedTsn, chunk.cumulativeTsn)) {
            return;
        }
        const isObsolete = (x) => (0, common_1.uint32Gt)(x, this.lastReceivedTsn);
        // # advance cumulative TSN
        this.lastReceivedTsn = chunk.cumulativeTsn;
        this.sackMisOrdered = new Set([...this.sackMisOrdered].filter(isObsolete));
        for (const tsn of [...this.sackMisOrdered].sort()) {
            if (tsn === tsnPlusOne(this.lastReceivedTsn)) {
                this.lastReceivedTsn = tsn;
            }
            else {
                break;
            }
        }
        // # filter out obsolete entries
        this.sackDuplicates = this.sackDuplicates.filter(isObsolete);
        this.sackMisOrdered = new Set([...this.sackMisOrdered].filter(isObsolete));
        // # update reassembly
        for (const [streamId, streamSeqNum] of chunk.streams) {
            const inboundStream = this.getInboundStream(streamId);
            // # advance sequence number and perform delivery
            inboundStream.streamSequenceNumber = (0, common_1.uint16Add)(streamSeqNum, 1);
            for (const message of inboundStream.popMessages()) {
                this.advertisedRwnd += message[2].length;
                this.receive(...message);
            }
        }
        // # prune obsolete chunks
        Object.values(this.inboundStreams).forEach((inboundStream) => {
            this.advertisedRwnd += inboundStream.pruneChunks(this.lastReceivedTsn);
        });
    }
    updateRto(R) {
        if (!this.srtt) {
            this.rttvar = R / 2;
            this.srtt = R;
        }
        else {
            this.rttvar =
                (1 - SCTP_RTO_BETA) * this.rttvar +
                    SCTP_RTO_BETA * Math.abs(this.srtt - R);
            this.srtt = (1 - SCTP_RTO_ALPHA) * this.srtt + SCTP_RTO_ALPHA * R;
        }
        this.rto = Math.max(SCTP_RTO_MIN, Math.min(this.srtt + 4 * this.rttvar, SCTP_RTO_MAX));
    }
    receive(streamId, ppId, data) {
        this.onReceive.execute(streamId, ppId, data);
    }
    getInboundStream(streamId) {
        if (!this.inboundStreams[streamId]) {
            this.inboundStreams[streamId] = new InboundStream();
        }
        return this.inboundStreams[streamId];
    }
    markReceived(tsn) {
        if ((0, common_1.uint32Gte)(this.lastReceivedTsn, tsn) || this.sackMisOrdered.has(tsn)) {
            this.sackDuplicates.push(tsn);
            return true;
        }
        this.sackMisOrdered.add(tsn);
        for (const tsn of [...this.sackMisOrdered].sort()) {
            if (tsn === tsnPlusOne(this.lastReceivedTsn)) {
                this.lastReceivedTsn = tsn;
            }
            else {
                break;
            }
        }
        const isObsolete = (x) => (0, common_1.uint32Gt)(x, this.lastReceivedTsn);
        this.sackDuplicates = this.sackDuplicates.filter(isObsolete);
        this.sackMisOrdered = new Set([...this.sackMisOrdered].filter(isObsolete));
        return false;
    }
    async transmit() {
        if (this.isStopped)
            return;
        if (this.transmitting) {
            this.transmitRequested = true;
            return;
        }
        this.transmitting = true;
        try {
            do {
                this.transmitRequested = false;
                await this.transmitOnce();
            } while (this.transmitRequested);
        }
        finally {
            this.transmitting = false;
        }
    }
    async transmitOnce() {
        if (this.isStopped)
            return;
        // """
        // Transmit outbound data.
        // """
        // # send FORWARD TSN
        if (this.forwardTsnChunk) {
            await this.sendChunk(this.forwardTsnChunk).catch((err) => {
                log("send forwardTsn failed", err.message);
            });
            this.forwardTsnChunk = undefined;
            if (!this.timer3Handle) {
                this.timer3Start();
            }
        }
        const burstSize = this.fastRecoveryExit != undefined
            ? 2 * USERDATA_MAX_LENGTH
            : 4 * USERDATA_MAX_LENGTH;
        const cwnd = Math.min(this.flightSize + burstSize, this.cwnd);
        let retransmitEarliest = true;
        for (const dataChunk of this.sentQueue) {
            if (dataChunk.retransmit) {
                if (this.fastRecoveryTransmit) {
                    this.fastRecoveryTransmit = false;
                }
                else if (this.flightSize >= cwnd) {
                    break;
                }
                this.flightSizeIncrease(dataChunk);
                dataChunk.misses = 0;
                dataChunk.retransmit = false;
                dataChunk.sentCount++;
                await this.sendChunk(dataChunk).catch((err) => {
                    log("send data failed", err.message);
                });
                if (retransmitEarliest) {
                    this.timer3Restart();
                }
            }
            retransmitEarliest = false;
        }
        // Drain queued outbound DATA; retransmission pacing is controlled by RTO/T3.
        while (this.outboundQueue.length > 0 &&
            this.flightSize < cwnd &&
            this.peerRwnd > 0) {
            const chunk = this.outboundQueue.shift();
            if (!chunk)
                break;
            if (chunk.bookSize > this.peerRwnd && this.flightSize > 0) {
                this.outboundQueue.unshift(chunk);
                break;
            }
            this.sentQueue.push(chunk);
            this.flightSizeIncrease(chunk);
            // # update counters
            chunk.sentCount++;
            chunk.sentTime = Date.now() / 1000;
            await this.sendChunk(chunk).catch((err) => {
                log("send data outboundQueue failed", err.message);
            });
            if (!this.timer3Handle) {
                this.timer3Start();
            }
        }
        if (!this.outboundQueue.length) {
            // Resetting the queue to empty array mitigates this.
            this.outboundQueue = [];
        }
        this.flush.execute();
    }
    async transmitReconfigRequest() {
        if (this.reconfigQueue.length > 0 &&
            this.associationState === const_1.SCTP_STATE.ESTABLISHED &&
            !this.reconfigRequest) {
            // Remove duplicate stream IDs from reconfigQueue
            const uniqueStreams = [...new Set(this.reconfigQueue)];
            const streams = uniqueStreams.slice(0, RECONFIG_MAX_STREAMS);
            this.reconfigQueue = uniqueStreams.slice(RECONFIG_MAX_STREAMS);
            const param = new param_1.OutgoingSSNResetRequestParam(this.reconfigRequestSeq, this.reconfigResponseSeq, tsnMinusOne(this.localTsn), streams);
            this.reconfigRequestSeq = tsnPlusOne(this.reconfigRequestSeq);
            this.reconfigRequest = param;
            await this.sendReconfigParam(param);
            this.timerReconfigHandleStart();
        }
    }
    async sendReconfigParam(param) {
        log("sendReconfigParam", param);
        const chunk = new chunk_1.ReconfigChunk();
        chunk.params.push([param.type, param.bytes]);
        await this.sendChunk(chunk).catch((err) => {
            log("send reconfig failed", err.message);
        });
    }
    // https://github.com/pion/sctp/pull/44/files
    async sendResetRequest(streamId) {
        log("sendResetRequest", streamId);
        const chunk = new chunk_1.DataChunk(0, undefined);
        chunk.streamId = streamId;
        this.outboundQueue.push(chunk);
        if (!this.timer3Handle) {
            await this.transmit();
        }
    }
    flightSizeIncrease(chunk) {
        this.flightSize += chunk.bookSize;
    }
    flightSizeDecrease(chunk) {
        this.flightSize = Math.max(0, this.flightSize - chunk.bookSize);
    }
    // # timers
    /**t1 is wait for initAck or cookieAck */
    timer1Start(chunk) {
        if (this.timer1Handle)
            throw new Error();
        this.timer1Chunk = chunk;
        this.timer1Failures = 0;
        this.timer1Handle = setTimeout(this.timer1Expired, this.rto * 1000);
    }
    timer1Cancel() {
        if (this.timer1Handle) {
            clearTimeout(this.timer1Handle);
            this.timer1Handle = undefined;
            this.timer1Chunk = undefined;
        }
    }
    /**t2 is wait for shutdown */
    t2Start(chunk) {
        if (this.timer2Handle)
            throw new Error();
        this.timer2Chunk = chunk;
        this.timer2Failures = 0;
        this.timer2Handle = setTimeout(this.timer2Expired, this.rto * 1000);
    }
    timer2Cancel() {
        if (this.timer2Handle) {
            clearTimeout(this.timer2Handle);
            this.timer2Handle = undefined;
            this.timer2Chunk = undefined;
        }
    }
    /**t3 is wait for data sack */
    timer3Start() {
        if (this.isStopped)
            return;
        if (this.timer3Handle)
            throw new Error();
        // RFC 9260 T3-rtx runs on current RTO; rto is stored in seconds.
        this.timer3Handle = setTimeout(this.timer3Expired, this.rto * 1000);
    }
    timer3Restart() {
        if (this.isStopped)
            return;
        this.timer3Cancel();
        // RFC 9260 requires restarting T3-rtx with current RTO (seconds -> JS ms).
        this.timer3Handle = setTimeout(this.timer3Expired, this.rto * 1000);
    }
    timer3Cancel() {
        if (this.timer3Handle) {
            clearTimeout(this.timer3Handle);
            this.timer3Handle = undefined;
        }
    }
    /**Re-configuration Timer */
    timerReconfigHandleStart() {
        if (this.isStopped)
            return;
        if (this.timerReconfigHandle)
            return;
        log("timerReconfigHandleStart", { rto: this.rto });
        this.timerReconfigFailures = 0;
        this.timerReconfigHandle = setTimeout(this.timerReconfigHandleExpired, this.rto * 1000);
    }
    timerReconfigCancel() {
        if (this.timerReconfigHandle) {
            log("timerReconfigCancel");
            clearTimeout(this.timerReconfigHandle);
            this.timerReconfigHandle = undefined;
            // Reset failures counter when timer is successfully cancelled
            this.timerReconfigFailures = 0;
        }
    }
    heartbeatStart() {
        if (this.timerHeartbeatHandle ||
            this.associationState !== const_1.SCTP_STATE.ESTABLISHED) {
            return;
        }
        // RFC 9260 heartbeat timer is based on RTO + HB.interval for idle paths.
        this.timerHeartbeatHandle = setTimeout(this.timerHeartbeatExpired, (this.rto + this.heartbeatInterval) * 1000);
    }
    heartbeatRestart() {
        this.heartbeatCancel();
        this.heartbeatStart();
    }
    heartbeatCancel() {
        if (this.timerHeartbeatHandle) {
            clearTimeout(this.timerHeartbeatHandle);
            this.timerHeartbeatHandle = undefined;
        }
    }
    setHeartbeatInterval(interval) {
        if (interval <= 0) {
            throw new Error("heartbeat interval must be > 0");
        }
        this.heartbeatInterval = interval;
        this.heartbeatRestart();
    }
    updateAdvancedPeerAckPoint() {
        if ((0, common_1.uint32Gt)(this.lastSackedTsn, this.advancedPeerAckTsn)) {
            this.advancedPeerAckTsn = this.lastSackedTsn;
        }
        let done = 0;
        const streams = {};
        while (this.sentQueue.length > 0 && this.sentQueue[0].abandoned) {
            const chunk = this.sentQueue.shift();
            this.advancedPeerAckTsn = chunk.tsn;
            done++;
            if (!(chunk.flags & SCTP_DATA_UNORDERED)) {
                streams[chunk.streamId] = chunk.streamSeqNum;
            }
        }
        // Resetting the queue to empty array mitigates this.
        if (!this.sentQueue.length) {
            this.sentQueue = [];
        }
        if (done) {
            this.forwardTsnChunk = new chunk_1.ForwardTsnChunk(0, undefined);
            this.forwardTsnChunk.cumulativeTsn = this.advancedPeerAckTsn;
            this.forwardTsnChunk.streams = Object.entries(streams).map(([k, v]) => [
                Number(k),
                v,
            ]);
        }
    }
    maybeAbandon(chunk) {
        if (chunk.abandoned)
            return true;
        const abandon = (!!chunk.maxRetransmits && chunk.maxRetransmits < chunk.sentCount) ||
            (!!chunk.expiry && chunk.expiry < Date.now() / 1000);
        if (!abandon)
            return false;
        const chunkPos = this.sentQueue.findIndex((v) => v.type === chunk.type);
        for (let pos = chunkPos; pos >= 0; pos--) {
            const oChunk = this.sentQueue[pos];
            oChunk.abandoned = true;
            oChunk.retransmit = false;
            if (oChunk.flags & SCTP_DATA_LAST_FRAG) {
                break;
            }
        }
        for (let pos = chunkPos; pos < this.sentQueue.length; pos++) {
            const oChunk = this.sentQueue[pos];
            oChunk.abandoned = true;
            oChunk.retransmit = false;
            if (oChunk.flags & SCTP_DATA_LAST_FRAG) {
                break;
            }
        }
        return true;
    }
    static getCapabilities() {
        return new RTCSctpCapabilities(65536);
    }
    setRemotePort(port) {
        this.remotePort = port;
    }
    async start(remotePort) {
        if (!this.started) {
            this.started = true;
            this.setConnectionState("connecting");
            if (remotePort) {
                this.setRemotePort(remotePort);
            }
            if (!this.isServer) {
                await this.init();
            }
        }
    }
    async init() {
        const init = new chunk_1.InitChunk();
        init.initiateTag = this.localVerificationTag;
        init.advertisedRwnd = this.advertisedRwnd;
        init.outboundStreams = this._outboundStreamsCount;
        init.inboundStreams = this._inboundStreamsMax;
        init.initialTsn = this.localTsn;
        this.setExtensions(init.params);
        log("send init", init);
        try {
            await this.sendChunk(init);
            // # start T1 timer and enter COOKIE-WAIT state
            this.timer1Start(init);
            this.setState(const_1.SCTP_STATE.COOKIE_WAIT);
        }
        catch (error) {
            log("send init failed", error.message);
        }
    }
    setExtensions(params) {
        const extensions = [];
        if (this.localPartialReliability) {
            params.push([SCTP_PRSCTP_SUPPORTED, Buffer.from("")]);
            extensions.push(chunk_1.ForwardTsnChunk.type);
        }
        extensions.push(chunk_1.ReConfigChunk.type);
        params.push([SCTP_SUPPORTED_CHUNK_EXT, Buffer.from(extensions)]);
    }
    async sendChunk(chunk) {
        if (this.state === "closed")
            return;
        if (this.remotePort === undefined) {
            throw new Error("invalid remote port");
        }
        const packet = (0, chunk_1.serializePacket)(this.localPort, this.remotePort, this.remoteVerificationTag, chunk);
        await this.transport.send(packet);
    }
    setState(state) {
        if (state != this.associationState) {
            this.associationState = state;
        }
        if (state === const_1.SCTP_STATE.ESTABLISHED) {
            this.isStopping = false;
            this.isClosed = false;
            this.setConnectionState("connected");
            this.heartbeatStart();
        }
        else if (state === const_1.SCTP_STATE.CLOSED) {
            this.isClosed = true;
            this.timer1Cancel();
            this.timer2Cancel();
            this.timer3Cancel();
            this.timerReconfigCancel();
            this.heartbeatCancel();
            if (this.sackTimeout) {
                clearTimeout(this.sackTimeout);
                this.sackTimeout = undefined;
            }
            this.setConnectionState("closed");
            this.removeAllListeners();
        }
    }
    setConnectionState(state) {
        this.state = state;
        log("setConnectionState", state);
        this.stateChanged[state].execute();
    }
    async stop() {
        if (this.isStopped) {
            this.setState(const_1.SCTP_STATE.CLOSED);
            return;
        }
        this.isStopping = true;
        this.transport.onData = undefined;
        if (this.sackTimeout) {
            clearTimeout(this.sackTimeout);
            this.sackTimeout = undefined;
        }
        if (this.associationState !== const_1.SCTP_STATE.CLOSED) {
            await this.abort();
        }
        this.setState(const_1.SCTP_STATE.CLOSED);
        clearTimeout(this.timer1Handle);
        clearTimeout(this.timer2Handle);
        clearTimeout(this.timer3Handle);
        clearTimeout(this.timerReconfigHandle);
        clearTimeout(this.timerHeartbeatHandle);
        clearTimeout(this.sackTimeout);
    }
    async abort() {
        const abort = new chunk_1.AbortChunk();
        await this.sendChunk(abort).catch((err) => {
            log("send abort failed", err.message);
        });
    }
    removeAllListeners() {
        Object.values(this.stateChanged).forEach((v) => v.allUnsubscribe());
    }
}
exports.SCTP = SCTP;
class InboundStream {
    constructor() {
        Object.defineProperty(this, "reassembly", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        Object.defineProperty(this, "streamSequenceNumber", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        }); // SSN
    }
    addChunk(chunk) {
        if (this.reassembly.length === 0 ||
            (0, common_1.uint32Gt)(chunk.tsn, this.reassembly[this.reassembly.length - 1].tsn)) {
            this.reassembly.push(chunk);
            return;
        }
        for (const [i, v] of (0, helper_1.enumerate)(this.reassembly)) {
            if (v.tsn === chunk.tsn)
                throw new Error("duplicate chunk in reassembly");
            if ((0, common_1.uint32Gt)(v.tsn, chunk.tsn)) {
                this.reassembly.splice(i, 0, chunk);
                break;
            }
        }
    }
    *popMessages() {
        let pos = 0;
        let startPos;
        let expectedTsn;
        let ordered;
        while (pos < this.reassembly.length) {
            const chunk = this.reassembly[pos];
            if (startPos === undefined) {
                ordered = !(chunk.flags & SCTP_DATA_UNORDERED);
                if (!(chunk.flags & SCTP_DATA_FIRST_FRAG)) {
                    if (ordered) {
                        break;
                    }
                    else {
                        pos++;
                        continue;
                    }
                }
                if (ordered &&
                    (0, common_1.uint16Gt)(chunk.streamSeqNum, this.streamSequenceNumber)) {
                    break;
                }
                expectedTsn = chunk.tsn;
                startPos = pos;
            }
            else if (chunk.tsn !== expectedTsn) {
                if (ordered) {
                    break;
                }
                else {
                    startPos = undefined;
                    pos++;
                    continue;
                }
            }
            if (chunk.flags & SCTP_DATA_LAST_FRAG) {
                const arr = this.reassembly
                    .slice(startPos, pos + 1)
                    .map((c) => c.userData)
                    .reduce((acc, cur) => {
                    acc.push(cur);
                    acc.push(Buffer.from(""));
                    return acc;
                }, []);
                arr.pop();
                const userData = Buffer.concat(arr);
                this.reassembly = [
                    ...this.reassembly.slice(0, startPos),
                    ...this.reassembly.slice(pos + 1),
                ];
                if (ordered && chunk.streamSeqNum === this.streamSequenceNumber) {
                    this.streamSequenceNumber = (0, common_1.uint16Add)(this.streamSequenceNumber, 1);
                }
                pos = startPos;
                yield [chunk.streamId, chunk.protocol, userData];
            }
            else {
                pos++;
            }
            expectedTsn = tsnPlusOne(expectedTsn);
        }
    }
    pruneChunks(tsn) {
        // """
        // Prune chunks up to the given TSN.
        // """
        let pos = -1, size = 0;
        for (const [i, chunk] of this.reassembly.entries()) {
            if ((0, common_1.uint32Gte)(tsn, chunk.tsn)) {
                pos = i;
                size += chunk.userData.length;
            }
            else {
                break;
            }
        }
        this.reassembly = this.reassembly.slice(pos + 1);
        return size;
    }
}
exports.InboundStream = InboundStream;
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
function tsnMinusOne(a) {
    return (a - 1) % SCTP_TSN_MODULO;
}
function tsnPlusOne(a) {
    return (a + 1) % SCTP_TSN_MODULO;
}
//# sourceMappingURL=sctp.js.map