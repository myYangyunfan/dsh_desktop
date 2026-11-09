import { AsnArray } from "@peculiar/asn1-schema";
import { ContentInfo } from "@peculiar/asn1-cms";
/**
 * ```asn1
 * AuthenticatedSafe ::= SEQUENCE OF ContentInfo
 *   -- Data if unencrypted
 *   -- EncryptedData if password-encrypted
 *   -- EnvelopedData if public key-encrypted
 * ```
 */
export declare class AuthenticatedSafe extends AsnArray<ContentInfo> {
    constructor(items?: ContentInfo[]);
}
