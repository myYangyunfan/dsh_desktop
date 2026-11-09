'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
// **Github:** https://github.com/fidm/x509
//
// **License:** MIT
const util_1 = require("util");
const crypto_1 = require("crypto");
const asn1_1 = require("@fidm/asn1");
const common_1 = require("./common");
const pki_1 = require("./pki");
// short name OID mappings
const shortNames = Object.create(null);
shortNames.CN = common_1.getOID('commonName');
shortNames.commonName = 'CN';
shortNames.C = common_1.getOID('countryName');
shortNames.countryName = 'C';
shortNames.L = common_1.getOID('localityName');
shortNames.localityName = 'L';
shortNames.ST = common_1.getOID('stateOrProvinceName');
shortNames.stateOrProvinceName = 'ST';
shortNames.O = common_1.getOID('organizationName');
shortNames.organizationName = 'O';
shortNames.OU = common_1.getOID('organizationalUnitName');
shortNames.organizationalUnitName = 'OU';
shortNames.E = common_1.getOID('emailAddress');
shortNames.emailAddress = 'E';
function getShortName(name) {
    return shortNames[name] == null ? '' : shortNames[name];
}
// validator for an X.509v3 certificate
const x509CertificateValidator = {
    name: 'Certificate',
    class: asn1_1.Class.UNIVERSAL,
    tag: asn1_1.Tag.SEQUENCE,
    value: [{
            name: 'Certificate.TBSCertificate',
            class: asn1_1.Class.UNIVERSAL,
            tag: asn1_1.Tag.SEQUENCE,
            capture: 'tbsCertificate',
            value: [{
                    name: 'Certificate.TBSCertificate.version',
                    class: asn1_1.Class.CONTEXT_SPECIFIC,
                    tag: asn1_1.Tag.NONE,
                    optional: true,
                    value: [{
                            name: 'Certificate.TBSCertificate.version.integer',
                            class: asn1_1.Class.UNIVERSAL,
                            tag: asn1_1.Tag.INTEGER,
                            capture: 'certVersion',
                        }],
                }, {
                    name: 'Certificate.TBSCertificate.serialNumber',
                    class: asn1_1.Class.UNIVERSAL,
                    tag: asn1_1.Tag.INTEGER,
                    capture: 'certSerialNumber',
                }, {
                    name: 'Certificate.TBSCertificate.signature',
                    class: asn1_1.Class.UNIVERSAL,
                    tag: asn1_1.Tag.SEQUENCE,
                    value: [{
                            name: 'Certificate.TBSCertificate.signature.algorithm',
                            class: asn1_1.Class.UNIVERSAL,
                            tag: asn1_1.Tag.OID,
                            capture: 'certinfoSignatureOID',
                        }, {
                            name: 'Certificate.TBSCertificate.signature.parameters',
                            class: asn1_1.Class.UNIVERSAL,
                            tag: asn1_1.Tag.OCTETSTRING,
                            optional: true,
                            capture: 'certinfoSignatureParams',
                        }],
                }, {
                    name: 'Certificate.TBSCertificate.issuer',
                    class: asn1_1.Class.UNIVERSAL,
                    tag: asn1_1.Tag.SEQUENCE,
                    capture: 'certIssuer',
                }, {
                    name: 'Certificate.TBSCertificate.validity',
                    class: asn1_1.Class.UNIVERSAL,
                    tag: asn1_1.Tag.SEQUENCE,
                    value: [{
                            name: 'Certificate.TBSCertificate.validity.notBefore',
                            class: asn1_1.Class.UNIVERSAL,
                            tag: [asn1_1.Tag.UTCTIME, asn1_1.Tag.GENERALIZEDTIME],
                            capture: 'certValidityNotBefore',
                        }, {
                            name: 'Certificate.TBSCertificate.validity.notAfter',
                            class: asn1_1.Class.UNIVERSAL,
                            tag: [asn1_1.Tag.UTCTIME, asn1_1.Tag.GENERALIZEDTIME],
                            capture: 'certValidityNotAfter',
                        }],
                }, {
                    // Name (subject) (RDNSequence)
                    name: 'Certificate.TBSCertificate.subject',
                    class: asn1_1.Class.UNIVERSAL,
                    tag: asn1_1.Tag.SEQUENCE,
                    capture: 'certSubject',
                },
                // SubjectPublicKeyInfo
                pki_1.publicKeyValidator,
                {
                    // issuerUniqueID (optional)
                    name: 'Certificate.TBSCertificate.issuerUniqueID',
                    class: asn1_1.Class.CONTEXT_SPECIFIC,
                    tag: asn1_1.Tag.BOOLEAN,
                    optional: true,
                    value: [{
                            name: 'Certificate.TBSCertificate.issuerUniqueID.id',
                            class: asn1_1.Class.UNIVERSAL,
                            tag: asn1_1.Tag.BITSTRING,
                            capture: 'certIssuerUniqueId',
                        }],
                }, {
                    // subjectUniqueID (optional)
                    name: 'Certificate.TBSCertificate.subjectUniqueID',
                    class: asn1_1.Class.CONTEXT_SPECIFIC,
                    tag: asn1_1.Tag.INTEGER,
                    optional: true,
                    value: [{
                            name: 'Certificate.TBSCertificate.subjectUniqueID.id',
                            class: asn1_1.Class.UNIVERSAL,
                            tag: asn1_1.Tag.BITSTRING,
                            capture: 'certSubjectUniqueId',
                        }],
                }, {
                    // Extensions (optional)
                    name: 'Certificate.TBSCertificate.extensions',
                    class: asn1_1.Class.CONTEXT_SPECIFIC,
                    tag: asn1_1.Tag.BITSTRING,
                    capture: 'certExtensions',
                    optional: true,
                }],
        }, {
            // AlgorithmIdentifier (signature algorithm)
            name: 'Certificate.signatureAlgorithm',
            class: asn1_1.Class.UNIVERSAL,
            tag: asn1_1.Tag.SEQUENCE,
            value: [{
                    // algorithm
                    name: 'Certificate.signatureAlgorithm.algorithm',
                    class: asn1_1.Class.UNIVERSAL,
                    tag: asn1_1.Tag.OID,
                    capture: 'certSignatureOID',
                }, {
                    name: 'Certificate.TBSCertificate.signature.parameters',
                    class: asn1_1.Class.UNIVERSAL,
                    tag: asn1_1.Tag.OCTETSTRING,
                    optional: true,
                    capture: 'certSignatureParams',
                }],
        }, {
            name: 'Certificate.signatureValue',
            class: asn1_1.Class.UNIVERSAL,
            tag: asn1_1.Tag.BITSTRING,
            capture: 'certSignature',
        }],
};
/**
 * DistinguishedName for X.509v3 certificate.
 */
