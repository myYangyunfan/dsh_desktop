import { __decorate } from "tslib";
import { EncryptedPrivateKeyInfo } from "@peculiar/asn1-pkcs8";
import { AsnType, AsnTypeTypes } from "@peculiar/asn1-schema";
let PKCS8ShroudedKeyBag = class PKCS8ShroudedKeyBag extends EncryptedPrivateKeyInfo {
};
PKCS8ShroudedKeyBag = __decorate([
    AsnType({ type: AsnTypeTypes.Sequence })
], PKCS8ShroudedKeyBag);
export { PKCS8ShroudedKeyBag };
