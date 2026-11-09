var AuthenticatedSafe_1;
import { __decorate } from "tslib";
import { AsnArray, AsnType, AsnTypeTypes } from "@peculiar/asn1-schema";
import { ContentInfo } from "@peculiar/asn1-cms";
let AuthenticatedSafe = AuthenticatedSafe_1 = class AuthenticatedSafe extends AsnArray {
    constructor(items) {
        super(items);
        Object.setPrototypeOf(this, AuthenticatedSafe_1.prototype);
    }
};
AuthenticatedSafe = AuthenticatedSafe_1 = __decorate([
    AsnType({
        type: AsnTypeTypes.Sequence,
        itemType: ContentInfo,
    })
], AuthenticatedSafe);
export { AuthenticatedSafe };
