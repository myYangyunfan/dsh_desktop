import { __decorate } from "tslib";
import { AsnProp, AsnPropTypes } from "@peculiar/asn1-schema";
export class Attribute {
    attrType = "";
    attrValues = [];
    constructor(params = {}) {
        Object.assign(this, params);
    }
}
__decorate([
    AsnProp({ type: AsnPropTypes.ObjectIdentifier })
], Attribute.prototype, "attrType", void 0);
__decorate([
    AsnProp({
        type: AsnPropTypes.Any,
        repeated: "set",
    })
], Attribute.prototype, "attrValues", void 0);
