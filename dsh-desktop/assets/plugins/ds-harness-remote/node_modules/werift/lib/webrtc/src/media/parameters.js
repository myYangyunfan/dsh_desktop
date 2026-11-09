"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RTCRtpSimulcastParameters = exports.RTCRtpCodingParameters = exports.RTCRtpRtxParameters = exports.RTCRtcpFeedback = exports.RTCRtcpParameters = exports.RTCRtpHeaderExtensionParameters = exports.RTCRtpCodecParameters = void 0;
class RTCRtpCodecParameters {
    constructor(props) {
        /**
         * When specifying a codec with a fixed payloadType such as PCMU,
         * it is necessary to set the correct PayloadType in RTCRtpCodecParameters in advance.
         */
        Object.defineProperty(this, "payloadType", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "mimeType", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "clockRate", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "channels", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "rtcpFeedback", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        Object.defineProperty(this, "parameters", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "direction", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: "all"
        });
        Object.assign(this, props);
    }
    get name() {
        return this.mimeType.split("/")[1];
    }
    get contentType() {
        return this.mimeType.split("/")[0];
    }
    get str() {
        let s = `${this.name}/${this.clockRate}`;
        if (this.channels === 2)
            s += "/2";
        return s;
    }
}
exports.RTCRtpCodecParameters = RTCRtpCodecParameters;
class RTCRtpHeaderExtensionParameters {
    constructor(props) {
        Object.defineProperty(this, "id", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "uri", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.assign(this, props);
    }
}
exports.RTCRtpHeaderExtensionParameters = RTCRtpHeaderExtensionParameters;
class RTCRtcpParameters {
    constructor(props = {}) {
        Object.defineProperty(this, "cname", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "mux", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        Object.defineProperty(this, "ssrc", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.assign(this, props);
    }
}
exports.RTCRtcpParameters = RTCRtcpParameters;
class RTCRtcpFeedback {
    constructor(props = {}) {
        Object.defineProperty(this, "type", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "parameter", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.assign(this, props);
    }
}
exports.RTCRtcpFeedback = RTCRtcpFeedback;
class RTCRtpRtxParameters {
    constructor(props = {}) {
        Object.defineProperty(this, "ssrc", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.assign(this, props);
    }
}
exports.RTCRtpRtxParameters = RTCRtpRtxParameters;
class RTCRtpCodingParameters {
    constructor(props) {
        Object.defineProperty(this, "ssrc", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "payloadType", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "rtx", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.assign(this, props);
    }
}
exports.RTCRtpCodingParameters = RTCRtpCodingParameters;
class RTCRtpSimulcastParameters {
    constructor(props) {
        Object.defineProperty(this, "rid", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "direction", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.assign(this, props);
    }
}
exports.RTCRtpSimulcastParameters = RTCRtpSimulcastParameters;
//# sourceMappingURL=parameters.js.map