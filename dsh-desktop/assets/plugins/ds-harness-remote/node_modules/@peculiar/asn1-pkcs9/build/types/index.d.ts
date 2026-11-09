import { OctetString, AsnArray } from "@peculiar/asn1-schema";
import * as cms from "@peculiar/asn1-cms";
import * as pfx from "@peculiar/asn1-pfx";
import * as pkcs8 from "@peculiar/asn1-pkcs8";
import * as x509 from "@peculiar/asn1-x509";
/**
 * ASN.1 module
 *
 * This appendix includes all of the ASN.1 type and value definitions
 * contained in this document in the form of the ASN.1 module PKCS-9.
 *
 * PKCS-9 {iso(1) member-body(2) us(840) rsadsi(113549) pkcs(1)
 * pkcs-9(9) modules(0) pkcs-9(1)}
 * DEFINITIONS IMPLICIT TAGS ::=
 *
 * BEGIN
 *
 * -- EXPORTS All --
 * -- All types and values defined in this module is exported for use
 * -- in other ASN.1 modules.
 *
 * IMPORTS
 *
 * informationFramework, authenticationFramework,
 * selectedAttributeTypes, upperBounds , id-at
 *         FROM UsefulDefinitions {joint-iso-itu-t ds(5) module(1)
 *         usefulDefinitions(0) 3}
 *
 * ub-name
 *         FROM UpperBounds upperBounds
 *
 * OBJECT-CLASS, ATTRIBUTE, MATCHING-RULE, Attribute, top,
 * objectIdentifierMatch
 *         FROM InformationFramework informationFramework
 *
 * ALGORITHM, Extensions, Time
 *         FROM AuthenticationFramework authenticationFramework
 *
 * DirectoryString, octetStringMatch, caseIgnoreMatch, caseExactMatch,
 * generalizedTimeMatch, integerMatch, serialNumber
 *         FROM SelectedAttributeTypes selectedAttributeTypes
 *
 * ContentInfo, SignerInfo
 *         FROM CryptographicMessageSyntax {iso(1) member-body(2) us(840)
 *         rsadsi(113549) pkcs(1) pkcs-9(9) smime(16) modules(0) cms(1)}
 *
 * EncryptedPrivateKeyInfo
 *         FROM PKCS-8 {iso(1) member-body(2) us(840) rsadsi(113549)
 *         pkcs(1) pkcs-8(8) modules(1) pkcs-8(1)}
 *
 * PFX
 *         FROM PKCS-12 {iso(1) member-body(2) us(840) rsadsi(113549)
 *         pkcs(1) pkcs-12(12) modules(0) pkcs-12(1)}
 *
 * PKCS15Token
 *         FROM PKCS-15 {iso(1) member-body(2) us(840) rsadsi(113549)
 *         pkcs(1) pkcs-15(15) modules(1) pkcs-15(1)};
 *
 * -- Upper bounds
 *
 * pkcs-9-ub-pkcs9String         INTEGER ::= 255
 * pkcs-9-ub-emailAddress        INTEGER ::= pkcs-9-ub-pkcs9String
 * pkcs-9-ub-unstructuredName    INTEGER ::= pkcs-9-ub-pkcs9String
 * pkcs-9-ub-unstructuredAddress INTEGER ::= pkcs-9-ub-pkcs9String
 * pkcs-9-ub-challengePassword   INTEGER ::= pkcs-9-ub-pkcs9String
 * pkcs-9-ub-friendlyName        INTEGER ::= pkcs-9-ub-pkcs9String
 * pkcs-9-ub-signingDescription  INTEGER ::= pkcs-9-ub-pkcs9String
 * pkcs-9-ub-match               INTEGER ::= pkcs-9-ub-pkcs9String
 * pkcs-9-ub-pseudonym           INTEGER ::= ub-name
 * pkcs-9-ub-placeOfBirth        INTEGER ::= ub-name
 *
 * -- Object Identifiers
 */
