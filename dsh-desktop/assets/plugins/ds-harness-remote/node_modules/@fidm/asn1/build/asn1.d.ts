/// <reference types="node" />
import { inspect } from 'util';
/**
 * Template is use to create schema of ASN.1 object for `asn1.validate` method.
 */
export interface Template {
    name: string;
    class: Class;
    tag: Tag | Tag[];
    optional?: boolean;
    capture?: string;
    value?: Template | Template[];
}
/**
 * Captures is use to capture sub objects from ASN.1 object for `asn1.validate` method.
 */
export interface Captures {
    [index: string]: ASN1;
}
/**
 * ASN.1 classes.
 */
export declare enum Class {
    UNIVERSAL = 0,
    APPLICATION = 64,
    CONTEXT_SPECIFIC = 128,
    PRIVATE = 192
}
/**
 * ASN.1 types. Not all types are supported by this implementation.
 */
export declare enum Tag {
    NONE = 0,
    BOOLEAN = 1,
    INTEGER = 2,
    BITSTRING = 3,
    OCTETSTRING = 4,
    NULL = 5,
    OID = 6,
    ENUMERATED = 10,
    UTF8 = 12,
    SEQUENCE = 16,
    SET = 17,
    NUMERICSTRING = 18,
    PRINTABLESTRING = 19,
    T61STRING = 20,
    IA5STRING = 22,
    UTCTIME = 23,
    GENERALIZEDTIME = 24,
    GENERALSTRING = 27
}
/**
 * BitString is the structure to use when you want an ASN.1 BIT STRING type. A
 * bit string is padded up to the nearest byte in memory and the number of
 * valid bits is recorded. Padding bits will be zero.
 */
export declare class BitString {
    /**
     * The underlying buffer
     */
    readonly buf: Buffer;
    /**
     * The length of bits
     */
    readonly bitLen: number;
    constructor(buf: Buffer, bitLen: number);
    /**
     * Returns the value for the given bits offset.
     * @param i bits offet
     */
    at(i: number): number;
    /**
     * Align buffer
     */
    rightAlign(): Buffer;
}
/**
 * Implements parsing of DER-encoded ASN.1 data structures,
 * as defined in ITU-T Rec X.690.
 *
 * See also ``A Layman's Guide to a Subset of ASN.1, BER, and DER,''
 * http://luca.ntop.org/Teaching/Appunti/asn1.html.
 *
 * ASN.1 is a syntax for specifying abstract objects and BER, DER, PER, XER etc
 * are different encoding formats for those objects. Here, we'll be dealing
 * with DER, the Distinguished Encoding Rules. DER is used in X.509 because
 * it's fast to parse and, unlike BER, has a unique encoding for every object.
 * When calculating hashes over objects, it's important that the resulting
 * bytes be the same at both ends and DER removes this margin of error.
 * ASN.1 is very complex and this package doesn't attempt to implement
 * everything by any means.
 *
 * DER Encoding of ASN.1 Types:
 * https://msdn.microsoft.com/en-us/library/windows/desktop/bb540792(v=vs.85).aspx
 */
