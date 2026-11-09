/**
 * ASN1 type
 */
import * as asn1js from "asn1js";
export type IEmptyConstructor<T = unknown> = new () => T;
/**
 * Options for parsing ASN.1 encoded data
 */
export interface IAsnParseOptions {
    /**
     * Resource limits forwarded to `asn1js.fromBER` for untrusted input
     * (`maxDepth`, `maxNodes`, `maxContentLength`). When omitted, the asn1js
     * defaults apply (maxDepth: 100, maxNodes: 10000, maxContentLength: 16MB).
     */
    berOptions?: asn1js.FromBerOptions;
}
/**
 * Allows to convert ASN.1 object to JS value and back
 */
export interface IAsnConverter<T = unknown, AsnType = asn1js.AsnType> {
    /**
     * Returns JS value from ASN.1 object
     * @param value ASN.1 object from asn1js module
     */
    fromASN(value: AsnType): T;
    /**
     * Returns ASN.1 object from JS value
     * @param value JS value
     */
    toASN(value: T): AsnType;
}
export type IntegerConverterType = string | number;
export type AnyConverterType = ArrayBuffer | null;
/**
 * Allows an object to control its own ASN.1 serialization and deserialization
 */
export interface IAsnConvertible<T = asn1js.AsnType> {
    fromASN(asn: T): this;
    toASN(): T;
    toSchema(name: string): asn1js.BaseBlock;
}
export type IAsnConvertibleConstructor = new () => IAsnConvertible;
