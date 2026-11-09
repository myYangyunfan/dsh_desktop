import { DigestInfo } from "@peculiar/asn1-rsa";
import { OctetString } from "@peculiar/asn1-schema";
/**
 * ```asn1
 * MacData ::= SEQUENCE {
 *   mac        DigestInfo,
 *   macSalt    OCTET STRING,
 *   iterations INTEGER DEFAULT 1
 *   -- Note: The default is for historical reasons and its use is
 *   -- deprecated.
 * }
 * ```
 */
export declare class MacData {
    mac: DigestInfo;
    macSalt: OctetString;
    iterations: number;
    constructor(params?: Partial<MacData>);
}