export declare class ASN1 {
    /**
     * Creates a Tag.BOOLEAN ASN.1 object.
     * @param val boolean value.
     */
    static Bool(val: boolean): ASN1;
    /**
     * Parse a Tag.BOOLEAN value from ASN.1 object' value.
     * @param buf the buffer to parse.
     */
    static parseBool(buf: Buffer): boolean;
    /**
     * Creates a Tag.INTEGER ASN.1 object.
     * @param val integer value or buffer.
     */
    static Integer(val: number | Buffer): ASN1;
    /**
     * Parse a Tag.INTEGER value from ASN.1 object' value.
     * @param buf the buffer to parse.
     */
    static parseInteger(buf: Buffer): number | string;
    /**
     * Parse a Tag.INTEGER value as a number from ASN.1 object' value.
     * @param buf the buffer to parse.
     */
    static parseIntegerNum(buf: Buffer): number;
    /**
     * Parse a Tag.INTEGER value as a hex string(for BigInt) from ASN.1 object' value.
     * @param buf the buffer to parse.
     */
    static parseIntegerStr(buf: Buffer): string;
    /**
     * Creates a Tag.BITSTRING ASN.1 object.
     * @param val BitString object or buffer.
     */
    static BitString(val: BitString | Buffer): ASN1;
    /**
     * Parse a Tag.BITSTRING value from ASN.1 object' value.
     * @param buf the buffer to parse.
     */
    static parseBitString(buf: Buffer): BitString;
    /**
     * Creates a Tag.NULL ASN.1 object.
     */
    static Null(): ASN1;
    /**
     * Parse a Tag.NULL value from ASN.1 object' value.
     * @param buf the buffer to parse.
     */
    static parseNull(buf: Buffer): null;
    /**
     * Creates an Tag.OID (dot-separated numeric string) ASN.1 object.
     * @param val dot-separated numeric string.
     */
    static OID(val: string): ASN1;
    /**
     * Parse a Tag.OID value from ASN.1 object' value.
     * @param buf the buffer to parse.
     */
    static parseOID(buf: Buffer): string;
    /**
     * Creates an Tag.UTF8 ASN.1 object.
     * @param val utf8 string.
     */
    static UTF8(val: string): ASN1;
    /**
     * Parse a Tag.UTF8 string from ASN.1 object' value.
     * @param buf the buffer to parse.
     */
    static parseUTF8(buf: Buffer): string;
    /**
     * Creates an Tag.NUMERICSTRING ASN.1 object.
     * @param val numeric string.
     */
    static NumericString(val: string): ASN1;
    /**
     * Parse a Tag.UTF8 string from ASN.1 object' value.
     * @param buf the buffer to parse.
     */
    static parseNumericString(buf: Buffer): string;
    /**
     * Creates an Tag.NUMERICSTRING ASN.1 object.
     * @param val printable string.
     */
    static PrintableString(val: string): ASN1;
    /**
     * Parse a Tag.PRINTABLESTRING string from ASN.1 object' value.
     * @param buf the buffer to parse.
     */
    static parsePrintableString(buf: Buffer): string;
    /**
     * Creates an Tag.IA5STRING (ASCII string) ASN.1 object.
     * @param val ASCII string.
     */
    static IA5String(val: string): ASN1;
    /**
     * Parse a Tag.IA5STRING string from ASN.1 object' value.
     * @param buf the buffer to parse.
     */
    static parseIA5String(buf: Buffer): string;
    /**
     * Creates an Tag.T61STRING (8-bit clean string) ASN.1 object.
     * @param val 8-bit clean string.
     */
    static T61String(val: string): ASN1;
    /**
     * Parse a Tag.T61STRING string from ASN.1 object' value.
     * @param buf the buffer to parse.
     */
    static parseT61String(buf: Buffer): string;
    /**
     * Creates an Tag.GENERALSTRING (specified in ISO-2022/ECMA-35) ASN.1 object.
     * @param val general string.
     */
    static GeneralString(val: string): ASN1;
    /**
     * Parse a Tag.GENERALSTRING string from ASN.1 object' value.
     * @param buf the buffer to parse.
     */
    static parseGeneralString(buf: Buffer): string;
    /**
     * Creates an Tag.UTCTIME ASN.1 object.
     *
     * Note: GeneralizedTime has 4 digits for the year and is used for X.509.
     * dates past 2049. Converting to a GeneralizedTime hasn't been implemented yet.
     * @param date date value.
     */
    static UTCTime(date: Date): ASN1;
    /**
     * Parse a Tag.UTCTIME date from ASN.1 object' value.
     * @param buf the buffer to parse.
     */
    static parseUTCTime(buf: Buffer): Date;
    /**
     * Creates an Tag.GENERALIZEDTIME ASN.1 object.
     * @param date date value.
     */
    static GeneralizedTime(date: Date): ASN1;
    /**
     * Parse a Tag.GENERALIZEDTIME date from ASN.1 object' value.
     * @param buf the buffer to parse.
     */
    static parseGeneralizedTime(buf: Buffer): Date;
    /**
     * Parse a Tag.UTCTIME date of Tag.GENERALIZEDTIME date from ASN.1 object' value.
     * @param tag the type.
     * @param buf the buffer to parse.
     */
    static parseTime(tag: Tag, buf: Buffer): Date;
    /**
     * Creates an Tag.SET ASN.1 object.
     * @param objs an array of ASN.1 objects.
     */
    static Set(objs: ASN1[]): ASN1;
    /**
     * Creates an Tag.SEQUENCE ASN.1 object.
     * @param objs an array of ASN.1 objects.
     */
    static Seq(objs: ASN1[]): ASN1;
    /**
     * Creates an Class.CONTEXT_SPECIFIC ASN.1 object.
     *
     * Note: the tag means nothing with Class.CONTEXT_SPECIFIC
     * @param tag number.
     * @param objs an array of ASN.1 objects or a ASN.1 object.
     * @param isCompound when objs is a array, the isCompound will be set to true.
     */
    static Spec(tag: Tag, objs: ASN1 | ASN1[], isCompound?: boolean): ASN1;
    /**
     * Parse a ASN.1 object from a buffer in DER format.
     *
     * @param buf the buffer to parse.
     * @param deepParse deeply parse or not.
     */
    static fromDER(buf: Buffer, deepParse?: boolean): ASN1;
    /**
     * Parse a ASN.1 object from a buffer in DER format with given class and tag.
     * If class or tag is not match, it will throw a error.
     *
     * @param tagClass expect class to parse.
     * @param tag expect type to parse.
     * @param buf the buffer to parse.
     */
    static parseDER(buf: Buffer, tagClass: Class, tag: Tag): ASN1;
    /**
     * Parse a ASN.1 object from a buffer in DER format with given Template object.
     * If template is not match, it will throw a error.
     *
     * @param buf the buffer to parse.
     * @param tpl expect template to parse.
     *
     * @return a Captures object with captured ASN.1 objects
     */
    static parseDERWithTemplate(buf: Buffer, tpl: Template): Captures;
    private static _parseCompound;
    private static _fromDER;
    readonly class: Class;
    readonly tag: Tag;
    readonly bytes: Buffer;
    readonly isCompound: boolean;
    private _value;
    private _der;
    constructor(tagClass: Class, tag: Tag, data: Buffer, isCompound?: boolean);
    /**
     * the well parsed value of this ASN.1 object.
     * It will be boolean, number, string, BitString, Date, array of ASN.1 objects and so on.
     */
    readonly value: any;
    /**
     * the DER format Buffer of this ASN.1 object.
     */
    readonly DER: Buffer;
    /**
     * Expecting it is compound ASN.1 object and returns an array of sub ASN.1 objects.
     * @param msg error message to throw when it is not compound ASN.1 object.
     */
    mustCompound(msg?: string): ASN1[];
    /**
     * Returns true if two ASN.1 objects equally.
     * @param obj another ASN.1 object.
     */
    equals(obj: ASN1): boolean;
    /**
     * Converts this ASN.1 object to a buffer of bytes in DER format.
     */
    toDER(): Buffer;
    /**
     * Parse the value of this ASN.1 object when it is Class.UNIVERSAL.
     * The value will be boolean, number, string, BitString, Date, array of ASN.1 objects and so on.
     */
    valueOf(): any;
    /**
     * Validates that the given ASN.1 object is at least a super set of the
     * given ASN.1 structure. Only tag classes and types are checked. An
     * optional map may also be provided to capture ASN.1 values while the
     * structure is checked.
     *
     * To capture an ASN.1 object, set an object in the validator's 'capture'
     * parameter to the key to use in the capture map.
     *
     * Objects in the validator may set a field 'optional' to true to indicate
     * that it isn't necessary to pass validation.
     *
     * @param tpl Template object to validate.
     * @param captures Captures object to capture ASN.1 object.
     */
    validate(tpl: Template, captures?: Captures): Error | null;
    /**
     * Return a friendly JSON object for debuging.
     */
    toJSON(): any;
    protected [inspect.custom](_depth: any, options: any): string;
}
