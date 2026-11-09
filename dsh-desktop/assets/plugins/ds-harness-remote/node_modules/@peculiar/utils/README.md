# @peculiar/utils

[![npm version](https://img.shields.io/npm/v/%40peculiar%2Futils.svg)](https://www.npmjs.com/package/@peculiar/utils)
[![Test](https://github.com/PeculiarVentures/pvtsutils/actions/workflows/test.yml/badge.svg?branch=master)](https://github.com/PeculiarVentures/pvtsutils/actions/workflows/test.yml)
[![Coverage Status](https://coveralls.io/repos/github/PeculiarVentures/pvtsutils/badge.svg?branch=master)](https://coveralls.io/github/PeculiarVentures/pvtsutils?branch=master)
[![License: MIT](https://img.shields.io/github/license/PeculiarVentures/pvtsutils.svg)](https://github.com/PeculiarVentures/pvtsutils/blob/master/LICENSE)

Modern byte, text, converter registry, and PEM utilities for TypeScript projects.

The package is designed around a modular v2 API:

- multi-entry exports for tree-shake-friendly imports;
- `encode` and `decode` terminology;
- an extensible runtime converter registry;
- generic PEM helpers without PKI-specific parsing;
- a legacy compatibility layer for historical `pvtsutils` consumers.

## Install

```bash
npm install @peculiar/utils
```

## Entry Points

```ts
import { bytes } from "@peculiar/utils";
import { hex, base64, base64url } from "@peculiar/utils/encoding";
import { pem } from "@peculiar/utils/pem";
import { convert, createConverterRegistry, defaultConverters } from "@peculiar/utils/converters";
import { Convert } from "@peculiar/utils/legacy";
```

## Bytes Helpers

`@peculiar/utils/bytes` stays focused on stateless byte sequence utilities. It does not include stateful readers, writers, ASN.1 parsing, PDF parsing, or other structured binary readers. For structured binary parsing, use a dedicated binary reader package.

```ts
import { bytes } from "@peculiar/utils";

const offset = bytes.indexOf(new Uint8Array([0x25, 0x25, 0x45, 0x4f, 0x46]), "%%EOF", {
 encoding: "ascii",
});

const suffix = bytes.endsWith(new Uint8Array([0x25, 0x25, 0x45, 0x4f, 0x46]), "%%EOF", {
 encoding: "ascii",
});
```

### Find `startxref` In A PDF Tail

```ts
import { lastIndexOf } from "@peculiar/utils/bytes";

const tailStart = Math.max(0, pdf.byteLength - 4096);

const offset = lastIndexOf(pdf, "startxref", {
 encoding: "ascii",
 start: pdf.byteLength,
 end: tailStart,
});

if (offset === -1) {
 throw new Error("PDF startxref marker not found");
}
```

### Find `startxref` Via `tail`

```ts
import { lastIndexOf, tail } from "@peculiar/utils/bytes";

const pdfTail = tail(pdf, 4096);

const localOffset = lastIndexOf(pdfTail, "startxref", {
 encoding: "ascii",
});

const offset =
 localOffset === -1
    ? -1
    : pdf.byteLength - pdfTail.byteLength + localOffset;
```

### Check Prefixes And Suffixes

```ts
import { bytes } from "@peculiar/utils";

bytes.startsWith(data, "-----BEGIN", { encoding: "ascii" });
bytes.endsWith(data, "%%EOF", { encoding: "ascii" });
```

### Compare Byte Sequences

```ts
import { bytes } from "@peculiar/utils";

const result = bytes.compare(a, b);

if (result === 0) {
 console.log("equal");
}
```

## Convert API

The default `convert` facade is a convenience singleton backed by the built-in registry.

```ts
import { convert } from "@peculiar/utils/converters";

const bytes = convert.decode("base64", "AQID");
const text = convert.encode("hex", bytes, { case: "upper" });
```

Deprecated `convert.to(...)` and `convert.from(...)` aliases are still available for temporary migration, but the primary v2 API is `encode` and `decode`.

## Transcode

Direct text-to-text transcoding goes through the registry without a manual intermediate step.

```ts
import { convert } from "@peculiar/utils/converters";
import { hex } from "@peculiar/utils/encoding";

const pemText = convert.transcode("AQID", {
 from: "base64",
 to: "pem",
 toOptions: {
  label: "CERTIFICATE",
 },
});

const hexText = convert.transcode(pemText, {
 from: "pem",
 fromOptions: { label: "CERTIFICATE" },
 to: "hex",
 toOptions: hex.formats.colonUpper,
});
```

There is intentionally no chain API.

## Hex Formatting

The `hex` codec accepts common input styles and can format output explicitly.

```ts
import { hex } from "@peculiar/utils/encoding";

hex.decode("0102030405060708090a0b0c");
hex.decode("01020304 05060708 090a0b0c");
hex.decode("01:02:03:04:05:06:07:08:09:0A:0B:0C");
hex.decode("0x0102030405060708090a0b0c");

hex.encode(new Uint8Array([1, 2, 3, 4]), hex.formats.colonUpper);
hex.encode(new Uint8Array([1, 2, 3, 4]), {
 prefix: "0x",
 group: {
  size: 2,
  separator: " ",
 },
});
```

Available presets:

- `hex.formats.compact`
- `hex.formats.upper`
- `hex.formats.colon`
- `hex.formats.colonUpper`
- `hex.formats.groupsOf4`
- `hex.formats.prefixed`

## Preserve Formatting

Use `parse` and `format` when you want to keep the original visual style of a hex string.

```ts
import { hex } from "@peculiar/utils/encoding";

const parsed = hex.parse("01:02:03:04:05:06");

parsed.bytes;
parsed.format;
parsed.normalized;

const updated = hex.format(new Uint8Array([0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff]), parsed.format);
```

The same capabilities are available through the registry facade:

```ts
import { convert } from "@peculiar/utils/converters";

const parsed = convert.parse("hex", "01:02:03:04");
const formatted = convert.format("hex", new Uint8Array([0xaa, 0xbb, 0xcc, 0xdd]), parsed.format);
```

## PEM Helpers

PEM support stays generic. The package does not parse ASN.1, validate PKI semantics, or handle encrypted PEM containers.

```ts
import { pem } from "@peculiar/utils/pem";

const text = pem.encode("CERTIFICATE", new Uint8Array([1, 2, 3]));
const blocks = pem.decode(text);
const block = pem.find(text, "CERTIFICATE");
const matches = pem.findAll(text, "CERTIFICATE");

const bundle = pem.encodeMany([
 { label: "CERTIFICATE", data: new Uint8Array([1, 2, 3]) },
 { label: "PRIVATE KEY", data: new Uint8Array([4, 5, 6]) },
]);
```

## Safe Decode And Detection

```ts
import { convert } from "@peculiar/utils/converters";

const result = convert.tryDecode("hex", "01:02:03");

if (result.ok) {
 console.log(result.bytes);
} else {
 console.error(result.error);
}

const candidates = convert.detect("-----BEGIN DATA-----\nAQID\n-----END DATA-----\n", {
 formats: ["pem", "base64", "hex"],
});
```

## Custom Registries

Applications can create isolated registries instead of mutating global state.

```ts
import { createConverterRegistry, defaultConverters } from "@peculiar/utils/converters";

const registry = createConverterRegistry(defaultConverters);

registry.register({
 name: "base58btc",
 aliases: ["b58"],
 encode(data) {
  return base58btcEncode(data);
 },
 decode(text) {
  return base58btcDecode(text);
 },
});
```

Name and alias conflicts throw by default. Use `{ override: true }` only when replacement is intentional.

## Typed Converter Options

Built-in converters expose typed options through the registry facade.

```ts
import { convert } from "@peculiar/utils/converters";

convert.encode("hex", new Uint8Array([1, 2, 3]), {
 case: "upper",
});
```

Wrong options are rejected by TypeScript:

```ts
convert.encode("hex", new Uint8Array([1, 2, 3]), {
 label: "CERTIFICATE",
});
```

Custom converters can extend the options map via module augmentation:

```ts
declare module "@peculiar/utils/converters" {
 interface ConverterOptionsMap {
  base58btc: {
   encode: Base58EncodeOptions;
   decode: Base58DecodeOptions;
  };
 }
}
```

## Legacy Compatibility

The old `pvtsutils`-style surface is preserved under the legacy entry point.

```ts
import { BufferSourceConverter, Convert, assign, combine, isEqual } from "@peculiar/utils/legacy";
```
