"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SsrcDescription = exports.RTCSessionDescription = exports.GroupDescription = exports.MediaDescription = exports.SessionDescription = void 0;
exports.candidateToSdp = candidateToSdp;
exports.parseGroup = parseGroup;
exports.candidateFromSdp = candidateFromSdp;
exports.addSDPHeader = addSDPHeader;
exports.codecParametersFromString = codecParametersFromString;
exports.codecParametersToString = codecParametersToString;
const crypto_1 = require("crypto");
const net_1 = require("net");
const const_1 = require("./const");
const helper_1 = require("./helper");
const ice_1 = require("./imports/ice");
const parameters_1 = require("./media/parameters");
const dtls_1 = require("./transport/dtls");
const ice_2 = require("./transport/ice");
const sctp_1 = require("./transport/sctp");
class SessionDescription {
    constructor() {
        Object.defineProperty(this, "version", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "origin", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: "-"
        });
        Object.defineProperty(this, "time", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: "0 0"
        });
        Object.defineProperty(this, "host", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "group", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        Object.defineProperty(this, "extMapAllowMixed", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: true
        });
        Object.defineProperty(this, "msidSemantic", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        Object.defineProperty(this, "media", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        Object.defineProperty(this, "type", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "dtlsRole", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "iceOptions", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "iceLite", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "icePassword", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "iceUsernameFragment", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "dtlsFingerprints", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        Object.defineProperty(this, "cachedJson", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
    }
    static parse(sdp) {
        const [sessionLines, mediaGroups] = groupLines(sdp);
        const session = new SessionDescription();
        sessionLines.forEach((line) => {
            if (line.startsWith("v=")) {
                session.version = Number.parseInt(line.slice(2), 10);
            }
            else if (line.startsWith("o=")) {
                session.origin = line.slice(2);
            }
            else if (line.startsWith("s=")) {
                session.name = line.slice(2);
            }
            else if (line.startsWith("c=")) {
                session.host = ipAddressFromSdp(line.slice(2));
            }
            else if (line.startsWith("t=")) {
                session.time = line.slice(2);
            }
            else if (line.startsWith("a=")) {
                const [attr, value] = parseAttr(line);
                switch (attr) {
                    case "fingerprint":
                        {
                            const [algorithm, fingerprint] = value?.split(" ") || [];
                            session.dtlsFingerprints.push(new dtls_1.RTCDtlsFingerprint(algorithm, fingerprint));
                        }
                        break;
                    case "ice-lite":
                        session.iceLite = true;
                        break;
                    case "ice-options":
                        session.iceOptions = value;
                        break;
                    case "ice-pwd":
                        session.icePassword = value;
                        break;
                    case "ice-ufrag":
                        session.iceUsernameFragment = value;
                        break;
                    case "group":
                        parseGroup(session.group, value);
                        break;
                    case "msid-semantic":
                        parseGroup(session.msidSemantic, value);
                        break;
                    case "setup":
                        session.dtlsRole = const_1.DTLS_SETUP_ROLE[value];
                        break;
                    case "extmap-allow-mixed":
                        session.extMapAllowMixed = true;
                        break;
                }
            }
        });
        const bundle = session.group.find((g) => g.semantic === "BUNDLE");
        mediaGroups.forEach((mediaLines) => {
            const target = mediaLines[0];
            const m = target.match(/^m=([^ ]+) ([0-9]+) ([A-Z/]+) (.+)/);
            if (!m) {
                throw new Error("m line not found");
            }
            const kind = m[1];
            const fmt = m[4].split(" ");
            // todo fix
            const fmtInt = ["audio", "video"].includes(kind)
                ? fmt.map((v) => Number(v))
                : undefined;
            const currentMedia = new MediaDescription(kind, Number.parseInt(m[2]), m[3], fmtInt || fmt);
            currentMedia.dtlsParams = new dtls_1.RTCDtlsParameters([...session.dtlsFingerprints], session.dtlsRole);
            currentMedia.iceParams = new ice_2.RTCIceParameters({
                iceLite: session.iceLite,
                usernameFragment: session.iceUsernameFragment,
                password: session.icePassword,
            });
            currentMedia.iceOptions = session.iceOptions;
            session.media.push(currentMedia);
            mediaLines.slice(1).forEach((line) => {
                if (line.startsWith("c=")) {
                    currentMedia.host = ipAddressFromSdp(line.slice(2));
                }
                else if (line.startsWith("a=")) {
                    const [attr, value] = parseAttr(line);
                    switch (attr) {
                        case "candidate":
                            if (!value)
                                throw new Error();
                            currentMedia.iceCandidates.push(candidateFromSdp(value));
                            break;
                        case "end-of-candidates":
                            currentMedia.iceCandidatesComplete = true;
                            break;
                        case "extmap":
                            {
                                // eslint-disable-next-line prefer-const
                                let [extId, extUri] = value.split(" ");
                                if (extId.includes("/")) {
                                    [extId] = extId.split("/");
                                }
                                currentMedia.rtp.headerExtensions.push(new parameters_1.RTCRtpHeaderExtensionParameters({
                                    id: Number.parseInt(extId),
                                    uri: extUri,
                                }));
                            }
                            break;
                        case "fingerprint":
                            {
                                if (!value)
                                    throw new Error();
                                const [algorithm, fingerprint] = value.split(" ");
                                currentMedia.dtlsParams?.fingerprints.push(new dtls_1.RTCDtlsFingerprint(algorithm, fingerprint));
                            }
                            break;
                        case "ice-options":
                            currentMedia.iceOptions = value;
                            break;
                        case "ice-pwd":
                            currentMedia.iceParams.password = value;
                            break;
                        case "ice-ufrag":
                            currentMedia.iceParams.usernameFragment = value;
                            break;
                        case "ice-lite":
                            currentMedia.iceParams.iceLite = true;
                            break;
                        case "max-message-size":
                            currentMedia.sctpCapabilities = new sctp_1.RTCSctpCapabilities(Number.parseInt(value, 10));
                            break;
                        case "mid":
                            currentMedia.rtp.muxId = value;
                            break;
                        case "msid":
                            currentMedia.msids.push(value);
                            break;
                        case "rtcp":
                            {
                                const [port, rest] = (0, helper_1.divide)(value, " ");
                                currentMedia.rtcpPort = Number.parseInt(port);
                                currentMedia.rtcpHost = ipAddressFromSdp(rest);
                            }
                            break;
                        case "rtcp-mux":
                            currentMedia.rtcpMux = true;
                            break;
                        case "setup":
                            currentMedia.dtlsParams.role = const_1.DTLS_SETUP_ROLE[value];
                            break;
                        case "recvonly":
                        case "sendonly":
                        case "sendrecv":
                        case "inactive":
                            currentMedia.direction = attr;
                            break;
                        case "rtpmap":
                            {
                                const [formatId, formatDesc] = (0, helper_1.divide)(value, " ");
                                const [type, clock, channel] = formatDesc.split("/");
                                let channels;
                                if (currentMedia.kind === "audio") {
                                    channels = channel ? Number.parseInt(channel) : 1;
                                }
                                const codec = new parameters_1.RTCRtpCodecParameters({
                                    mimeType: currentMedia.kind + "/" + type,
                                    channels,
                                    clockRate: Number.parseInt(clock),
                                    payloadType: Number.parseInt(formatId),
                                });
                                currentMedia.rtp.codecs.push(codec);
                            }
                            break;
                        case "sctpmap":
                            {
                                if (!value)
                                    throw new Error();
                                const [formatId, formatDesc] = (0, helper_1.divide)(value, " ");
                                currentMedia.sctpMap[Number.parseInt(formatId)] = formatDesc;
                                currentMedia.sctpPort = Number.parseInt(formatId);
                            }
                            break;
                        case "sctp-port":
                            if (!value)
                                throw new Error();
                            currentMedia.sctpPort = Number.parseInt(value);
                            break;
                        case "ssrc":
                            {
                                const [ssrcStr, ssrcDesc] = (0, helper_1.divide)(value, " ");
                                const ssrc = Number.parseInt(ssrcStr);
                                const [ssrcAttr, ssrcValue] = (0, helper_1.divide)(ssrcDesc, ":");
                                let ssrcInfo = currentMedia.ssrc.find((v) => v.ssrc === ssrc);
                                if (!ssrcInfo) {
                                    ssrcInfo = new SsrcDescription({ ssrc });
                                    currentMedia.ssrc.push(ssrcInfo);
                                }
                                if (const_1.SSRC_INFO_ATTRS.includes(ssrcAttr)) {
                                    ssrcInfo[ssrcAttr] = ssrcValue;
                                }
                            }
                            break;
                        case "ssrc-group":
                            parseGroup(currentMedia.ssrcGroup, value);
                            break;
                        case "rid":
                            {
                                const [rid, direction] = (0, helper_1.divide)(value, " ");
                                currentMedia.simulcastParameters.push(new parameters_1.RTCRtpSimulcastParameters({
                                    rid,
                                    direction: direction,
                                }));
                            }
                            break;
                    }
                }
            });
            if (!currentMedia.iceParams.usernameFragment ||
                !currentMedia.iceParams.password) {
                if (currentMedia.rtp.muxId &&
                    bundle &&
                    bundle.items.includes(currentMedia.rtp.muxId)) {
                    for (let i = 0; i < bundle.items.length; i++) {
                        if (!bundle.items.includes(i.toString()))
                            continue;
                        const check = session.media[i];
                        if (check.iceParams?.usernameFragment && check.iceParams.password) {
                            currentMedia.iceParams = {
                                ...check.iceParams,
                            };
                            break;
                        }
                    }
                }
            }
            if (!currentMedia.dtlsParams.role) {
                currentMedia.dtlsParams = undefined;
            }
            const findCodec = (pt) => currentMedia.rtp.codecs.find((v) => v.payloadType === pt);
            mediaLines.slice(1).forEach((line) => {
                if (line.startsWith("a=")) {
                    const [attr, value] = parseAttr(line);
                    if (attr === "fmtp") {
                        const [formatId, formatDesc] = (0, helper_1.divide)(value, " ");
                        const codec = findCodec(Number(formatId));
                        codec.parameters = formatDesc;
                    }
                    else if (attr === "rtcp-fb") {
                        const [payloadType, feedbackType, feedbackParam] = value.split(" ");
                        currentMedia.rtp.codecs.forEach((codec) => {
                            if (["*", codec.payloadType.toString()].includes(payloadType)) {
                                codec.rtcpFeedback.push(new parameters_1.RTCRtcpFeedback({
                                    type: feedbackType,
                                    parameter: feedbackParam,
                                }));
                            }
                        });
                    }
                }
            });
        });
        return session;
    }
    webrtcTrackId(media) {
        if (media.msid?.includes(" ")) {
            const bits = media.msid.split(" ");
            for (const group of this.msidSemantic) {
                if (group.semantic === "WMS" &&
                    (group.items.includes(bits[0]) || group.items.includes("*"))) {
                    return bits[1];
                }
            }
        }
        return;
    }
    get string() {
        const lines = [`v=${this.version}`, `o=${this.origin}`, `s=${this.name}`];
        if (this.host) {
            lines.push(`c=${ipAddressToSdp(this.host)}`);
        }
        lines.push(`t=${this.time}`);
        this.group.forEach((group) => lines.push(`a=group:${group.str}`));
        if (this.extMapAllowMixed) {
            lines.push(`a=extmap-allow-mixed`);
        }
        this.msidSemantic.forEach((group) => lines.push(`a=msid-semantic:${group.str}`));
        const media = this.media.map((m) => m.toString()).join("");
        const sdp = lines.join("\r\n") + "\r\n" + media;
        return sdp;
    }
    toJSON() {
        const sdp = this.string;
        if (!this.cachedJson ||
            this.cachedJson.sdp !== sdp ||
            this.cachedJson.type !== this.type) {
            this.cachedJson = new RTCSessionDescription(sdp, this.type);
        }
        return this.cachedJson;
    }
    toSdp() {
        return {
            type: this.type,
            sdp: this.string,
        };
    }
}
exports.SessionDescription = SessionDescription;
class MediaDescription {
    constructor(kind, port, profile, fmt) {
        Object.defineProperty(this, "kind", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: kind
        });
        Object.defineProperty(this, "port", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: port
        });
        Object.defineProperty(this, "profile", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: profile
        });
        Object.defineProperty(this, "fmt", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: fmt
        });
        // rtp
        Object.defineProperty(this, "host", {
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
        Object.defineProperty(this, "msids", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        // rtcp
        Object.defineProperty(this, "rtcpPort", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "rtcpHost", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "rtcpMux", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        // ssrc
        Object.defineProperty(this, "ssrc", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        Object.defineProperty(this, "ssrcGroup", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        // formats
        Object.defineProperty(this, "rtp", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: { codecs: [], headerExtensions: [] }
        });
        // sctp
        Object.defineProperty(this, "sctpCapabilities", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "sctpMap", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: {}
        });
        Object.defineProperty(this, "sctpPort", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        // DTLS
        Object.defineProperty(this, "dtlsParams", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        // ICE
        Object.defineProperty(this, "iceParams", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "iceCandidates", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        Object.defineProperty(this, "iceCandidatesComplete", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        Object.defineProperty(this, "iceOptions", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        // Simulcast
        Object.defineProperty(this, "simulcastParameters", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
    }
    get msid() {
        return this.msids[0];
    }
    set msid(value) {
        this.msids = value ? [value] : [];
    }
    toString() {
        const lines = [];
        lines.push(`m=${this.kind} ${this.port} ${this.profile} ${this.fmt
            .map((v) => v.toString())
            .join(" ")}`);
        if (this.host) {
            lines.push(`c=${ipAddressToSdp(this.host)}`);
        }
        // ice
        this.iceCandidates.forEach((candidate) => {
            lines.push(`a=candidate:${candidateToSdp(candidate)}`);
        });
        if (this.iceCandidatesComplete) {
            lines.push("a=end-of-candidates");
        }
        if (this.iceParams?.usernameFragment) {
            lines.push(`a=ice-ufrag:${this.iceParams.usernameFragment}`);
        }
        if (this.iceParams?.password) {
            lines.push(`a=ice-pwd:${this.iceParams.password}`);
        }
        if (this.iceParams?.iceLite) {
            lines.push(`a=ice-lite`);
        }
        if (this.iceOptions) {
            lines.push(`a=ice-options:${this.iceOptions}`);
        }
        // dtls
        if (this.dtlsParams) {
            this.dtlsParams.fingerprints.forEach((fingerprint) => {
                lines.push(`a=fingerprint:${fingerprint.algorithm} ${fingerprint.value}`);
            });
            lines.push(`a=setup:${const_1.DTLS_ROLE_SETUP[this.dtlsParams.role]}`);
        }
        if (this.direction) {
            lines.push(`a=${this.direction}`);
        }
        if (this.rtp.muxId) {
            lines.push(`a=mid:${this.rtp.muxId}`);
        }
        this.msids.forEach((msid) => lines.push(`a=msid:${msid}`));
        if (this.rtcpPort && this.rtcpHost) {
            lines.push(`a=rtcp:${this.rtcpPort} ${ipAddressToSdp(this.rtcpHost)}`);
            if (this.rtcpMux) {
                lines.push("a=rtcp-mux");
            }
        }
        this.ssrcGroup.forEach((group) => {
            lines.push(`a=ssrc-group:${group.str}`);
        });
        this.ssrc.forEach((ssrcInfo) => {
            const_1.SSRC_INFO_ATTRS.forEach((ssrcAttr) => {
                const ssrcValue = ssrcInfo[ssrcAttr];
                if (ssrcValue !== undefined) {
                    lines.push(`a=ssrc:${ssrcInfo.ssrc} ${ssrcAttr}:${ssrcValue}`);
                }
            });
        });
        this.rtp.codecs.forEach((codec) => {
            lines.push(`a=rtpmap:${codec.payloadType} ${codec.str}`);
            codec.rtcpFeedback.forEach((feedback) => {
                let value = feedback.type;
                if (feedback.parameter)
                    value += ` ${feedback.parameter}`;
                lines.push(`a=rtcp-fb:${codec.payloadType} ${value}`);
            });
            if (codec.parameters) {
                lines.push(`a=fmtp:${codec.payloadType} ${codec.parameters}`);
            }
        });
        Object.keys(this.sctpMap).forEach((k) => {
            const v = this.sctpMap[Number(k)];
            lines.push(`a=sctpmap:${k} ${v}`);
        });
        if (this.sctpPort) {
            lines.push(`a=sctp-port:${this.sctpPort}`);
        }
        if (this.sctpCapabilities) {
            lines.push(`a=max-message-size:${this.sctpCapabilities.maxMessageSize}`);
        }
        // rtp extension
        this.rtp.headerExtensions.forEach((extension) => lines.push(`a=extmap:${extension.id} ${extension.uri}`));
        // simulcast
        if (this.simulcastParameters.length) {
            this.simulcastParameters.forEach((param) => {
                lines.push(`a=rid:${param.rid} ${param.direction}`);
            });
            let line = `a=simulcast:`;
            const recv = this.simulcastParameters.filter((v) => v.direction === "recv");
            if (recv.length) {
                line += `recv ${recv.map((v) => v.rid).join(";")} `;
            }
            const send = this.simulcastParameters.filter((v) => v.direction === "send");
            if (send.length) {
                line += `send ${send.map((v) => v.rid).join(";")}`;
            }
            lines.push(line);
        }
        return lines.join("\r\n") + "\r\n";
    }
}
exports.MediaDescription = MediaDescription;
class GroupDescription {
    constructor(semantic, items) {
        Object.defineProperty(this, "semantic", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: semantic
        });
        Object.defineProperty(this, "items", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: items
        });
    }
    get str() {
        return `${this.semantic} ${this.items.join(" ")}`;
    }
}
exports.GroupDescription = GroupDescription;
function ipAddressFromSdp(sdp) {
    const m = sdp.match(/^IN (IP4|IP6) ([^ ]+)$/);
    if (!m)
        throw new Error("exception");
    return m[2];
}
function ipAddressToSdp(addr) {
    const version = (0, net_1.isIPv4)(addr) ? 4 : 6;
    return `IN IP${version} ${addr}`;
}
function candidateToSdp(c) {
    let sdp = `${c.foundation} ${c.component} ${c.protocol} ${c.priority} ${c.ip} ${c.port} typ ${c.type}`;
    if (c.relatedAddress != undefined) {
        sdp += ` raddr ${c.relatedAddress}`;
    }
    if (c.relatedPort != undefined) {
        sdp += ` rport ${c.relatedPort}`;
    }
    if (c.tcpType != undefined) {
        sdp += ` tcptype ${c.tcpType}`;
    }
    if (c.generation != undefined) {
        sdp += ` generation ${c.generation}`;
    }
    if (c.ufrag != undefined) {
        sdp += ` ufrag ${c.ufrag}`;
    }
    return sdp;
}
function groupLines(sdp) {
    const session = [];
    const media = [];
    let lines = sdp.split("\r\n");
    if (lines.length === 1) {
        lines = sdp.split("\n");
    }
    lines.forEach((line) => {
        if (line.startsWith("m=")) {
            media.push([line]);
        }
        else if (media.length > 0) {
            media[media.length - 1].push(line);
        }
        else {
            session.push(line);
        }
    });
    return [session, media];
}
function parseAttr(line) {
    if (line.includes(":")) {
        const bits = (0, helper_1.divide)(line.slice(2), ":");
        return [bits[0], bits[1]];
    }
    else {
        return [line.slice(2), undefined];
    }
}
function parseGroup(dest, value, type = (v) => v.toString()) {
    const bits = value.split(" ");
    if (bits.length > 0) {
        dest.push(new GroupDescription(bits[0], bits.slice(1).map(type)));
    }
}
function candidateFromSdp(sdp) {
    const ice = ice_1.Candidate.fromSdp(sdp);
    const candidate = (0, ice_2.candidateFromIce)(ice);
    return candidate;
}
class RTCSessionDescription {
    constructor(sdp, type) {
        Object.defineProperty(this, "sdp", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "type", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperties(this, {
            sdp: {
                configurable: true,
                enumerable: true,
                value: sdp,
                writable: false,
            },
            type: {
                configurable: true,
                enumerable: true,
                value: type,
                writable: false,
            },
        });
    }
    static isThis(o) {
        if (typeof o?.sdp === "string")
            return true;
    }
    toSdp() {
        return {
            sdp: this.sdp,
            type: this.type,
        };
    }
}
exports.RTCSessionDescription = RTCSessionDescription;
function addSDPHeader(type, description) {
    const username = "-";
    const sessionId = (0, crypto_1.randomBytes)(8).readBigUInt64BE(0).toString().slice(0, 8);
    const sessionVersion = 0;
    description.origin = `${username} ${sessionId} ${sessionVersion} IN IP4 0.0.0.0`;
    description.msidSemantic.push(new GroupDescription("WMS", ["*"]));
    description.type = type;
}
function codecParametersFromString(str) {
    const parameters = {};
    str.split(";").forEach((param) => {
        if (param.includes("=")) {
            const [k, v] = (0, helper_1.divide)(param, "=");
            if (const_1.FMTP_INT_PARAMETERS.includes(k)) {
                parameters[k] = Number(v);
            }
            else {
                parameters[k] = v;
            }
        }
        else if (param.includes(":")) {
            const [k, v] = param.split(":");
            parameters[k] = Number.isNaN(Number(v)) ? v : Number(v);
        }
        else {
            parameters[param] = undefined;
        }
    });
    return parameters;
}
function codecParametersToString(parameters, joint = "=") {
    const params = Object.entries(parameters).map(([k, v]) => {
        if (v)
            return `${k}${joint}${v}`;
        else
            return k;
    });
    if (params.length > 0) {
        return params.join(";");
    }
    return undefined;
}
class SsrcDescription {
    constructor(props) {
        Object.defineProperty(this, "ssrc", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "cname", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "msid", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "msLabel", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "label", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.assign(this, props);
    }
}
exports.SsrcDescription = SsrcDescription;
//# sourceMappingURL=sdp.js.map