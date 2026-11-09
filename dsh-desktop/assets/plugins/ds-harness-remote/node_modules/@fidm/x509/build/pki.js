'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
// **Github:** https://github.com/fidm/x509
//
// **License:** MIT
const util_1 = require("util");
const crypto_1 = require("crypto");
const tweetnacl_1 = require("tweetnacl");
const asn1_1 = require("@fidm/asn1");
const common_1 = require("./common");
/**
 * ASN.1 Template for PKCS#8 Public Key.
 */
exports.publicKeyValidator = {
    name: 'PublicKeyInfo',
    class: asn1_1.Class.UNIVERSAL,
    tag: asn1_1.Tag.SEQUENCE,
    capture: 'publicKeyInfo',
    value: [{
            name: 'PublicKeyInfo.AlgorithmIdentifier',
            class: asn1_1.Class.UNIVERSAL,
            tag: asn1_1.Tag.SEQUENCE,
            value: [{
                    name: 'PublicKeyAlgorithmIdentifier.algorithm',
                    class: asn1_1.Class.UNIVERSAL,
                    tag: asn1_1.Tag.OID,
                    capture: 'publicKeyOID',
                }],
        }, {
            name: 'PublicKeyInfo.PublicKey',
            class: asn1_1.Class.UNIVERSAL,
            tag: asn1_1.Tag.BITSTRING,
            capture: 'publicKey',
        }],
};
/**
 * ASN.1 Template for PKCS#8 Private Key. https://tools.ietf.org/html/rfc5208
 */
exports.privateKeyValidator = {
    name: 'PrivateKeyInfo',
    class: asn1_1.Class.UNIVERSAL,
    tag: asn1_1.Tag.SEQUENCE,
    capture: 'privateKeyInfo',
    value: [{
            name: 'PrivateKeyInfo.Version',
            class: asn1_1.Class.UNIVERSAL,
            tag: asn1_1.Tag.INTEGER,
            capture: 'privateKeyVersion',
        }, {
            name: 'PrivateKeyInfo.AlgorithmIdentifier',
            class: asn1_1.Class.UNIVERSAL,
            tag: asn1_1.Tag.SEQUENCE,
            value: [{
                    name: 'PrivateKeyAlgorithmIdentifier.algorithm',
                    class: asn1_1.Class.UNIVERSAL,
                    tag: asn1_1.Tag.OID,
                    capture: 'privateKeyOID',
                }],
        }, {
            name: 'PrivateKeyInfo.PrivateKey',
            class: asn1_1.Class.UNIVERSAL,
            tag: asn1_1.Tag.OCTETSTRING,
            capture: 'privateKey',
        }],
};
// validator for an RSA public key
const rsaPublicKeyValidator = {
    // RSAPublicKey
    name: 'RSAPublicKey',
    class: asn1_1.Class.UNIVERSAL,
    tag: asn1_1.Tag.SEQUENCE,
    value: [{
            // modulus (n)
            name: 'RSAPublicKey.modulus',
            class: asn1_1.Class.UNIVERSAL,
            tag: asn1_1.Tag.INTEGER,
            capture: 'publicKeyModulus',
        }, {
            // publicExponent (e)
            name: 'RSAPublicKey.exponent',
            class: asn1_1.Class.UNIVERSAL,
            tag: asn1_1.Tag.INTEGER,
            capture: 'publicKeyExponent',
        }],
};
const rsaPrivateKeyValidator = {
    // RSAPrivateKey
    name: 'RSAPrivateKey',
    class: asn1_1.Class.UNIVERSAL,
    tag: asn1_1.Tag.SEQUENCE,
    value: [{
            // Version (INTEGER)
            name: 'RSAPrivateKey.version',
            class: asn1_1.Class.UNIVERSAL,
            tag: asn1_1.Tag.INTEGER,
            capture: 'privateKeyVersion',
        }, {
            // modulus (n)
            name: 'RSAPrivateKey.modulus',
            class: asn1_1.Class.UNIVERSAL,
            tag: asn1_1.Tag.INTEGER,
            capture: 'privateKeyModulus',
        }, {
            // publicExponent (e)
            name: 'RSAPrivateKey.publicExponent',
            class: asn1_1.Class.UNIVERSAL,
            tag: asn1_1.Tag.INTEGER,
            capture: 'privateKeyPublicExponent',
        }, {
            // privateExponent (d)
            name: 'RSAPrivateKey.privateExponent',
            class: asn1_1.Class.UNIVERSAL,
            tag: asn1_1.Tag.INTEGER,
            capture: 'privateKeyPrivateExponent',
        }, {
            // prime1 (p)
            name: 'RSAPrivateKey.prime1',
            class: asn1_1.Class.UNIVERSAL,
            tag: asn1_1.Tag.INTEGER,
            capture: 'privateKeyPrime1',
        }, {
            // prime2 (q)
            name: 'RSAPrivateKey.prime2',
            class: asn1_1.Class.UNIVERSAL,
            tag: asn1_1.Tag.INTEGER,
            capture: 'privateKeyPrime2',
        }, {
            // exponent1 (d mod (p-1))
            name: 'RSAPrivateKey.exponent1',
            class: asn1_1.Class.UNIVERSAL,
            tag: asn1_1.Tag.INTEGER,
            capture: 'privateKeyExponent1',
        }, {
            // exponent2 (d mod (q-1))
            name: 'RSAPrivateKey.exponent2',
            class: asn1_1.Class.UNIVERSAL,
            tag: asn1_1.Tag.INTEGER,
            capture: 'privateKeyExponent2',
        }, {
            // coefficient ((inverse of q) mod p)
            name: 'RSAPrivateKey.coefficient',
            class: asn1_1.Class.UNIVERSAL,
            tag: asn1_1.Tag.INTEGER,
            capture: 'privateKeyCoefficient',
        }],
};
const EdDSAPrivateKeyOIDs = [
    // https://tools.ietf.org/html/draft-ietf-curdle-pkix-10
    common_1.getOID('X25519'),
    common_1.getOID('X448'),
    common_1.getOID('Ed25519'),
    common_1.getOID('Ed448'),
];
/**
 * PKCS#8 Public Key
 */
