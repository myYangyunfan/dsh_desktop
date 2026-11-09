import { OctetString } from "@peculiar/asn1-schema";
import { AlgorithmIdentifier } from "@peculiar/asn1-x509";
/**
 * ```asn1
 * EncryptedData ::= OCTET STRING
 * ```
 */
export declare class EncryptedData extends OctetString {
}
/**
 * ```asn1
 * EncryptedPrivateKeyInfo ::= SEQUENCE {
 *   encryptionAlgorithm AlgorithmIdentifier {{KeyEncryptionAlgorithms}},
 *   encryptedData EncryptedData
 * }
 * ```
 */
export declare class EncryptedPrivateKeyInfo {
    encryptionAlgorithm: AlgorithmIdentifier;
    encryptedData: EncryptedData;
    constructor(params?: Partial<EncryptedPrivateKeyInfo>);
}
