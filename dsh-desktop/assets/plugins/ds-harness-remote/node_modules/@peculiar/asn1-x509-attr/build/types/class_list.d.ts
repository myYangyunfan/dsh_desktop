import { BitString } from "@peculiar/asn1-schema";
export declare enum ClassListFlags {
    unmarked = 1,
    unclassified = 2,
    restricted = 4,
    confidential = 8,
    secret = 16,
    topSecret = 32
}
/**
 * ```asn1
 * ClassList  ::=  BIT STRING {
 *      unmarked       (0),
 *      unclassified   (1),
 *      restricted     (2),
 *      confidential   (3),
 *      secret         (4),
 *      topSecret      (5)
 * }
 * ```
 */
export declare class ClassList extends BitString<ClassListFlags> {
}