class PublicKey {
    constructor(obj) {
        const captures = {};
        const err = obj.validate(exports.publicKeyValidator, captures);
        if (err != null) {
            throw new Error('Cannot read X.509 public key: ' + err.message);
        }
        this.oid = asn1_1.ASN1.parseOID(captures.publicKeyOID.bytes);
        this.algo = common_1.getOIDName(this.oid);
        this._pkcs8 = obj;
        this._keyRaw = asn1_1.ASN1.parseBitString(captures.publicKey.bytes).buf;
        this._finalKey = this._keyRaw;
        this._finalPEM = '';
    }
    /**
     * Parse an PublicKey for X.509 certificate from PKCS#8 PEM formatted buffer or PKCS#1 RSA PEM formatted buffer.
     * @param pem PEM formatted buffer
     */
    static fromPEM(pem) {
        const msg = asn1_1.PEM.parse(pem)[0];
        if (msg.procType.includes('ENCRYPTED')) {
            throw new Error('Could not convert public key from PEM, PEM is encrypted.');
        }
        const obj = asn1_1.ASN1.fromDER(msg.body, true);
        switch (msg.type) {
            case 'PUBLIC KEY': // PKCS#8
                return new PublicKey(obj);
            case 'RSA PUBLIC KEY': // PKCS#1
                const _pkcs8 = asn1_1.ASN1.Seq([
                    // AlgorithmIdentifier
                    asn1_1.ASN1.Seq([
                        // algorithm
                        asn1_1.ASN1.OID(common_1.getOID('rsaEncryption')),
                        // optional parameters
                        asn1_1.ASN1.Null(),
                    ]),
                    // PublicKey
                    asn1_1.ASN1.BitString(obj.DER),
                ]);
                return new PublicKey(_pkcs8);
            default:
                throw new Error('Could not convert public key from PEM, recommend PKCS#8 PEM');
        }
    }
    /**
     * Registers an external Verifier with object identifier.
     * Built-in verifiers: Ed25519, RSA, others see https://nodejs.org/api/crypto.html#crypto_class_verify
     * ```js
     * PublicKey.addVerifier(getOID('Ed25519'), function (this: PublicKey, data: Buffer, signature: Buffer): boolean {
     *   return ed25519.detached.verify(data, signature, this.keyRaw)
     * })
     * ```
     * @param oid algorithm object identifier
     * @param fn Verifier function
     */
    static addVerifier(oid, fn) {
        oid = common_1.getOID(oid);
        if (oid === '') {
            throw new Error(`Invalid object identifier: ${oid}`);
        }
        if (PublicKey._verifiers[oid] != null) {
            throw new Error(`Verifier ${oid} exists`);
        }
        PublicKey._verifiers[oid] = fn;
    }
    /**
     * underlying key buffer
     */
    get keyRaw() {
        return this._finalKey;
    }
    /**
     * Returns true if the provided data and the given signature matched.
     * ```js
     * certificate.publicKey.verify(data, signature, 'sha256') // => true or false
     * ```
     * @param data data to verify
     * @param signature signature that signed by private key
     * @param hashAlgorithm hash algorithm, such as 'sha256', 'sha1'
     */
    verify(data, signature, hashAlgorithm) {
        const verifier = PublicKey._verifiers[this.oid];
        if (verifier != null) {
            const sum = crypto_1.createHash(hashAlgorithm).update(data).digest();
            return verifier.call(this, sum, signature);
        }
        const verify = crypto_1.createVerify(hashAlgorithm);
        verify.update(data);
        return verify.verify(this.toPEM(), signature);
    }
    /**
     * Returns the digest of the PublicKey with given hash algorithm.
     * ```js
     * certificate.publicKey.getFingerprint('sha1', 'PublicKey') // => Buffer
     * ```
     * @param hashAlgorithm hash algorithm, such as 'sha256', 'sha1'
     * @param type 'PublicKey' or 'PublicKeyInfo'
     */
    getFingerprint(hashAlgorithm, type = 'PublicKey') {
        let bytes;
        switch (type) {
            case 'PublicKeyInfo':
                bytes = this._pkcs8.DER;
                break;
            case 'PublicKey':
                bytes = this._keyRaw;
                break;
            default:
                throw new Error(`Unknown fingerprint type "${type}".`);
        }
        const hasher = crypto_1.createHash(hashAlgorithm);
        hasher.update(bytes);
        return hasher.digest();
    }
    /**
     * Returns an ASN.1 object of this PublicKey
     */
    toASN1() {
        return this._pkcs8;
    }
    /**
     * Returns an DER formatted buffer of this PublicKey
     */
    toDER() {
        return this._pkcs8.DER;
    }
    /**
     * Returns an PEM formatted string of this PublicKey
     */
    toPEM() {
        if (this._finalPEM === '') {
            this._finalPEM = new asn1_1.PEM('PUBLIC KEY', this._pkcs8.DER).toString();
        }
        return this._finalPEM;
    }
    /**
     * Return a friendly JSON object for debuging.
     */
    toJSON() {
        return {
            oid: this.oid,
            algo: this.algo,
            publicKey: this._keyRaw,
        };
    }
    [util_1.inspect.custom](_depth, options) {
        return `<${this.constructor.name} ${util_1.inspect(this.toJSON(), options)}>`;
    }
}
PublicKey._verifiers = Object.create(null);
exports.PublicKey = PublicKey;
/**
 * PKCS#8 Private Key
 */
