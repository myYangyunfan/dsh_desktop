import { CertificateSet } from "./certificate_choices";
import { RevocationInfoChoices } from "./revocation_info_choice";
/**
 * ```asn
 * OriginatorInfo ::= SEQUENCE {
 *  certs [0] IMPLICIT CertificateSet OPTIONAL,
 *  crls [1] IMPLICIT RevocationInfoChoices OPTIONAL }
 * ```
 */
export declare class OriginatorInfo {
    certs?: CertificateSet;
    crls?: RevocationInfoChoices;
    constructor(params?: Partial<OriginatorInfo>);
}
