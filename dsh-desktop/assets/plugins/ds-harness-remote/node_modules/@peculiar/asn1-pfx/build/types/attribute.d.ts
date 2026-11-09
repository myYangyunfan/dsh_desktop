import { AsnArray } from "@peculiar/asn1-schema";
/**
 * ```asn1
 * PKCS12Attribute ::= SEQUENCE {
 *   attrId      ATTRIBUTE.&id ({PKCS12AttrSet}),
 *   attrValues  SET OF ATTRIBUTE.&Type ({PKCS12AttrSet}{@attrId})
 * } -- This type is compatible with the X.500 type 'Attribute'
 * ```
 */
export declare class PKCS12Attribute {
    attrId: string;
    attrValues: ArrayBuffer[];
    constructor(params?: Partial<PKCS12Attribute>);
}
/**
 * ```asn1
 * PKCS12AttrSet ATTRIBUTE ::= {
 *   friendlyName |
 *   localKeyId,
 *   ... -- Other attributes are allowed
 * }
 * ```
 */
export declare class PKCS12AttrSet extends AsnArray<PKCS12Attribute> {
    constructor(items?: PKCS12Attribute[]);
}