class PrivateKey {
    constructor(obj) {
        // get RSA params
        const captures = Object.create(null);
        const err = obj.validate(exports.privateKeyValidator, captures);
        if (err != null) {
            throw new Error('Cannot read X.509 private key: ' + err.message);
        }
        this.version = asn1_1.ASN1.parseIntegerNum(captures.privateKeyVersion.bytes) + 1;
        this.oid = asn1_1.ASN1.parseOID(captures.privateKeyOID.bytes);
        this.algo = common_1.getOIDName(this.oid);
        this._pkcs8 = obj;
        this._keyRaw = captures.privateKey.bytes;
        this._publicKeyRaw = null;
        this._finalKey = this._keyRaw;
        this._finalPEM = '';
        if (EdDSAPrivateKeyOIDs.includes(this.oid)) {
            this._finalKey = this._keyRaw = asn1_1.ASN1.parseDER(this._keyRaw, asn1_1.Class.UNIVERSAL, asn1_1.Tag.OCTETSTRING).bytes;
            if (this.oid === '1.3.101.112') {
                const keypair = tweetnacl_1.sign.keyPair.fromSeed(this._keyRaw);
                this._publicKeyRaw = Buffer.from(keypair.publicKey);
                this._finalKey = Buffer.from(keypair.secretKey);
            }
            else if (this.version === 2) {
                for (const val of obj.mustCompound()) {
                    if (val.class === asn1_1.Class.CONTEXT_SPECIFIC && val.tag === 1) {
                        this._publicKeyRaw = asn1_1.ASN1.parseBitString(val.bytes).buf;
                        this._finalKey = Buffer.concat([this._keyRaw, this._publicKeyRaw]);
                    }
                }
            }
        }
    }
    /**
     * Parse an PrivateKey for X.509 certificate from PKCS#8 PEM formatted buffer or PKCS#1 RSA PEM formatted buffer.
     * @param pem PEM formatted buffer
     */
    static fromPEM(pem) {
        const msg = asn1_1.PEM.parse(pem)[0];
        if (msg.procType.includes('ENCRYPTED')) {
            throw new Error('Could not convert private key from PEM, PEM is encrypted.');
        }
        let obj = asn1_1.ASN1.fromDER(msg.body, true);
        switch (msg.type) {
            case 'PRIVATE KEY': // PKCS#8
                return new PrivateKey(obj);
            case 'RSA PRIVATE KEY': // PKCS#1
                obj = asn1_1.ASN1.Seq([
                    // Version (INTEGER)
                    obj.value[0],
                    // AlgorithmIdentifier
                    asn1_1.ASN1.Seq([
                        // algorithm
                        asn1_1.ASN1.OID(common_1.getOID('rsaEncryption')),
                        // optional parameters
                        asn1_1.ASN1.Null(),
                    ]),
                    // PrivateKey
                    new asn1_1.ASN1(asn1_1.Class.UNIVERSAL, asn1_1.Tag.OCTETSTRING, obj.DER),
                ]);
                return new PrivateKey(obj);
            default:
                throw new Error('Could not convert private key from PEM, recommend PKCS#8 PEM');
        }
    }
    /**
     * Registers an external Signer with object identifier.
     * Built-in verifiers: Ed25519, RSA, others see https://nodejs.org/api/crypto.html#crypto_class_sign
     * ```js
     * PrivateKey.addSigner(getOID('Ed25519'), function (this: PrivateKey, data: Buffer): Buffer {
     *   const key = this.keyRaw
     *   if (key.length !== 64) {
     *     throw new Error('Invalid signing key.')
     *   }
     *   return Buffer.from(ed25519.detached(data, key))
     * })
     * ```
     * @param oid algorithm object identifier
     * @param fn Verifier function
     */
    static addSigner(oid, fn) {
        oid = common_1.getOID(oid);
        if (oid === '') {
            throw new Error(`Invalid object identifier: ${oid}`);
        }
        if (PrivateKey._signers[oid] != null) {
            throw new Error(`Signer ${oid} exists`);
        }
        PrivateKey._signers[oid] = fn;
    }
    /**
     * underlying key buffer
     */
    get keyRaw() {
        return this._finalKey;
    }
    /**
     * Returns publicKey buffer, it is used for Ed25519/Ed448.
     */
    get publicKeyRaw() {
        return this._publicKeyRaw;
    }
    /**
     * Returns signature for the given data and hash algorithm.
     * @param data
     * @param hashAlgorithm
     */
    sign(data, hashAlgorithm) {
        const signer = PrivateKey._signers[this.oid];
        if (signer != null) {
            const sum = crypto_1.createHash(hashAlgorithm).update(data).digest();
            return signer.call(this, sum);
        }
        const sign = crypto_1.createSign(hashAlgorithm);
        sign.update(data);
        return sign.sign(this.toPEM());
    }
    /**
     * Returns an ASN.1 object of this PrivateKey
     */
    toASN1() {
        return this._pkcs8;
    }
    /**
     * Returns an DER formatted buffer of this PrivateKey
     */
    toDER() {
        return this._pkcs8.DER;
    }
    /**
     * Returns an PEM formatted string of this PrivateKey
     */
    toPEM() {
        if (this._finalPEM === '') {
            this._finalPEM = new asn1_1.PEM('PRIVATE KEY', this._pkcs8.DER).toString();
        }
        return this._finalPEM;
    }
    /**
     * Return a friendly JSON object for debuging.
     */
    toJSON() {
        return {
            version: this.version,
            oid: this.oid,
            algo: this.algo,
            privateKey: this._keyRaw,
            publicKey: this._publicKeyRaw,
        };
    }
    [util_1.inspect.custom](_depth, options) {
        return `<${this.constructor.name} ${util_1.inspect(this.toJSON(), options)}>`;
    }
}
PrivateKey._signers = Object.create(null);
exports.PrivateKey = PrivateKey;
/**
 * PKCS#1 RSA Public Key
 */
