# `@peculiar/asn1-schema`

[![License](https://img.shields.io/badge/license-MIT-green.svg?style=flat)](https://github.com/PeculiarVentures/asn1-schema/blob/master/packages/schema/LICENSE)
[![npm version](https://badge.fury.io/js/%40peculiar%2Fasn1-schema.svg)](https://badge.fury.io/js/%40peculiar%2Fasn1-schema)

[![NPM](https://nodei.co/npm/@peculiar/asn1-schema.png)](https://nodei.co/npm/@peculiar/asn1-schema/)

Decorators and helper APIs for declaring ASN.1 schemas in TypeScript.

This is the core package used by the schema modules in this repository. It lets you describe DER structures with decorators and convert them with `AsnConvert`, `AsnParser`, and `AsnSerializer`.

## Installation

```bash
npm install @peculiar/asn1-schema
```

## Overview

Abstract Syntax Notation One (ASN.1) is widely used across X.509, PKCS, CMS, OCSP, and related standards. This package keeps those mappings declarative and type-friendly by attaching schema metadata directly to classes.

## TypeScript Example

```ts
import { AsnConvert, AsnProp, AsnPropTypes, AsnType, AsnTypeTypes } from "@peculiar/asn1-schema";

@AsnType({ type: AsnTypeTypes.Sequence })
class BasicConstraints {
  @AsnProp({ type: AsnPropTypes.Boolean, defaultValue: false })
  public cA = false;
}

const basicConstraints = new BasicConstraints();
basicConstraints.cA = true;

const encoded = AsnConvert.serialize(basicConstraints);
const decoded = AsnConvert.parse(encoded, BasicConstraints);

console.log(decoded.cA);
```

## Related Links

- [Decorators overview](https://medium.com/google-developers/exploring-es7-decorators-76ecb65fb841)
- [ASN.1 playground](http://lapo.it/asn1js/)
