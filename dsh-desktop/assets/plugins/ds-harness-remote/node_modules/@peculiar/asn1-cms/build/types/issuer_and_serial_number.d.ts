import { Name } from "@peculiar/asn1-x509";
/**
 * ```asn
 * IssuerAndSerialNumber ::= SEQUENCE {
 *   issuer Name,
 *   serialNumber CertificateSerialNumber }
 * ```
 */
export declare class IssuerAndSerialNumber {
    issuer: Name;
    serialNumber: ArrayBuffer;
    constructor(params?: Partial<IssuerAndSerialNumber>);
}
/**
 * ```asn
 * CertificateSerialNumber ::= INTEGER
 * ```
 */
export type CertificateSerialNumber = ArrayBuffer;
