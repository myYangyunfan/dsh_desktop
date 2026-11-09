import { AttrSpec } from "./attr_spec";
/**
 * ```asn1
 * AAControls ::= SEQUENCE {
 *      pathLenConstraint INTEGER (0..MAX) OPTIONAL,
 *      permittedAttrs    [0] AttrSpec OPTIONAL,
 *      excludedAttrs     [1] AttrSpec OPTIONAL,
 *      permitUnSpecified BOOLEAN DEFAULT TRUE
 * }
 * ```
 */
export declare class AAControls {
    pathLenConstraint?: number;
    permittedAttrs?: AttrSpec;
    excludedAttrs?: AttrSpec;
    permitUnSpecified: boolean;
    constructor(params?: Partial<AAControls>);
}
