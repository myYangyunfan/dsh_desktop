import { GeneralName, Attribute } from "@peculiar/asn1-x509";
/**
 * ```asn1
 * ACClearAttrs ::= SEQUENCE {
 *      acIssuer          GeneralName,
 *      acSerial          INTEGER,
 *      attrs             SEQUENCE OF Attribute
 * }
 * ```
 */
export declare class ACClearAttrs {
    acIssuer: GeneralName;
    acSerial: number;
    attrs: Attribute[];
    constructor(params?: Partial<ACClearAttrs>);
}
