import { __decorate } from "tslib";
import { Time } from "@peculiar/asn1-x509";
import { AsnTypeTypes, AsnType } from "@peculiar/asn1-schema";
export const id_signingTime = "1.2.840.113549.1.9.5";
let SigningTime = class SigningTime extends Time {
};
SigningTime = __decorate([
    AsnType({ type: AsnTypeTypes.Choice })
], SigningTime);
export { SigningTime };
