import { GeneralName } from "@peculiar/asn1-x509";
import { V2Form } from "./v2_form";
/**
 * ```asn1
 * AttCertIssuer ::= CHOICE {
 *      v1Form   GeneralNames,  -- MUST NOT be used in this
 *                              -- profile
 *      v2Form   [0] V2Form     -- v2 only
 * }
 * ```
 */
export declare class AttCertIssuer {
    v1Form?: GeneralName[];
    v2Form?: V2Form;
    constructor(params?: Partial<AttCertIssuer>);
}
