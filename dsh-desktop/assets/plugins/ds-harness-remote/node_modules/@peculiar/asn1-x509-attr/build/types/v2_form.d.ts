import { GeneralNames } from "@peculiar/asn1-x509";
import { IssuerSerial } from "./issuer_serial";
import { ObjectDigestInfo } from "./object_digest_info";
/**
 * ```asn1
 * V2Form ::= SEQUENCE {
 *      issuerName            GeneralNames  OPTIONAL,
 *      baseCertificateID     [0] IssuerSerial  OPTIONAL,
 *      objectDigestInfo      [1] ObjectDigestInfo  OPTIONAL
 *         -- issuerName MUST be present in this profile
 *         -- baseCertificateID and objectDigestInfo MUST
 *         -- NOT be present in this profile
 * }
 * ```
 */
export declare class V2Form {
    issuerName?: GeneralNames;
    baseCertificateID?: IssuerSerial;
    objectDigestInfo?: ObjectDigestInfo;
    constructor(params?: Partial<V2Form>);
}
