# `@peculiar/asn1-x509`

[![License](https://img.shields.io/badge/license-MIT-green.svg?style=flat)](https://github.com/PeculiarVentures/asn1-schema/blob/master/packages/x509/LICENSE)
[![npm version](https://badge.fury.io/js/%40peculiar%2Fasn1-x509.svg)](https://badge.fury.io/js/%40peculiar%2Fasn1-x509)

[![NPM](https://nodei.co/npm/@peculiar/asn1-x509.png)](https://nodei.co/npm/@peculiar/asn1-x509/)

ASN.1 schema for X.509 certificates, certificate revocation lists, and related profile structures defined in RFC 5280.

Use the exported classes with `@peculiar/asn1-schema` helpers such as `AsnConvert`, `AsnParser`, and `AsnSerializer` to parse or serialize DER-encoded data defined by the referenced specification.

## Installation

```bash
npm install @peculiar/asn1-x509
```

## Specifications

- [RFC 5280: Internet X.509 Public Key Infrastructure Certificate and Certificate Revocation List (CRL) Profile](https://datatracker.ietf.org/doc/html/rfc5280)
- [EntrustVersionInfo extension reference](http://ftp.gnome.org/mirror/archive/ftp.sunet.se/pub/security/dfnpca/docs/misc/Entrust/directory.pdf)
