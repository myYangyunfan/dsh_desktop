import { AsnArray } from "@peculiar/asn1-schema";
import { Targets } from "./target";
/**
 * ```asn1
 * ProxyInfo ::= SEQUENCE OF Targets
 * ```
 */
export declare class ProxyInfo extends AsnArray<Targets> {
    constructor(items?: Targets[]);
}
