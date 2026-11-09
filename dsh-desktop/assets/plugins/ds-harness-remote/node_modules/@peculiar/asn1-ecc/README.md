# `@peculiar/asn1-ecc`

[![License](https://img.shields.io/badge/license-MIT-green.svg?style=flat)](https://github.com/PeculiarVentures/asn1-schema/blob/master/packages/ecc/LICENSE)
[![npm version](https://badge.fury.io/js/%40peculiar%2Fasn1-ecc.svg)](https://badge.fury.io/js/%40peculiar%2Fasn1-ecc)

[![NPM](https://nodei.co/npm/@peculiar/asn1-ecc.png)](https://nodei.co/npm/@peculiar/asn1-ecc/)

ASN.1 schema for elliptic-curve private keys and related identifiers defined in RFC 5915, RFC 5480, and RFC 3279.

Use the exported classes with `@peculiar/asn1-schema` helpers such as `AsnConvert`, `AsnParser`, and `AsnSerializer` to parse or serialize DER-encoded data defined by the referenced specification.

## Installation

```bash
npm install @peculiar/asn1-ecc
```

## Specifications

- [RFC 5915: Elliptic Curve Private Key Structure](https://datatracker.ietf.org/doc/html/rfc5915)
- [RFC 5480: Elliptic Curve Cryptography Subject Public Key Information](https://datatracker.ietf.org/doc/html/rfc5480)
- [RFC 3279: Algorithms and Identifiers for the Internet X.509 Public Key Infrastructure Certificate and CRL Profile](https://datatracker.ietf.org/doc/html/rfc3279#section-2.3.5)
