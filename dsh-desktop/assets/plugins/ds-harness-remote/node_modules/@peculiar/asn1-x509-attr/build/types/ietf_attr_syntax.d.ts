import { OctetString } from "@peculiar/asn1-schema";
import { GeneralNames } from "@peculiar/asn1-x509";
/**
 * ```asn1
 * CHOICE {
 *                    octets    OCTET STRING,
 *                    oid       OBJECT IDENTIFIER,
 *                    string    UTF8String
 * ```
 */
export declare class IetfAttrSyntaxValueChoices {
    cotets?: OctetString;
    oid?: string;
    string?: string;
    constructor(params?: Partial<IetfAttrSyntaxValueChoices>);
}
/**
 * ```asn1
 * IetfAttrSyntax ::= SEQUENCE {
 *     policyAuthority[0] GeneralNames    OPTIONAL,
 *     values         SEQUENCE OF CHOICE {
 *                    octets    OCTET STRING,
 *                    oid       OBJECT IDENTIFIER,
 *                    string    UTF8String
 *    }
 * }
 * ```
 */
export declare class IetfAttrSyntax {
    policyAuthority?: GeneralNames;
    values: IetfAttrSyntaxValueChoices[];
    constructor(params?: Partial<IetfAttrSyntax>);
}
