import { __decorate } from "tslib";
import { AsnProp, AsnPropTypes } from "@peculiar/asn1-schema";
import { GeneralName, Attribute } from "@peculiar/asn1-x509";
export class ACClearAttrs {
    acIssuer = new GeneralName();
    acSerial = 0;
    attrs = [];
    constructor(params = {}) {
        Object.assign(this, params);
    }
}
__decorate([
    AsnProp({ type: GeneralName })
], ACClearAttrs.prototype, "acIssuer", void 0);
__decorate([
    AsnProp({ type: AsnPropTypes.Integer })
], ACClearAttrs.prototype, "acSerial", void 0);
__decorate([
    AsnProp({
        type: Attribute,
        repeated: "sequence",
    })
], ACClearAttrs.prototype, "attrs", void 0);
