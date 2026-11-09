'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
// **Github:** https://github.com/fidm/x509
//
// **License:** MIT
const net_1 = require("net");
/**
 * Converts IP string into buffer, 4 bytes for IPv4, and 16 bytes for IPv6.
 * It will return null when IP string invalid.
 *
 * ```js
 * console.log(bytesFromIP('::1')) // <Buffer 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 01>
 * ```
 * @param ip IP string to convert
 */
function bytesFromIP(ip) {
    switch (net_1.isIP(ip)) {
        case 4:
            return Buffer.from(ip.split('.').map((val) => parseInt(val, 10)));
        case 6:
            const vals = ip.split(':');
            const buf = Buffer.alloc(16);
            let offset = 0;
            if (vals[vals.length - 1] === '') {
                vals[vals.length - 1] = '0';
            }
            for (let i = 0; i < vals.length; i++) {
                if (vals[i] === '') {
                    if (i + 1 < vals.length && vals[i + 1] !== '') {
                        // reset offset for non-zero values
                        offset = 16 - (vals.length - i - 1) * 2;
                    }
                    // skip zero bytes
                    continue;
                }
                buf.writeUInt16BE(parseInt(vals[i], 16), offset);
                offset += 2;
            }
            return buf;
        default:
            return null;
    }
}
exports.bytesFromIP = bytesFromIP;
/**
 * Converts 4-bytes into an IPv4 string representation or 16-bytes into
 * an IPv6 string representation. The bytes must be in network order.
 *
 * ```js
 * console.log(bytesToIP(Buffer.from([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]))) // '::1'
 * ```
 * @param bytes buffer to convert
 */
function bytesToIP(bytes) {
    switch (bytes.length) {
        case 4:
            return [bytes[0], bytes[1], bytes[2], bytes[3]].join('.');
        case 16:
            const ip = [];
            let zeroAt = -1;
            let zeroLen = 0;
            let maxAt = -1;
            let maxLen = 0;
            for (let i = 0; i < bytes.length; i += 2) {
                const hex = (bytes[i] << 8) | bytes[i + 1];
                if (hex === 0) {
                    zeroLen++;
                    if (zeroAt === -1) {
                        zeroAt = ip.length;
                    }
                    if (zeroLen > maxLen) {
                        maxLen = zeroLen;
                        maxAt = zeroAt;
                    }
                }
                else {
                    zeroAt = -1;
                    zeroLen = 0;
                }
                ip.push(hex.toString(16));
            }
            if (maxLen > 0) {
                let padding = '';
                const rest = ip.slice(maxAt + maxLen);
                ip.length = maxAt;
                if (ip.length === 0) {
                    padding += ':';
                }
                if (rest.length === 0) {
                    padding += ':';
                }
                ip.push(padding, ...rest);
            }
            return ip.join(':');
        default:
            return '';
    }
}
exports.bytesToIP = bytesToIP;
const oids = Object.create(null);
const oidReg = /^[0-9.]+$/;
/**
 * Returns Object Identifier (dot-separated numeric string) that registered by initOID function.
 * It will return empty string if not exists.
 * @param nameOrId OID name or OID
 */
function getOID(nameOrId) {
    if (oidReg.test(nameOrId) && oids[nameOrId] !== '') {
        return nameOrId;
    }
    return oids[nameOrId] == null ? '' : oids[nameOrId];
}
exports.getOID = getOID;
/**
 * Returns Object Identifier name that registered by initOID function.
 * It will return the argument nameOrId if not exists.
 * @param nameOrId OID name or OID
 */
function getOIDName(nameOrId) {
    if (!oidReg.test(nameOrId) && oids[nameOrId] !== '') {
        return nameOrId;
    }
    return oids[nameOrId] == null ? nameOrId : oids[nameOrId];
}
exports.getOIDName = getOIDName;
/**
 * Register OID and name
 * @param oid Object Identifier
 * @param name Object Identifier name
 */
