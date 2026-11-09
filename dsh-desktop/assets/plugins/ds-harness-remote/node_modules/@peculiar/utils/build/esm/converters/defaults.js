import { base64, base64url, binary, hex, utf8, utf16 } from "../encoding/index.js";
import { pemConverter } from "../pem/index.js";
export { pemConverter } from "../pem/index.js";
import { createConverterRegistry } from "./registry.js";
export const binaryConverter = {
    name: "binary",
    aliases: ["latin1"],
    encode: binary.encode,
    decode: binary.decode,
    is: binary.is,
};
export const hexConverter = {
    name: "hex",
    encode: hex.encode,
    decode: hex.decode,
    format: hex.format,
    is: hex.is,
    normalize: hex.normalize,
    parse: hex.parse,
};
export const base64Converter = {
    name: "base64",
    aliases: ["b64"],
    encode: base64.encode,
    decode: base64.decode,
    is: base64.is,
    normalize: base64.normalize,
};
export const base64urlConverter = {
    name: "base64url",
    aliases: ["base64-url", "b64url"],
    encode: base64url.encode,
    decode: base64url.decode,
    is: base64url.is,
    normalize: base64url.normalize,
};
export const utf8Converter = {
    name: "utf8",
    aliases: ["utf-8"],
    encode: (data) => utf8.decode(data),
    decode: (text) => utf8.encode(text),
    is: (text) => typeof text === "string",
};
export const utf16beConverter = {
    name: "utf16be",
    aliases: ["utf16", "utf-16", "utf-16be"],
    encode: (data) => utf16.decode(data),
    decode: (text) => utf16.encode(text),
    is: (text) => typeof text === "string",
};
export const utf16leConverter = {
    name: "utf16le",
    aliases: ["utf-16le", "ucs2", "usc2"],
    encode: (data) => utf16.decode(data, { littleEndian: true }),
    decode: (text) => utf16.encode(text, { littleEndian: true }),
    is: (text) => typeof text === "string",
};
export const defaultConverters = [
    binaryConverter,
    hexConverter,
    base64Converter,
    base64urlConverter,
    utf8Converter,
    utf16beConverter,
    utf16leConverter,
    pemConverter,
];
export const defaultConverterRegistry = createConverterRegistry(defaultConverters);