class DistinguishedName {
    constructor() {
        this.attributes = [];
        this.uniqueId = null;
    }
    get commonName() {
        return this.getFieldValue('commonName');
    }
    get organizationName() {
        return this.getFieldValue('organizationName');
    }
    get organizationalUnitName() {
        return this.getFieldValue('organizationalUnitName');
    }
    get countryName() {
        return this.getFieldValue('countryName');
    }
    get localityName() {
        return this.getFieldValue('localityName');
    }
    get serialName() {
        return this.getFieldValue('serialName');
    }
    getHash() {
        const hasher = crypto_1.createHash('sha1');
        for (const attr of this.attributes) {
            hasher.update(attr.oid);
            hasher.update(attr.value);
        }
        return hasher.digest();
    }
    getField(key) {
        for (const attr of this.attributes) {
            if (key === attr.oid || key === attr.name || key === attr.shortName) {
                return attr;
            }
        }
        return null;
    }
    addField(attr) {
        fillMissingFields([attr]);
        this.attributes.push(attr);
    }
    setAttrs(attrs) {
        // set new attributes, clear hash
        fillMissingFields(attrs);
        this.attributes = attrs;
    }
    toJSON() {
        const obj = {};
        for (const attr of this.attributes) {
            const key = attr.shortName;
            if (typeof key === 'string' && key !== '') {
                obj[key] = attr.value;
            }
        }
        obj.uniqueId = this.uniqueId;
        obj.attributes = this.attributes;
        return obj;
    }
    getFieldValue(key) {
        const val = this.getField(key);
        if (val != null) {
            return val.value;
        }
        return '';
    }
}
exports.DistinguishedName = DistinguishedName;
/**
 * X.509v3 Certificate.
 */
