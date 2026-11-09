"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deepMerge = exports.MediaStreamTrackFactory = exports.createSelfSignedCertificate = exports.compactNtp = exports.ntpTimeToEpochMs = exports.ntpTime = exports.timestampSeconds = exports.microTime = exports.milliTime = exports.andDirection = void 0;
exports.fingerprint = fingerprint;
exports.normalizeFingerprintAlgorithm = normalizeFingerprintAlgorithm;
exports.normalizeFingerprintValue = normalizeFingerprintValue;
exports.isDtls = isDtls;
exports.reverseSimulcastDirection = reverseSimulcastDirection;
exports.reverseDirection = reverseDirection;
exports.parseIceServers = parseIceServers;
exports.resolveTurnTransport = resolveTurnTransport;
/* eslint-disable prefer-const */
const crypto_1 = require("crypto");
const dgram_1 = require("dgram");
const perf_hooks_1 = require("perf_hooks");
const common_1 = require("./imports/common");
const dtls_1 = require("./imports/dtls");
const rtpTransceiver_1 = require("./media/rtpTransceiver");
const track_1 = require("./media/track");
const log = (0, common_1.debug)("werift:packages/webrtc/src/utils.ts");
function fingerprint(file, hashName) {
    const upper = (s) => s.toUpperCase();
    const colon = (s) => s.match(/(.{2})/g).join(":");
    const hash = (0, crypto_1.createHash)(hashName).update(file).digest("hex");
    return colon(upper(hash));
}
const fingerprintHashAlgorithms = {
    sha1: "sha1",
    "sha-1": "sha1",
    sha224: "sha224",
    "sha-224": "sha224",
    sha256: "sha256",
    "sha-256": "sha256",
    sha384: "sha384",
    "sha-384": "sha384",
    sha512: "sha512",
    "sha-512": "sha512",
};
function normalizeFingerprintAlgorithm(algorithm) {
    return fingerprintHashAlgorithms[algorithm.trim().toLowerCase()];
}
function normalizeFingerprintValue(value) {
    return value.replace(/[^0-9a-f]/gi, "").toLowerCase();
}
function isDtls(buf) {
    const firstByte = buf[0];
    return firstByte > 19 && firstByte < 64;
}
function reverseSimulcastDirection(dir) {
    if (dir === "recv")
        return "send";
    return "recv";
}
const andDirection = (a, b) => rtpTransceiver_1.Directions[rtpTransceiver_1.Directions.indexOf(a) & rtpTransceiver_1.Directions.indexOf(b)];
exports.andDirection = andDirection;
function reverseDirection(dir) {
    if (dir === "sendonly")
        return "recvonly";
    if (dir === "recvonly")
        return "sendonly";
    return dir;
}
exports.milliTime = Date.now;
const startupTimestampInMicroseconds = BigInt(Date.now()) * 1000n - process.hrtime.bigint() / 1000n;
const microTime = () => {
    return startupTimestampInMicroseconds + process.hrtime.bigint() / 1000n;
};
exports.microTime = microTime;
const timestampSeconds = () => Date.now() / 1000;
exports.timestampSeconds = timestampSeconds;
/**https://datatracker.ietf.org/doc/html/rfc3550#section-4 */
const ntpTime = () => {
    const now = perf_hooks_1.performance.timeOrigin + perf_hooks_1.performance.now() - Date.UTC(1900, 0, 1);
    const seconds = now / 1000;
    const [sec, msec] = seconds.toString().split(".").map(Number);
    const buf = (0, common_1.bufferWriter)([4, 4], [sec, msec]);
    return buf.readBigUInt64BE();
};
exports.ntpTime = ntpTime;
const ntpTimeToEpochMs = (ntp) => {
    const [seconds, milliseconds] = (0, common_1.bufferReader)((0, common_1.bufferWriter)([8], [ntp]), [4, 4]);
    return seconds * 1000 + milliseconds + Date.UTC(1900, 0, 1);
};
exports.ntpTimeToEpochMs = ntpTimeToEpochMs;
/**
 * https://datatracker.ietf.org/doc/html/rfc3550#section-4
 * @param ntp
 * @returns 32bit
 */
