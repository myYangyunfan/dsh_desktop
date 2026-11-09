# [@fidm/asn1](https://github.com/fidm/asn1)
ASN.1/DER, PEM for Node.js.

[![NPM version][npm-image]][npm-url]
[![Build Status][travis-image]][travis-url]
[![Downloads][downloads-image]][downloads-url]

## Install

```
npm i --save @fidm/asn1
```

## Documentation

https://fidm.github.io/asn1/

## Dependents

[@fidm/x509](https://github.com/fidm/x509)

## Example

### Parse a private key from PEM file with ASN.1 Template
```js
const fs = require('fs')
const { PEM, ASN1, Class, Tag } = require('@fidm/asn1')

// ASN.1 Template https://tools.ietf.org/html/rfc5208
const privateKeyValidator = {
  name: 'PrivateKeyInfo',
  class: Class.UNIVERSAL,
  tag: Tag.SEQUENCE,
  capture: 'privateKeyInfo',
  value: [{
    name: 'PrivateKeyInfo.Version',
    class: Class.UNIVERSAL,
    tag: Tag.INTEGER,
    capture: 'privateKeyVersion'
  }, {
    name: 'PrivateKeyInfo.AlgorithmIdentifier',
    class: Class.UNIVERSAL,
    tag: Tag.SEQUENCE,
    value: [{
      name: 'PrivateKeyAlgorithmIdentifier.algorithm',
      class: Class.UNIVERSAL,
      tag: Tag.OID,
      capture: 'privateKeyOID'
    }]
  }, {
    name: 'PrivateKeyInfo.PrivateKey',
    class: Class.UNIVERSAL,
    tag: Tag.OCTETSTRING,
    capture: 'privateKey'
  }]
}

const rootkey = PEM.parse(fs.readFileSync('./test/cert/rootkey.pem'))[0]
const captures = ASN1.parseDERWithTemplate(rootkey.body, privateKeyValidator)
console.log(captures)
// { privateKeyInfo:
//   <ASN1 { class: 'UNIVERSAL',
//     tag: 'SEQUENCE',
//     value:
//      [ { class: 'UNIVERSAL', tag: 'INTEGER', value: 0 },
//        { class: 'UNIVERSAL',
//          tag: 'SEQUENCE',
//          value:
//           [ { class: 'UNIVERSAL', tag: 'OID', value: '1.2.840.113549.1.1.1' },
//             { class: 'UNIVERSAL', tag: 'NULL', value: null } ] },
//        { class: 'UNIVERSAL',
//          tag: 'OCTETSTRING',
//          value:
//           <Buffer 30 82 04 a5 02 01 00 02 82 01 01 00 bf 9a 15 d6 cd cd ba ce d2 20 d8 3b a2 6b b9 03 1b 9e 12 02 bd ee 68 79 3d 4d e1 81 9a 65 89 21 5a 11 29 8b da a2 ... > } ] }>,
//  privateKeyVersion: <ASN1 { class: 'UNIVERSAL', tag: 'INTEGER', value: 0 }>,
//  privateKeyOID:
//   <ASN1 { class: 'UNIVERSAL', tag: 'OID', value: '1.2.840.113549.1.1.1' }>,
//  privateKey:
//   <ASN1 { class: 'UNIVERSAL',
//     tag: 'OCTETSTRING',
//     value:
//      <Buffer 30 82 04 a5 02 01 00 02 82 01 01 00 bf 9a 15 d6 cd cd ba ce d2 20 d8 3b a2 6b b9 03 1b 9e 12 02 bd ee 68 79 3d 4d e1 81 9a 65 89 21 5a 11 29 8b da a2 ... > }> }
```

### Build PKCS#8 private key ASN1 object from PKCS#1 private key ASN1 object
```js
const { ASN1, Class, Tag } = require('@fidm/asn1')

const rsaPrivateKeyASN1 = getSomeRSAPrivateKeyASN1()
const privateKeyASN1 = ASN1.Seq([
  // Version (INTEGER)
  rsaPrivateKeyASN1.value[0],
  // AlgorithmIdentifier
  ASN1.Seq([
    // algorithm
    ASN1.OID('1.2.840.113549.1.1.1'),
    // optional parameters
    ASN1.Null(),
  ]),
  // PrivateKey
  new ASN1(Class.UNIVERSAL, Tag.OCTETSTRING, rsaPrivateKeyASN1.DER),
])
```

### Parse a certificate from PEM file
```js
const fs = require('fs')
const { PEM, ASN1 } = require('@fidm/asn1')

const pems = PEM.parse(fs.readFileSync('./test/cert/github.crt'))
const asn1 = ASN1.fromDER(pems[0].body)
console.log(asn1)
// <ASN1 { class: 'UNIVERSAL',
//   tag: 'SEQUENCE',
//   value:
//    [ { class: 'UNIVERSAL',
//        tag: 'SEQUENCE',
//        value:
//         [ { class: 'CONTEXT_SPECIFIC',
//             tag: 0,
//             value: [ { class: 'UNIVERSAL', tag: 'INTEGER', value: 2 } ] },
//           { class: 'UNIVERSAL',
//             tag: 'INTEGER',
//             value: '0a0630427f5bbced6957396593b6451f' },
//           { class: 'UNIVERSAL',
//             tag: 'SEQUENCE',
//             value:
//              [ { class: 'UNIVERSAL',
//                  tag: 'OID',
//                  value: '1.2.840.113549.1.1.11' },
//                { class: 'UNIVERSAL', tag: 'NULL', value: null } ] },
//           { class: 'UNIVERSAL',
//             tag: 'SEQUENCE',
//             value:
//              [ { class: 'UNIVERSAL',
//                  tag: 'SET',
//                  value:
//                   [ { class: 'UNIVERSAL',
//                       tag: 'SEQUENCE',
//                       value:
//                        [ { class: 'UNIVERSAL', tag: 'OID', value: '2.5.4.6' },
//                          { class: 'UNIVERSAL', tag: 'PRINTABLESTRING', value: 'US' } ] } ] },
//                { class: 'UNIVERSAL',
//                  tag: 'SET',
//                  value:
//                   [ { class: 'UNIVERSAL',
//                       tag: 'SEQUENCE',
//                       value:
//                        [ { class: 'UNIVERSAL', tag: 'OID', value: '2.5.4.10' },
//                          { class: 'UNIVERSAL',
//                            tag: 'PRINTABLESTRING',
//                            value: 'DigiCert Inc' } ] } ] },
//                { class: 'UNIVERSAL',
//                  tag: 'SET',
//                  value:
//                   [ { class: 'UNIVERSAL',
//                       tag: 'SEQUENCE',
//                       value:
//                        [ { class: 'UNIVERSAL', tag: 'OID', value: '2.5.4.11' },
//                          { class: 'UNIVERSAL',
//                            tag: 'PRINTABLESTRING',
//                            value: 'www.digicert.com' } ] } ] },
//                { class: 'UNIVERSAL',
//                  tag: 'SET',
//                  value:
//                   [ { class: 'UNIVERSAL',
//                       tag: 'SEQUENCE',
//                       value:
//                        [ { class: 'UNIVERSAL', tag: 'OID', value: '2.5.4.3' },
//                          { class: 'UNIVERSAL',
//                            tag: 'PRINTABLESTRING',
//                            value: 'DigiCert SHA2 Extended Validation Server CA' } ] } ] } ] },
//           { class: 'UNIVERSAL',
//             tag: 'SEQUENCE',
//             value:
//              [ { class: 'UNIVERSAL',
//                  tag: 'UTCTIME',
//                  value: 2018-05-08T00:00:00.000Z },
//                { class: 'UNIVERSAL',
//                  tag: 'UTCTIME',
//                  value: 2020-06-03T12:00:00.000Z } ] },
//           { class: 'UNIVERSAL',
//             tag: 'SEQUENCE',
//             value:
//              [ { class: 'UNIVERSAL',
//                  tag: 'SET',
//                  value:
//                   [ { class: 'UNIVERSAL',
//                       tag: 'SEQUENCE',
//                       value:
//                        [ { class: 'UNIVERSAL', tag: 'OID', value: '2.5.4.15' },
//                          { class: 'UNIVERSAL',
//                            tag: 'UTF8',
//                            value: 'Private Organization' } ] } ] },
//                { class: 'UNIVERSAL',
//                  tag: 'SET',
//                  value:
//                   [ { class: 'UNIVERSAL',
//                       tag: 'SEQUENCE',
//                       value:
//                        [ { class: 'UNIVERSAL',
//                            tag: 'OID',
//                            value: '1.3.6.1.4.1.311.60.2.1.3' },
//                          { class: 'UNIVERSAL', tag: 'PRINTABLESTRING', value: 'US' } ] } ] },
//                { class: 'UNIVERSAL',
//                  tag: 'SET',
//                  value:
//                   [ { class: 'UNIVERSAL',
//                       tag: 'SEQUENCE',
//                       value:
//                        [ { class: 'UNIVERSAL',
//                            tag: 'OID',
//                            value: '1.3.6.1.4.1.311.60.2.1.2' },
//                          { class: 'UNIVERSAL', tag: 'PRINTABLESTRING', value: 'Delaware' } ] } ] },
//                { class: 'UNIVERSAL',
//                  tag: 'SET',
//                  value:
//                   [ { class: 'UNIVERSAL',
//                       tag: 'SEQUENCE',
//                       value:
//                        [ { class: 'UNIVERSAL', tag: 'OID', value: '2.5.4.5' },
//                          { class: 'UNIVERSAL', tag: 'PRINTABLESTRING', value: '5157550' } ] } ] },
//                { class: 'UNIVERSAL',
//                  tag: 'SET',
//                  value:
//                   [ { class: 'UNIVERSAL',
//                       tag: 'SEQUENCE',
//                       value:
//                        [ { class: 'UNIVERSAL', tag: 'OID', value: '2.5.4.6' },
//                          { class: 'UNIVERSAL', tag: 'PRINTABLESTRING', value: 'US' } ] } ] },
//                { class: 'UNIVERSAL',
//                  tag: 'SET',
//                  value:
//                   [ { class: 'UNIVERSAL',
//                       tag: 'SEQUENCE',
//                       value:
//                        [ { class: 'UNIVERSAL', tag: 'OID', value: '2.5.4.8' },
//                          { class: 'UNIVERSAL',
//                            tag: 'PRINTABLESTRING',
//                            value: 'California' } ] } ] },
//                { class: 'UNIVERSAL',
//                  tag: 'SET',
//                  value:
//                   [ { class: 'UNIVERSAL',
//                       tag: 'SEQUENCE',
//                       value:
//                        [ { class: 'UNIVERSAL', tag: 'OID', value: '2.5.4.7' },
//                          { class: 'UNIVERSAL',
//                            tag: 'PRINTABLESTRING',
//                            value: 'San Francisco' } ] } ] },
//                { class: 'UNIVERSAL',
//                  tag: 'SET',
//                  value:
//                   [ { class: 'UNIVERSAL',
//                       tag: 'SEQUENCE',
//                       value:
//                        [ { class: 'UNIVERSAL', tag: 'OID', value: '2.5.4.10' },
//                          { class: 'UNIVERSAL',
//                            tag: 'PRINTABLESTRING',
//                            value: 'GitHub, Inc.' } ] } ] },
//                { class: 'UNIVERSAL',
//                  tag: 'SET',
//                  value:
//                   [ { class: 'UNIVERSAL',
//                       tag: 'SEQUENCE',
//                       value:
//                        [ { class: 'UNIVERSAL', tag: 'OID', value: '2.5.4.3' },
//                          { class: 'UNIVERSAL',
//                            tag: 'PRINTABLESTRING',
//                            value: 'github.com' } ] } ] } ] },
//           { class: 'UNIVERSAL',
//             tag: 'SEQUENCE',
//             value:
//              [ { class: 'UNIVERSAL',
//                  tag: 'SEQUENCE',
//                  value:
//                   [ { class: 'UNIVERSAL', tag: 'OID', value: '1.2.840.113549.1.1.1' },
//                     { class: 'UNIVERSAL', tag: 'NULL', value: null } ] },
//                { class: 'UNIVERSAL',
//                  tag: 'BITSTRING',
//                  value:
//                   BitString {
//                     buf:
//                      <Buffer 30 82 01 0a 02 82 01 01 00 c6 3c aa f2 3c 97 0c 3a c1 4f 28 ad 72 70 7d d3 ce b9 b5 60 73 a4 74 9b 8a 77 46 fd 7a 98 42 4c c5 30 19 57 9a a9 33 0b e1 ... >,
//                     bitLen: 2160 } } ] },
//           { class: 'CONTEXT_SPECIFIC',
//             tag: 3,
//             value:
//              [ { class: 'UNIVERSAL',
//                  tag: 'SEQUENCE',
//                  value:
//                   [ { class: 'UNIVERSAL',
//                       tag: 'SEQUENCE',
//                       value:
//                        [ { class: 'UNIVERSAL', tag: 'OID', value: '2.5.29.35' },
//                          { class: 'UNIVERSAL',
//                            tag: 'OCTETSTRING',
//                            value:
//                             <Buffer 30 16 80 14 3d d3 50 a5 d6 a0 ad ee f3 4a 60 0a 65 d3 21 d4 f8 f8 d6 0f> } ] },
//                     { class: 'UNIVERSAL',
//                       tag: 'SEQUENCE',
//                       value:
//                        [ { class: 'UNIVERSAL', tag: 'OID', value: '2.5.29.14' },
//                          { class: 'UNIVERSAL',
//                            tag: 'OCTETSTRING',
//                            value:
//                             <Buffer 04 14 c9 c2 53 61 66 9d 5f ab 25 f4 26 cd 0f 38 9a a8 49 ea 48 a9> } ] },
//                     { class: 'UNIVERSAL',
//                       tag: 'SEQUENCE',
//                       value:
//                        [ { class: 'UNIVERSAL', tag: 'OID', value: '2.5.29.17' },
//                          { class: 'UNIVERSAL',
//                            tag: 'OCTETSTRING',
//                            value:
//                             <Buffer 30 1c 82 0a 67 69 74 68 75 62 2e 63 6f 6d 82 0e 77 77 77 2e 67 69 74 68 75 62 2e 63 6f 6d> } ] },
//                     { class: 'UNIVERSAL',
//                       tag: 'SEQUENCE',
//                       value:
//                        [ { class: 'UNIVERSAL', tag: 'OID', value: '2.5.29.15' },
//                          { class: 'UNIVERSAL', tag: 'BOOLEAN', value: true },
//                          { class: 'UNIVERSAL',
//                            tag: 'OCTETSTRING',
//                            value: <Buffer 03 02 05 a0> } ] },
//                     { class: 'UNIVERSAL',
//                       tag: 'SEQUENCE',
//                       value:
//                        [ { class: 'UNIVERSAL', tag: 'OID', value: '2.5.29.37' },
//                          { class: 'UNIVERSAL',
//                            tag: 'OCTETSTRING',
//                            value:
//                             <Buffer 30 14 06 08 2b 06 01 05 05 07 03 01 06 08 2b 06 01 05 05 07 03 02> } ] },
//                     { class: 'UNIVERSAL',
//                       tag: 'SEQUENCE',
//                       value:
//                        [ { class: 'UNIVERSAL', tag: 'OID', value: '2.5.29.31' },
//                          { class: 'UNIVERSAL',
//                            tag: 'OCTETSTRING',
//                            value:
//                             <Buffer 30 6c 30 34 a0 32 a0 30 86 2e 68 74 74 70 3a 2f 2f 63 72 6c 33 2e 64 69 67 69 63 65 72 74 2e 63 6f 6d 2f 73 68 61 32 2d 65 76 2d 73 65 72 76 65 72 2d ... > } ] },
//                     { class: 'UNIVERSAL',
//                       tag: 'SEQUENCE',
//                       value:
//                        [ { class: 'UNIVERSAL', tag: 'OID', value: '2.5.29.32' },
//                          { class: 'UNIVERSAL',
//                            tag: 'OCTETSTRING',
//                            value:
//                             <Buffer 30 42 30 37 06 09 60 86 48 01 86 fd 6c 02 01 30 2a 30 28 06 08 2b 06 01 05 05 07 02 01 16 1c 68 74 74 70 73 3a 2f 2f 77 77 77 2e 64 69 67 69 63 65 72 ... > } ] },
//                     { class: 'UNIVERSAL',
//                       tag: 'SEQUENCE',
//                       value:
//                        [ { class: 'UNIVERSAL', tag: 'OID', value: '1.3.6.1.5.5.7.1.1' },
//                          { class: 'UNIVERSAL',
//                            tag: 'OCTETSTRING',
//                            value:
//                             <Buffer 30 7a 30 24 06 08 2b 06 01 05 05 07 30 01 86 18 68 74 74 70 3a 2f 2f 6f 63 73 70 2e 64 69 67 69 63 65 72 74 2e 63 6f 6d 30 52 06 08 2b 06 01 05 05 07 ... > } ] },
//                     { class: 'UNIVERSAL',
//                       tag: 'SEQUENCE',
//                       value:
//                        [ { class: 'UNIVERSAL', tag: 'OID', value: '2.5.29.19' },
//                          { class: 'UNIVERSAL', tag: 'BOOLEAN', value: true },
//                          { class: 'UNIVERSAL', tag: 'OCTETSTRING', value: <Buffer 30 00> } ] },
//                     { class: 'UNIVERSAL',
//                       tag: 'SEQUENCE',
//                       value:
//                        [ { class: 'UNIVERSAL',
//                            tag: 'OID',
//                            value: '1.3.6.1.4.1.11129.2.4.2' },
//                          { class: 'UNIVERSAL',
//                            tag: 'OCTETSTRING',
//                            value:
//                             <Buffer 04 82 01 6a 01 68 00 76 00 a4 b9 09 90 b4 18 58 14 87 bb 13 a2 cc 67 70 0a 3c 35 98 04 f9 1b df b8 e3 77 cd 0e c8 0d dc 10 00 00 01 63 41 62 6d 0a 00 ... > } ] } ] } ] } ] },
//      { class: 'UNIVERSAL',
//        tag: 'SEQUENCE',
//        value:
//         [ { class: 'UNIVERSAL',
//             tag: 'OID',
//             value: '1.2.840.113549.1.1.11' },
//           { class: 'UNIVERSAL', tag: 'NULL', value: null } ] },
//      { class: 'UNIVERSAL',
//        tag: 'BITSTRING',
//        value:
//         BitString {
//           buf:
//            <Buffer 70 0f 5a 96 a7 58 e5 bf 8a 9d a8 27 98 2b 00 7f 26 a9 07 da ba 7b 82 54 4f af 69 cf bc f2 59 03 2b f2 d5 74 58 25 d8 1e a4 20 76 62 60 29 73 2a d7 dc ... >,
//           bitLen: 2048 } } ] }>
```

### License
@fidm/asn1 is licensed under the [MIT](https://github.com/fidm/asn1/blob/master/LICENSE) license.
Copyright &copy; 2018-2019 FIdM.

[npm-url]: https://www.npmjs.com/package/@fidm/asn1
[npm-image]: https://img.shields.io/npm/v/@fidm/asn1.svg

[travis-url]: https://travis-ci.org/fidm/asn1
[travis-image]: http://img.shields.io/travis/fidm/asn1.svg

[downloads-url]: https://npmjs.org/package/@fidm/asn1
[downloads-image]: https://img.shields.io/npm/dm/@fidm/asn1.svg?style=flat-square
