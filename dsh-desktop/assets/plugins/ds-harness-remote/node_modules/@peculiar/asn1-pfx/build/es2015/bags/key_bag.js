import { __decorate } from "tslib";
import { PrivateKeyInfo } from "@peculiar/asn1-pkcs8";
import { AsnType, AsnTypeTypes } from "@peculiar/asn1-schema";
let KeyBag = class KeyBag extends PrivateKeyInfo {
};
KeyBag = __decorate([
    AsnType({ type: AsnTypeTypes.Sequence })
], KeyBag);
export { KeyBag };
