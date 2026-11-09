"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultOptions = exports.CandidatePairState = exports.CONSENT_RESPONSE_TIMEOUT_MIN = exports.CONSENT_RESPONSE_TIMEOUT = exports.CONSENT_TIMEOUT = exports.CONSENT_FAILURES = exports.CONSENT_INTERVAL = exports.ICE_FAILED = exports.ICE_COMPLETED = exports.CandidatePair = void 0;
exports.consentResponseTimeoutMs = consentResponseTimeoutMs;
exports.validateRemoteCandidate = validateRemoteCandidate;
exports.sortCandidatePairs = sortCandidatePairs;
exports.candidatePairPriority = candidatePairPriority;
exports.serverReflexiveCandidate = serverReflexiveCandidate;
exports.validateAddress = validateAddress;
const crypto_1 = require("crypto");
const candidate_1 = require("./candidate");
const common_1 = require("./imports/common");
const const_1 = require("./stun/const");
const message_1 = require("./stun/message");
const log = (0, common_1.debug)("werift-ice : packages/ice/src/ice.ts : log");
class CandidatePair {
    get state() {
        return this._state;
    }
    toJSON() {
        return this.json;
    }
    get json() {
        return {
            protocol: this.protocol.type,
            localCandidate: this.localCandidate.toSdp(),
            remoteCandidate: this.remoteCandidate.toSdp(),
        };
    }
    constructor(protocol, remoteCandidate, iceControlling) {
        Object.defineProperty(this, "protocol", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: protocol
        });
        Object.defineProperty(this, "remoteCandidate", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: remoteCandidate
        });
        Object.defineProperty(this, "iceControlling", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: iceControlling
        });
        Object.defineProperty(this, "id", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: (0, crypto_1.randomUUID)().toString()
        });
        Object.defineProperty(this, "handle", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "nominated", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        Object.defineProperty(this, "remoteNominated", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        // 5.7.4.  Computing States
        Object.defineProperty(this, "_state", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: CandidatePairState.FROZEN
        });
        // Statistics tracking
        Object.defineProperty(this, "packetsSent", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "packetsReceived", {
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
        Object.defineProperty(this, "bytesReceived", {
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
        Object.defineProperty(this, "requestsReceived", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "requestsSent", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "responsesReceived", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "responsesSent", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "retransmissionsReceived", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "retransmissionsSent", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "consentRequestsSent", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "requestTransactionIds", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Set()
        });
    }
    updateState(state) {
        this._state = state;
    }
    get localCandidate() {
        if (!this.protocol.localCandidate) {
            throw new Error("localCandidate not exist");
        }
        return this.protocol.localCandidate;
    }
    get remoteAddr() {
        return [this.remoteCandidate.host, this.remoteCandidate.port];
    }
    get component() {
        return this.localCandidate.component;
    }
    get priority() {
        return candidatePairPriority(this.localCandidate, this.remoteCandidate, this.iceControlling);
    }
    get foundation() {
        return this.localCandidate.foundation;
    }
    noteIncomingRequest(transactionId) {
        const isRetransmission = this.requestTransactionIds.has(transactionId);
        if (!isRetransmission) {
            this.requestTransactionIds.add(transactionId);
            return false;
        }
        this.retransmissionsReceived++;
        return true;
    }
}
exports.CandidatePair = CandidatePair;
exports.ICE_COMPLETED = 1;
exports.ICE_FAILED = 2;
/** Basic consent check period in seconds (RFC 7675). Actual interval is 0.8–1.2× this. */
exports.CONSENT_INTERVAL = 5;
/**
 * @deprecated Consent expiry is based on {@link CONSENT_TIMEOUT} (30s after the
 * last valid response), not a consecutive failure count. Kept for API compatibility.
 */
exports.CONSENT_FAILURES = 6;
/** RFC 7675: consent expires this many seconds after the last valid response. */
exports.CONSENT_TIMEOUT = 30;
/**
 * Default single-shot response wait for consent requests (ms) when RTT is unknown.
 * Independent of retransmission count. Downstream ICE-lite peers typically
 * answer in 150–300ms; 1s is a conservative default used by interop patches.
 */
exports.CONSENT_RESPONSE_TIMEOUT = 1000;
/** RFC 8445 §14.3: ICE RTO must not be less than 500ms. */
exports.CONSENT_RESPONSE_TIMEOUT_MIN = 500;
/**
 * Compute consent response wait from pair RTT (seconds).
 * Uses 2×RTT + 200ms jitter margin, floored at {@link CONSENT_RESPONSE_TIMEOUT_MIN}.
 * Falls back to {@link CONSENT_RESPONSE_TIMEOUT} when RTT is unavailable.
 */
function consentResponseTimeoutMs(rttSeconds) {
    if (rttSeconds === undefined ||
        !Number.isFinite(rttSeconds) ||
        rttSeconds <= 0) {
        return exports.CONSENT_RESPONSE_TIMEOUT;
    }
    return Math.max(exports.CONSENT_RESPONSE_TIMEOUT_MIN, Math.round(rttSeconds * 1000 * 2 + 200));
}
var CandidatePairState;
(function (CandidatePairState) {
    CandidatePairState[CandidatePairState["FROZEN"] = 0] = "FROZEN";
    CandidatePairState[CandidatePairState["WAITING"] = 1] = "WAITING";
    CandidatePairState[CandidatePairState["IN_PROGRESS"] = 2] = "IN_PROGRESS";
    CandidatePairState[CandidatePairState["SUCCEEDED"] = 3] = "SUCCEEDED";
    CandidatePairState[CandidatePairState["FAILED"] = 4] = "FAILED";
})(CandidatePairState || (exports.CandidatePairState = CandidatePairState = {}));
exports.defaultOptions = {
    iceLite: false,
    useTcp: false,
    useIpv4: true,
    useIpv6: true,
};
function validateRemoteCandidate(candidate) {
    // """
    // Check the remote candidate is supported.
    // """
    if (!["host", "relay", "srflx"].includes(candidate.type))
        throw new Error(`Unexpected candidate type "${candidate.type}"`);
    // ipaddress.ip_address(candidate.host)
    return candidate;
}
function sortCandidatePairs(pairs, iceControlling) {
    return pairs
        .sort((a, b) => candidatePairPriority(a.localCandidate, a.remoteCandidate, iceControlling) -
        candidatePairPriority(b.localCandidate, b.remoteCandidate, iceControlling))
        .reverse();
}
// 5.7.2.  Computing Pair Priority and Ordering Pairs
function candidatePairPriority(local, remote, iceControlling) {
    const G = (iceControlling && local.priority) || remote.priority;
    const D = (iceControlling && remote.priority) || local.priority;
    return (1 << 32) * Math.min(G, D) + 2 * Math.max(G, D) + (G > D ? 1 : 0);
}
async function serverReflexiveCandidate(protocol, stunServer) {
    // """
    // Query STUN server to obtain a server-reflexive candidate.
    // """
    // # perform STUN query
    const request = new message_1.Message(const_1.methods.BINDING, const_1.classes.REQUEST);
    try {
        const [response] = await protocol.request(request, stunServer);
        const localCandidate = protocol.localCandidate;
        if (!localCandidate) {
            throw new Error("not exist");
        }
        const candidate = new candidate_1.Candidate((0, candidate_1.candidateFoundation)("srflx", localCandidate.transport, localCandidate.host), localCandidate.component, localCandidate.transport, (0, candidate_1.candidatePriority)("srflx", {
            transport: localCandidate.transport,
            tcptype: localCandidate.tcptype,
        }), response.getAttributeValue("XOR-MAPPED-ADDRESS")[0], response.getAttributeValue("XOR-MAPPED-ADDRESS")[1], "srflx", localCandidate.host, localCandidate.port, localCandidate.tcptype);
        return candidate;
    }
    catch (error) {
        // todo fix
        log("error serverReflexiveCandidate", error);
    }
}
function validateAddress(addr) {
    if (addr && Number.isNaN(addr[1])) {
        return [addr[0], 443];
    }
    return addr;
}
//# sourceMappingURL=iceBase.js.map