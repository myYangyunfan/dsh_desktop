import { AlgorithmIdentifier, Attribute, UniqueIdentifier, Extensions, CertificateSerialNumber } from "@peculiar/asn1-x509";
import { Holder } from "./holder";
import { AttCertIssuer } from "./attr_cert_issuer";
import { AttCertValidityPeriod } from "./attr_cert_validity_period";
/**
 * ```asn1
 * AttCertVersion ::= INTEGER { v2(1) }
 * ```
 */
export declare enum AttCertVersion {
    v2 = 1
}
/**
 * ```asn1
 * AttributeCertificateInfo ::= SEQUENCE {
 *   version        AttCertVersion  -- version is v2,
 *   holder         Holder,
 *   issuer         AttCertIssuer,
 *   signature      AlgorithmIdentifier,
 *   serialNumber   CertificateSerialNumber,
 *   attrCertValidityPeriod   AttCertValidityPeriod,
 *   attributes     SEQUENCE OF Attribute,
 *   issuerUniqueID UniqueIdentifier OPTIONAL,
 *   extensions     Extensions     OPTIONAL
 * }
 * ```
 */
export declare class AttributeCertificateInfo {
    version: AttCertVersion;
    holder: Holder;
    issuer: AttCertIssuer;
    signature: AlgorithmIdentifier;
    serialNumber: CertificateSerialNumber;
    attrCertValidityPeriod: AttCertValidityPeriod;
    attributes: Attribute[];
    issuerUniqueID?: UniqueIdentifier;
    extensions?: Extensions;
    constructor(params?: Partial<AttributeCertificateInfo>);
}
