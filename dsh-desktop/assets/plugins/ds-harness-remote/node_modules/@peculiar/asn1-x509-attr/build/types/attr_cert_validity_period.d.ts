/**
 * ```asn1
 * AttCertValidityPeriod  ::= SEQUENCE {
 *      notBeforeTime  GeneralizedTime,
 *      notAfterTime   GeneralizedTime
 * }
 * ```
 */
export declare class AttCertValidityPeriod {
    notBeforeTime: Date;
    notAfterTime: Date;
    constructor(params?: Partial<AttCertValidityPeriod>);
}
