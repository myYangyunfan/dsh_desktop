import { __decorate } from "tslib";
import { AsnProp, AsnPropTypes } from "@peculiar/asn1-schema";
export class OtherKeyAttribute {
    keyAttrId = "";
    keyAttr;
    constructor(params = {}) {
        Object.assign(this, params);
    }
}
__decorate([
    AsnProp({ type: AsnPropTypes.ObjectIdentifier })
], OtherKeyAttribute.prototype, "keyAttrId", void 0);
__decorate([
    AsnProp({
        type: AsnPropTypes.Any,
        optional: true,
    })
], OtherKeyAttribute.prototype, "keyAttr", void 0);
