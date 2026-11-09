import { AsnArray } from "@peculiar/asn1-schema";
import { PKCS12Attribute } from "./attribute";
/**
 * ```asn1
 * SafeBag ::= SEQUENCE {
 *   bagId         BAG-TYPE.&id ({PKCS12BagSet}),
 *   bagValue      [0] EXPLICIT BAG-TYPE.&Type({PKCS12BagSet}{@bagId}),
 *   bagAttributes SET OF PKCS12Attribute OPTIONAL
 * }
 * ```
 */
export declare class SafeBag {
    bagId: string;
    bagValue: ArrayBuffer;
    bagAttributes?: PKCS12Attribute[];
    constructor(params?: Partial<SafeBag>);
}
/**
 * ```asn1
 * SafeContents ::= SEQUENCE OF SafeBag
 * ```
 */
export declare class SafeContents extends AsnArray<SafeBag> {
    constructor(items?: SafeBag[]);
}