/**
 * pkcs-9 OBJECT IDENTIFIER ::= {iso(1) member-body(2) us(840)
 *                               rsadsi(113549) pkcs(1) 9}
 */
export declare const id_pkcs9 = "1.2.840.113549.1.9";
/**
 * pkcs-9-mo OBJECT IDENTIFIER ::= {pkcs-9 0}  -- Modules branch
 */
export declare const id_pkcs9_mo = "1.2.840.113549.1.9.0";
/**
 * pkcs-9-oc OBJECT IDENTIFIER ::= {pkcs-9 24} -- Object class branch
 */
export declare const id_pkcs9_oc = "1.2.840.113549.1.9.24";
/**
 * pkcs-9-at OBJECT IDENTIFIER ::= {pkcs-9 25} -- Attribute branch, for
 *                                             -- new  attributes
 */
export declare const id_pkcs9_at = "1.2.840.113549.1.9.25";
/**
 * pkcs-9-sx OBJECT IDENTIFIER ::= {pkcs-9 26} -- For syntaxes (RFC 2252)
 */
export declare const id_pkcs9_sx = "1.2.840.113549.1.9.26";
/**
 * pkcs-9-mr OBJECT IDENTIFIER ::= {pkcs-9 27} -- Matching rules
 */
export declare const id_pkcs9_mr = "1.2.840.113549.1.9.27";
/**
 * pkcs-9-oc-pkcsEntity    OBJECT IDENTIFIER ::= {pkcs-9-oc 1}
 */
export declare const id_pkcs9_oc_pkcsEntity = "1.2.840.113549.1.9.24.1";
/**
 * pkcs-9-oc-naturalPerson OBJECT IDENTIFIER ::= {pkcs-9-oc 2}
 */
export declare const id_pkcs9_oc_naturalPerson = "1.2.840.113549.1.9.24.2";
/**
 * pkcs-9-at-emailAddress        OBJECT IDENTIFIER ::= {pkcs-9 1}
 */
export declare const id_pkcs9_at_emailAddress = "1.2.840.113549.1.9.1";
/**
 * pkcs-9-at-unstructuredName    OBJECT IDENTIFIER ::= {pkcs-9 2}
 */
export declare const id_pkcs9_at_unstructuredName = "1.2.840.113549.1.9.2";
/**
 * pkcs-9-at-contentType         OBJECT IDENTIFIER ::= {pkcs-9 3}
 */
export declare const id_pkcs9_at_contentType = "1.2.840.113549.1.9.3";
/**
 * pkcs-9-at-messageDigest       OBJECT IDENTIFIER ::= {pkcs-9 4}
 */
export declare const id_pkcs9_at_messageDigest = "1.2.840.113549.1.9.4";
/**
 * pkcs-9-at-signingTime         OBJECT IDENTIFIER ::= {pkcs-9 5}
 */
export declare const id_pkcs9_at_signingTime = "1.2.840.113549.1.9.5";
/**
 * pkcs-9-at-counterSignature    OBJECT IDENTIFIER ::= {pkcs-9 6}
 */
export declare const id_pkcs9_at_counterSignature = "1.2.840.113549.1.9.6";
/**
 * pkcs-9-at-challengePassword   OBJECT IDENTIFIER ::= {pkcs-9 7}
 */
export declare const id_pkcs9_at_challengePassword = "1.2.840.113549.1.9.7";
/**
 * pkcs-9-at-unstructuredAddress OBJECT IDENTIFIER ::= {pkcs-9 8}
 */
export declare const id_pkcs9_at_unstructuredAddress = "1.2.840.113549.1.9.8";
/**
 * pkcs-9-at-extendedCertificateAttributes
 *                               OBJECT IDENTIFIER ::= {pkcs-9 9}
 */