class RSAPublicKey extends PublicKey {
    static fromPublicKey(publicKey) {
        return new RSAPublicKey(publicKey.toASN1());
    }
    constructor(obj) {
        super(obj);
        if (common_1.getOID(this.oid) !== common_1.getOID('rsaEncryption')) {
            throw new Error(`Invalid RSA public key, unknown OID: ${this.oid}`);
        }
        // get RSA params
        const captures = Object.create(null);
        this._pkcs1 = asn1_1.ASN1.fromDER(this._keyRaw, true);
        const err = this._pkcs1.validate(rsaPublicKeyValidator, captures);
        if (err != null) {
            throw new Error('Cannot read RSA public key: ' + err.message);
        }
        this.modulus = asn1_1.ASN1.parseIntegerStr(captures.publicKeyModulus.bytes);
        this.exponent = asn1_1.ASN1.parseIntegerNum(captures.publicKeyExponent.bytes);
    }
    /**
     * Returns an PKCS#1 ASN.1 object of this RSAPublicKey
     */
    toASN1() {
        return this._pkcs1;
    }
    /**
     * Returns an PKCS#1 DER formatted buffer of this RSAPublicKey
     */
    toDER() {
        return this._keyRaw;
    }
    /**
     * Returns an PKCS#1 PEM formatted string of this RSAPublicKey
     */
    toPEM() {
        if (this._finalPEM === '') {
            this._finalPEM = new asn1_1.PEM('RSA PUBLIC KEY', this._keyRaw).toString();
        }
        return this._finalPEM;
    }
    /**
     * Returns an PKCS#8 PEM formatted string of this RSAPublicKey
     */
    toPublicKeyPEM() {
        return new asn1_1.PEM('PUBLIC KEY', this._pkcs8.DER).toString();
    }
    /**
     * Return a friendly JSON object for debuging.
     */
    toJSON() {
        return {
            oid: this.oid,
            algo: this.algo,
            modulus: trimLeadingZeroByte(this.modulus),
            exponent: this.exponent,
        };
    }
    [util_1.inspect.custom](_depth, options) {
        return `<${this.constructor.name} ${util_1.inspect(this.toJSON(), options)}>`;
    }
}
exports.RSAPublicKey = RSAPublicKey;
/**
 * PKCS#1 RSA Private Key
 */
