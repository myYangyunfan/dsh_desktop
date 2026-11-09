import { SubjectKeyIdentifier } from "@peculiar/asn1-x509";
import { IssuerAndSerialNumber } from "./issuer_and_serial_number";
/**
 * ```asn
 * SignerIdentifier ::= CHOICE {
 *   issuerAndSerialNumber IssuerAndSerialNumber,
 *   subjectKeyIdentifier [0] SubjectKeyIdentifier }
 * ```
 */
export declare class SignerIdentifier {
    subjectKeyIdentifier?: SubjectKeyIdentifier;
    issuerAndSerialNumber?: IssuerAndSerialNumber;
    constructor(params?: Partial<SignerIdentifier>);
}
