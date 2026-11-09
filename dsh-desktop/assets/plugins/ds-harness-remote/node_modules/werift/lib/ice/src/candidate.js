"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Candidate = void 0;
exports.candidateLocalPreference = candidateLocalPreference;
exports.candidateFoundation = candidateFoundation;
exports.candidatePriority = candidatePriority;
exports.remoteTcpTypeForIncoming = remoteTcpTypeForIncoming;
const crypto_1 = require("crypto");
const net_1 = require("net");
class Candidate {
    constructor(foundation, component, transport, priority, host, port, type, relatedAddress, relatedPort, tcptype, generation, ufrag) {
        Object.defineProperty(this, "foundation", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: foundation
        });
        Object.defineProperty(this, "component", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: component
        });
        Object.defineProperty(this, "transport", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: transport
        });
        Object.defineProperty(this, "priority", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: priority
        });
        Object.defineProperty(this, "host", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: host
        });
        Object.defineProperty(this, "port", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: port
        });
        Object.defineProperty(this, "type", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: type
        });
        Object.defineProperty(this, "relatedAddress", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: relatedAddress
        });
        Object.defineProperty(this, "relatedPort", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: relatedPort
        });
        Object.defineProperty(this, "tcptype", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: tcptype
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
        // An ICE candidate.
        Object.defineProperty(this, "id", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: (0, crypto_1.randomUUID)().toString()
        });
    }
    refreshId() {
        this.id = (0, crypto_1.randomUUID)().toString();
    }
    static fromSdp(sdp) {
        // Parse a :class:`Candidate` from SDP.
        // .. code-block:: python
        //    Candidate.from_sdp(
        //     '6815297761 1 udp 659136 1.2.3.4 31102 typ host generation 0 ufrag b7l3')
        const bits = sdp.split(" ");
        if (bits.length < 8) {
            throw new Error("SDP does not have enough properties");
        }
        // 固定ワード
        const kwargs = {
            foundation: bits[0],
            component: Number(bits[1]),
            transport: bits[2],
            priority: Number(bits[3]),
            host: bits[4],
            port: Number(bits[5]),
            type: bits[7],
        };
        for (let i = 8, il = bits.length - 1; i < il; i += 2) {
            if (bits[i] === "raddr") {
                kwargs["related_address"] = bits[i + 1];
            }
            else if (bits[i] === "rport") {
                kwargs["related_port"] = Number(bits[i + 1]);
            }
            else if (bits[i] === "tcptype") {
                kwargs["tcptype"] = bits[i + 1];
            }
            else if (bits[i] === "generation") {
                kwargs["generation"] = Number(bits[i + 1]);
            }
            else if (bits[i] === "ufrag") {
                kwargs["ufrag"] = bits[i + 1];
            }
        }
        const { foundation, component, transport, priority, host, port, type } = kwargs;
        return new Candidate(foundation, component, transport, priority, host, port, type, kwargs["related_address"], kwargs["related_port"], kwargs["tcptype"], kwargs["generation"], kwargs["ufrag"]);
    }
    canPairWith(other) {
        // """
        // A local candidate is paired with a remote candidate if and only if
        // the two candidates have the same component ID and have the same IP
        // address version.
        // """
        const a = (0, net_1.isIPv4)(this.host);
        const b = (0, net_1.isIPv4)(other.host);
        return (this.component === other.component &&
            this.transport.toLowerCase() === other.transport.toLowerCase() &&
            canPairTcpCandidates(this, other) &&
            a === b);
    }
    toSdp() {
        let sdp = `${this.foundation} ${this.component} ${this.transport} ${this.priority} ${this.host} ${this.port} typ ${this.type}`;
        if (this.relatedAddress)
            sdp += ` raddr ${this.relatedAddress}`;
        if (this.relatedPort != undefined)
            sdp += ` rport ${this.relatedPort}`;
        if (this.tcptype)
            sdp += ` tcptype ${this.tcptype}`;
        if (this.generation != undefined)
            sdp += ` generation ${this.generation}`;
        if (this.ufrag != undefined)
            sdp += ` ufrag ${this.ufrag}`;
        return sdp;
    }
}
exports.Candidate = Candidate;
const UDP_TYPE_PREFERENCE = {
    host: 126,
    prflx: 110,
    srflx: 100,
    relay: 0,
};
const TCP_TYPE_PREFERENCE = {
    host: 105,
    prflx: 90,
    srflx: 80,
    relay: 0,
};
const ACTIVE_PASSIVE_DIRECTION_PREFERENCE = {
    active: 6,
    passive: 4,
    so: 2,
};
const REFLEXIVE_DIRECTION_PREFERENCE = {
    active: 4,
    passive: 2,
    so: 6,
};
function normalizeTransport(transport) {
    return transport?.toLowerCase() ?? "udp";
}
function normalizeTcpType(tcptype) {
    switch (tcptype) {
        case "active":
        case "passive":
        case "so":
            return tcptype;
        default:
            return undefined;
    }
}
function canPairTcpCandidates(local, remote) {
    if (normalizeTransport(local.transport) !== "tcp") {
        return true;
    }
    const localType = normalizeTcpType(local.tcptype);
    const remoteType = normalizeTcpType(remote.tcptype);
    if (!localType || !remoteType) {
        return false;
    }
    return ((localType === "active" && remoteType === "passive") ||
        (localType === "passive" && remoteType === "active") ||
        (localType === "so" && remoteType === "so"));
}
function candidateLocalPreference({ candidateType, transport = "udp", tcptype, otherPreference = 8191, }) {
    if (normalizeTransport(transport) !== "tcp") {
        return otherPreference;
    }
    const tcpType = normalizeTcpType(tcptype) ?? "active";
    const directionPreference = candidateType === "srflx" || candidateType === "prflx"
        ? REFLEXIVE_DIRECTION_PREFERENCE[tcpType]
        : ACTIVE_PASSIVE_DIRECTION_PREFERENCE[tcpType];
    return (1 << 13) * directionPreference + otherPreference;
}
function candidateTypePreference(candidateType, transport = "udp") {
    const table = normalizeTransport(transport) === "tcp"
        ? TCP_TYPE_PREFERENCE
        : UDP_TYPE_PREFERENCE;
    return table[candidateType] ?? 0;
}
function candidateFoundation(candidateType, candidateTransport, baseAddress) {
    // """
    // See RFC 5245 - 4.1.1.3. Computing Foundations
    // """
    const key = `${candidateType}|${candidateTransport}|${baseAddress}`;
    return (0, crypto_1.createHash)("md5").update(key, "ascii").digest("hex").slice(7);
}
// priorityを決める
function candidatePriority(candidateType, options = 65535) {
    const candidateComponent = 1;
    // See RFC 5245 - 4.1.2.1. Recommended Formula
    const transport = typeof options === "number" ? "udp" : normalizeTransport(options.transport);
    const localPref = typeof options === "number"
        ? options
        : (options.localPreference ??
            candidateLocalPreference({
                candidateType,
                transport,
                tcptype: options.tcptype,
                otherPreference: options.otherPreference,
            }));
    const typePref = candidateTypePreference(candidateType, transport);
    return ((1 << 24) * typePref + (1 << 8) * localPref + (256 - candidateComponent));
}
function remoteTcpTypeForIncoming(localTcpType) {
    switch (localTcpType) {
        case "passive":
            return "active";
        case "active":
            return "passive";
        default:
            return "so";
    }
}
//# sourceMappingURL=candidate.js.map