export declare const id_pkcs9_at_extendedCertificateAttributes = "1.2.840.113549.1.9.9";
/**
 * -- Obsolete (?) attribute identifiers, purportedly from "tentative
 * -- PKCS #9 draft"
 * -- pkcs-9-at-issuerAndSerialNumber OBJECT IDENTIFIER ::= {pkcs-9 10}
 * -- pkcs-9-at-passwordCheck         OBJECT IDENTIFIER ::= {pkcs-9 11}
 * -- pkcs-9-at-publicKey             OBJECT IDENTIFIER ::= {pkcs-9 12}
 */
/**
 * pkcs-9-at-signingDescription       OBJECT IDENTIFIER ::= {pkcs-9 13}
 */
export declare const id_pkcs9_at_signingDescription = "1.2.840.113549.1.9.13";
/**
 * pkcs-9-at-extensionRequest         OBJECT IDENTIFIER ::= {pkcs-9 14}
 */
export declare const id_pkcs9_at_extensionRequest = "1.2.840.113549.1.9.14";
/**
 * pkcs-9-at-smimeCapabilities        OBJECT IDENTIFIER ::= {pkcs-9 15}
 */
export declare const id_pkcs9_at_smimeCapabilities = "1.2.840.113549.1.9.15";
/**
 * -- Unused (?)
 * -- pkcs-9-at-?                     OBJECT IDENTIFIER ::= {pkcs-9 17}
 * -- pkcs-9-at-?                     OBJECT IDENTIFIER ::= {pkcs-9 18}
 * -- pkcs-9-at-?                     OBJECT IDENTIFIER ::= {pkcs-9 19}
 */
/**
 * pkcs-9-at-friendlyName             OBJECT IDENTIFIER ::= {pkcs-9 20}
 */
export declare const id_pkcs9_at_friendlyName = "1.2.840.113549.1.9.20";
/**
 * pkcs-9-at-localKeyId               OBJECT IDENTIFIER ::= {pkcs-9 21}
 */
export declare const id_pkcs9_at_localKeyId = "1.2.840.113549.1.9.21";
/**
 * pkcs-9-at-userPKCS12               OBJECT IDENTIFIER ::=
 *                                       {2 16 840 1 113730 3 1 216}
 */
export declare const id_pkcs9_at_userPKCS12 = "2.16.840.1.113730.3.1.216";
/**
 * pkcs-9-at-pkcs15Token              OBJECT IDENTIFIER ::= {pkcs-9-at 1}
 */
export declare const id_pkcs9_at_pkcs15Token = "1.2.840.113549.1.9.25.1";
/**
 * pkcs-9-at-encryptedPrivateKeyInfo  OBJECT IDENTIFIER ::= {pkcs-9-at 2}
 */
export declare const id_pkcs9_at_encryptedPrivateKeyInfo = "1.2.840.113549.1.9.25.2";
/**
 * pkcs-9-at-randomNonce              OBJECT IDENTIFIER ::= {pkcs-9-at 3}
 */
export declare const id_pkcs9_at_randomNonce = "1.2.840.113549.1.9.25.3";
/**
 * pkcs-9-at-sequenceNumber           OBJECT IDENTIFIER ::= {pkcs-9-at 4}
 */
export declare const id_pkcs9_at_sequenceNumber = "1.2.840.113549.1.9.25.4";
/**
 * pkcs-9-at-pkcs7PDU                 OBJECT IDENTIFIER ::= {pkcs-9-at 5}
 */
export declare const id_pkcs9_at_pkcs7PDU = "1.2.840.113549.1.9.25.5";
/**
 * ietf-at                            OBJECT IDENTIFIER ::=
 *                                       {1 3 6 1 5 5 7 9}
 */
export declare const id_ietf_at = "1.3.6.1.5.5.7.9";
/**
 * pkcs-9-at-dateOfBirth              OBJECT IDENTIFIER ::= {ietf-at 1}
 */
export declare const id_pkcs9_at_dateOfBirth = "1.3.6.1.5.5.7.9.1";
/**
 * pkcs-9-at-placeOfBirth             OBJECT IDENTIFIER ::= {ietf-at 2}
 */
