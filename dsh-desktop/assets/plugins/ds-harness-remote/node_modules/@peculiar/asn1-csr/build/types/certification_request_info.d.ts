import { Name, SubjectPublicKeyInfo } from "@peculiar/asn1-x509";
import { Attributes } from "./attributes";
/**
 * ```asn1
 * CertificationRequestInfo ::= SEQUENCE {
 *   version       INTEGER { v1(0) } (v1,...),
 *   subject       Name,
 *   subjectPKInfo SubjectPublicKeyInfo{{ PKInfoAlgorithms }},
 *   attributes    [0] Attributes{{ CRIAttributes }}
 * }
 * ```
 */
export declare class CertificationRequestInfo {
    version: number;
    subject: Name;
    subjectPKInfo: SubjectPublicKeyInfo;
    /**
     * List of attributes providing additional information about the
     * subject of the certification request.
     *
     * @remarks
     * The textual description in RFC 2986 (see https://datatracker.ietf.org/doc/rfc2986/)
     * indicates that a certification request contains "optionally a set of attributes".
     * The ASN.1 module in appendix A does not include the `OPTIONAL` keyword for this
     * component, which is a formal inconsistency. In practice, popular implementations
     * (for example OpenSSL) are tolerant and accept both forms:
     *  - the attributes field present as an empty context-specific element (A0 00),
     *  - the attributes field completely omitted.
     *
     * To be compatible with real-world CSR encodings, this property is marked
     * `optional: true` in the decorator. Consumers should therefore treat
     * `certificationRequestInfo.attributes` as possibly `undefined` and
     * handle that case (for example, treat `undefined` as an empty set of attributes).
     */
    attributes: Attributes;
    constructor(params?: Partial<CertificationRequestInfo>);
}
