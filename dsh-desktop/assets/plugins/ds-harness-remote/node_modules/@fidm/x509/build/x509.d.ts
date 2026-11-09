/// <reference types="node" />
import { inspect } from 'util';
import { ASN1, Tag, BitString } from '@fidm/asn1';
import { PublicKey } from './pki';
/**
 * Attribute for X.509v3 certificate.
 */
export interface Attribute {
    oid: string;
    value: any;
    valueTag: Tag;
    name: string;
    shortName: string;
    extensions?: Extension[];
}
/**
 * DistinguishedName for X.509v3 certificate.
 */
export declare class DistinguishedName {
    uniqueId: BitString | null;
    attributes: Attribute[];
    constructor();
    readonly commonName: string;
    readonly organizationName: string;
    readonly organizationalUnitName: string;
    readonly countryName: string;
    readonly localityName: string;
    readonly serialName: string;
    getHash(): Buffer;
    getField(key: string): Attribute | null;
    addField(attr: any): void;
    setAttrs(attrs: any): void;
    toJSON(): any;
    private getFieldValue;
}
/**
 * X.509v3 Certificate.
 */
export declare class Certificate {
    /**
     * Parse one or more X.509 certificates from PEM formatted buffer.
     * If there is no certificate, it will throw error.
     * @param data PEM formatted buffer
     */
    static fromPEMs(data: Buffer): Certificate[];
    /**
     * Parse an X.509 certificate from PEM formatted buffer.
     * @param data PEM formatted buffer
     */
    static fromPEM(data: Buffer): Certificate;
    readonly raw: Buffer;
    readonly version: number;
    readonly serialNumber: string;
    readonly signatureOID: string;
    readonly signatureAlgorithm: string;
    readonly infoSignatureOID: string;
    readonly signature: Buffer;
    readonly subjectKeyIdentifier: string;
    readonly authorityKeyIdentifier: string;
    readonly ocspServer: string;
    readonly issuingCertificateURL: string;
    readonly isCA: boolean;
    readonly maxPathLen: number;
    readonly basicConstraintsValid: boolean;
    readonly keyUsage: number;
    readonly dnsNames: string[];
    readonly emailAddresses: string[];
    readonly ipAddresses: string[];
    readonly uris: string[];
    readonly validFrom: Date;
    readonly validTo: Date;
    readonly issuer: DistinguishedName;
    readonly subject: DistinguishedName;
    readonly extensions: Extension[];
    readonly publicKey: PublicKey;
    readonly publicKeyRaw: Buffer;
    readonly tbsCertificate: ASN1;
    /**
     * Creates an X.509 certificate from an ASN.1 object
     * @param obj an ASN.1 object
     */
    constructor(obj: ASN1);
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
    getExtension(name: string, key?: string): any;
    /**
     * Returns null if a subject certificate is valid, or error if invalid.
     * Note that it does not check validity time, DNS name, ip or others.
     * @param child subject's Certificate
     */
    checkSignature(child: Certificate): Error | null;
    /**
     * Returns true if this certificate's issuer matches the passed
     * certificate's subject. Note that no signature check is performed.
     * @param parent issuer's Certificate
     */
    isIssuer(parent: Certificate): boolean;
    /**
     * Verifies the subjectKeyIdentifier extension value for this certificate
     * against its public key.
     */
    verifySubjectKeyIdentifier(): boolean;
    /**
     * Return a friendly JSON object for debuging.
     */
    toJSON(): any;
    protected [inspect.custom](_depth: any, options: any): string;
}
export interface Extension {
    oid: string;
    critical: boolean;
    value: Buffer;
    name: string;
    altNames?: any[];
    [index: string]: any;
}