export declare const id_pkcs9_at_placeOfBirth = "1.3.6.1.5.5.7.9.2";
/**
 * pkcs-9-at-gender                   OBJECT IDENTIFIER ::= {ietf-at 3}
 */
export declare const id_pkcs9_at_gender = "1.3.6.1.5.5.7.9.3";
/**
 * pkcs-9-at-countryOfCitizenship     OBJECT IDENTIFIER ::= {ietf-at 4}
 */
export declare const id_pkcs9_at_countryOfCitizenship = "1.3.6.1.5.5.7.9.4";
/**
 * pkcs-9-at-countryOfResidence       OBJECT IDENTIFIER ::= {ietf-at 5}
 */
export declare const id_pkcs9_at_countryOfResidence = "1.3.6.1.5.5.7.9.5";
/**
 * pkcs-9-sx-pkcs9String              OBJECT IDENTIFIER ::= {pkcs-9-sx 1}
 */
export declare const id_pkcs9_sx_pkcs9String = "1.2.840.113549.1.9.26.1";
/**
 * pkcs-9-sx-signingTime              OBJECT IDENTIFIER ::= {pkcs-9-sx 2}
 */
export declare const id_pkcs9_sx_signingTime = "1.2.840.113549.1.9.26.2";
/**
 * pkcs-9-mr-caseIgnoreMatch          OBJECT IDENTIFIER ::= {pkcs-9-mr 1}
 */
export declare const id_pkcs9_mr_caseIgnoreMatch = "1.2.840.113549.1.9.27.1";
/**
 * pkcs-9-mr-signingTimeMatch         OBJECT IDENTIFIER ::= {pkcs-9-mr 2}
 */
export declare const id_pkcs9_mr_signingTimeMatch = "1.2.840.113549.1.9.27.2";
/**
 *   -- Arcs with attributes defined elsewhere
 */
/**
 * smime                              OBJECT IDENTIFIER ::= {pkcs-9 16}
 */
export declare const id_smime = "1.2.840.113549.1.9.16";
/**
 *   -- Main arc for S/MIME (RFC 2633)
 */
/**
 * certTypes                          OBJECT IDENTIFIER ::= {pkcs-9 22}
 */
export declare const id_certTypes = "1.2.840.113549.1.9.22";
/**
 *   -- Main arc for certificate types defined in PKCS #12
 * crlTypes                           OBJECT IDENTIFIER ::= {pkcs-9 23}
 */
export declare const crlTypes = "1.2.840.113549.1.9.23";
/**
 *   -- Main arc for crl types defined in PKCS #12
 *
 *   -- Other object identifiers
 */
/**
 * id-at-pseudonym                    OBJECT IDENTIFIER ::= {id-at 65}
 */
export declare const id_at_pseudonym = "2.5.4.65";
/**
 * -- Useful types
 */
/**
 * PKCS9String {INTEGER : maxSize} ::= CHOICE {
 *         ia5String IA5String (SIZE(1..maxSize)),
 *         directoryString DirectoryString {maxSize}
 * }
 */
export declare class PKCS9String extends x509.DirectoryString {
    ia5String?: string;
    constructor(params?: Partial<PKCS9String>);
    toString(): string;
}
/**
 *
 * -- Object classes
 */
/**
 * pkcsEntity OBJECT-CLASS ::= {
 *         SUBCLASS OF     { top }
 *         KIND            auxiliary
 *         MAY CONTAIN     { PKCSEntityAttributeSet }
 *         ID              pkcs-9-oc-pkcsEntity
 * }
 *
 * naturalPerson OBJECT-CLASS ::= {
 *         SUBCLASS OF     { top }
 *         KIND            auxiliary
 *         MAY CONTAIN     { NaturalPersonAttributeSet }
 *         ID              pkcs-9-oc-naturalPerson
 * }
 *
 * -- Attribute sets
 *
 * PKCSEntityAttributeSet ATTRIBUTE ::= {
 *         pKCS7PDU |
 *         userPKCS12 |
 *         pKCS15Token |
 *         encryptedPrivateKeyInfo,
 *         ... -- For future extensions
 * }
 *
 * NaturalPersonAttributeSet ATTRIBUTE ::= {
 *         emailAddress |
 *         unstructuredName |
 *         unstructuredAddress |
 *         dateOfBirth |
 *         placeOfBirth |
 *         gender |
 *         countryOfCitizenship |
 *         countryOfResidence |
 *         pseudonym |
 *         serialNumber,
 *         ... -- For future extensions
 * }
 *
 * -- Attributes
 */
