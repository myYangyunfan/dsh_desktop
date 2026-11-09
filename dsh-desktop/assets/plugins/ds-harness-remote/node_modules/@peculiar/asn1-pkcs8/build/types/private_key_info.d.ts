import { AsnArray, OctetString } from "@peculiar/asn1-schema";
import { AlgorithmIdentifier, Attribute } from "@peculiar/asn1-x509";
/**
 * ```asn1
 * Version ::= INTEGER {v1(0)} (v1,...)
 * ```
 */
export declare enum Version {
    v1 = 0
}
/**
 * ```asn1
 * PrivateKey ::= OCTET STRING
 * ```
 */
export declare class PrivateKey extends OctetString {
}
/**
 * ```asn1
 * Attributes ::= SET OF Attribute
 * ```
 */
export declare class Attributes extends AsnArray<Attribute> {
    constructor(items?: Attribute[]);
}
/**
 * ```asn1
 * PrivateKeyInfo ::= SEQUENCE {
 *   version Version,
 *   privateKeyAlgorithm AlgorithmIdentifier {{PrivateKeyAlgorithms}},
 *   privateKey PrivateKey,
 *   attributes [0] Attributes OPTIONAL }
 * ```
 */
export declare class PrivateKeyInfo {
    version: Version;
    privateKeyAlgorithm: AlgorithmIdentifier;
    privateKey: PrivateKey;
    attributes?: Attributes;
    constructor(params?: Partial<PrivateKeyInfo>);
}
