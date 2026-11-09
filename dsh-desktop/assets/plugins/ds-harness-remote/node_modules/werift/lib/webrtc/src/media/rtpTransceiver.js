"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Directions = exports.Sendrecv = exports.Recvonly = exports.Sendonly = exports.Inactive = exports.RTCRtpTransceiver = void 0;
const crypto_1 = require("crypto");
const common_1 = require("../imports/common");
const const_1 = require("../const");
const stats_1 = require("./stats");
class RTCRtpTransceiver {
    set codecs(codecs) {
        this._codecs = codecs;
    }
    get codecs() {
        return this._codecs;
    }
    constructor(kind, dtlsTransport, receiver, sender, 
    /**RFC 8829 4.2.4.  direction the transceiver was initialized with */
    _direction) {
        Object.defineProperty(this, "kind", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: kind
        });
        Object.defineProperty(this, "receiver", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: receiver
        });
        Object.defineProperty(this, "sender", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: sender
        });
        Object.defineProperty(this, "_direction", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: _direction
        });
        Object.defineProperty(this, "id", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: (0, crypto_1.randomUUID)().toString()
        });
        Object.defineProperty(this, "onTrack", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new common_1.Event()
        });
        Object.defineProperty(this, "mid", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: null
        });
        Object.defineProperty(this, "mLineIndex", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        /**should not be reused because it has been used for sending before. */
        Object.defineProperty(this, "usedForSender", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        Object.defineProperty(this, "_currentDirection", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "offerDirection", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "_codecs", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        Object.defineProperty(this, "headerExtensions", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        Object.defineProperty(this, "options", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: {}
        });
        Object.defineProperty(this, "stopping", {
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
        if (dtlsTransport) {
            this.setDtlsTransport(dtlsTransport);
        }
    }
    get dtlsTransport() {
        return this.receiver.dtlsTransport;
    }
    /**RFC 8829 4.2.4. setDirectionに渡された最後の値を示します */
    get direction() {
        return this._direction;
    }
    set direction(direction) {
        this.setDirection(direction);
    }
    setDirection(direction) {
        this._direction = direction;
        if (this._currentDirection &&
            this._currentDirection !== "stopped" &&
            const_1.SenderDirections.includes(this._currentDirection)) {
            this.usedForSender = true;
        }
    }
    /**RFC 8829 4.2.5. last negotiated direction */
    get currentDirection() {
        return this._currentDirection ?? null;
    }
    setCurrentDirection(direction) {
        this._currentDirection = direction;
    }
    setDtlsTransport(dtls) {
        this.receiver.setDtlsTransport(dtls);
        this.sender.setDtlsTransport(dtls);
    }
    get msid() {
        return this.msids[0];
    }
    get msids() {
        return this.sender.streamIds.map((streamId) => `${streamId} ${this.sender.trackId}`);
    }
    addTrack(track) {
        const res = this.receiver.addTrack(track);
        if (res) {
            this.onTrack.execute(track, this);
        }
    }
    // todo impl
    // https://www.w3.org/TR/webrtc/#methods-8
    stop() {
        if (this.stopping) {
            return;
        }
        // todo Stop sending and receiving with transceiver.
        this.stopping = true;
    }
    forceStop() {
        if (this.stopped) {
            return;
        }
        this.stopping = true;
        this.stopped = true;
        this.setCurrentDirection("stopped");
        this.receiver.stop();
        this.sender.stop();
    }
    getPayloadType(mimeType) {
        return this.codecs.find((codec) => codec.mimeType.toLowerCase().includes(mimeType.toLowerCase()))?.payloadType;
    }
    getCodecStats() {
        const timestamp = (0, stats_1.getStatsTimestamp)();
        return this.collectCodecStats(timestamp);
    }
    collectCodecStats(timestamp) {
        const stats = [];
        if (!this.dtlsTransport) {
            return stats;
        }
        const transportId = (0, stats_1.generateStatsId)("transport", this.dtlsTransport.id);
        // Add codec stats for each codec
        for (const codec of this.codecs) {
            const codecStats = {
                type: "codec",
                id: (0, stats_1.generateCodecStatsId)(transportId, codec.payloadType, this.id),
                timestamp,
                payloadType: codec.payloadType,
                transportId,
                mimeType: codec.mimeType,
                clockRate: codec.clockRate,
                channels: codec.channels,
                sdpFmtpLine: codec.parameters,
            };
            stats.push(codecStats);
        }
        return stats;
    }
}
exports.RTCRtpTransceiver = RTCRtpTransceiver;
exports.Inactive = "inactive";
exports.Sendonly = "sendonly";
exports.Recvonly = "recvonly";
exports.Sendrecv = "sendrecv";
exports.Directions = [exports.Inactive, exports.Sendonly, exports.Recvonly, exports.Sendrecv];
//# sourceMappingURL=rtpTransceiver.js.map