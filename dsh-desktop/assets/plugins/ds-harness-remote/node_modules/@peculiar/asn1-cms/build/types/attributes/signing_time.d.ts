import { Time } from "@peculiar/asn1-x509";
/**
 * ```asn
 * id-signingTime OBJECT IDENTIFIER ::= { iso(1) member-body(2)
 *   us(840) rsadsi(113549) pkcs(1) pkcs9(9) 5 }
 * ```
 */
export declare const id_signingTime = "1.2.840.113549.1.9.5";
/**
 * ```asn
 * SigningTime  ::= Time
 * ```
 */
export declare class SigningTime extends Time {
}