const compactNtp = (ntp) => {
    const buf = (0, common_1.bufferWriter)([8], [ntp]);
    const [, sec, msec] = (0, common_1.bufferReader)(buf, [2, 2, 2, 2]);
    return (0, common_1.bufferWriter)([2, 2], [sec, msec]).readUInt32BE();
};
exports.compactNtp = compactNtp;
function parseIceServers(iceServers) {
    const options = {};
    for (const iceServer of iceServers) {
        const urls = Array.isArray(iceServer.urls)
            ? iceServer.urls
            : [iceServer.urls];
        for (const url of urls) {
            const parsed = parseIceServerUrl(url);
            if (!parsed) {
                continue;
            }
            if (!options.stunServer && parsed.kind === "stun") {
                options.stunServer = parsed.address;
            }
            if (!options.turnServer && parsed.kind === "turn") {
                options.turnServer = parsed.address;
                options.turnTransport = parsed.transport;
                options.turnUsername = iceServer.username;
                options.turnPassword = iceServer.credential;
            }
        }
    }
    log("iceOptions", options);
    return options;
}
function resolveTurnTransport({ configuredTurnTransport, forceTurnTCP, parsedTurnTransport, }) {
    if (parsedTurnTransport) {
        return parsedTurnTransport;
    }
    if (configuredTurnTransport) {
        return configuredTurnTransport;
    }
    if (forceTurnTCP) {
        return "tcp";
    }
    return undefined;
}
function parseIceServerUrl(url) {
    const matched = /^(stun|stuns|turn|turns):(.+)$/i.exec(url.trim());
    if (!matched) {
        return;
    }
    const [, rawScheme, rawRest] = matched;
    const scheme = rawScheme.toLowerCase();
    const [authority] = rawRest.split("?", 1);
    const [, query = ""] = rawRest.split("?");
    const address = parseAddress(authority, defaultPort(scheme));
    if (!address) {
        return;
    }
    if (scheme === "stun" || scheme === "stuns") {
        return { kind: "stun", address };
    }
    const queryParams = new URLSearchParams(query);
    const transportParam = queryParams.get("transport");
    const transport = resolveParsedTurnTransport({
        scheme,
        transportParam,
    });
    if (transport === "invalid") {
        return;
    }
    return {
        kind: "turn",
        address,
        transport,
    };
}
function resolveParsedTurnTransport({ scheme, transportParam, }) {
    if (transportParam == null) {
        return scheme === "turns" ? "tls" : undefined;
    }
    if (transportParam === "udp") {
        return scheme === "turns" ? "invalid" : "udp";
    }
    if (transportParam === "tcp") {
        return scheme === "turns" ? "tls" : "tcp";
    }
    return "invalid";
}
function defaultPort(scheme) {
    if (scheme === "stuns" || scheme === "turns") {
        return 5349;
    }
    return 3478;
}
function parseAddress(value, fallbackPort) {
    const authority = value.startsWith("//") ? value.slice(2) : value;
    if (!authority) {
        return;
    }
    if (authority.startsWith("[")) {
        const closingBracket = authority.indexOf("]");
        if (closingBracket === -1) {
            return;
        }
        const host = authority.slice(1, closingBracket);
        const port = parsePort(authority.slice(closingBracket + 1), fallbackPort);
        return [host, port];
    }
    const firstColon = authority.indexOf(":");
    const lastColon = authority.lastIndexOf(":");
    if (firstColon !== -1 && firstColon === lastColon) {
        return [
            authority.slice(0, firstColon),
            parsePort(authority.slice(firstColon + 1), fallbackPort),
        ];
    }
    return [authority, fallbackPort];
}
function parsePort(value, fallbackPort) {
    const portString = value.startsWith(":") ? value.slice(1) : value;
    const port = Number.parseInt(portString, 10);
    return Number.isFinite(port) ? port : fallbackPort;
}
/**
 *
 * @param signatureHash
 * @param namedCurveAlgorithm necessary when use ecdsa
 */
exports.createSelfSignedCertificate = dtls_1.CipherContext.createSelfSignedCertificateWithKey;
class MediaStreamTrackFactory {
    static async rtpSource({ port, kind, cb, }) {
        port ?? (port = await (0, common_1.randomPort)());
        const track = new track_1.MediaStreamTrack({ kind });
        const udp = (0, dgram_1.createSocket)("udp4");
        udp.bind(port);
        const onMessage = (msg) => {
            if (cb) {
                msg = cb(msg);
            }
            track.writeRtp(msg);
        };
        udp.addListener("message", onMessage);
        const dispose = () => {
            udp.removeListener("message", onMessage);
            try {
                udp.close();
            }
            catch (error) { }
        };
        return [track, port, dispose];
    }
}
exports.MediaStreamTrackFactory = MediaStreamTrackFactory;
/**
 * Merge two objects. If a property value in the source object is undefined or
 * when casted is equal to undefined (== undefined), then it will not overwrite
 * the value of the property in the destination object.
 */
const deepMerge = (dst, src) => {
    if (!dst || typeof dst !== "object") {
        if (src !== null && typeof src === "object") {
            return src;
        }
        else {
            return dst;
        }
    }
    if (!src || typeof src !== "object") {
        if (src == undefined) {
            return dst;
        }
        return src;
    }
    for (const key in src) {
        if (Object.prototype.hasOwnProperty.call(src, key)) {
            const sourceValue = src[key];
            if (sourceValue != undefined) {
                dst[key] = sourceValue;
            }
        }
    }
    return dst;
};
exports.deepMerge = deepMerge;
//# sourceMappingURL=utils.js.map