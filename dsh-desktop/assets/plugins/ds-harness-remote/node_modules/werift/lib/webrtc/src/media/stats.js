"use strict";
/**
 * WebRTC Statistics API implementation
 * Based on: https://www.w3.org/TR/webrtc-stats/
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.RTCStatsReport = void 0;
exports.generateStatsId = generateStatsId;
exports.generateCodecStatsId = generateCodecStatsId;
exports.getStatsTimestamp = getStatsTimestamp;
exports.getReferencedStatsIds = getReferencedStatsIds;
exports.buildStatsReport = buildStatsReport;
/**
 * RTCStatsReport is a Map-like object that holds WebRTC statistics
 */
class RTCStatsReport extends Map {
    constructor(stats) {
        super();
        if (stats) {
            for (const stat of stats) {
                this.set(stat.id, stat);
            }
        }
    }
}
exports.RTCStatsReport = RTCStatsReport;
/**
 * Generate a unique ID for a statistics object
 */
function generateStatsId(type, ...parts) {
    const validParts = parts.filter((p) => p !== undefined);
    return `${type}_${validParts.join("_")}`;
}
function generateCodecStatsId(transportId, payloadType, scopeId) {
    return generateStatsId("codec", transportId, payloadType, scopeId);
}
/**
 * Get current timestamp in milliseconds (DOMHighResTimeStamp)
 */
function getStatsTimestamp() {
    return performance.timeOrigin + performance.now();
}
function getReferencedStatsIds(stat) {
    const references = [];
    for (const [key, value] of Object.entries(stat)) {
        if (key === "id") {
            continue;
        }
        if (key.endsWith("Id")) {
            if (typeof value === "string") {
                references.push(value);
            }
            continue;
        }
        if (key.endsWith("Ids") && Array.isArray(value)) {
            for (const entry of value) {
                if (typeof entry === "string") {
                    references.push(entry);
                }
            }
        }
    }
    return references;
}
function buildStatsReport(stats, rootIds) {
    const index = new Map();
    for (const stat of stats) {
        index.set(stat.id, stat);
    }
    if (!rootIds) {
        return new RTCStatsReport([...index.values()]);
    }
    const includedIds = new Set();
    const queue = [...new Set(Array.from(rootIds))];
    while (queue.length > 0) {
        const id = queue.shift();
        if (!id || includedIds.has(id)) {
            continue;
        }
        const stat = index.get(id);
        if (!stat) {
            continue;
        }
        includedIds.add(id);
        queue.push(...getReferencedStatsIds(stat));
    }
    return new RTCStatsReport([...includedIds]
        .map((id) => index.get(id))
        .filter((stat) => !!stat));
}
//# sourceMappingURL=stats.js.map