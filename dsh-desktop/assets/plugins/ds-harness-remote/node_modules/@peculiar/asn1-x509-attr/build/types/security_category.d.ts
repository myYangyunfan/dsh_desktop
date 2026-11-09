/**
 * ```asn1
 * SecurityCategory ::= SEQUENCE {
 *      type      [0]  IMPLICIT OBJECT IDENTIFIER,
 *      value     [1]  ANY DEFINED BY type
 * }
 * ```
 */
export declare class SecurityCategory {
    type: string;
    value: ArrayBuffer;
    constructor(params?: Partial<SecurityCategory>);
}
