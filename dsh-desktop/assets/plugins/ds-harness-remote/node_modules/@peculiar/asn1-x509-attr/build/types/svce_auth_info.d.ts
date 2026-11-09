import { OctetString } from "@peculiar/asn1-schema";
import { GeneralName } from "@peculiar/asn1-x509";
/**
 * ```asn1
 * SvceAuthInfo ::=    SEQUENCE {
 *      service       GeneralName,
 *      ident         GeneralName,
 *      authInfo      OCTET STRING OPTIONAL
 * }
 * ```
 */
export declare class SvceAuthInfo {
    service: GeneralName;
    ident: GeneralName;
    authInfo?: OctetString;
    constructor(params?: Partial<SvceAuthInfo>);
}
