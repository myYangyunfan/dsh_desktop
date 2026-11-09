import { AsnArray } from "@peculiar/asn1-schema";
import { RecipientInfo } from "./recipient_info";
/**
 * ```asn
 * RecipientInfos ::= SET SIZE (1..MAX) OF RecipientInfo
 * ```
 */
export declare class RecipientInfos extends AsnArray<RecipientInfo> {
    constructor(items?: RecipientInfo[]);
}
