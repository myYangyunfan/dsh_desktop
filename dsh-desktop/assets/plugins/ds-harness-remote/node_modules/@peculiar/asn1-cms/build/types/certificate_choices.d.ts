import { AsnArray } from "@peculiar/asn1-schema";
import { Certificate } from "@peculiar/asn1-x509";
import { AttributeCertificate } from "@peculiar/asn1-x509-attr";
/**
 * ```asn
 * OtherCertificateFormat ::= SEQUENCE {
 *   otherCertFormat OBJECT IDENTIFIER,
 *   otherCert ANY DEFINED BY otherCertFormat }
 * ```
 */
export declare class OtherCertificateFormat {
    otherCertFormat: string;
    otherCert: ArrayBuffer;
    constructor(params?: Partial<OtherCertificateFormat>);
}
/**
 * ```asn
 * CertificateChoices ::= CHOICE {
 *   certificate Certificate,
 *   extendedCertificate [0] IMPLICIT ExtendedCertificate,  -- Obsolete
 *   v1AttrCert [1] IMPLICIT AttributeCertificateV1,        -- Obsolete
 *   v2AttrCert [2] IMPLICIT AttributeCertificateV2,
 *   other [3] IMPLICIT OtherCertificateFormat }
 * ```
 */
export declare class CertificateChoices {
    certificate?: Certificate;
    v2AttrCert?: AttributeCertificate;
    other?: OtherCertificateFormat;
    constructor(params?: Partial<CertificateChoices>);
}
/**
 * ```asn
 * CertificateSet ::= SET OF CertificateChoices
 * ```
 */
export declare class CertificateSet extends AsnArray<CertificateChoices> {
    constructor(items?: CertificateChoices[]);
}
