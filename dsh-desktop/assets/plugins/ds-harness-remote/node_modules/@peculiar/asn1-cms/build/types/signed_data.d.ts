import { AsnArray } from "@peculiar/asn1-schema";
import { CertificateSet } from "./certificate_choices";
import { CMSVersion, DigestAlgorithmIdentifier } from "./types";
import { EncapsulatedContentInfo } from "./encapsulated_content_info";
import { RevocationInfoChoices } from "./revocation_info_choice";
import { SignerInfos } from "./signer_info";
/**
 * ```asn
 * DigestAlgorithmIdentifiers ::= SET OF DigestAlgorithmIdentifier
 * ```
 */
export declare class DigestAlgorithmIdentifiers extends AsnArray<DigestAlgorithmIdentifier> {
    constructor(items?: DigestAlgorithmIdentifier[]);
}
/**
 * ```asn
 * SignedData ::= SEQUENCE {
 *   version CMSVersion,
 *   digestAlgorithms DigestAlgorithmIdentifiers,
 *   encapContentInfo EncapsulatedContentInfo,
 *   certificates [0] IMPLICIT CertificateSet OPTIONAL,
 *   crls [1] IMPLICIT RevocationInfoChoices OPTIONAL,
 *   signerInfos SignerInfos }
 * ```
 */
export declare class SignedData {
    version: CMSVersion;
    digestAlgorithms: DigestAlgorithmIdentifiers;
    encapContentInfo: EncapsulatedContentInfo;
    certificates?: CertificateSet;
    crls?: RevocationInfoChoices;
    signerInfos: SignerInfos;
    constructor(params?: Partial<SignedData>);
}
