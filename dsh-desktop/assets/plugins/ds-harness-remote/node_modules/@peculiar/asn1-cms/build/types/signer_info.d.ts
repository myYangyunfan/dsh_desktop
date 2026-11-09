import { AsnArray, OctetString } from "@peculiar/asn1-schema";
import { SignerIdentifier } from "./signer_identifier";
import { CMSVersion, SignatureAlgorithmIdentifier, DigestAlgorithmIdentifier } from "./types";
import { Attribute } from "./attribute";
/**
 * ```asn
 * SignedAttributes ::= SET SIZE (1..MAX) OF Attribute
 * ```
 */
export type SignedAttributes = Attribute[];
/**
 * ```asn
 * UnsignedAttributes ::= SET SIZE (1..MAX) OF Attribute
 * ```
 */
export type UnsignedAttributes = Attribute[];
/**
 * ```asn
 * SignatureValue ::= OCTET STRING
 * ```
 */
export type SignatureValue = OctetString;
/**
 * ```asn
 * SignerInfo ::= SEQUENCE {
 *   version CMSVersion,
 *   sid SignerIdentifier,
 *   digestAlgorithm DigestAlgorithmIdentifier,
 *   signedAttrs [0] IMPLICIT SignedAttributes OPTIONAL,
 *   signatureAlgorithm SignatureAlgorithmIdentifier,
 *   signature SignatureValue,
 *   unsignedAttrs [1] IMPLICIT UnsignedAttributes OPTIONAL }
 * ```
 */
export declare class SignerInfo {
    version: CMSVersion;
    sid: SignerIdentifier;
    digestAlgorithm: DigestAlgorithmIdentifier;
    signedAttrs?: SignedAttributes;
    signedAttrsRaw?: ArrayBuffer;
    signatureAlgorithm: SignatureAlgorithmIdentifier;
    signature: SignatureValue;
    unsignedAttrs?: UnsignedAttributes;
    constructor(params?: Partial<SignerInfo>);
}
/**
 * ```asn
 * SignerInfos ::= SET OF SignerInfo
 * ```
 */
export declare class SignerInfos extends AsnArray<SignerInfo> {
    constructor(items?: SignerInfo[]);
}
