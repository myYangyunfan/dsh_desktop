import { OctetString } from "@peculiar/asn1-schema";
import { ContentType } from "./types";
export declare class EncapsulatedContent {
    single?: OctetString;
    any?: ArrayBuffer;
    constructor(params?: Partial<EncapsulatedContent>);
}
/**
 * ```asn
 * EncapsulatedContentInfo ::= SEQUENCE {
 *   eContentType ContentType,
 *   eContent [0] EXPLICIT OCTET STRING OPTIONAL }
 * ```
 */
export declare class EncapsulatedContentInfo {
    eContentType: ContentType;
    eContent?: EncapsulatedContent;
    constructor(params?: Partial<EncapsulatedContentInfo>);
}
