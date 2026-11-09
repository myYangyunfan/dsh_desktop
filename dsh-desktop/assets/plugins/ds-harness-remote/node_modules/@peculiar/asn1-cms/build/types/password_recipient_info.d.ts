import { CMSVersion, KeyDerivationAlgorithmIdentifier, KeyEncryptionAlgorithmIdentifier, EncryptedKey } from "./types";
/**
 * ```asn
 * PasswordRecipientInfo ::= SEQUENCE {
 *  version CMSVersion,   -- Always set to 0
 *  keyDerivationAlgorithm [0] KeyDerivationAlgorithmIdentifier OPTIONAL,
 *  keyEncryptionAlgorithm KeyEncryptionAlgorithmIdentifier,
 *  encryptedKey EncryptedKey }
 * ```
 */
export declare class PasswordRecipientInfo {
    version: CMSVersion;
    keyDerivationAlgorithm?: KeyDerivationAlgorithmIdentifier;
    keyEncryptionAlgorithm: KeyEncryptionAlgorithmIdentifier;
    encryptedKey: EncryptedKey;
    constructor(params?: Partial<PasswordRecipientInfo>);
}
