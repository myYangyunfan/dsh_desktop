/**
 * ```asn
 * AttributeValue ::= ANY
 * ```
 */
export type AttributeValue = ArrayBuffer;
/**
 * ```asn
 * Attribute ::= SEQUENCE {
 *   attrType OBJECT IDENTIFIER,
 *   attrValues SET OF AttributeValue }
 * ```
 */
export declare class Attribute {
    attrType: string;
    attrValues: AttributeValue[];
    constructor(params?: Partial<Attribute>);
}
