import { OctetString } from "@peculiar/asn1-schema";
import { OtherKeyAttribute } from "./other_key_attribute";
import { CMSVersion, EncryptedKey, KeyEncryptionAlgorithmIdentifier } from "./types";
/**
 * ```asn
 * KEKIdentifier ::= SEQUENCE {
 *  keyIdentifier OCTET STRING,
 *  date GeneralizedTime OPTIONAL,
 *  other OtherKeyAttribute OPTIONAL }
 * ```
 */
export declare class KEKIdentifier {
    keyIdentifier: OctetString;
    date?: Date;
    other?: OtherKeyAttribute;
    constructor(params?: Partial<KEKIdentifier>);
}
/**
 * ```asn
 * KEKRecipientInfo ::= SEQUENCE {
 *  version CMSVersion,  -- always set to 4
 *  kekid KEKIdentifier,
 *  keyEncryptionAlgorithm KeyEncryptionAlgorithmIdentifier,
 *  encryptedKey EncryptedKey }
 * ```
 */
export declare class KEKRecipientInfo {
    version: CMSVersion;
    kekid: KEKIdentifier;
    keyEncryptionAlgorithm: KeyEncryptionAlgorithmIdentifier;
    encryptedKey: EncryptedKey;
    constructor(params?: Partial<KEKRecipientInfo>);
}
