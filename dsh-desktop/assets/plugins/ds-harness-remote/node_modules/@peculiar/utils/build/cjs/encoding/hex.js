"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hex = exports.formats = void 0;
exports.normalize = normalize;
exports.is = is;
exports.encode = encode;
exports.decode = decode;
exports.parse = parse;
exports.format = format;
const index_js_1 = require("../bytes/index.js");
const HEX_CHARACTER_REGEX = /^[0-9a-f]$/i;
const COMMON_SEPARATORS = [" ", "\t", "\n", "\r", ":", "-", "."];
function resolveSeparators(options) {
    if (options.separators === "none") {
        return [];
    }
    if (!options.separators || options.separators === "common") {
        return COMMON_SEPARATORS;
    }
    return options.separators;
}
function validateSeparator(separator) {
    if (!separator) {
        throw new TypeError("Hex separators must be non-empty strings");
    }
}
function matchSeparator(text, index, separators) {
    for (const separator of separators) {
        if (text.startsWith(separator, index)) {
            return separator;
        }
    }
    return undefined;
}
function detectCase(text) {
    const hasUpper = /[A-F]/.test(text);
    const hasLower = /[a-f]/.test(text);
    return hasUpper && !hasLower ? "upper" : "lower";
}
function detectLineSeparator(text) {
    const match = /\r\n|\n/.exec(text);
    if (!match) {
        return undefined;
    }
    return match[0] === "\r\n" ? "\r\n" : "\n";
}
function compactForDetection(text) {
    return text.replace(/[^0-9a-f]/gi, "");
}
function detectGroup(text) {
    const segments = text.match(/[0-9A-Fa-f]+|[^0-9A-Fa-f]+/g) ?? [];
    if (segments.length < 3) {
        return undefined;
    }
    const hexSegments = segments.filter((_, index) => index % 2 === 0);
    const separators = segments.filter((_, index) => index % 2 === 1);
    const separator = separators[0];
    if (!separator || separators.some((item) => item !== separator)) {
        return undefined;
    }
    if (hexSegments.some((segment) => segment.length === 0 || segment.length % 2 !== 0)) {
        return undefined;
    }
    const firstLength = hexSegments[0]?.length ?? 0;
    if (!firstLength) {
        return undefined;
    }
    if (hexSegments.slice(0, -1).some((segment) => segment.length !== firstLength)) {
        return undefined;
    }
    if ((hexSegments[hexSegments.length - 1]?.length ?? 0) > firstLength) {
        return undefined;
    }
    return {
        size: firstLength / 2,
        separator,
    };
}
function detectFormat(text) {
    const trimmed = text.trim();
    const prefix = /^0x/i.test(trimmed) ? "0x" : "";
    const body = prefix ? trimmed.slice(2) : trimmed;
    const lineSeparator = detectLineSeparator(body);
    const lines = body.split(/\r\n|\n/).filter((line) => line.length > 0);
    const sampleLine = lines[0]?.trim() ?? "";
    const group = detectGroup(sampleLine);
    const format = {
        case: detectCase(trimmed),
        prefix,
    };
    if (group) {
        format.group = group;
    }
    if (lineSeparator && lines.length > 1) {
        const firstLineBytes = compactForDetection(lines[0] ?? "").length / 2;
        if (firstLineBytes > 0 && lines.slice(0, -1).every((line) => compactForDetection(line).length / 2 === firstLineBytes)) {
            format.line = {
                bytesPerLine: firstLineBytes,
                separator: lineSeparator,
            };
        }
    }
    return format;
}
function normalizeText(text, options) {
    const allowPrefix = options.allowPrefix ?? true;
    const separators = [...resolveSeparators(options)].sort((left, right) => right.length - left.length);
    for (const separator of separators) {
        validateSeparator(separator);
    }
    let working = text.trim();
    if (/^0x/i.test(working)) {
        if (!allowPrefix) {
            throw new TypeError("Hexadecimal text must not include a 0x prefix");
        }
        working = working.slice(2);
    }
    let normalized = "";
    let lastTokenWasSeparator = false;
    for (let index = 0; index < working.length;) {
        const character = working[index] ?? "";
        if (HEX_CHARACTER_REGEX.test(character)) {
            normalized += character;
            lastTokenWasSeparator = false;
            index += 1;
            continue;
        }
        const separator = matchSeparator(working, index, separators);
        if (!separator) {
            throw new TypeError("Input is not valid hexadecimal text");
        }
        if (options.strict && (lastTokenWasSeparator || normalized.length === 0)) {
            throw new TypeError("Hexadecimal text contains misplaced separators");
        }
        lastTokenWasSeparator = true;
        index += separator.length;
    }
    if (options.strict && lastTokenWasSeparator && normalized.length > 0) {
        throw new TypeError("Hexadecimal text must not end with a separator");
    }
    if (normalized.length % 2 !== 0) {
        if (!options.allowOddLength) {
            throw new TypeError("Hexadecimal text must contain an even number of characters");
        }
        normalized = `0${normalized}`;
    }
    return normalized.toLowerCase();
}
function groupPairs(pairs, group) {
    if (!group) {
        return pairs.join("");
    }
    if (!Number.isInteger(group.size) || group.size < 1) {
        throw new RangeError("Hex group size must be a positive integer");
    }
    const chunks = [];
    for (let index = 0; index < pairs.length; index += group.size) {
        chunks.push(pairs.slice(index, index + group.size).join(""));
    }
    return chunks.join(group.separator);
}
function normalize(text, options = {}) {
    return normalizeText(text, options);
}
function is(text, options = {}) {
    if (typeof text !== "string") {
        return false;
    }
    try {
        normalize(text, options);
        return true;
    }
    catch {
        return false;
    }
}
function encode(data, options = {}) {
    const bytes = (0, index_js_1.toUint8Array)(data);
    const casing = options.case ?? "lower";
    const pairs = Array.from(bytes, (byte) => {
        const text = byte.toString(16).padStart(2, "0");
        return casing === "upper" ? text.toUpperCase() : text;
    });
    let body = "";
    if (options.line) {
        const bytesPerLine = options.line.bytesPerLine;
        if (!Number.isInteger(bytesPerLine) || bytesPerLine < 1) {
            throw new RangeError("Hex bytesPerLine must be a positive integer");
        }
        const separator = options.line.separator ?? "\n";
        const lines = [];
        for (let index = 0; index < pairs.length; index += bytesPerLine) {
            lines.push(groupPairs(pairs.slice(index, index + bytesPerLine), options.group));
        }
        body = lines.join(separator);
    }
    else {
        body = groupPairs(pairs, options.group);
    }
    return `${options.prefix ?? ""}${body}`;
}
function decode(text, options = {}) {
    const normalized = normalize(text, options);
    const result = new Uint8Array(normalized.length / 2);
    for (let i = 0; i < normalized.length; i += 2) {
        result[i / 2] = Number.parseInt(normalized.slice(i, i + 2), 16);
    }
    return result;
}
function parse(text, options = {}) {
    const normalized = normalize(text, options);
    return {
        bytes: decode(normalized),
        format: detectFormat(text),
        normalized,
    };
}
function format(data, value) {
    return encode(data, value);
}
exports.formats = {
    compact: Object.freeze({}),
    upper: Object.freeze({ case: "upper" }),
    colon: Object.freeze({ group: { size: 1, separator: ":" } }),
    colonUpper: Object.freeze({ case: "upper", group: { size: 1, separator: ":" } }),
    groupsOf4: Object.freeze({ group: { size: 4, separator: " " } }),
    prefixed: Object.freeze({ prefix: "0x" }),
};
exports.hex = { encode, decode, format, formats: exports.formats, is, normalize, parse };
