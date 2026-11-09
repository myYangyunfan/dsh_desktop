"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RTCIceParameters = exports.IceCandidate = exports.RTCIceCandidate = exports.RTCIceGatherer = exports.IceGathererStates = exports.IceTransportStates = exports.RTCIceTransport = void 0;
exports.candidateFromIce = candidateFromIce;
exports.candidateToIce = candidateToIce;
const crypto_1 = require("crypto");
const common_1 = require("../imports/common");
const src_1 = require("../../../ice/src");
const helper_1 = require("../helper");
const stats_1 = require("../media/stats");
const sdp_1 = require("../sdp");
const log = (0, common_1.debug)("werift:packages/webrtc/src/transport/ice.ts");
function mapCandidatePairState(state) {
    switch (state) {
        case 0:
            return "frozen";
        case 1:
            return "waiting";
        case 2:
            return "in-progress";
        case 3:
            return "succeeded";
        case 4:
            return "failed";
        default:
            return "failed";
    }
}
/**
 *                                          +------------+
                                            |            |
                                            |disconnected|
                                            |            |
                                            +------------+
                                            ^           ^
                                            |           |
+------+      +----------+      +-----------+      +----------+
|      |      |          |      |           |      |          |
| new  | ---> | checking | ---> | connected | ---> | completed|
|      |      |          |      |           |      |          |
+------+      +----+-----+      +-----------+      +----------+
                    |
                    |
                    v
                +-------+
                |       |
                | failed|
                |       |
                +-------+
 */
