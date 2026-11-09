import { AlgorithmIdentifier } from "@peculiar/asn1-x509";
export declare enum DigestedObjectType {
    publicKey = 0,
    publicKeyCert = 1,
    otherObjectTypes = 2
}
/**
 * ```asn1
 * ObjectDigestInfo    ::= SEQUENCE {
 *      digestedObjectType  ENUMERATED {
 *           publicKey            (0),
 *           publicKeyCert        (1),
 *           otherObjectTypes     (2) },
 *                   -- otherObjectTypes MUST NOT
 *                   -- MUST NOT be used in this profile
 *      otherObjectTypeID   OBJECT IDENTIFIER  OPTIONAL,
 *      digestAlgorithm     AlgorithmIdentifier,
 *      objectDigest        BIT STRING
 * }
 * ```
 */
export declare class ObjectDigestInfo {
    digestedObjectType: DigestedObjectType;
    otherObjectTypeID?: string;
    digestAlgorithm: AlgorithmIdentifier;
    objectDigest: ArrayBuffer;
    constructor(params?: Partial<ObjectDigestInfo>);
}
