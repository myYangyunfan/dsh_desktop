import { GeneralNames } from "@peculiar/asn1-x509";
import { IssuerSerial } from "./issuer_serial";
import { ObjectDigestInfo } from "./object_digest_info";
/**
 * ```asn1
 * Holder ::= SEQUENCE {
 *      baseCertificateID   [0] IssuerSerial OPTIONAL,
 *                -- the issuer and serial number of
 *                -- the holder's Public Key Certificate
 *      entityName          [1] GeneralNames OPTIONAL,
 *                -- the name of the claimant or role
 *      objectDigestInfo    [2] ObjectDigestInfo OPTIONAL
 *                -- used to directly authenticate the
 *                -- holder, for example, an executable
 * }
 * ```
 */
export declare class Holder {
    baseCertificateID?: IssuerSerial;
    entityName?: GeneralNames;
    objectDigestInfo?: ObjectDigestInfo;
    constructor(params?: Partial<Holder>);
}