class RTCIceTransport {
    constructor(iceGather) {
        Object.defineProperty(this, "iceGather", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: iceGather
        });
        Object.defineProperty(this, "id", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: (0, crypto_1.randomUUID)().toString()
        });
        Object.defineProperty(this, "connection", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "state", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: "new"
        });
        Object.defineProperty(this, "component", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: "rtp"
        });
        Object.defineProperty(this, "iceRestarts", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "waitStart", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "renominating", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        Object.defineProperty(this, "events", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new helper_1.EventTarget()
        });
        Object.defineProperty(this, "onstatechange", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "ongatheringstatechange", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "onStateChange", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new common_1.Event()
        });
        Object.defineProperty(this, "onIceCandidate", {
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
        Object.defineProperty(this, "addEventListener", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: (type, listener, options) => {
                this.events.addEventListener(type, listener, options);
            }
        });
        Object.defineProperty(this, "removeEventListener", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: (type, listener) => {
                this.events.removeEventListener(type, listener);
            }
        });
        Object.defineProperty(this, "dispatchEvent", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: (event) => this.events.dispatchEvent(event)
        });
        Object.defineProperty(this, "addRemoteCandidate", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: (candidate) => {
                if (!this.connection.remoteCandidatesEnd) {
                    return !candidate
                        ? this.connection.addRemoteCandidate(undefined)
                        : this.connection.addRemoteCandidate(candidateToIce(candidate));
                }
            }
        });
        this.connection = this.iceGather.connection;
        this.connection.stateChanged.subscribe((state) => {
            this.setState(state);
        });
        this.iceGather.onIceCandidate = (candidate) => {
            this.onIceCandidate.execute(candidate);
        };
        this.iceGather.onGatheringStateChange.subscribe(() => {
            this.ongatheringstatechange?.();
            this.events.emit("gatheringstatechange");
        });
    }
    get role() {
        if (!this.connection.remoteUsername || !this.connection.remotePassword) {
            return "unknown";
        }
        if (this.connection.iceControlling)
            return "controlling";
        else
            return "controlled";
    }
    get gatheringState() {
        return this.iceGather.gatheringState;
    }
    get localCandidates() {
        return this.iceGather.localCandidates;
    }
    get localParameters() {
        return this.iceGather.localParameters;
    }
    getRemoteCandidates() {
        return this.connection.remoteCandidates
            .filter((candidate) => candidate.type !== "prflx")
            .map((candidate) => candidateFromIce(candidate).toJSON());
    }
    getLocalCandidates() {
        return this.connection.localCandidates.map((candidate) => candidateFromIce(candidate).toJSON());
    }
    getSelectedCandidatePair() {
        const pair = this.connection.candidatePairs.find((candidate) => candidate.nominated) ??
            this.connection.candidatePairs.find((candidate) => candidate.state === 3);
        if (!pair) {
            return null;
        }
        return {
            local: candidateFromIce(pair.localCandidate).toJSON(),
            remote: candidateFromIce(pair.remoteCandidate).toJSON(),
        };
    }
    getLocalParameters() {
        return this.localParameters ?? null;
    }
    getRemoteParameters() {
        if (!this.connection.remoteUsername || !this.connection.remotePassword) {
            return null;
        }
        return new RTCIceParameters({
            iceLite: this.connection.remoteIsLite,
            password: this.connection.remotePassword,
            usernameFragment: this.connection.remoteUsername,
        });
    }
    setState(state, emitEvent = true) {
        if (state !== this.state) {
            this.state = state;
            this.onStateChange.execute(state);
            if (emitEvent) {
                this.onstatechange?.();
                this.events.emit("statechange");
            }
        }
    }
    gather() {
        return this.iceGather.gather();
    }
    setRemoteParams(remoteParameters, renomination = false) {
        if (renomination) {
            this.renominating = true;
        }
        if (this.connection.remoteUsername &&
            this.connection.remotePassword &&
            (this.connection.remoteUsername !== remoteParameters.usernameFragment ||
                this.connection.remotePassword !== remoteParameters.password)) {
            if (this.renominating) {
                log("renomination", remoteParameters);
                this.connection.resetNominatedPair();
                this.renominating = false;
            }
            else {
                log("restart", remoteParameters);
                this.restart();
            }
        }
        this.connection.setRemoteParams(remoteParameters);
    }
    restart() {
        this.iceRestarts++;
        this.connection.restart();
        this.setState("new");
        this.iceGather.gatheringState = "new";
        this.waitStart = undefined;
        this.onNegotiationNeeded.execute();
    }
    async start() {
        if (this.state === "closed") {
            throw new Error("RTCIceTransport is closed");
        }
        if (!this.connection.remotePassword || !this.connection.remoteUsername) {
            throw new Error("remoteParams missing");
        }
        if (this.waitStart) {
            await this.waitStart.asPromise();
        }
        this.waitStart = new common_1.Event();
        this.setState("checking");
        try {
            await this.connection.connect();
        }
        catch (error) {
            this.setState("failed");
            throw error;
        }
        this.waitStart.execute();
        this.waitStart.complete();
        this.waitStart = undefined;
    }
    async stop() {
        if (this.state !== "closed") {
            this.setState("closed", false);
            await this.connection.close();
        }
        this.onStateChange.complete();
        this.onIceCandidate.complete();
        this.onNegotiationNeeded.complete();
    }
    async getStats(timestamp = (0, stats_1.getStatsTimestamp)(), transportId = (0, stats_1.generateStatsId)("transport", this.id)) {
        const stats = [];
        // Local candidates
        for (const candidate of this.connection.localCandidates) {
            const candidateStats = {
                type: "local-candidate",
                id: (0, stats_1.generateStatsId)("local-candidate", candidate.id),
                timestamp,
                transportId,
                address: candidate.host,
                port: candidate.port,
                protocol: candidate.transport,
                candidateType: candidate.type,
                priority: candidate.priority,
                foundation: candidate.foundation,
                relatedAddress: candidate.relatedAddress,
                relatedPort: candidate.relatedPort,
                usernameFragment: candidate.ufrag,
                tcpType: candidate.tcptype,
            };
            stats.push(candidateStats);
        }
        // Remote candidates
        for (const candidate of this.connection.remoteCandidates) {
            const candidateStats = {
                type: "remote-candidate",
                id: (0, stats_1.generateStatsId)("remote-candidate", candidate.id),
                timestamp,
                transportId,
                address: candidate.host,
                port: candidate.port,
                protocol: candidate.transport,
                candidateType: candidate.type,
                priority: candidate.priority,
                foundation: candidate.foundation,
                relatedAddress: candidate.relatedAddress,
                relatedPort: candidate.relatedPort,
                usernameFragment: candidate.ufrag,
                tcpType: candidate.tcptype,
            };
            stats.push(candidateStats);
        }
        // Candidate pairs
        const pairs = this.connection?.candidatePairs
            ? [
                ...this.connection.candidatePairs.filter((p) => p.nominated),
                ...this.connection.candidatePairs.filter((p) => !p.nominated),
            ]
            : [];
        for (const pair of pairs) {
            const pairStats = {
                type: "candidate-pair",
                id: (0, stats_1.generateStatsId)("candidate-pair", pair.id),
                timestamp,
                transportId,
                localCandidateId: (0, stats_1.generateStatsId)("local-candidate", pair.localCandidate.id),
                remoteCandidateId: (0, stats_1.generateStatsId)("remote-candidate", pair.remoteCandidate.id),
                state: mapCandidatePairState(pair.state),
                nominated: pair.nominated,
                packetsSent: pair.packetsSent,
                packetsReceived: pair.packetsReceived,
                bytesSent: pair.bytesSent,
                bytesReceived: pair.bytesReceived,
                currentRoundTripTime: pair.rtt,
                totalRoundTripTime: pair.totalRoundTripTime,
                roundTripTimeMeasurements: pair.roundTripTimeMeasurements,
                requestsReceived: pair.requestsReceived,
                requestsSent: pair.requestsSent,
                responsesReceived: pair.responsesReceived,
                responsesSent: pair.responsesSent,
                retransmissionsReceived: pair.retransmissionsReceived,
                retransmissionsSent: pair.retransmissionsSent,
                consentRequestsSent: pair.consentRequestsSent,
            };
            stats.push(pairStats);
        }
        return stats;
    }
}
exports.RTCIceTransport = RTCIceTransport;
exports.IceTransportStates = [
    "new",
    "checking",
    "connected",
    "completed",
    "disconnected",
    "failed",
    "closed",
];
exports.IceGathererStates = ["new", "gathering", "complete"];
class RTCIceGatherer {
    constructor(options = {}) {
        Object.defineProperty(this, "options", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: options
        });
        Object.defineProperty(this, "onIceCandidate", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: () => { }
        });
        Object.defineProperty(this, "gatheringState", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: "new"
        });
        Object.defineProperty(this, "connection", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "onGatheringStateChange", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new common_1.Event()
        });
        this.connection = new src_1.Connection(false, this.options);
        this.connection.onIceCandidate.subscribe((candidate) => {
            this.onIceCandidate(candidateFromIce(candidate));
        });
    }
    async gather() {
        if (this.gatheringState === "new") {
            this.setState("gathering");
            await this.connection.gatherCandidates();
            this.onIceCandidate(undefined);
            this.setState("complete");
        }
    }
    get localCandidates() {
        return this.connection.localCandidates.map(candidateFromIce);
    }
    get localParameters() {
        const params = new RTCIceParameters({
            iceLite: this.connection.iceLite,
            usernameFragment: this.connection.localUsername,
            password: this.connection.localPassword,
        });
        return params;
    }
    setState(state) {
        if (state !== this.gatheringState) {
            this.gatheringState = state;
            this.onGatheringStateChange.execute(state);
        }
    }
}
exports.RTCIceGatherer = RTCIceGatherer;
function candidateFromIce(c) {
    const candidate = new IceCandidate(c.component, c.foundation, c.host, c.port, c.priority, c.transport, c.type, c.generation, c.ufrag);
    candidate.relatedAddress = c.relatedAddress;
    candidate.relatedPort = c.relatedPort;
    candidate.tcpType = c.tcptype;
    return candidate;
}
function candidateToIce(x) {
    return new src_1.Candidate(x.foundation, x.component, x.protocol, x.priority, x.ip, x.port, x.type, x.relatedAddress, x.relatedPort, x.tcpType, x.generation, x.ufrag);
}
class RTCIceCandidate {
    constructor(props) {
        Object.defineProperty(this, "candidate", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "sdpMid", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "sdpMLineIndex", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "usernameFragment", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.assign(this, props);
    }
    static fromSdp(sdp) {
        const ice = src_1.Candidate.fromSdp(sdp);
        const candidate = candidateFromIce(ice);
        return candidate.toJSON();
    }
    static isThis(o) {
        if (typeof o?.candidate === "string")
            return true;
    }
    toJSON() {
        return {
            candidate: this.candidate,
            sdpMid: this.sdpMid,
            sdpMLineIndex: this.sdpMLineIndex,
            usernameFragment: this.usernameFragment,
        };
    }
}
exports.RTCIceCandidate = RTCIceCandidate;
class IceCandidate {
    constructor(component, foundation, ip, port, priority, protocol, type, generation, ufrag) {
        Object.defineProperty(this, "component", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: component
        });
        Object.defineProperty(this, "foundation", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: foundation
        });
        Object.defineProperty(this, "ip", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: ip
        });
        Object.defineProperty(this, "port", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: port
        });
        Object.defineProperty(this, "priority", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: priority
        });
        Object.defineProperty(this, "protocol", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: protocol
        });
        Object.defineProperty(this, "type", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: type
        });
        Object.defineProperty(this, "generation", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: generation
        });
        Object.defineProperty(this, "ufrag", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: ufrag
        });
        // """
        // The :class:`RTCIceCandidate` interface represents a candidate Interactive
        // Connectivity Establishment (ICE) configuration which may be used to
        // establish an RTCPeerConnection.
        // """
        Object.defineProperty(this, "relatedAddress", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "relatedPort", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "sdpMid", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "sdpMLineIndex", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "tcpType", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
    }
    toJSON() {
        return new RTCIceCandidate({
            candidate: (0, sdp_1.candidateToSdp)(this),
            sdpMLineIndex: this.sdpMLineIndex,
            sdpMid: this.sdpMid,
            usernameFragment: this.ufrag,
        });
    }
    static fromJSON(data) {
        try {
            if (!data.candidate) {
                throw new Error("candidate is required");
            }
            const normalizedCandidate = data.candidate.startsWith("candidate:")
                ? data.candidate.slice("candidate:".length)
                : data.candidate;
            const candidate = (0, sdp_1.candidateFromSdp)(normalizedCandidate);
            candidate.sdpMLineIndex = data.sdpMLineIndex ?? undefined;
            candidate.sdpMid = data.sdpMid ?? undefined;
            return candidate;
        }
        catch (error) { }
    }
}
exports.IceCandidate = IceCandidate;
class RTCIceParameters {
    constructor(props = {}) {
        Object.defineProperty(this, "iceLite", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        Object.defineProperty(this, "usernameFragment", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "password", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.assign(this, props);
    }
}
exports.RTCIceParameters = RTCIceParameters;
//# sourceMappingURL=ice.js.map