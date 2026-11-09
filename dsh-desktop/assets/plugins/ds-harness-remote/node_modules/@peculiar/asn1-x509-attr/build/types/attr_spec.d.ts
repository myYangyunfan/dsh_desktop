import { AsnArray } from "@peculiar/asn1-schema";
/**
 * ```asn1
 * AttrSpec ::= SEQUENCE OF OBJECT IDENTIFIER
 * ```
 */
export declare class AttrSpec extends AsnArray<string> {
    constructor(items?: string[]);
}