function initOID(oid, name) {
    oids[oid] = name;
    oids[name] = oid;
}
// algorithm OIDs
initOID('1.2.840.113549.1.1.1', 'rsaEncryption');
initOID('1.2.840.113549.1.1.4', 'md5WithRsaEncryption');
initOID('1.2.840.113549.1.1.5', 'sha1WithRsaEncryption');
initOID('1.2.840.113549.1.1.8', 'mgf1');
initOID('1.2.840.113549.1.1.10', 'RSASSA-PSS');
initOID('1.2.840.113549.1.1.11', 'sha256WithRsaEncryption');
initOID('1.2.840.113549.1.1.12', 'sha384WithRsaEncryption');
initOID('1.2.840.113549.1.1.13', 'sha512WithRsaEncryption');
initOID('1.2.840.10045.2.1', 'ecEncryption'); // ECDSA and ECDH Public Key
initOID('1.2.840.10045.4.1', 'ecdsaWithSha1');
initOID('1.2.840.10045.4.3.2', 'ecdsaWithSha256');
initOID('1.2.840.10045.4.3.3', 'ecdsaWithSha384');
initOID('1.2.840.10045.4.3.4', 'ecdsaWithSha512');
initOID('1.2.840.10040.4.3', 'dsaWithSha1');
initOID('2.16.840.1.101.3.4.3.2', 'dsaWithSha256');
initOID('1.3.14.3.2.7', 'desCBC');
initOID('1.3.14.3.2.26', 'sha1');
initOID('2.16.840.1.101.3.4.2.1', 'sha256');
initOID('2.16.840.1.101.3.4.2.2', 'sha384');
initOID('2.16.840.1.101.3.4.2.3', 'sha512');
initOID('1.2.840.113549.2.5', 'md5');
// Algorithm Identifiers for Ed25519, Ed448, X25519 and X448 for use in the Internet X.509 Public Key Infrastructure
// https://tools.ietf.org/html/draft-ietf-curdle-pkix-10
initOID('1.3.101.110', 'X25519');
initOID('1.3.101.111', 'X448');
initOID('1.3.101.112', 'Ed25519');
initOID('1.3.101.113', 'Ed448');
// pkcs#7 content types
initOID('1.2.840.113549.1.7.1', 'data');
initOID('1.2.840.113549.1.7.2', 'signedData');
initOID('1.2.840.113549.1.7.3', 'envelopedData');
initOID('1.2.840.113549.1.7.4', 'signedAndEnvelopedData');
initOID('1.2.840.113549.1.7.5', 'digestedData');
initOID('1.2.840.113549.1.7.6', 'encryptedData');
// pkcs#9 oids
initOID('1.2.840.113549.1.9.1', 'emailAddress');
initOID('1.2.840.113549.1.9.2', 'unstructuredName');
initOID('1.2.840.113549.1.9.3', 'contentType');
initOID('1.2.840.113549.1.9.4', 'messageDigest');
initOID('1.2.840.113549.1.9.5', 'signingTime');
initOID('1.2.840.113549.1.9.6', 'counterSignature');
initOID('1.2.840.113549.1.9.7', 'challengePassword');
initOID('1.2.840.113549.1.9.8', 'unstructuredAddress');
initOID('1.2.840.113549.1.9.14', 'extensionRequest');
initOID('1.2.840.113549.1.9.20', 'friendlyName');
initOID('1.2.840.113549.1.9.21', 'localKeyId');
initOID('1.2.840.113549.1.9.22.1', 'x509Certificate');
// pkcs#12 safe bags
initOID('1.2.840.113549.1.12.10.1.1', 'keyBag');
initOID('1.2.840.113549.1.12.10.1.2', 'pkcs8ShroudedKeyBag');
initOID('1.2.840.113549.1.12.10.1.3', 'certBag');
initOID('1.2.840.113549.1.12.10.1.4', 'crlBag');
initOID('1.2.840.113549.1.12.10.1.5', 'secretBag');
initOID('1.2.840.113549.1.12.10.1.6', 'safeContentsBag');
// password-based-encryption for pkcs#12
initOID('1.2.840.113549.1.5.13', 'pkcs5PBES2');
initOID('1.2.840.113549.1.5.12', 'pkcs5PBKDF2');
// hmac OIDs
initOID('1.2.840.113549.2.7', 'hmacWithSha1');
initOID('1.2.840.113549.2.9', 'hmacWithSha256');
initOID('1.2.840.113549.2.10', 'hmacWithSha384');
initOID('1.2.840.113549.2.11', 'hmacWithSha512');
// symmetric key algorithm oids
initOID('1.2.840.113549.3.7', '3desCBC');
initOID('2.16.840.1.101.3.4.1.2', 'aesCBC128');
initOID('2.16.840.1.101.3.4.1.42', 'aesCBC256');
// certificate issuer/subject OIDs
initOID('2.5.4.3', 'commonName');
initOID('2.5.4.5', 'serialName');
initOID('2.5.4.6', 'countryName');
initOID('2.5.4.7', 'localityName');
initOID('2.5.4.8', 'stateOrProvinceName');
initOID('2.5.4.10', 'organizationName');
initOID('2.5.4.11', 'organizationalUnitName');
initOID('2.5.4.15', 'businessCategory');
// X.509 extension OIDs
initOID('2.16.840.1.113730.1.1', 'nsCertType');
initOID('2.5.29.2', 'keyAttributes'); // obsolete, use .37 or .15
initOID('2.5.29.4', 'keyUsageRestriction'); // obsolete, use .37 or .15
initOID('2.5.29.6', 'subtreesConstraint'); // obsolete, use .30
initOID('2.5.29.9', 'subjectDirectoryAttributes');
initOID('2.5.29.14', 'subjectKeyIdentifier');
initOID('2.5.29.15', 'keyUsage');
initOID('2.5.29.16', 'privateKeyUsagePeriod');
initOID('2.5.29.17', 'subjectAltName');
initOID('2.5.29.18', 'issuerAltName');
initOID('2.5.29.19', 'basicConstraints');
initOID('2.5.29.20', 'cRLNumber');
initOID('2.5.29.21', 'cRLReason');
initOID('2.5.29.22', 'expirationDate');
initOID('2.5.29.23', 'instructionCode');
initOID('2.5.29.24', 'invalidityDate');
initOID('2.5.29.27', 'deltaCRLIndicator');
initOID('2.5.29.28', 'issuingDistributionPoint');
initOID('2.5.29.29', 'certificateIssuer');
initOID('2.5.29.30', 'nameConstraints');
initOID('2.5.29.31', 'cRLDistributionPoints');
initOID('2.5.29.32', 'certificatePolicies');
initOID('2.5.29.33', 'policyMappings');
initOID('2.5.29.35', 'authorityKeyIdentifier');
initOID('2.5.29.36', 'policyConstraints');
initOID('2.5.29.37', 'extKeyUsage');
initOID('2.5.29.46', 'freshestCRL');
initOID('2.5.29.54', 'inhibitAnyPolicy');
// extKeyUsage purposes
initOID('1.3.6.1.4.1.311.60.2.1.2', 'jurisdictionST');
initOID('1.3.6.1.4.1.311.60.2.1.3', 'jurisdictionC');
initOID('1.3.6.1.4.1.11129.2.4.2', 'timestampList');
initOID('1.3.6.1.5.5.7.1.1', 'authorityInfoAccess');
initOID('1.3.6.1.5.5.7.3.1', 'serverAuth');
initOID('1.3.6.1.5.5.7.3.2', 'clientAuth');
initOID('1.3.6.1.5.5.7.3.3', 'codeSigning');
initOID('1.3.6.1.5.5.7.3.4', 'emailProtection');
initOID('1.3.6.1.5.5.7.3.8', 'timeStamping');
initOID('1.3.6.1.5.5.7.48.1', 'authorityInfoAccessOcsp');
initOID('1.3.6.1.5.5.7.48.2', 'authorityInfoAccessIssuers');
//# sourceMappingURL=common.js.map