import { GeneralNames, GeneralName } from "@peculiar/asn1-x509";
/**
 * ```asn1
 * RoleSyntax ::= SEQUENCE {
 *      roleAuthority  [0] GeneralNames OPTIONAL,
 *      roleName       [1] GeneralName
 * }
 * ```
 */
export declare class RoleSyntax {
    roleAuthority?: GeneralNames;
    roleName?: GeneralName;
    constructor(params?: Partial<RoleSyntax>);
}
