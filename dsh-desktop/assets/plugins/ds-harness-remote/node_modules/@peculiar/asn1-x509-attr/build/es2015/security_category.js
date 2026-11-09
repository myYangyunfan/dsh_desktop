import { __decorate } from "tslib";
import { AsnProp, AsnPropTypes } from "@peculiar/asn1-schema";
export class SecurityCategory {
    type = "";
    value = new ArrayBuffer(0);
    constructor(params = {}) {
        Object.assign(this, params);
    }
}
__decorate([
    AsnProp({
        type: AsnPropTypes.ObjectIdentifier,
        implicit: true,
        context: 0,
    })
], SecurityCategory.prototype, "type", void 0);
__decorate([
    AsnProp({
        type: AsnPropTypes.Any,
        implicit: true,
        context: 1,
    })
], SecurityCategory.prototype, "value", void 0);
