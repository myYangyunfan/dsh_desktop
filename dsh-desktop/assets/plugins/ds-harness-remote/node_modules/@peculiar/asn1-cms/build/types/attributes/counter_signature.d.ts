import { SignerInfo } from "../signer_info";
/**
 * ```asn
 * id-countersignature OBJECT IDENTIFIER ::= { iso(1) member-body(2)
 *   us(840) rsadsi(113549) pkcs(1) pkcs9(9) 6 }
 * ```
 */
export declare const id_counterSignature = "1.2.840.113549.1.9.6";
/**
 * ```asn
 * SigningTime  ::= Time
 * ```
 */
export declare class CounterSignature extends SignerInfo {
}
