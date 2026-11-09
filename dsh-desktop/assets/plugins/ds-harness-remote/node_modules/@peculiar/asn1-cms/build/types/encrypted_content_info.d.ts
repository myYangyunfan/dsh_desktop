import { OctetString } from "@peculiar/asn1-schema";
import { ContentType, ContentEncryptionAlgorithmIdentifier } from "./types";
/**
 * ```asn
 * EncryptedContent ::= OCTET STRING
 * ```
 */
export declare class EncryptedContent {
    value?: OctetString;
    constructedValue?: OctetString[];
    constructor(params?: Partial<EncryptedContent>);
}
/**
 * ```asn
 * EncryptedContentInfo ::= SEQUENCE {
 *  contentType ContentType,
 *  contentEncryptionAlgorithm ContentEncryptionAlgorithmIdentifier,
 *  encryptedContent [0] IMPLICIT EncryptedContent OPTIONAL }
 * ```
 */
export declare class EncryptedContentInfo {
    contentType: ContentType;
    contentEncryptionAlgorithm: ContentEncryptionAlgorithmIdentifier;
    encryptedContent?: EncryptedContent;
    constructor(params?: Partial<EncryptedContentInfo>);
}
