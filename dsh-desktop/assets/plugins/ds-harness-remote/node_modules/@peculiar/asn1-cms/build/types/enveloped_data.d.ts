import { AsnArray } from "@peculiar/asn1-schema";
import { CMSVersion } from "./types";
import { Attribute } from "./attribute";
import { RecipientInfos } from "./recipient_infos";
import { OriginatorInfo } from "./originator_info";
import { EncryptedContentInfo } from "./encrypted_content_info";
/**
 * ```asn
 * UnprotectedAttributes ::= SET SIZE (1..MAX) OF Attribute
 * ```
 */
export declare class UnprotectedAttributes extends AsnArray<Attribute> {
    constructor(items?: Attribute[]);
}
/**
 * ```asn
 * EnvelopedData ::= SEQUENCE {
 *  version CMSVersion,
 *  originatorInfo [0] IMPLICIT OriginatorInfo OPTIONAL,
 *  recipientInfos RecipientInfos,
 *  encryptedContentInfo EncryptedContentInfo,
 *  unprotectedAttrs [1] IMPLICIT UnprotectedAttributes OPTIONAL }
 * ```
 */
export declare class EnvelopedData {
    version: CMSVersion;
    originatorInfo?: OriginatorInfo;
    recipientInfos: RecipientInfos;
    encryptedContentInfo: EncryptedContentInfo;
    unprotectedAttrs?: UnprotectedAttributes;
    constructor(params?: Partial<EnvelopedData>);
}
