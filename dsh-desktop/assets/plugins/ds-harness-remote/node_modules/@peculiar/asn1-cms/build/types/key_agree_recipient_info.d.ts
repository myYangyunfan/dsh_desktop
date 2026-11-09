import { AsnArray, OctetString } from "@peculiar/asn1-schema";
import { AlgorithmIdentifier, SubjectKeyIdentifier } from "@peculiar/asn1-x509";
import { CMSVersion, KeyEncryptionAlgorithmIdentifier, EncryptedKey } from "./types";
import { IssuerAndSerialNumber } from "./issuer_and_serial_number";
import { OtherKeyAttribute } from "./other_key_attribute";
/**
 * ```asn
 * UserKeyingMaterial ::= OCTET STRING
 * ```
 */
export type UserKeyingMaterial = OctetString;
/**
 * ```asn
 * RecipientKeyIdentifier ::= SEQUENCE {
 *  subjectKeyIdentifier SubjectKeyIdentifier,
 *  date GeneralizedTime OPTIONAL,
 *  other OtherKeyAttribute OPTIONAL }
 * ```
 */
export declare class RecipientKeyIdentifier {
    subjectKeyIdentifier: SubjectKeyIdentifier;
    date?: Date;
    other?: OtherKeyAttribute;
    constructor(params?: Partial<RecipientKeyIdentifier>);
}
/**
 * ```asn
 * KeyAgreeRecipientIdentifier ::= CHOICE {
 *  issuerAndSerialNumber IssuerAndSerialNumber,
 *  rKeyId [0] IMPLICIT RecipientKeyIdentifier }
 * ```
 */
export declare class KeyAgreeRecipientIdentifier {
    rKeyId?: RecipientKeyIdentifier;
    issuerAndSerialNumber?: IssuerAndSerialNumber;
    constructor(params?: Partial<KeyAgreeRecipientIdentifier>);
}
/**
 * ```asn
 * RecipientEncryptedKey ::= SEQUENCE {
 *  rid KeyAgreeRecipientIdentifier,
 *  encryptedKey EncryptedKey }
 * ```
 */
export declare class RecipientEncryptedKey {
    rid: KeyAgreeRecipientIdentifier;
    encryptedKey: EncryptedKey;
    constructor(params?: Partial<RecipientEncryptedKey>);
}
/**
 * ```asn
 * RecipientEncryptedKeys ::= SEQUENCE OF RecipientEncryptedKey
 * ```
 */
export declare class RecipientEncryptedKeys extends AsnArray<RecipientEncryptedKey> {
    constructor(items?: RecipientEncryptedKey[]);
}
/**
 * ```asn
 * OriginatorPublicKey ::= SEQUENCE {
 *  algorithm AlgorithmIdentifier,
 *  publicKey BIT STRING }
 * ```
 */
export declare class OriginatorPublicKey {
    algorithm: AlgorithmIdentifier;
    publicKey: ArrayBuffer;
    constructor(params?: Partial<OriginatorPublicKey>);
}
/**
 * ```asn
 * OriginatorIdentifierOrKey ::= CHOICE {
 *  issuerAndSerialNumber IssuerAndSerialNumber,
 *  subjectKeyIdentifier [0] SubjectKeyIdentifier,
 *  originatorKey [1] OriginatorPublicKey }
 * ```
 */
export declare class OriginatorIdentifierOrKey {
    subjectKeyIdentifier?: SubjectKeyIdentifier;
    originatorKey?: OriginatorPublicKey;
    issuerAndSerialNumber?: IssuerAndSerialNumber;
    constructor(params?: Partial<OriginatorIdentifierOrKey>);
}
/**
 * ```asn
 * KeyAgreeRecipientInfo ::= SEQUENCE {
 *  version CMSVersion,  -- always set to 3
 *  originator [0] EXPLICIT OriginatorIdentifierOrKey,
 *  ukm [1] EXPLICIT UserKeyingMaterial OPTIONAL,
 *  keyEncryptionAlgorithm KeyEncryptionAlgorithmIdentifier,
 *  recipientEncryptedKeys RecipientEncryptedKeys }
 * ```
 */
export declare class KeyAgreeRecipientInfo {
    version: CMSVersion;
    originator: OriginatorIdentifierOrKey;
    ukm?: UserKeyingMaterial;
    keyEncryptionAlgorithm: KeyEncryptionAlgorithmIdentifier;
    recipientEncryptedKeys: RecipientEncryptedKeys;
    constructor(params?: Partial<KeyAgreeRecipientInfo>);
}
