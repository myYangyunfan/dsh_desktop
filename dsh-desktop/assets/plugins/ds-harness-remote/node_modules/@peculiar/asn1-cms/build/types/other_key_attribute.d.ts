/**
 * ```asn
 * OtherKeyAttribute ::= SEQUENCE {
 *  keyAttrId OBJECT IDENTIFIER,
 *  keyAttr ANY DEFINED BY keyAttrId OPTIONAL }
 * ```
 */
export declare class OtherKeyAttribute {
    keyAttrId: string;
    keyAttr?: ArrayBuffer;
    constructor(params?: Partial<OtherKeyAttribute>);
}