/**
 * pKCS7PDU ATTRIBUTE ::= {
 *         WITH SYNTAX ContentInfo
 *         ID pkcs-9-at-pkcs7PDU
 * }
 */
export declare class Pkcs7PDU extends cms.ContentInfo {
}
/**
 * userPKCS12 ATTRIBUTE ::= {
 *         WITH SYNTAX PFX
 *         ID pkcs-9-at-userPKCS12
 * }
 */
export declare class UserPKCS12 extends pfx.PFX {
}
/**
 * pKCS15Token ATTRIBUTE ::= {
 *         WITH SYNTAX PKCS15Token
 *         ID pkcs-9-at-pkcs15Token
 * }
 */
/**
 * encryptedPrivateKeyInfo ATTRIBUTE ::= {
 *         WITH SYNTAX EncryptedPrivateKeyInfo
 *         ID pkcs-9-at-encryptedPrivateKeyInfo
 * }
 */
export declare class EncryptedPrivateKeyInfo extends pkcs8.EncryptedPrivateKeyInfo {
}
/**
 * emailAddress ATTRIBUTE ::= {
 *         WITH SYNTAX IA5String (SIZE(1..pkcs-9-ub-emailAddress))
 *         EQUALITY MATCHING RULE pkcs9CaseIgnoreMatch
 *         ID pkcs-9-at-emailAddress
 * }
 */
export declare class EmailAddress {
    value: string;
    constructor(value?: string);
    /**
     * Returns a string representation of an object.
     */
    toString(): string;
}
/**
 * unstructuredName ATTRIBUTE ::= {
 *         WITH SYNTAX PKCS9String {pkcs-9-ub-unstructuredName}
 *         EQUALITY MATCHING RULE pkcs9CaseIgnoreMatch
 *         ID pkcs-9-at-unstructuredName
 * }
 */
export declare class UnstructuredName extends PKCS9String {
}
/**
 * unstructuredAddress ATTRIBUTE ::= {
 *         WITH SYNTAX DirectoryString {pkcs-9-ub-unstructuredAddress}
 *         EQUALITY MATCHING RULE caseIgnoreMatch
 *         ID pkcs-9-at-unstructuredAddress
 * }
 */
export declare class UnstructuredAddress extends x509.DirectoryString {
}
/**
 * dateOfBirth ATTRIBUTE ::= {
 *         WITH SYNTAX GeneralizedTime
 *         EQUALITY MATCHING RULE generalizedTimeMatch
 *         SINGLE VALUE TRUE
 *         ID pkcs-9-at-dateOfBirth
 * }
 */
export declare class DateOfBirth {
    value: Date;
    constructor(value?: Date);
}
/**
 * placeOfBirth ATTRIBUTE ::= {
 *         WITH SYNTAX DirectoryString {pkcs-9-ub-placeOfBirth}
 *         EQUALITY MATCHING RULE caseExactMatch
 *         SINGLE VALUE TRUE
 *         ID pkcs-9-at-placeOfBirth
 * }
 */
export declare class PlaceOfBirth extends x509.DirectoryString {
}
export type GenderType = "M" | "F" | "m" | "f";
/**
 * gender ATTRIBUTE ::= {
 *         WITH SYNTAX PrintableString (SIZE(1) ^
 *                     FROM ("M" | "F" | "m" | "f"))
 *         EQUALITY MATCHING RULE caseIgnoreMatch
 *         SINGLE VALUE TRUE
 *         ID pkcs-9-at-gender
 * }
 */
