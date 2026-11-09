import { __decorate } from "tslib";
import { AsnType, AsnTypeTypes } from "@peculiar/asn1-schema";
import { SignerInfo } from "../signer_info";
export const id_counterSignature = "1.2.840.113549.1.9.6";
let CounterSignature = class CounterSignature extends SignerInfo {
};
CounterSignature = __decorate([
    AsnType({ type: AsnTypeTypes.Sequence })
], CounterSignature);
export { CounterSignature };