class Certificate {
    /**
     * Parse one or more X.509 certificates from PEM formatted buffer.
     * If there is no certificate, it will throw error.
     * @param data PEM formatted buffer
     */
    static fromPEMs(data) {
        const certs = [];
        const pems = asn1_1.PEM.parse(data);
        for (const pem of pems) {
            if (pem.type !== 'CERTIFICATE' &&
                pem.type !== 'X509 CERTIFICATE' &&
                pem.type !== 'TRUSTED CERTIFICATE') {
                throw new Error('Could not convert certificate from PEM: invalid type');
            }
            if (pem.procType.includes('ENCRYPTED')) {
                throw new Error('Could not convert certificate from PEM: PEM is encrypted.');
            }
            const obj = asn1_1.ASN1.fromDER(pem.body);
            certs.push(new Certificate(obj));
        }
        if (certs.length === 0) {
            throw new Error('No Certificate');
        }
        return certs;
    }
    /**
     * Parse an X.509 certificate from PEM formatted buffer.
     * @param data PEM formatted buffer
     */
    static fromPEM(data) {
        return Certificate.fromPEMs(data)[0];
    }
    /**
     * Creates an X.509 certificate from an ASN.1 object
     * @param obj an ASN.1 object
     */
    constructor(obj) {
        // validate certificate and capture data
        const captures = Object.create(null);
        const err = obj.validate(x509CertificateValidator, captures);
        if (err != null) {
            throw new Error('Cannot read X.509 certificate: ' + err.message);
        }
        this.raw = obj.DER;
        this.version = captures.certVersion == null ? 0 : (asn1_1.ASN1.parseIntegerNum(captures.certVersion.bytes) + 1);
        this.serialNumber = asn1_1.ASN1.parseIntegerStr(captures.certSerialNumber.bytes);
        this.signatureOID = asn1_1.ASN1.parseOID(captures.certSignatureOID.bytes);
        this.signatureAlgorithm = common_1.getOIDName(this.signatureOID);
        this.infoSignatureOID = asn1_1.ASN1.parseOID(captures.certinfoSignatureOID.bytes);
        this.signature = asn1_1.ASN1.parseBitString(captures.certSignature.bytes).buf;
        this.validFrom = asn1_1.ASN1.parseTime(captures.certValidityNotBefore.tag, captures.certValidityNotBefore.bytes);
        this.validTo = asn1_1.ASN1.parseTime(captures.certValidityNotAfter.tag, captures.certValidityNotAfter.bytes);
        this.issuer = new DistinguishedName();
        this.issuer.setAttrs(RDNAttributesAsArray(captures.certIssuer));
        if (captures.certIssuerUniqueId != null) {
            this.issuer.uniqueId = asn1_1.ASN1.parseBitString(captures.certIssuerUniqueId.bytes);
        }
        this.subject = new DistinguishedName();
        this.subject.setAttrs(RDNAttributesAsArray(captures.certSubject));
        if (captures.certSubjectUniqueId != null) {
            this.subject.uniqueId = asn1_1.ASN1.parseBitString(captures.certSubjectUniqueId.bytes);
        }
        this.extensions = [];
        this.subjectKeyIdentifier = '';
        this.authorityKeyIdentifier = '';
        this.ocspServer = '';
        this.issuingCertificateURL = '';
        this.isCA = false;
        this.maxPathLen = -1;
        this.basicConstraintsValid = false;
        this.keyUsage = 0;
        this.dnsNames = [];
        this.emailAddresses = [];
        this.ipAddresses = [];
        this.uris = [];
        if (captures.certExtensions != null) {
            this.extensions = certificateExtensionsFromAsn1(captures.certExtensions);
            for (const ext of this.extensions) {
                if (typeof ext.subjectKeyIdentifier === 'string') {
                    this.subjectKeyIdentifier = ext.subjectKeyIdentifier;
                }
                if (typeof ext.authorityKeyIdentifier === 'string') {
                    this.authorityKeyIdentifier = ext.authorityKeyIdentifier;
                }
                if (typeof ext.authorityInfoAccessOcsp === 'string') {
                    this.ocspServer = ext.authorityInfoAccessOcsp;
                }
                if (typeof ext.authorityInfoAccessIssuers === 'string') {
                    this.issuingCertificateURL = ext.authorityInfoAccessIssuers;
                }
                if (typeof ext.basicConstraintsValid === 'boolean') {
                    this.isCA = ext.isCA;
                    this.maxPathLen = ext.maxPathLen;
                    this.basicConstraintsValid = ext.basicConstraintsValid;
                }
                if (typeof ext.keyUsage === 'number') {
                    this.keyUsage = ext.keyUsage;
                }
                if (Array.isArray(ext.altNames)) {
                    for (const item of ext.altNames) {
                        if (item.dnsName != null) {
                            this.dnsNames.push(item.dnsName);
                        }
                        if (item.email != null) {
                            this.emailAddresses.push(item.email);
                        }
                        if (item.ip != null) {
                            this.ipAddresses.push(item.ip);
                        }
                        if (item.uri != null) {
                            this.uris.push(item.uri);
                        }
                    }
                }
            }
        }
        this.publicKey = new pki_1.PublicKey(captures.publicKeyInfo);
        this.publicKeyRaw = this.publicKey.toDER();
        this.tbsCertificate = captures.tbsCertificate;
    }
    /**
     * Gets an extension by its name or oid.
     * If extension exists and a key provided, it will return extension[key].
     * ```js
     * certificate.getExtension('keyUsage')
     * certificate.getExtension('2.5.29.15')
     * // => { oid: '2.5.29.15',
     * //      critical: true,
     * //      value: <Buffer 03 02 05 a0>,
     * //      name: 'keyUsage',
     * //      digitalSignature: true,
     * //      nonRepudiation: false,
     * //      keyEncipherment: true,
     * //      dataEncipherment: false,
     * //      keyAgreement: false,
     * //      keyCertSign: false,
     * //      cRLSign: false,
     * //      encipherOnly: false,
     * //      decipherOnly: false }
     * certificate.getExtension('keyUsage', 'keyCertSign') // => false
     * ```
     * @param name extension name or OID
     * @param key key in extension
     */
    getExtension(name, key = '') {
        for (const ext of this.extensions) {
            if (name === ext.oid || name === ext.name) {
                return key === '' ? ext : ext[key];
            }
        }
        return null;
    }
    /**
     * Returns null if a subject certificate is valid, or error if invalid.
     * Note that it does not check validity time, DNS name, ip or others.
     * @param child subject's Certificate
     */
    checkSignature(child) {
        // RFC 5280, 4.2.1.9:
        // "If the basic constraints extension is not present in a version 3
        // certificate, or the extension is present but the cA boolean is not
        // asserted, then the certified public key MUST NOT be used to verify
        // certificate signatures."
        // (not handler entrust broken SPKI, See http://www.entrust.net/knowledge-base/technote.cfm?tn=7869)
        if (this.version === 3 && !this.basicConstraintsValid || (this.basicConstraintsValid && !this.isCA)) {
            return new Error('The parent constraint violation error');
        }
        if (this.getExtension('keyUsage', 'keyCertSign') !== true) {
            return new Error('The parent constraint violation error');
        }
        if (!child.isIssuer(this)) {
            return new Error('The parent certificate did not issue the given child certificate');
        }
        const agl = getHashAgl(child.signatureOID);
        if (agl === '') {
            return new Error('Unknown child signature OID.');
        }
        const res = this.publicKey.verify(child.tbsCertificate.DER, child.signature, agl);
        if (res === false) {
            return new Error('Child signature not matched');
        }
        return null;
    }
    /**
     * Returns true if this certificate's issuer matches the passed
     * certificate's subject. Note that no signature check is performed.
     * @param parent issuer's Certificate
     */
    isIssuer(parent) {
        return this.issuer.getHash().equals(parent.subject.getHash());
    }
    /**
     * Verifies the subjectKeyIdentifier extension value for this certificate
     * against its public key.
     */
    verifySubjectKeyIdentifier() {
        const ski = this.publicKey.getFingerprint('sha1', 'PublicKey');
        return ski.toString('hex') === this.subjectKeyIdentifier;
    }
    /**
     * Return a friendly JSON object for debuging.
     */
    toJSON() {
        const obj = {};
        for (const key of Object.keys(this)) {
            obj[key] = toJSONify(this[key]);
        }
        delete obj.tbsCertificate;
        return obj;
    }
    [util_1.inspect.custom](_depth, options) {
        if (options.depth <= 2) {
            options.depth = 10;
        }
        return `<${this.constructor.name} ${util_1.inspect(this.toJSON(), options)}>`;
    }
}
exports.Certificate = Certificate;
function certificateExtensionsFromAsn1(exts) {
    const res = [];
    for (const val of exts.mustCompound()) {
        for (const ext of val.mustCompound()) {
            res.push(certificateExtensionFromAsn1(ext));
        }
    }
    return res;
}
function certificateExtensionFromAsn1(ext) {
    // an extension has:
    // [0] extnID      OBJECT IDENTIFIER
    // [1] critical    BOOLEAN DEFAULT FALSE
    // [2] extnValue   OCTET STRING
    const e = {};
    e.oid = asn1_1.ASN1.parseOID(ext.value[0].bytes);
    e.critical = false;
    if (ext.value[1].tag === asn1_1.Tag.BOOLEAN) {
        e.critical = asn1_1.ASN1.parseBool(ext.value[1].bytes);
        e.value = ext.value[2].bytes;
    }
    else {
        e.value = ext.value[1].bytes;
    }
    // if the oid is known, get its name
    e.name = common_1.getOIDName(e.oid);
    switch (e.name) {
        // handle key usage
        case 'keyUsage':
            decodeExtKeyUsage(e);
            break;
        case 'basicConstraints':
            decodeExtBasicConstraints(e);
            break;
        case 'extKeyUsage':
            decodeExtExtKeyUsage(e);
            break;
        case 'nsCertType':
            decodeExtNsCertType(e);
            break;
        case 'subjectAltName':
            decodeExtAltName(e);
            break;
        case 'issuerAltName':
            decodeExtAltName(e);
            break;
        case 'subjectKeyIdentifier':
            decodeExtSubjectKeyIdentifier(e);
            break;
        case 'authorityKeyIdentifier':
            decodeExtAuthorityKeyIdentifier(e);
            break;
        case 'authorityInfoAccess':
            decodeExtAuthorityInfoAccess(e);
            break;
    }
    return e;
}
function decodeExtKeyUsage(e) {
    // ev is a BITSTRING
    const ev = asn1_1.ASN1.parseBitString(asn1_1.ASN1.fromDER(e.value).bytes);
    let b2 = 0x00;
    let b3 = 0x00;
    e.keyUsage = 0;
    for (let i = 0; i < 9; i++) {
        if (ev.at(i) !== 0) {
            e.keyUsage |= 1 << i;
        }
    }
    if (ev.buf.length > 0) {
        b2 = ev.buf[0];
        b3 = ev.buf.length > 1 ? ev.buf[1] : 0;
    }
    // set flags
    e.digitalSignature = (b2 & 0x80) === 0x80;
    e.nonRepudiation = (b2 & 0x40) === 0x40;
    e.keyEncipherment = (b2 & 0x20) === 0x20;
    e.dataEncipherment = (b2 & 0x10) === 0x10;
    e.keyAgreement = (b2 & 0x08) === 0x08;
    e.keyCertSign = (b2 & 0x04) === 0x04;
    e.cRLSign = (b2 & 0x02) === 0x02;
    e.encipherOnly = (b2 & 0x01) === 0x01;
    e.decipherOnly = (b3 & 0x80) === 0x80;
}
function decodeExtBasicConstraints(e) {
    // handle basic constraints
    // get value as SEQUENCE
    const ev = asn1_1.ASN1.fromDER(e.value);
    const vals = ev.mustCompound();
    // get cA BOOLEAN flag (defaults to false)
    if (vals.length > 0 && vals[0].tag === asn1_1.Tag.BOOLEAN) {
        e.isCA = asn1_1.ASN1.parseBool(vals[0].bytes);
    }
    else {
        e.isCA = false;
    }
    // get path length constraint
    let value = null;
    if (vals.length > 0 && vals[0].tag === asn1_1.Tag.INTEGER) {
        value = vals[0].bytes;
    }
    else if (vals.length > 1) {
        value = vals[1].bytes;
    }
    if (value !== null) {
        e.maxPathLen = asn1_1.ASN1.parseInteger(value);
    }
    else {
        e.maxPathLen = -1;
    }
    e.basicConstraintsValid = true;
}
function decodeExtExtKeyUsage(e) {
    // handle extKeyUsage
    // value is a SEQUENCE of OIDs
    const ev = asn1_1.ASN1.fromDER(e.value);
    const vals = ev.mustCompound();
    for (const val of vals) {
        e[common_1.getOIDName(asn1_1.ASN1.parseOID(val.bytes))] = true;
    }
}
function decodeExtNsCertType(e) {
    // ev is a BITSTRING
    const ev = asn1_1.ASN1.parseBitString(asn1_1.ASN1.fromDER(e.value).bytes);
    let b2 = 0x00;
    if (ev.buf.length > 0) {
        b2 = ev.buf[0];
    }
    // set flags
    e.client = (b2 & 0x80) === 0x80;
    e.server = (b2 & 0x40) === 0x40;
    e.email = (b2 & 0x20) === 0x20;
    e.objsign = (b2 & 0x10) === 0x10;
    e.reserved = (b2 & 0x08) === 0x08;
    e.sslCA = (b2 & 0x04) === 0x04;
    e.emailCA = (b2 & 0x02) === 0x02;
    e.objCA = (b2 & 0x01) === 0x01;
}
function decodeExtAltName(e) {
    // handle subjectAltName/issuerAltName
    e.altNames = [];
    // ev is a SYNTAX SEQUENCE
    const ev = asn1_1.ASN1.fromDER(e.value);
    const vals = ev.mustCompound();
    for (const gn of vals) {
        // get GeneralName
        const item = {
            tag: gn.tag,
            value: gn.bytes,
        };
        e.altNames.push(item);
        switch (gn.tag) {
            // rfc822Name, emailAddresses
            case 1:
                item.email = gn.bytes.toString();
                break;
            // dNSName
            case 2:
                item.dnsName = gn.bytes.toString();
                break;
            // uniformResourceIdentifier (URI)
            case 6:
                item.uri = gn.bytes.toString();
                break;
            // IPAddress
            case 7:
                // convert to IPv4/IPv6 string representation
                item.ip = common_1.bytesToIP(gn.bytes);
                break;
            // registeredID
            case 8:
                item.oid = asn1_1.ASN1.parseOID(gn.bytes);
                break;
            default:
            // unsupported
        }
    }
}
const subjectKeyIdentifierValidator = {
    name: 'subjectKeyIdentifier',
    class: asn1_1.Class.UNIVERSAL,
    tag: asn1_1.Tag.OCTETSTRING,
    capture: 'subjectKeyIdentifier',
};
function decodeExtSubjectKeyIdentifier(e) {
    const captures = asn1_1.ASN1.parseDERWithTemplate(e.value, subjectKeyIdentifierValidator);
    e.subjectKeyIdentifier = captures.subjectKeyIdentifier.bytes.toString('hex');
}
const authorityKeyIdentifierValidator = {
    name: 'authorityKeyIdentifier',
    class: asn1_1.Class.UNIVERSAL,
    tag: asn1_1.Tag.SEQUENCE,
    value: [{
            name: 'authorityKeyIdentifier.value',
            class: asn1_1.Class.CONTEXT_SPECIFIC,
            tag: asn1_1.Tag.NONE,
            capture: 'authorityKeyIdentifier',
        }],
};
function decodeExtAuthorityKeyIdentifier(e) {
    const captures = asn1_1.ASN1.parseDERWithTemplate(e.value, authorityKeyIdentifierValidator);
    e.authorityKeyIdentifier = captures.authorityKeyIdentifier.bytes.toString('hex');
}
const authorityInfoAccessValidator = {
    name: 'authorityInfoAccess',
    class: asn1_1.Class.UNIVERSAL,
    tag: asn1_1.Tag.SEQUENCE,
    value: [{
            name: 'authorityInfoAccess.authorityInfoAccessOcsp',
            class: asn1_1.Class.UNIVERSAL,
            tag: asn1_1.Tag.SEQUENCE,
            optional: true,
            value: [{
                    name: 'authorityInfoAccess.authorityInfoAccessOcsp.oid',
                    class: asn1_1.Class.UNIVERSAL,
                    tag: asn1_1.Tag.OID,
                }, {
                    name: 'authorityInfoAccess.authorityInfoAccessOcsp.value',
                    class: asn1_1.Class.CONTEXT_SPECIFIC,
                    tag: asn1_1.Tag.OID,
                    capture: 'authorityInfoAccessOcsp',
                }],
        }, {
            name: 'authorityInfoAccess.authorityInfoAccessIssuers',
            class: asn1_1.Class.UNIVERSAL,
            tag: asn1_1.Tag.SEQUENCE,
            optional: true,
            value: [{
                    name: 'authorityInfoAccess.authorityInfoAccessIssuers.oid',
                    class: asn1_1.Class.UNIVERSAL,
                    tag: asn1_1.Tag.OID,
                }, {
                    name: 'authorityInfoAccess.authorityInfoAccessIssuers.value',
                    class: asn1_1.Class.CONTEXT_SPECIFIC,
                    tag: asn1_1.Tag.OID,
                    capture: 'authorityInfoAccessIssuers',
                }],
        }],
};
function decodeExtAuthorityInfoAccess(e) {
    const captures = asn1_1.ASN1.parseDERWithTemplate(e.value, authorityInfoAccessValidator);
    if (captures.authorityInfoAccessOcsp != null) {
        e.authorityInfoAccessOcsp = captures.authorityInfoAccessOcsp.bytes.toString();
    }
    if (captures.authorityInfoAccessIssuers != null) {
        e.authorityInfoAccessIssuers = captures.authorityInfoAccessIssuers.bytes.toString();
    }
}
// Fills in missing fields in attributes.
function fillMissingFields(attrs) {
    for (const attr of attrs) {
        // populate missing name
        if (attr.name == null || attr.name === '') {
            if (attr.oid != null) {
                attr.name = common_1.getOIDName(attr.oid);
            }
            if (attr.name === '' && attr.shortName != null) {
                attr.name = common_1.getOIDName(shortNames[attr.shortName]);
            }
        }
        // populate missing type (OID)
        if (attr.oid == null || attr.oid === '') {
            if (attr.name !== '') {
                attr.oid = common_1.getOID(attr.name);
            }
            else {
                throw new Error('Attribute oid not specified.');
            }
        }
        // populate missing shortname
        if (attr.shortName == null || attr.shortName === '') {
            attr.shortName = shortNames[attr.name] == null ? '' : shortNames[attr.name];
        }
        if (attr.value == null) {
            throw new Error('Attribute value not specified.');
        }
    }
}
// Only support RSA and ECDSA
function getHashAgl(oid) {
    switch (common_1.getOIDName(oid)) {
        case 'sha1WithRsaEncryption':
            return 'sha1';
        case 'md5WithRsaEncryption':
            return 'md5';
        case 'sha256WithRsaEncryption':
            return 'sha256';
        case 'sha384WithRsaEncryption':
            return 'sha384';
        case 'sha512WithRsaEncryption':
            return 'sha512';
        case 'RSASSA-PSS':
            return 'sha256';
        case 'ecdsaWithSha1':
            return 'sha1';
        case 'ecdsaWithSha256':
            return 'sha256';
        case 'ecdsaWithSha384':
            return 'sha384';
        case 'ecdsaWithSha512':
            return 'sha512';
        case 'dsaWithSha1':
            return 'sha1';
        case 'dsaWithSha256':
            return 'sha256';
        default:
            return '';
    }
}
// Converts an RDNSequence of ASN.1 DER-encoded RelativeDistinguishedName
// sets into an array with objects that have type and value properties.
function RDNAttributesAsArray(rdn) {
    const rval = [];
    // each value in 'rdn' in is a SET of RelativeDistinguishedName
    // var set, attr, obj
    for (const set of rdn.mustCompound()) {
        // each value in the SET is an AttributeTypeAndValue sequence
        // containing first a type (an OID) and second a value (defined by the OID)
        for (const attr of set.mustCompound()) {
            const values = attr.mustCompound();
            const obj = {};
            obj.oid = asn1_1.ASN1.parseOID(values[0].bytes);
            obj.value = values[1].value;
            obj.valueTag = values[1].tag;
            obj.name = common_1.getOIDName(obj.oid);
            obj.shortName = getShortName(obj.name);
            rval.push(obj);
        }
    }
    return rval;
}
function toJSONify(val) {
    if (val != null && !(val instanceof Buffer) && typeof val.toJSON === 'function') {
        return val.toJSON();
    }
    return val;
}
//# sourceMappingURL=x509.js.map