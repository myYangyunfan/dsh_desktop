import { AlgorithmIdentifier } from "@peculiar/asn1-x509";
import { OctetString } from "@peculiar/asn1-schema";
/**
 * ```asn
 * ContentType ::= OBJECT IDENTIFIER
 * ```
 */
export type ContentType = string;
/**
 * ```asn
 * CMSVersion ::= INTEGER  { v0(0), v1(1), v2(2), v3(3), v4(4), v5(5) }
 * ```
 */
export declare enum CMSVersion {
    v0 = 0,
    v1 = 1,
    v2 = 2,
    v3 = 3,
    v4 = 4,
    v5 = 5
}
/**
 * ```asn
 * EncryptedKey ::= OCTET STRING
 * ```
 */
export type EncryptedKey = OctetString;
/**
 * ```asn
 * DigestAlgorithmIdentifier ::= AlgorithmIdentifier
 * ```
 */
export declare class DigestAlgorithmIdentifier extends AlgorithmIdentifier {
}
/**
 * ```asn
 * SignatureAlgorithmIdentifier ::= AlgorithmIdentifier
 * ```
 */
export declare class SignatureAlgorithmIdentifier extends AlgorithmIdentifier {
}
/**
 * ```asn
 * KeyEncryptionAlgorithmIdentifier ::= AlgorithmIdentifier
 * ```
 */
export declare class KeyEncryptionAlgorithmIdentifier extends AlgorithmIdentifier {
}
/**
 * ```asn
 * ContentEncryptionAlgorithmIdentifier ::= AlgorithmIdentifier
 * ```
 */
export declare class ContentEncryptionAlgorithmIdentifier extends AlgorithmIdentifier {
}
/**
 * ```asn
 * MessageAuthenticationCodeAlgorithm ::= AlgorithmIdentifier
 * ```
 */
export declare class MessageAuthenticationCodeAlgorithm extends AlgorithmIdentifier {
}
/**
 * ```asn
 * KeyDerivationAlgorithmIdentifier ::= AlgorithmIdentifier
 * ```
 */
export declare class KeyDerivationAlgorithmIdentifier extends AlgorithmIdentifier {
}
