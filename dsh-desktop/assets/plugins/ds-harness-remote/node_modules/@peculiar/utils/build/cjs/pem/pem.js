"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pemConverter = exports.pem = void 0;
exports.encode = encode;
exports.encodeMany = encodeMany;
exports.decode = decode;
exports.find = find;
exports.findAll = findAll;
exports.decodeFirst = decodeFirst;
exports.parse = parse;
exports.format = format;
const base64_js_1 = require("../encoding/base64.js");
const LABEL_REGEX = /^[A-Z0-9][A-Z0-9 ._-]*[A-Z0-9]$/i;
const PEM_BLOCK_REGEX = /-----BEGIN ([^-]+)-----([\s\S]*?)-----END \1-----/g;
function assertLabel(label) {
    if (!LABEL_REGEX.test(label)) {
        throw new TypeError(`Invalid PEM label '${label}'`);
    }
}
function wrap(text, lineLength) {
    const result = [];
    for (let i = 0; i < text.length; i += lineLength) {
        result.push(text.slice(i, i + lineLength));
    }
    return result;
}
function parseBody(body) {
    const normalized = body.trim().replace(/\r\n/g, "\n");
    const lines = normalized.split("\n").map((line) => line.trim()).filter(Boolean);
    const headers = {};
    let index = 0;
    for (; index < lines.length; index++) {
        const line = lines[index];
        const separator = line.indexOf(":");
        if (separator <= 0) {
            break;
        }
        headers[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
    }
    return {
        headers: Object.keys(headers).length ? headers : undefined,
        base64Lines: lines.slice(index),
        base64Text: lines.slice(index).join(""),
    };
}
function detectNewline(text) {
    return /\r\n/.test(text) ? "\r\n" : "\n";
}
function collectBlocks(text, options = {}) {
    const blocks = [];
    const requestedLabel = options.label;
    let match;
    PEM_BLOCK_REGEX.lastIndex = 0;
    while ((match = PEM_BLOCK_REGEX.exec(text))) {
        const label = match[1].trim();
        if (requestedLabel && label !== requestedLabel) {
            continue;
        }
        assertLabel(label);
        const parsed = parseBody(match[2]);
        blocks.push({
            label,
            data: base64_js_1.base64.decode(parsed.base64Text),
            headers: parsed.headers,
            lineLength: parsed.base64Lines[0]?.length ?? 64,
            newline: detectNewline(match[0]),
        });
    }
    if (options.strict && blocks.length === 0) {
        throw new TypeError(requestedLabel
            ? `No PEM block with label '${requestedLabel}' was found`
            : "No PEM blocks were found");
    }
    return blocks;
}
function encode(label, data, options = {}) {
    assertLabel(label);
    const lineLength = options.lineLength ?? 64;
    if (!Number.isInteger(lineLength) || lineLength < 1) {
        throw new RangeError("PEM lineLength must be a positive integer");
    }
    const newline = options.newline ?? "\n";
    const lines = [`-----BEGIN ${label}-----`];
    if (options.headers) {
        for (const [name, value] of Object.entries(options.headers)) {
            lines.push(`${name}: ${value}`);
        }
        lines.push("");
    }
    lines.push(...wrap(base64_js_1.base64.encode(data), lineLength));
    lines.push(`-----END ${label}-----`);
    return `${lines.join(newline)}${newline}`;
}
function encodeMany(blocks, options = {}) {
    return blocks.map((block) => encode(block.label, block.data, { ...options, headers: block.headers ?? options.headers })).join("");
}
function decode(text, options = {}) {
    return collectBlocks(text, options).map(({ lineLength: _lineLength, newline: _newline, ...block }) => block);
}
function find(text, label) {
    return decode(text, { label })[0];
}
function findAll(text, label) {
    return decode(text, { label });
}
function decodeFirst(text, label) {
    const [block] = decode(text, { label, strict: true });
    return block.data;
}
function parse(text, options = {}) {
    const [block] = collectBlocks(text, { ...options, strict: true });
    const format = {
        label: block.label,
        headers: block.headers,
        lineLength: block.lineLength,
        newline: block.newline,
    };
    return {
        bytes: block.data,
        format,
        normalized: encode(block.label, block.data, format),
    };
}
function format(data, value) {
    return encode(value.label, data, value);
}
exports.pem = { decode, decodeFirst, encode, encodeMany, find, findAll, format, parse };
exports.pemConverter = {
    name: "pem",
    encode: (data, options) => {
        if (!options?.label) {
            throw new TypeError("PEM label is required");
        }
        return encode(options.label, data, options);
    },
    decode: (text, options) => decodeFirst(text, options?.label),
    format,
    is: (text) => typeof text === "string" && /-----BEGIN [^-]+-----/.test(text),
    parse,
};
