/// <reference types="node" />
import { inspect } from 'util';
import { ASN1, Template } from '@fidm/asn1';
/**
 * ASN.1 Template for PKCS#8 Public Key.
 */
export declare const publicKeyValidator: Template;
/**
 * ASN.1 Template for PKCS#8 Private Key. https://tools.ietf.org/html/rfc5208
 */
export declare const privateKeyValidator: Template;
export declare type Verifier = (this: PublicKey, data: Buffer, signature: Buffer) => boolean;
/**
 * PKCS#8 Public Key
 */
export declare class PublicKey {
    /**
     * Parse an PublicKey for X.509 certificate from PKCS#8 PEM formatted buffer or PKCS#1 RSA PEM formatted buffer.
     * @param pem PEM formatted buffer
     */
    static fromPEM(pem: Buffer): PublicKey;
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
    static addVerifier(oid: string, fn: Verifier): void;
    private static _verifiers;
    readonly oid: string;
    readonly algo: string;
    protected _pkcs8: ASN1;
    protected _keyRaw: Buffer;
    protected _finalKey: Buffer;
    protected _finalPEM: string;
    constructor(obj: ASN1);
    /**
     * underlying key buffer
     */
    readonly keyRaw: Buffer;
    /**
     * Returns true if the provided data and the given signature matched.
     * ```js
     * certificate.publicKey.verify(data, signature, 'sha256') // => true or false
     * ```
     * @param data data to verify
     * @param signature signature that signed by private key
     * @param hashAlgorithm hash algorithm, such as 'sha256', 'sha1'
     */
    verify(data: Buffer, signature: Buffer, hashAlgorithm: string): boolean;
    /**
     * Returns the digest of the PublicKey with given hash algorithm.
     * ```js
     * certificate.publicKey.getFingerprint('sha1', 'PublicKey') // => Buffer
     * ```
     * @param hashAlgorithm hash algorithm, such as 'sha256', 'sha1'
     * @param type 'PublicKey' or 'PublicKeyInfo'
     */
    getFingerprint(hashAlgorithm: string, type?: string): Buffer;
    /**
     * Returns an ASN.1 object of this PublicKey
     */
    toASN1(): ASN1;
    /**
     * Returns an DER formatted buffer of this PublicKey
     */
    toDER(): Buffer;
    /**
     * Returns an PEM formatted string of this PublicKey
     */
    toPEM(): string;
    /**
     * Return a friendly JSON object for debuging.
     */
    toJSON(): any;
    protected [inspect.custom](_depth: any, options: any): string;
}
export declare type Signer = (this: PrivateKey, data: Buffer) => Buffer;
/**
 * PKCS#8 Private Key
 */
export declare class PrivateKey {
    /**
     * Parse an PrivateKey for X.509 certificate from PKCS#8 PEM formatted buffer or PKCS#1 RSA PEM formatted buffer.
     * @param pem PEM formatted buffer
     */
    static fromPEM(pem: Buffer): PrivateKey;
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
    static addSigner(oid: string, fn: Signer): void;
    private static _signers;
    readonly version: number;
    readonly oid: string;
    readonly algo: string;
    protected _pkcs8: ASN1;
    protected _keyRaw: Buffer;
    protected _publicKeyRaw: Buffer | null;
    protected _finalKey: Buffer;
    protected _finalPEM: string;
    constructor(obj: ASN1);
    /**
     * underlying key buffer
     */
    readonly keyRaw: Buffer;
    /**
     * Returns publicKey buffer, it is used for Ed25519/Ed448.
     */
    readonly publicKeyRaw: Buffer | null;
    /**
     * Returns signature for the given data and hash algorithm.
     * @param data
     * @param hashAlgorithm
     */
    sign(data: Buffer, hashAlgorithm: string): Buffer;
    /**
     * Returns an ASN.1 object of this PrivateKey
     */
    toASN1(): ASN1;
    /**
     * Returns an DER formatted buffer of this PrivateKey
     */
    toDER(): Buffer;
    /**
     * Returns an PEM formatted string of this PrivateKey
     */
    toPEM(): string;
    /**
     * Return a friendly JSON object for debuging.
     */
    toJSON(): any;
    protected [inspect.custom](_depth: any, options: any): string;
}
/**
 * PKCS#1 RSA Public Key
 */
export declare class RSAPublicKey extends PublicKey {
    static fromPublicKey(publicKey: PublicKey): RSAPublicKey;
    readonly modulus: string;
    readonly exponent: number;
    protected _pkcs1: ASN1;
    constructor(obj: ASN1);
    /**
     * Returns an PKCS#1 ASN.1 object of this RSAPublicKey
     */
    toASN1(): ASN1;
    /**
     * Returns an PKCS#1 DER formatted buffer of this RSAPublicKey
     */
    toDER(): Buffer;
    /**
     * Returns an PKCS#1 PEM formatted string of this RSAPublicKey
     */
    toPEM(): string;
    /**
     * Returns an PKCS#8 PEM formatted string of this RSAPublicKey
     */
    toPublicKeyPEM(): string;
    /**
     * Return a friendly JSON object for debuging.
     */
    toJSON(): any;
    protected [inspect.custom](_depth: any, options: any): string;
}
/**
 * PKCS#1 RSA Private Key
 */
export declare class RSAPrivateKey extends PrivateKey {
    static fromPrivateKey(privateKey: PrivateKey): RSAPrivateKey;
    readonly publicExponent: number;
    readonly privateExponent: string;
    readonly modulus: string;
    readonly prime1: string;
    readonly prime2: string;
    readonly exponent1: string;
    readonly exponent2: string;
    readonly coefficient: string;
    protected _pkcs1: ASN1;
    constructor(obj: ASN1);
    /**
     * Returns an PKCS#1 ASN.1 object of this RSAPrivateKey
     */
    toASN1(): ASN1;
    /**
     * Returns an PKCS#1 DER formatted buffer of this RSAPrivateKey
     */
    toDER(): Buffer;
    /**
     * Returns an PKCS#1 PEM formatted string of this RSAPrivateKey
     */
    toPEM(): string;
    /**
     * Returns an PKCS#8 PEM formatted string of this RSAPrivateKey
     */
    toPrivateKeyPEM(): string;
    /**
     * Return a friendly JSON object for debuging.
     */
    toJSON(): any;
    protected [inspect.custom](_depth: any, options: any): string;
}
