import { ClassList } from "./class_list";
import { SecurityCategory } from "./security_category";
/**
 * ```asn1
 * Clearance  ::=  SEQUENCE {
 *      policyId       OBJECT IDENTIFIER,
 *      classList      ClassList DEFAULT {unclassified},
 *      securityCategories  SET OF SecurityCategory OPTIONAL
 * }
 * ```
 */
export declare class Clearance {
    policyId: string;
    classList: ClassList;
    securityCategories?: SecurityCategory[];
    constructor(params?: Partial<Clearance>);
}