export declare class Gender {
    value: GenderType;
    /**
     * Initialize Gender object
     * @param value Gender object value. Default value is 'M'.
     */
    constructor(value?: GenderType);
    /**
     * Returns a string representation of an object.
     */
    toString(): string;
}
/**
 * countryOfCitizenship ATTRIBUTE ::= {
 *         WITH SYNTAX PrintableString (SIZE(2))(CONSTRAINED BY {
 *         -- Must be a two-letter country acronym in accordance with
 *         -- ISO/IEC 3166 --})
 *         EQUALITY MATCHING RULE caseIgnoreMatch
 *         ID pkcs-9-at-countryOfCitizenship
 * }
 */
export declare class CountryOfCitizenship {
    /**
     * Country name. Must be a two-letter country acronym in accordance with ISO/IEC 3166
     */
    value: string;
    constructor(value?: string);
    /**
     * Returns a string representation of an object.
     */
    toString(): string;
}
/**
 * countryOfResidence ATTRIBUTE ::= {
 *         WITH SYNTAX PrintableString (SIZE(2))(CONSTRAINED BY {
 *         -- Must be a two-letter country acronym in accordance with
 *         -- ISO/IEC 3166 --})
 *         EQUALITY MATCHING RULE caseIgnoreMatch
 *         ID pkcs-9-at-countryOfResidence
 * }
 */
export declare class CountryOfResidence extends CountryOfCitizenship {
}
/**
 * pseudonym ATTRIBUTE ::= {
 *         WITH SYNTAX DirectoryString {pkcs-9-ub-pseudonym}
 *         EQUALITY MATCHING RULE caseExactMatch
 *         ID id-at-pseudonym
 * }
 */
export declare class Pseudonym extends x509.DirectoryString {
}
/**
 * contentType ATTRIBUTE ::= {
 *         WITH SYNTAX ContentType
 *         EQUALITY MATCHING RULE objectIdentifierMatch
 *         SINGLE VALUE TRUE
 *         ID pkcs-9-at-contentType
 * }
 */
export declare class ContentType {
    value: string;
    constructor(value?: string);
    /**
     * Returns a string representation of an object.
     */
    toString(): string;
}
/**
 * MessageDigest ::= OCTET STRING
 *
 * messageDigest ATTRIBUTE ::= {
 *         WITH SYNTAX MessageDigest
 *         EQUALITY MATCHING RULE octetStringMatch
 *         SINGLE VALUE TRUE
 *         ID pkcs-9-at-messageDigest
 * }
 */
export declare class MessageDigest extends OctetString {
}
/**
 * SigningTime ::= Time -- imported from ISO/IEC 9594-8
 *
 * signingTime ATTRIBUTE ::= {
 *         WITH SYNTAX SigningTime
 *         EQUALITY MATCHING RULE signingTimeMatch
 *         SINGLE VALUE TRUE
 *         ID pkcs-9-at-signingTime
 * }
 */
export declare class SigningTime extends x509.Time {
}
/**
 * RandomNonce ::= OCTET STRING (SIZE(4..MAX))
 *         -- At least four bytes long
 *
 * randomNonce ATTRIBUTE ::= {
 *         WITH SYNTAX RandomNonce
 *         EQUALITY MATCHING RULE octetStringMatch
 *         SINGLE VALUE TRUE
 *         ID pkcs-9-at-randomNonce
 * }
 */
export declare class RandomNonce extends OctetString {
}
/**
 * SequenceNumber ::= INTEGER (1..MAX)
 *
 * sequenceNumber ATTRIBUTE ::= {
 *         WITH SYNTAX SequenceNumber
 *         EQUALITY MATCHING RULE integerMatch
 *         SINGLE VALUE TRUE
 *         ID pkcs-9-at-sequenceNumber
 * }
 */
export declare class SequenceNumber {
    value: number;
    constructor(value?: number);
    /**
     * Returns a string representation of an object.
     */
    toString(): string;
}
/**
 * counterSignature ATTRIBUTE ::= {
 *         WITH SYNTAX SignerInfo
 *         ID pkcs-9-at-counterSignature
 * }
 */
