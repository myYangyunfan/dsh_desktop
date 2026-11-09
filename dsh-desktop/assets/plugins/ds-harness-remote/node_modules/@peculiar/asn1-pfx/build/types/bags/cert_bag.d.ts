/**
 * ```asn1
 * CertBag ::= SEQUENCE {
 *   certId    BAG-TYPE.&id   ({CertTypes}),
 *   certValue [0] EXPLICIT BAG-TYPE.&Type ({CertTypes}{@certId})
 * }
 * ```
 */
export declare class CertBag {
    certId: string;
    certValue: ArrayBuffer;
    constructor(params?: Partial<CertBag>);
}
/**
 * ```asn1
 * certTypes OBJECT IDENTIFIER ::= {pkcs-9 22}
 * ```
 */
export declare const id_certTypes = "1.2.840.113549.1.9.22";
/**
 * ```asn1
 * x509Certificate BAG-TYPE ::=
 *   {OCTET STRING IDENTIFIED BY {certTypes 1}}
 *   -- DER-encoded X.509 certificate stored in OCTET STRING
 * ```
 */
export declare const id_x509Certificate = "1.2.840.113549.1.9.22.1";
/**
 * ```asn1
 * sdsiCertificate BAG-TYPE ::=
 *   {IA5String IDENTIFIED BY {certTypes 2}}
 *   -- Base64-encoded SDSI certificate stored in IA5String
 * ```
 */
export declare const id_sdsiCertificate = "1.2.840.113549.1.9.22.2";