class RSAPrivateKey extends PrivateKey {
    static fromPrivateKey(privateKey) {
        return new RSAPrivateKey(privateKey.toASN1());
    }
    constructor(obj) {
        super(obj);
        if (common_1.getOID(this.oid) !== common_1.getOID('rsaEncryption')) {
            throw new Error(`Invalid RSA private key, unknown OID: ${this.oid}`);
        }
        // get RSA params
        const captures = Object.create(null);
        this._pkcs1 = asn1_1.ASN1.fromDER(this._keyRaw, true);
        const err = this._pkcs1.validate(rsaPrivateKeyValidator, captures);
        if (err != null) {
            throw new Error('Cannot read RSA private key: ' + err.message);
        }
        this.publicExponent = asn1_1.ASN1.parseIntegerNum(captures.privateKeyPublicExponent.bytes);
        this.privateExponent = asn1_1.ASN1.parseIntegerStr(captures.privateKeyPrivateExponent.bytes);
        this.modulus = asn1_1.ASN1.parseIntegerStr(captures.privateKeyModulus.bytes);
        this.prime1 = asn1_1.ASN1.parseIntegerStr(captures.privateKeyPrime1.bytes);
        this.prime2 = asn1_1.ASN1.parseIntegerStr(captures.privateKeyPrime2.bytes);
        this.exponent1 = asn1_1.ASN1.parseIntegerStr(captures.privateKeyExponent1.bytes);
        this.exponent2 = asn1_1.ASN1.parseIntegerStr(captures.privateKeyExponent2.bytes);
        this.coefficient = asn1_1.ASN1.parseIntegerStr(captures.privateKeyCoefficient.bytes);
    }
    /**
     * Returns an PKCS#1 ASN.1 object of this RSAPrivateKey
     */
    toASN1() {
        return this._pkcs1;
    }
    /**
     * Returns an PKCS#1 DER formatted buffer of this RSAPrivateKey
     */
    toDER() {
        return this._keyRaw;
    }
    /**
     * Returns an PKCS#1 PEM formatted string of this RSAPrivateKey
     */
    toPEM() {
        if (this._finalPEM === '') {
            this._finalPEM = new asn1_1.PEM('RSA PRIVATE KEY', this._keyRaw).toString();
        }
        return this._finalPEM;
    }
    /**
     * Returns an PKCS#8 PEM formatted string of this RSAPrivateKey
     */
    toPrivateKeyPEM() {
        return new asn1_1.PEM('PRIVATE KEY', this._pkcs8.DER).toString();
    }
    /**
     * Return a friendly JSON object for debuging.
     */
    toJSON() {
        return {
            version: this.version,
            oid: this.oid,
            algo: this.algo,
            publicExponent: this.publicExponent,
            privateExponent: trimLeadingZeroByte(this.privateExponent),
            modulus: trimLeadingZeroByte(this.modulus),
            prime1: trimLeadingZeroByte(this.prime1),
            prime2: trimLeadingZeroByte(this.prime2),
            exponent1: trimLeadingZeroByte(this.exponent1),
            exponent2: trimLeadingZeroByte(this.exponent2),
            coefficient: trimLeadingZeroByte(this.coefficient),
        };
    }
    [util_1.inspect.custom](_depth, options) {
        return `<${this.constructor.name} ${util_1.inspect(this.toJSON(), options)}>`;
    }
}
exports.RSAPrivateKey = RSAPrivateKey;
// leading 00 byte is signed representation for BigInteger
// https://stackoverflow.com/questions/8515691/getting-1-byte-extra-in-the-modulus-rsa-key-and-sometimes-for-exponents-also
function trimLeadingZeroByte(hex) {
    return (hex.length % 8 !== 0) && hex.startsWith('00') ? hex.slice(2) : hex;
}
PublicKey.addVerifier(common_1.getOID('Ed25519'), function (data, signature) {
    return tweetnacl_1.sign.detached.verify(data, signature, this.keyRaw);
});
PrivateKey.addSigner(common_1.getOID('Ed25519'), function (data) {
    const key = this.keyRaw;
    if (key.length !== 64) {
        throw new Error('Invalid signing key.');
    }
    return Buffer.from(tweetnacl_1.sign.detached(data, key));
});
//# sourceMappingURL=pki.js.map