# [@fidm/x509](https://github.com/fidm/x509)
Pure JavaScript X509 certificate tools for Node.js.

[![NPM version][npm-image]][npm-url]
[![Build Status][travis-image]][travis-url]
[![Downloads][downloads-image]][downloads-url]

Inspired by https://github.com/digitalbazaar/forge

## Install

```
npm i --save @fidm/x509
```

## Documentation

https://fidm.github.io/x509/

## Example

### Support ed25519 certificate
```js
const fs = require('fs')

const { Certificate, PrivateKey } = require('@fidm/x509')

const ed25519Cert = Certificate.fromPEM(fs.readFileSync('./test/cert/ed25519-server-cert.pem'))
const privateKey = PrivateKey.fromPEM(fs.readFileSync('./test/cert/ed25519-server-key.pem'))

const data = Buffer.allocUnsafe(100)
const signature = privateKey.sign(data, 'sha256')
console.log(ed25519Cert.publicKey.verify(data, signature, 'sha256')) // true
```

### Parse githu.com' certificate
```js
const fs = require('fs')
const { Certificate } = require('@fidm/x509')
const issuer = Certificate.fromPEM(fs.readFileSync('./test/cert/github-issuer.crt'))
const cert = Certificate.fromPEM(fs.readFileSync('./test/cert/github.crt'))
console.log(cert.isIssuer(issuer)) // true
console.log(issuer.verifySubjectKeyIdentifier()) // true
console.log(cert.verifySubjectKeyIdentifier()) // true
console.log(issuer.checkSignature(cert)) // null
console.log(issuer)
// <Certificate { raw:
//    <Buffer 30 82 04 b6 30 82 03 9e a0 03 02 01 02 02 10 0c 79 a9 44 b0 8c 11 95 20 92 61 5f e2 6b 1d 83 30 0d 06 09 2a 86 48 86 f7 0d 01 01 0b 05 00 30 6c 31 0b ... >,
//   version: 3,
//   serialNumber: '0c79a944b08c11952092615fe26b1d83',
//   signatureOID: '1.2.840.113549.1.1.11',
//   signatureAlgorithm: 'sha256WithRsaEncryption',
//   infoSignatureOID: '1.2.840.113549.1.1.11',
//   signature:
//    <Buffer 9d b6 d0 90 86 e1 86 02 ed c5 a0 f0 34 1c 74 c1 8d 76 cc 86 0a a8 f0 4a 8a 42 d6 3f c8 a9 4d ad 7c 08 ad e6 b6 50 b8 a2 1a 4d 88 07 b1 29 21 dc e7 da ... >,
//   validFrom: '2013-10-22T12:00:00.000Z',
//   validTo: '2028-10-22T12:00:00.000Z',
//   issuer:
//    { C: 'US',
//      O: 'DigiCert Inc',
//      OU: 'www.digicert.com',
//      CN: 'DigiCert High Assurance EV Root CA',
//      uniqueId: null,
//      attributes:
//       [ { oid: '2.5.4.6',
//           value: 'US',
//           valueTag: 19,
//           name: 'countryName',
//           shortName: 'C' },
//         { oid: '2.5.4.10',
//           value: 'DigiCert Inc',
//           valueTag: 19,
//           name: 'organizationName',
//           shortName: 'O' },
//         { oid: '2.5.4.11',
//           value: 'www.digicert.com',
//           valueTag: 19,
//           name: 'organizationalUnitName',
//           shortName: 'OU' },
//         { oid: '2.5.4.3',
//           value: 'DigiCert High Assurance EV Root CA',
//           valueTag: 19,
//           name: 'commonName',
//           shortName: 'CN' } ] },
//   subject:
//    { C: 'US',
//      O: 'DigiCert Inc',
//      OU: 'www.digicert.com',
//      CN: 'DigiCert SHA2 Extended Validation Server CA',
//      uniqueId: null,
//      attributes:
//       [ { oid: '2.5.4.6',
//           value: 'US',
//           valueTag: 19,
//           name: 'countryName',
//           shortName: 'C' },
//         { oid: '2.5.4.10',
//           value: 'DigiCert Inc',
//           valueTag: 19,
//           name: 'organizationName',
//           shortName: 'O' },
//         { oid: '2.5.4.11',
//           value: 'www.digicert.com',
//           valueTag: 19,
//           name: 'organizationalUnitName',
//           shortName: 'OU' },
//         { oid: '2.5.4.3',
//           value: 'DigiCert SHA2 Extended Validation Server CA',
//           valueTag: 19,
//           name: 'commonName',
//           shortName: 'CN' } ] },
//   extensions:
//    [ { oid: '2.5.29.19',
//        critical: true,
//        value: <Buffer 30 06 01 01 ff 02 01 00>,
//        name: 'basicConstraints',
//        isCA: true,
//        maxPathLen: 0,
//        basicConstraintsValid: true },
//      { oid: '2.5.29.15',
//        critical: true,
//        value: <Buffer 03 02 01 86>,
//        name: 'keyUsage',
//        keyUsage: 97,
//        digitalSignature: true,
//        nonRepudiation: false,
//        keyEncipherment: false,
//        dataEncipherment: false,
//        keyAgreement: false,
//        keyCertSign: true,
//        cRLSign: true,
//        encipherOnly: false,
//        decipherOnly: false },
//      { oid: '2.5.29.37',
//        critical: false,
//        value:
//         <Buffer 30 14 06 08 2b 06 01 05 05 07 03 01 06 08 2b 06 01 05 05 07 03 02>,
//        name: 'extKeyUsage',
//        serverAuth: true,
//        clientAuth: true },
//      { oid: '1.3.6.1.5.5.7.1.1',
//        critical: false,
//        value:
//         <Buffer 30 26 30 24 06 08 2b 06 01 05 05 07 30 01 86 18 68 74 74 70 3a 2f 2f 6f 63 73 70 2e 64 69 67 69 63 65 72 74 2e 63 6f 6d>,
//        name: 'authorityInfoAccess',
//        authorityInfoAccessOcsp: 'http://ocsp.digicert.com' },
//      { oid: '2.5.29.31',
//        critical: false,
//        value:
//         <Buffer 30 42 30 40 a0 3e a0 3c 86 3a 68 74 74 70 3a 2f 2f 63 72 6c 34 2e 64 69 67 69 63 65 72 74 2e 63 6f 6d 2f 44 69 67 69 43 65 72 74 48 69 67 68 41 73 73 ... >,
//        name: 'cRLDistributionPoints' },
//      { oid: '2.5.29.32',
//        critical: false,
//        value:
//         <Buffer 30 34 30 32 06 04 55 1d 20 00 30 2a 30 28 06 08 2b 06 01 05 05 07 02 01 16 1c 68 74 74 70 73 3a 2f 2f 77 77 77 2e 64 69 67 69 63 65 72 74 2e 63 6f 6d ... >,
//        name: 'certificatePolicies' },
//      { oid: '2.5.29.14',
//        critical: false,
//        value:
//         <Buffer 04 14 3d d3 50 a5 d6 a0 ad ee f3 4a 60 0a 65 d3 21 d4 f8 f8 d6 0f>,
//        name: 'subjectKeyIdentifier',
//        subjectKeyIdentifier: '3dd350a5d6a0adeef34a600a65d321d4f8f8d60f' },
//      { oid: '2.5.29.35',
//        critical: false,
//        value:
//         <Buffer 30 16 80 14 b1 3e c3 69 03 f8 bf 47 01 d4 98 26 1a 08 02 ef 63 64 2b c3>,
//        name: 'authorityKeyIdentifier',
//        authorityKeyIdentifier: 'b13ec36903f8bf4701d498261a0802ef63642bc3' } ],
//   subjectKeyIdentifier: '3dd350a5d6a0adeef34a600a65d321d4f8f8d60f',
//   authorityKeyIdentifier: 'b13ec36903f8bf4701d498261a0802ef63642bc3',
//   ocspServer: 'http://ocsp.digicert.com',
//   issuingCertificateURL: '',
//   isCA: true,
//   maxPathLen: 0,
//   basicConstraintsValid: true,
//   keyUsage: 97,
//   dnsNames: [],
//   emailAddresses: [],
//   ipAddresses: [],
//   uris: [],
//   publicKey:
//    { oid: '1.2.840.113549.1.1.1',
//      algo: 'rsaEncryption',
//      publicKey:
//       <Buffer 30 82 01 0a 02 82 01 01 00 d7 53 a4 04 51 f8 99 a6 16 48 4b 67 27 aa 93 49 d0 39 ed 0c b0 b0 00 87 f1 67 28 86 85 8c 8e 63 da bc b1 40 38 e2 d3 f5 ec ... > },
//   publicKeyRaw:
//    <Buffer 30 82 01 22 30 0d 06 09 2a 86 48 86 f7 0d 01 01 01 05 00 03 82 01 0f 00 30 82 01 0a 02 82 01 01 00 d7 53 a4 04 51 f8 99 a6 16 48 4b 67 27 aa 93 49 d0 ... > }>
// <Certificate { raw:
//    <Buffer 30 82 07 42 30 82 06 2a a0 03 02 01 02 02 10 0a 06 30 42 7f 5b bc ed 69 57 39 65 93 b6 45 1f 30 0d 06 09 2a 86 48 86 f7 0d 01 01 0b 05 00 30 75 31 0b ... >,
//   version: 3,
//   serialNumber: '0a0630427f5bbced6957396593b6451f',
//   signatureOID: '1.2.840.113549.1.1.11',
//   signatureAlgorithm: 'sha256WithRsaEncryption',
//   infoSignatureOID: '1.2.840.113549.1.1.11',
//   signature:
//    <Buffer 70 0f 5a 96 a7 58 e5 bf 8a 9d a8 27 98 2b 00 7f 26 a9 07 da ba 7b 82 54 4f af 69 cf bc f2 59 03 2b f2 d5 74 58 25 d8 1e a4 20 76 62 60 29 73 2a d7 dc ... >,
//   validFrom: '2018-05-08T00:00:00.000Z',
//   validTo: '2020-06-03T12:00:00.000Z',
//   issuer:
//    { C: 'US',
//      O: 'DigiCert Inc',
//      OU: 'www.digicert.com',
//      CN: 'DigiCert SHA2 Extended Validation Server CA',
//      uniqueId: null,
//      attributes:
//       [ { oid: '2.5.4.6',
//           value: 'US',
//           valueTag: 19,
//           name: 'countryName',
//           shortName: 'C' },
//         { oid: '2.5.4.10',
//           value: 'DigiCert Inc',
//           valueTag: 19,
//           name: 'organizationName',
//           shortName: 'O' },
//         { oid: '2.5.4.11',
//           value: 'www.digicert.com',
//           valueTag: 19,
//           name: 'organizationalUnitName',
//           shortName: 'OU' },
//         { oid: '2.5.4.3',
//           value: 'DigiCert SHA2 Extended Validation Server CA',
//           valueTag: 19,
//           name: 'commonName',
//           shortName: 'CN' } ] },
//   subject:
//    { C: 'US',
//      ST: 'California',
//      L: 'San Francisco',
//      O: 'GitHub, Inc.',
//      CN: 'github.com',
//      uniqueId: null,
//      attributes:
//       [ { oid: '2.5.4.15',
//           value: 'Private Organization',
//           valueTag: 12,
//           name: 'businessCategory',
//           shortName: '' },
//         { oid: '1.3.6.1.4.1.311.60.2.1.3',
//           value: 'US',
//           valueTag: 19,
//           name: 'jurisdictionC',
//           shortName: '' },
//         { oid: '1.3.6.1.4.1.311.60.2.1.2',
//           value: 'Delaware',
//           valueTag: 19,
//           name: 'jurisdictionST',
//           shortName: '' },
//         { oid: '2.5.4.5',
//           value: '5157550',
//           valueTag: 19,
//           name: 'serialName',
//           shortName: '' },
//         { oid: '2.5.4.6',
//           value: 'US',
//           valueTag: 19,
//           name: 'countryName',
//           shortName: 'C' },
//         { oid: '2.5.4.8',
//           value: 'California',
//           valueTag: 19,
//           name: 'stateOrProvinceName',
//           shortName: 'ST' },
//         { oid: '2.5.4.7',
//           value: 'San Francisco',
//           valueTag: 19,
//           name: 'localityName',
//           shortName: 'L' },
//         { oid: '2.5.4.10',
//           value: 'GitHub, Inc.',
//           valueTag: 19,
//           name: 'organizationName',
//           shortName: 'O' },
//         { oid: '2.5.4.3',
//           value: 'github.com',
//           valueTag: 19,
//           name: 'commonName',
//           shortName: 'CN' } ] },
//   extensions:
//    [ { oid: '2.5.29.35',
//        critical: false,
//        value:
//         <Buffer 30 16 80 14 3d d3 50 a5 d6 a0 ad ee f3 4a 60 0a 65 d3 21 d4 f8 f8 d6 0f>,
//        name: 'authorityKeyIdentifier',
//        authorityKeyIdentifier: '3dd350a5d6a0adeef34a600a65d321d4f8f8d60f' },
//      { oid: '2.5.29.14',
//        critical: false,
//        value:
//         <Buffer 04 14 c9 c2 53 61 66 9d 5f ab 25 f4 26 cd 0f 38 9a a8 49 ea 48 a9>,
//        name: 'subjectKeyIdentifier',
//        subjectKeyIdentifier: 'c9c25361669d5fab25f426cd0f389aa849ea48a9' },
//      { oid: '2.5.29.17',
//        critical: false,
//        value:
//         <Buffer 30 1c 82 0a 67 69 74 68 75 62 2e 63 6f 6d 82 0e 77 77 77 2e 67 69 74 68 75 62 2e 63 6f 6d>,
//        name: 'subjectAltName',
//        altNames:
//         [ { tag: 2,
//             value: <Buffer 67 69 74 68 75 62 2e 63 6f 6d>,
//             dnsName: 'github.com' },
//           { tag: 2,
//             value: <Buffer 77 77 77 2e 67 69 74 68 75 62 2e 63 6f 6d>,
//             dnsName: 'www.github.com' } ] },
//      { oid: '2.5.29.15',
//        critical: true,
//        value: <Buffer 03 02 05 a0>,
//        name: 'keyUsage',
//        keyUsage: 5,
//        digitalSignature: true,
//        nonRepudiation: false,
//        keyEncipherment: true,
//        dataEncipherment: false,
//        keyAgreement: false,
//        keyCertSign: false,
//        cRLSign: false,
//        encipherOnly: false,
//        decipherOnly: false },
//      { oid: '2.5.29.37',
//        critical: false,
//        value:
//         <Buffer 30 14 06 08 2b 06 01 05 05 07 03 01 06 08 2b 06 01 05 05 07 03 02>,
//        name: 'extKeyUsage',
//        serverAuth: true,
//        clientAuth: true },
//      { oid: '2.5.29.31',
//        critical: false,
//        value:
//         <Buffer 30 6c 30 34 a0 32 a0 30 86 2e 68 74 74 70 3a 2f 2f 63 72 6c 33 2e 64 69 67 69 63 65 72 74 2e 63 6f 6d 2f 73 68 61 32 2d 65 76 2d 73 65 72 76 65 72 2d ... >,
//        name: 'cRLDistributionPoints' },
//      { oid: '2.5.29.32',
//        critical: false,
//        value:
//         <Buffer 30 42 30 37 06 09 60 86 48 01 86 fd 6c 02 01 30 2a 30 28 06 08 2b 06 01 05 05 07 02 01 16 1c 68 74 74 70 73 3a 2f 2f 77 77 77 2e 64 69 67 69 63 65 72 ... >,
//        name: 'certificatePolicies' },
//      { oid: '1.3.6.1.5.5.7.1.1',
//        critical: false,
//        value:
//         <Buffer 30 7a 30 24 06 08 2b 06 01 05 05 07 30 01 86 18 68 74 74 70 3a 2f 2f 6f 63 73 70 2e 64 69 67 69 63 65 72 74 2e 63 6f 6d 30 52 06 08 2b 06 01 05 05 07 ... >,
//        name: 'authorityInfoAccess',
//        authorityInfoAccessOcsp: 'http://ocsp.digicert.com',
//        authorityInfoAccessIssuers:
//         'http://cacerts.digicert.com/DigiCertSHA2ExtendedValidationServerCA.crt' },
//      { oid: '2.5.29.19',
//        critical: true,
//        value: <Buffer 30 00>,
//        name: 'basicConstraints',
//        isCA: false,
//        maxPathLen: -1,
//        basicConstraintsValid: true },
//      { oid: '1.3.6.1.4.1.11129.2.4.2',
//        critical: false,
//        value:
//         <Buffer 04 82 01 6a 01 68 00 76 00 a4 b9 09 90 b4 18 58 14 87 bb 13 a2 cc 67 70 0a 3c 35 98 04 f9 1b df b8 e3 77 cd 0e c8 0d dc 10 00 00 01 63 41 62 6d 0a 00 ... >,
//        name: 'timestampList' } ],
//   subjectKeyIdentifier: 'c9c25361669d5fab25f426cd0f389aa849ea48a9',
//   authorityKeyIdentifier: '3dd350a5d6a0adeef34a600a65d321d4f8f8d60f',
//   ocspServer: 'http://ocsp.digicert.com',
//   issuingCertificateURL:
//    'http://cacerts.digicert.com/DigiCertSHA2ExtendedValidationServerCA.crt',
//   isCA: false,
//   maxPathLen: -1,
//   basicConstraintsValid: true,
//   keyUsage: 5,
//   dnsNames: [ 'github.com', 'www.github.com' ],
//   emailAddresses: [],
//   ipAddresses: [],
//   uris: [],
//   publicKey:
//    { oid: '1.2.840.113549.1.1.1',
//      algo: 'rsaEncryption',
//      publicKey:
//       <Buffer 30 82 01 0a 02 82 01 01 00 c6 3c aa f2 3c 97 0c 3a c1 4f 28 ad 72 70 7d d3 ce b9 b5 60 73 a4 74 9b 8a 77 46 fd 7a 98 42 4c c5 30 19 57 9a a9 33 0b e1 ... > },
//   publicKeyRaw:
//    <Buffer 30 82 01 22 30 0d 06 09 2a 86 48 86 f7 0d 01 01 01 05 00 03 82 01 0f 00 30 82 01 0a 02 82 01 01 00 c6 3c aa f2 3c 97 0c 3a c1 4f 28 ad 72 70 7d d3 ce ... > }>
```

### License
@fidm/x509 is licensed under the [MIT](https://github.com/fidm/x509/blob/master/LICENSE) license.
Copyright &copy; 2018-2019 FIdM.

[npm-url]: https://www.npmjs.com/package/@fidm/x509
[npm-image]: https://img.shields.io/npm/v/@fidm/x509.svg

[travis-url]: https://travis-ci.org/fidm/x509
[travis-image]: http://img.shields.io/travis/fidm/x509.svg

[downloads-url]: https://npmjs.org/package/@fidm/x509
[downloads-image]: https://img.shields.io/npm/dm/@fidm/x509.svg?style=flat-square
