"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RTCDataChannelParameters = exports.RTCDataChannel = void 0;
exports.getDataChannelMessageSize = getDataChannelMessageSize;
const crypto_1 = require("crypto");
const common_1 = require("./imports/common");
const helper_1 = require("./helper");
const log = (0, common_1.debug)("werift:packages/webrtc/src/dataChannel.ts");
function getDataChannelMessageSize(data) {
    return Buffer.isBuffer(data) ? data.length : Buffer.byteLength(data);
}
class RTCDataChannel extends helper_1.EventTarget {
    constructor(sctp, parameters, sendOpen = true) {
        super();
        Object.defineProperty(this, "sctp", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: sctp
        });
        Object.defineProperty(this, "parameters", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: parameters
        });
        Object.defineProperty(this, "sendOpen", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: sendOpen
        });
        Object.defineProperty(this, "statsId", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: (0, crypto_1.randomUUID)().toString()
        });
        Object.defineProperty(this, "stateChange", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new common_1.Event()
        });
        Object.defineProperty(this, "stateChanged", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new common_1.Event()
        });
        Object.defineProperty(this, "onMessage", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new common_1.Event()
        });
        // todo impl
        Object.defineProperty(this, "error", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new common_1.Event()
        });
        Object.defineProperty(this, "bufferedAmountLow", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new common_1.Event()
        });
        Object.defineProperty(this, "onopen", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "onclose", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "onclosing", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "onmessage", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        // todo impl
        Object.defineProperty(this, "onerror", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "isCreatedByRemote", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        Object.defineProperty(this, "id", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "readyState", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: "connecting"
        });
        Object.defineProperty(this, "bufferedAmount", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "_bufferedAmountLowThreshold", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        // Statistics
        Object.defineProperty(this, "messagesSent", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "bytesSent", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "messagesReceived", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "bytesReceived", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        this.id = this.parameters.id;
        if (parameters.negotiated) {
            if (this.id == undefined || this.id < 0 || this.id > 65534) {
                throw new Error("ID must be in range 0-65534 if data channel is negotiated out-of-band");
            }
            this.sctp.dataChannelAddNegotiated(this);
        }
        else {
            if (sendOpen) {
                this.sendOpen = false;
                this.sctp.dataChannelOpen(this);
            }
        }
    }
    get ordered() {
        return this.parameters.ordered;
    }
    get maxRetransmits() {
        return this.parameters.maxRetransmits ?? null;
    }
    get maxPacketLifeTime() {
        return this.parameters.maxPacketLifeTime ?? null;
    }
    get label() {
        return this.parameters.label;
    }
    get protocol() {
        return this.parameters.protocol;
    }
    get negotiated() {
        return this.parameters.negotiated;
    }
    get bufferedAmountLowThreshold() {
        return this._bufferedAmountLowThreshold;
    }
    set bufferedAmountLowThreshold(value) {
        if (value < 0 || value > 4294967295) {
            throw new Error("bufferedAmountLowThreshold must be in range 0 - 4294967295");
        }
        this._bufferedAmountLowThreshold = value;
    }
    setId(id) {
        this.id = id;
    }
    setReadyState(state) {
        if (state !== this.readyState) {
            this.readyState = state;
            this.stateChange.execute(state);
            this.stateChanged.execute(state);
            switch (state) {
                case "open":
                    if (this.onopen)
                        this.onopen();
                    this.emit("open");
                    break;
                case "closed":
                    if (this.onclose)
                        this.onclose();
                    this.emit("close");
                    break;
                case "closing":
                    if (this.onclosing)
                        this.onclosing();
                    break;
            }
            log("change state", state);
        }
    }
    addBufferedAmount(amount) {
        const crossesThreshold = this.bufferedAmount > this.bufferedAmountLowThreshold &&
            this.bufferedAmount + amount <= this.bufferedAmountLowThreshold;
        this.bufferedAmount += amount;
        if (crossesThreshold) {
            this.bufferedAmountLow.execute();
            this.emit("bufferedamountlow");
        }
    }
    send(data) {
        const size = this.sctp.datachannelSend(this, data);
        this.messagesSent++;
        this.bytesSent += size;
    }
    close() {
        this.sctp.dataChannelClose(this);
    }
}
exports.RTCDataChannel = RTCDataChannel;
class RTCDataChannelParameters {
    constructor(props = {}) {
        Object.defineProperty(this, "label", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: ""
        });
        Object.defineProperty(this, "maxPacketLifeTime", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        }); // sec
        Object.defineProperty(this, "maxRetransmits", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "ordered", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: true
        });
        Object.defineProperty(this, "protocol", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: ""
        });
        Object.defineProperty(this, "negotiated", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        Object.defineProperty(this, "id", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.assign(this, props);
    }
}
exports.RTCDataChannelParameters = RTCDataChannelParameters;
//# sourceMappingURL=dataChannel.js.map