export declare class CounterSignature extends cms.SignerInfo {
}
/**
 * challengePassword ATTRIBUTE ::= {
 *         WITH SYNTAX DirectoryString {pkcs-9-ub-challengePassword}
 *         EQUALITY MATCHING RULE caseExactMatch
 *         SINGLE VALUE TRUE
 *         ID pkcs-9-at-challengePassword
 * }
 */
export declare class ChallengePassword extends x509.DirectoryString {
}
/**
 * ExtensionRequest ::= Extensions
 *
 * extensionRequest ATTRIBUTE ::= {
 *         WITH SYNTAX ExtensionRequest
 *         SINGLE VALUE TRUE
 *         ID pkcs-9-at-extensionRequest
 * }
 */
export declare class ExtensionRequest extends x509.Extensions {
    constructor(items?: x509.Extension[]);
}
/**
 * extendedCertificateAttributes ATTRIBUTE ::= {
 *         WITH SYNTAX SET OF Attribute
 *         SINGLE VALUE TRUE
 *         ID pkcs-9-at-extendedCertificateAttributes
 * }
 */
export declare class ExtendedCertificateAttributes extends AsnArray<cms.Attribute> {
    constructor(items?: cms.Attribute[]);
}
/**
 * friendlyName ATTRIBUTE ::= {
 *         WITH SYNTAX BMPString (SIZE(1..pkcs-9-ub-friendlyName))
 *         EQUALITY MATCHING RULE caseIgnoreMatch
 *         SINGLE VALUE TRUE
 *         ID pkcs-9-at-friendlyName
 * }
 */
export declare class FriendlyName {
    value: string;
    constructor(value?: string);
    /**
     * Returns a string representation of an object.
     */
    toString(): string;
}
/**
 * localKeyId ATTRIBUTE ::= {
 *         WITH SYNTAX OCTET STRING
 *         EQUALITY MATCHING RULE octetStringMatch
 *         SINGLE VALUE TRUE
 *         ID pkcs-9-at-localKeyId
 * }
 */
export declare class LocalKeyId extends OctetString {
}
/**
 * signingDescription ATTRIBUTE ::= {
 *         WITH SYNTAX DirectoryString {pkcs-9-ub-signingDescription}
 *         EQUALITY MATCHING RULE caseIgnoreMatch
 *         SINGLE VALUE TRUE
 *         ID pkcs-9-at-signingDescription
 * }
 */
export declare class SigningDescription extends x509.DirectoryString {
}
/**
 * SMIMECapability ::= SEQUENCE {
 *         algorithm  ALGORITHM.&id ({SMIMEv3Algorithms}),
 *         parameters ALGORITHM.&Type ({SMIMEv3Algorithms}{@algorithm})
 * }
 *
 * SMIMEv3Algorithms ALGORITHM ::= {...-- See RFC 2633 --}
 */
export declare class SMIMECapability extends x509.AlgorithmIdentifier {
}
/**
 * SMIMECapabilities ::= SEQUENCE OF SMIMECapability
 *
 * smimeCapabilities ATTRIBUTE ::= {
 *         WITH SYNTAX SMIMECapabilities
 *         SINGLE VALUE TRUE
 *         ID pkcs-9-at-smimeCapabilities
 * }
 */
export declare class SMIMECapabilities extends AsnArray<SMIMECapability> {
    constructor(items?: SMIMECapability[]);
}
/**
 *  -- Matching rules
 *
 * pkcs9CaseIgnoreMatch MATCHING-RULE ::= {
 *         SYNTAX PKCS9String {pkcs-9-ub-match}
 *         ID pkcs-9-mr-caseIgnoreMatch
 * }
 *
 * signingTimeMatch MATCHING-RULE ::= {
 *         SYNTAX SigningTime
 *         ID pkcs-9-mr-signingTimeMatch
 * }
 *
 * END
 */
