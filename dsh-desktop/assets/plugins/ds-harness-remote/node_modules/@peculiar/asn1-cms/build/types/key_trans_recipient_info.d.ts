import { SubjectKeyIdentifier } from "@peculiar/asn1-x509";
import { CMSVersion, KeyEncryptionAlgorithmIdentifier, EncryptedKey } from "./types";
import { IssuerAndSerialNumber } from "./issuer_and_serial_number";
/**
 * ```asn
 * RecipientIdentifier ::= CHOICE {
 *  issuerAndSerialNumber IssuerAndSerialNumber,
 *  subjectKeyIdentifier [0] SubjectKeyIdentifier }
 * ```
 */
export declare class RecipientIdentifier {
    subjectKeyIdentifier?: SubjectKeyIdentifier;
    issuerAndSerialNumber?: IssuerAndSerialNumber;
    constructor(params?: Partial<RecipientIdentifier>);
}
/**
 * ```asn
 * KeyTransRecipientInfo ::= SEQUENCE {
 *  version CMSVersion,  -- always set to 0 or 2
 *  rid RecipientIdentifier,
 *  keyEncryptionAlgorithm KeyEncryptionAlgorithmIdentifier,
 *  encryptedKey EncryptedKey }
 * ```
 */
export declare class KeyTransRecipientInfo {
    version: CMSVersion;
    rid: RecipientIdentifier;
    keyEncryptionAlgorithm: KeyEncryptionAlgorithmIdentifier;
    encryptedKey: EncryptedKey;
    constructor(params?: Partial<KeyTransRecipientInfo>);
}
