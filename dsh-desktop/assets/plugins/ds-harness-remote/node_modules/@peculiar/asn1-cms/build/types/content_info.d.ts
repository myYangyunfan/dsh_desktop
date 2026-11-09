import { ContentType } from "./types";
/**
 * ```asn
 * ContentInfo ::= SEQUENCE {
 *    contentType ContentType,
 *    content [0] EXPLICIT ANY DEFINED BY contentType }
 * ```
 */
export declare class ContentInfo {
    contentType: ContentType;
    content: ArrayBuffer;
    constructor(params?: Partial<ContentInfo>);
}
