var PKCS12AttrSet_1;
import { __decorate } from "tslib";
import { AsnProp, AsnPropTypes, AsnArray, AsnType, AsnTypeTypes } from "@peculiar/asn1-schema";
export class PKCS12Attribute {
    attrId = "";
    attrValues = [];
    constructor(params = {}) {
        Object.assign(params);
    }
}
__decorate([
    AsnProp({ type: AsnPropTypes.ObjectIdentifier })
], PKCS12Attribute.prototype, "attrId", void 0);
__decorate([
    AsnProp({
        type: AsnPropTypes.Any,
        repeated: "set",
    })
], PKCS12Attribute.prototype, "attrValues", void 0);
let PKCS12AttrSet = PKCS12AttrSet_1 = class PKCS12AttrSet extends AsnArray {
    constructor(items) {
        super(items);
        Object.setPrototypeOf(this, PKCS12AttrSet_1.prototype);
    }
};
PKCS12AttrSet = PKCS12AttrSet_1 = __decorate([
    AsnType({
        type: AsnTypeTypes.Sequence,
        itemType: PKCS12Attribute,
    })
], PKCS12AttrSet);
export { PKCS12AttrSet };
