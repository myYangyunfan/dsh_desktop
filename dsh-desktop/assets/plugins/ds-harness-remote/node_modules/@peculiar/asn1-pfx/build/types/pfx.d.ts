import { ContentInfo } from "@peculiar/asn1-cms";
import { MacData } from "./mac_data";
/**
 * ```asn1
 * PFX ::= SEQUENCE {
 *   version    INTEGER {v3(3)}(v3,...),
 *   authSafe   ContentInfo,
 *   macData    MacData OPTIONAL
 * }
 * ```
 */
export declare class PFX {
    version: number;
    authSafe: ContentInfo;
    macData: MacData;
    constructor(params?: Partial<PFX>);
}
